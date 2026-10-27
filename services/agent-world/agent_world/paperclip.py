"""The service's side of Paperclip, best effort: every call has a 5 s timeout and none raises.

A failed call returns None or False and is remembered in ``last_error``; after a network failure
the client stays quiet for a minute (``DOWN_FOR_S``) so an unreachable Paperclip costs one
timeout, not one per call.

The calls are Paperclip v2026.1023.0's REST API as a running Paperclip answered them on
2026-10-27:

- An agent's comment or issue update is refused (403) unless ``X-Paperclip-Run-Id`` names one of
  that agent's own heartbeat runs whose context is an issue. ``start_run`` asks Paperclip for one
  on the session's issue; every later write names it. A reason beginning ``execution_`` keeps
  Paperclip from checking the backlog issue out to that short run, after which no update would
  land without a live run. The run's wake reaches this service's heartbeat route, which ignores it.
- Cost events need no run: each role reports with its own key and its own agent id.
- ``blocked`` names who unblocks it (Paperclip lets an agent name only itself).
"""

from __future__ import annotations

import logging
import time
from collections.abc import Callable, Mapping
from typing import Any

import httpx

logger = logging.getLogger(__name__)

TIMEOUT_S = 5.0
DOWN_FOR_S = 60.0
COMMENT_MAX = 2000
UNBLOCK_ACTION_MAX = 2000
RUN_REASON = "execution_agent_world_session"
HEAD_TRADER = "head-trader"


def budget_stop(me: Mapping[str, Any] | None) -> str | None:
    """Why the Head trader may not start a session, or None when it may."""
    if not me:
        return None
    if str(me.get("status") or "").lower() == "paused":
        return "The Head trader is paused in Paperclip."
    budget = me.get("budgetMonthlyCents")
    spent = me.get("spentMonthlyCents")
    if isinstance(budget, (int, float)) and isinstance(spent, (int, float)) and budget > 0 and spent >= budget:
        return f"The Head trader has spent its monthly budget in Paperclip ({spent:g} of {budget:g} cents)."
    return None


