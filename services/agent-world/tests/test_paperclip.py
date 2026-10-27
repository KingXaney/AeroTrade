"""The service's Paperclip calls, as a running Paperclip v2026.1023.0 took them on 2026-10-27."""

import json

import httpx

from agent_world.paperclip import RUN_REASON, PaperclipClient

HEAD_KEY = "head-key"


class Recorder:
    def __init__(self, answers=None):
        self.requests = []
        self.answers = answers or {}

    def __call__(self, request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content) if request.content else None
        self.requests.append((request.method, request.url.path, dict(request.headers), body))
        key = f"{request.method} {request.url.path}"
        status, payload = self.answers.get(key, (200, {"id": "ok"}))
        return httpx.Response(status, json=payload)


def client(recorder, *, run_id=None, role_keys=None):
    return PaperclipClient("http://paperclip.test", HEAD_KEY, "company-1", role_keys or {}, run_id=run_id,
                           transport=httpx.MockTransport(recorder))


def test_a_run_on_the_issue_is_asked_for_without_a_run_header_and_named_by_every_write():
    recorder = Recorder({"POST /api/agents/head-1/heartbeat/invoke": (202, {"id": "run-7", "status": "queued"})})
    pc = client(recorder, run_id="routine-run")
    assert pc.start_run("issue-1", "head-1") == "run-7"
    method, path, headers, body = recorder.requests[0]
    assert (method, path) == ("POST", "/api/agents/head-1/heartbeat/invoke")
    assert body == {"reason": RUN_REASON, "payload": {"issueId": "issue-1"}}
    assert RUN_REASON.startswith("execution_")  # keeps Paperclip from checking the backlog issue out
    assert "x-paperclip-run-id" not in headers
    assert headers["authorization"] == f"Bearer {HEAD_KEY}"

    assert pc.comment("issue-1", "AAPL: Buy")
    assert pc.done("issue-1", "Session finished.")
    comment, done = recorder.requests[1], recorder.requests[2]
    assert (comment[0], comment[1], comment[3]) == ("POST", "/api/issues/issue-1/comments", {"body": "AAPL: Buy"})
    assert (done[0], done[1], done[3]) == ("PATCH", "/api/issues/issue-1", {"status": "done", "comment": "Session finished."})
    assert comment[2]["x-paperclip-run-id"] == "run-7" and done[2]["x-paperclip-run-id"] == "run-7"


def test_without_a_new_run_the_request_s_own_run_is_named():
    recorder = Recorder({"POST /api/agents/head-1/heartbeat/invoke": (409, {"error": "Agent is paused"})})
    pc = client(recorder, run_id="routine-run")
    assert pc.start_run("issue-1", "head-1") is None
    assert pc.comment("issue-1", "note")
    assert recorder.requests[-1][2]["x-paperclip-run-id"] == "routine-run"


def test_no_run_at_all_sends_no_write_paperclip_would_refuse():
    recorder = Recorder()
    pc = client(recorder)
    assert not pc.comment("issue-1", "note") and not pc.done("issue-1", "done")
    assert recorder.requests == [] and "no Paperclip run" in (pc.last_error or "")


def test_blocked_names_the_head_trader_as_the_one_to_unblock_it():
    recorder = Recorder({"GET /api/agents/me": (200, {"id": "head-1", "status": "active"})})
    pc = client(recorder, run_id="run-7")
    assert pc.blocked("issue-1", "Session stopped (limit): 429")
    method, path, headers, body = recorder.requests[-1]
    assert (method, path) == ("PATCH", "/api/issues/issue-1")
    assert body == {"status": "blocked", "comment": "Session stopped (limit): 429",
                    "unblockDescriptor": {"owner": {"agentId": "head-1"}, "action": "Session stopped (limit): 429"}}
    assert headers["x-paperclip-run-id"] == "run-7"


def test_a_cost_event_goes_with_the_role_s_own_key_and_no_run():
    recorder = Recorder()
    pc = client(recorder, run_id="run-7", role_keys={"market": "market-key"})
    assert pc.cost_event(role="market", provider="google", model="gemini-2.5-flash-lite", input_tokens=1200,
                         output_tokens=300, cost_cents=0.0123, occurred_at="2026-10-27T13:00:00Z",
                         idempotency_key="aw-1:AAPL:market:1", issue_id="issue-1", agent_ids={"market": "agent-m"})
    method, path, headers, body = recorder.requests[-1]
    assert (method, path) == ("POST", "/api/companies/company-1/cost-events")
    assert headers["authorization"] == "Bearer market-key" and "x-paperclip-run-id" not in headers
    assert body["agentId"] == "agent-m" and body["occurredAt"] == "2026-10-27T13:00:00Z" and "billingCode" not in body


def test_a_role_without_a_key_reports_through_the_head_trader_tagged():
    recorder = Recorder()
    pc = client(recorder)
    assert pc.cost_event(role="bear", provider="google", model="m", input_tokens=1, output_tokens=1, cost_cents=0,
                         occurred_at="2026-10-27T13:00:00Z", idempotency_key="k", agent_ids={"head-trader": "head-1"})
    headers, body = recorder.requests[-1][2], recorder.requests[-1][3]
    assert headers["authorization"] == f"Bearer {HEAD_KEY}"
    assert body["agentId"] == "head-1" and body["billingCode"] == "role:bear"


def test_a_routine_issue_is_closed_under_the_wake_s_own_run():
    recorder = Recorder()
    pc = client(recorder, run_id="some-other-run")
    assert pc.close_issue("issue-9", "wake-run", "Handed to AeroTrade.")
    method, path, headers, body = recorder.requests[-1]
    assert (method, path, body) == ("PATCH", "/api/issues/issue-9", {"status": "done", "comment": "Handed to AeroTrade."})
    assert headers["x-paperclip-run-id"] == "wake-run"


def test_an_unreachable_paperclip_costs_one_timeout_then_stays_quiet():
    calls = []

    def down(request):
        calls.append(request.url.path)
        raise httpx.ConnectError("refused")

    pc = PaperclipClient("http://paperclip.test", HEAD_KEY, "company-1", run_id="run-7",
                         transport=httpx.MockTransport(down))
    assert pc.me() is None and pc.reachable is False
    assert not pc.comment("issue-1", "note")
    assert calls == ["/api/agents/me"]