class PaperclipClient:
    def __init__(self, base_url: str | None, api_key: str | None, company_id: str | None,
                 role_keys: Mapping[str, str] | None = None, *, run_id: str | None = None,
                 timeout_s: float = TIMEOUT_S, transport: httpx.BaseTransport | None = None,
                 clock: Callable[[], float] = time.monotonic) -> None:
        self.base_url = (base_url or "").rstrip("/")
        self.api_key = api_key or ""
        self.company_id = company_id or ""
        self.role_keys = dict(role_keys or {})
        self.run_id = run_id
        self.configured = bool(self.base_url and self.api_key and self.company_id)
        self.last_error: str | None = None
        self.reachable: bool | None = None
        self._clock = clock
        self._down_until = 0.0
        self._agent_ids: dict[str, str] = {}
        self._client = httpx.Client(base_url=self.base_url or "http://paperclip.invalid",
                                    timeout=timeout_s, transport=transport)

    def close(self) -> None:
        self._client.close()

    # ---- transport ----

    def _request(self, method: str, path: str, *, key: str | None = None,
                 body: Mapping[str, Any] | None = None, run_id: str | None = None) -> httpx.Response | None:
        if not self.configured:
            return None
        if self._clock() < self._down_until:
            return None
        headers = {"Authorization": f"Bearer {key or self.api_key}", "Accept": "application/json"}
        if run_id:
            headers["X-Paperclip-Run-Id"] = run_id
        try:
            response = self._client.request(method, path, headers=headers, json=dict(body) if body is not None else None)
        except httpx.HTTPError as exc:
            self._down_until = self._clock() + DOWN_FOR_S
            self.reachable = False
            self.last_error = f"{method} {path}: {type(exc).__name__}"
            logger.warning("Paperclip unreachable (%s)", self.last_error)
            return None
        self.reachable = True
        if response.status_code >= 400:
            self.last_error = f"{method} {path}: HTTP {response.status_code}"
            logger.warning("Paperclip answered %s", self.last_error)
        return response

    @staticmethod
    def _json(response: httpx.Response | None) -> Any:
        if response is None or not 200 <= response.status_code < 300:
            return None
        try:
            return response.json()
        except ValueError:
            return None

    # ---- calls ----

    def me(self, key: str | None = None) -> dict[str, Any] | None:
        """``GET /api/agents/me`` as ``{id, status, budgetMonthlyCents, spentMonthlyCents}``."""
        data = self._json(self._request("GET", "/api/agents/me", key=key))
        if not isinstance(data, dict):
            return None
        agent = data.get("agent") if isinstance(data.get("agent"), dict) else data
        out = {
            "id": agent.get("id"),
            "status": agent.get("status"),
            "budgetMonthlyCents": agent.get("budgetMonthlyCents"),
            "spentMonthlyCents": agent.get("spentMonthlyCents"),
        }
        if out["id"]:
            self._agent_ids[key or self.api_key] = str(out["id"])
        return out

    def start_run(self, issue_id: str, agent_id: str) -> str | None:
        """A heartbeat run of the Head trader on the session's issue, which every later write names.

        Paperclip answers 202 ``{id}``; a paused agent is 409 and an issue another agent holds is
        ``{status: 'skipped'}`` without an id. Without a run, the run id the request brought (a
        routine's wake, counted by Paperclip toward that run's writes) stays the one used.
        """
        data = self._json(self._request("POST", f"/api/agents/{agent_id}/heartbeat/invoke",
                                        body={"reason": RUN_REASON, "payload": {"issueId": issue_id}}))
        run = data.get("id") if isinstance(data, dict) else None
        if isinstance(run, str) and run:
            self.run_id = run
            return run
        return None

    def _write(self, method: str, path: str, body: Mapping[str, Any], run_id: str | None = None) -> bool:
        run = run_id or self.run_id
        if not self.configured:
            return False
        if not run:
            self.last_error = f"{method} {path}: no Paperclip run to name"
            return False
        response = self._request(method, path, body=body, run_id=run)
        return response is not None and 200 <= response.status_code < 300

    def comment(self, issue_id: str, body: str) -> bool:
        return self._write("POST", f"/api/issues/{issue_id}/comments", {"body": body[:COMMENT_MAX]})

    def done(self, issue_id: str, comment: str) -> bool:
        """Hand the issue in: under an approval stage it goes to the Execution desk, else it closes."""
        return self._write("PATCH", f"/api/issues/{issue_id}", {"status": "done", "comment": comment[:COMMENT_MAX]})

    def blocked(self, issue_id: str, comment: str) -> bool:
        head = self._agent_ids.get(self.api_key) or (self.me() or {}).get("id")
        body: dict[str, Any] = {"status": "blocked", "comment": comment[:COMMENT_MAX]}
        if head:
            body["unblockDescriptor"] = {"owner": {"agentId": str(head)}, "action": comment[:UNBLOCK_ACTION_MAX]}
        return self._write("PATCH", f"/api/issues/{issue_id}", body)

    def close_issue(self, issue_id: str, run_id: str, comment: str) -> bool:
        """Close an issue under the wake that holds it: a routine's issue is checked out to its wake's
        run, which takes updates only while that wake is still being answered."""
        return self._write("PATCH", f"/api/issues/{issue_id}", {"status": "done", "comment": comment[:COMMENT_MAX]},
                           run_id=run_id)

    def _agent_for(self, role: str, agent_ids: Mapping[str, str]) -> tuple[str | None, str | None, str | None]:
        """(key, agentId, billingCode) a role's cost event is posted with.

        Paperclip accepts a cost event only for the agent its key belongs to, so a role with a key
        of its own reports as itself; one without reports through the Head trader, tagged.
        """
        key = self.role_keys.get(role)
        if key:
            agent_id = agent_ids.get(role) or self._agent_ids.get(key) or (self.me(key) or {}).get("id")
            if agent_id:
                return key, str(agent_id), None
        head = agent_ids.get(HEAD_TRADER) or self._agent_ids.get(self.api_key) or (self.me() or {}).get("id")
        return self.api_key, (str(head) if head else None), f"role:{role}"

    def cost_event(self, *, role: str, provider: str, model: str, input_tokens: int, output_tokens: int,
                   cost_cents: float, occurred_at: str, idempotency_key: str, issue_id: str | None = None,
                   agent_ids: Mapping[str, str] | None = None) -> bool:
        """``POST /api/companies/{companyId}/cost-events`` for one role's model usage."""
        key, agent_id, billing_code = self._agent_for(role, agent_ids or {})
        if not agent_id:
            self.last_error = f"no Paperclip agent id for role {role}"
            return False
        body: dict[str, Any] = {
            "agentId": agent_id,
            "provider": provider,
            "model": model,
            "inputTokens": int(input_tokens),
            "outputTokens": int(output_tokens),
            "costCents": round(float(cost_cents), 4),
            "occurredAt": occurred_at,
            "idempotencyKey": idempotency_key,
        }
        if issue_id:
            body["issueId"] = issue_id
        if billing_code:
            body["billingCode"] = billing_code
        response = self._request("POST", f"/api/companies/{self.company_id}/cost-events", key=key, body=body)
        return response is not None and 200 <= response.status_code < 300
