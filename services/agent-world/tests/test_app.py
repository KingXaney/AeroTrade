import json
import threading
import time

import pytest
from fastapi.testclient import TestClient

from agent_world.app import HEARTBEAT_MAX_BYTES, ROUTINE_REFUSED, ROUTINE_TAKEN, create_app
from agent_world.emitter import EmitterStats
from agent_world.events import SessionCompleted, SessionStarted
from agent_world.runner import RunOutcome, SessionResult
from agent_world.signing import signed_headers, verify
from agent_world.worker import Worker
from conftest import AEROTRADE, SECRET, make_settings

HEARTBEAT = "heartbeat-test-secret"


class ListEmitter:
    def __init__(self):
        self.events = []
        self.dropped = 0

    def emit(self, event):
        self.events.append(event)
        return True

    def close(self, budget_s):
        return EmitterStats(emitted=len(self.events), delivered=len(self.events))


class Stub:
    """A worker whose sessions run no graph: each waits for the gate, then completes."""

    def __init__(self):
        self.gate = threading.Event()
        self.ran = []
        self.emitters = []
        self.forwarded = []
        self.closed = []

    def run(self, request, emitter, paperclip, settings, **kw):
        self.ran.append(request.sessionId)
        emitter.emit(SessionStarted(symbols=request.symbols, tradeDate=request.trade_date, approval=request.approval,
                                    dryRun=request.dryRun, models=settings.models))
        self.gate.wait(10)
        emitter.emit(SessionCompleted(runs=[], tokensIn=0, tokensOut=0, costCents=0, llmCalls=0, toolCalls=0, dropped=0))
        return SessionResult(session_id=request.sessionId, status="completed",
                             runs=[RunOutcome(symbol=s, status="completed", rating="Hold") for s in request.symbols])

    def worker(self, settings):
        def emitter_factory(request):
            emitter = ListEmitter()
            self.emitters.append(emitter)
            return emitter

        return Worker(settings, run=self.run, emitter_factory=emitter_factory,
                      paperclip_factory=lambda request: type("P", (), {"configured": False, "close": lambda s: None})())

    def forward(self, url, body, headers):
        self.forwarded.append((url, body, headers))
        return 202

    def close(self, issue_id, run_id, comment):
        self.closed.append((issue_id, run_id, comment))
        return True


@pytest.fixture
def stub():
    return Stub()


@pytest.fixture
def client(stub):
    app = create_app(make_settings(PAPERCLIP_ROLE_KEYS='{"market": "key-1", "trader": "key-2"}'),
                     worker_factory=stub.worker, register_vendors=False, prepare=False, forward=stub.forward,
                     close_issue=stub.close)
    with TestClient(app) as test_client:
        try:
            yield test_client
        finally:
            stub.gate.set()


def run_body(session_id="aw-2026-10-26", symbols=("AAPL",), callback=f"{AEROTRADE}/api/agent-world/events", **extra):
    body = {
        "sessionId": session_id,
        "symbols": list(symbols),
        "tradeDate": "2026-10-26",
        "portfolio": {"cash": 100000, "currency": "USD",
                      "positions": [{"ticker": "AAPL", "quantity": 10, "averagePrice": 180.5}]},
        "callbackUrl": callback,
        "paperclip": None,
        "approval": "owner",
        "dryRun": False,
    }
    body.update(extra)
    return json.dumps(body, separators=(",", ":")).encode()


def post_run(client, body, *, secret=SECRET, now=None):
    headers = signed_headers(secret, body, now if now is not None else time.time())
    return client.post("/runs", content=body, headers=headers)


def wait_for(predicate, timeout=5.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if predicate():
            return True
        time.sleep(0.02)
    return False


def test_health_shape(client):
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"ok", "service", "versions", "providers", "keys", "vendors", "models", "worker", "paperclip"}
    assert body["ok"] is True
    assert body["service"]["version"] == "0.1.0" and isinstance(body["service"]["uptimeS"], int)
    assert body["versions"]["tradingagents"] == "0.7.1"
    for name in ("python", "openbb-core", "openbb-yfinance", "openbb-equity", "openbb-news", "openbb-economy",
                 "openbb-technical", "openbb-sec", "openbb-fred"):
        assert name in body["versions"]
    assert set(body["providers"]) == {"yfinance", "sec", "fred"}
    assert all(isinstance(v, bool) for v in body["providers"].values())
    assert body["keys"] == {"google": False, "anthropic": False, "fred": False, "secEdgarUserAgent": False,
                            "paperclip": False, "roleKeys": 2}
    assert body["vendors"]["get_stock_data"] == ["openbb", "yfinance"]
    assert body["vendors"]["get_balance_sheet"] == ["openbb", "sec_edgar", "yfinance"]
    assert body["vendors"]["get_global_news"] == ["yfinance"]
    assert body["vendors"]["get_macro_indicators"] == ["fred", "openbb"]
    assert body["models"] == {"provider": "google", "quick": "gemini-2.5-flash-lite", "deep": "gemini-2.5-flash"}
    assert body["worker"] == {"busy": False, "sessionId": None, "symbol": None, "index": None}
    assert body["paperclip"] == {"configured": False, "reachable": None}
    assert SECRET not in response.text and "key-1" not in response.text and HEARTBEAT not in response.text


def test_runs_need_a_valid_signature(client):
    body = run_body()
    assert client.post("/runs", content=body, headers={"Content-Type": "application/json"}).status_code == 401
    assert post_run(client, body, secret="not-the-right-secret").status_code == 401
    assert post_run(client, body, now=time.time() - 301).status_code == 401
    headers = signed_headers(SECRET, body, time.time())
    assert client.post("/runs", content=body + b" ", headers=headers).status_code == 401  # not the bytes signed


def test_queued_known_and_busy(client, stub):
    first = post_run(client, run_body("aw-2026-10-26"))
    assert first.status_code == 202 and first.json() == {"sessionId": "aw-2026-10-26", "status": "queued"}
    assert wait_for(lambda: stub.ran == ["aw-2026-10-26"])
    again = post_run(client, run_body("aw-2026-10-26"))
    assert again.status_code == 200 and again.json()["sessionId"] == "aw-2026-10-26"
    other = post_run(client, run_body("aw-2026-10-26-manual-20261026-1400"))
    assert other.status_code == 409 and other.json() == {"error": "busy", "sessionId": "aw-2026-10-26"}
    health = client.get("/health").json()["worker"]
    assert health["busy"] is True and health["sessionId"] == "aw-2026-10-26"

    snapshot = client.get("/runs/aw-2026-10-26")
    assert snapshot.status_code == 200 and snapshot.json()["status"] == "running"
    stub.gate.set()
    assert wait_for(lambda: client.get("/runs/aw-2026-10-26").json()["status"] == "completed")
    done = client.get("/runs/aw-2026-10-26").json()
    assert done["runs"] == [{"symbol": "AAPL", "status": "completed", "rating": "Hold", "review": False, "reason": None}]
    assert done["delivery"]["delivered"] == 2
    assert [e.type for e in stub.emitters[0].events] == ["session.started", "session.completed"]
    assert wait_for(lambda: client.get("/health").json()["worker"]["busy"] is False)
    # A known id stays known after it finished.
    assert post_run(client, run_body("aw-2026-10-26")).status_code == 200
    assert client.get("/runs/aw-nope").status_code == 404


@pytest.mark.parametrize("body", [
    run_body(callback="https://elsewhere.example/api/agent-world/events"),
    run_body(callback="http://aerotrade.example/api/agent-world/events"),
])
def test_callback_must_be_on_aerotrade_origin(client, body):
    response = post_run(client, body)
    assert response.status_code == 400 and response.json()["error"] == "callback-origin"


@pytest.mark.parametrize("body", [
    b"not json",
    run_body(session_id="aw 2026"),
    run_body(session_id="x" * 81),
    run_body(symbols=["aapl"]),
    run_body(symbols=[]),
    run_body(symbols=[f"S{i}" for i in range(11)]),
    run_body(symbols=["AAPL", "AAPL"]),
    run_body(tradeDate="2026-13-01"),
    run_body(approval="nobody"),
])
def test_bad_bodies_are_400(client, body):
    response = post_run(client, body)
    assert response.status_code == 400 and response.json()["error"] == "invalid"


def test_oversized_bodies_are_413(client):
    body = run_body(portfolio={"cash": 1, "currency": "USD", "positions": [], "pad": "x" * 70_000})
    assert post_run(client, body).status_code == 413


def routine_wake(**context):
    """A routine run's wake as Paperclip v2026.1023.0 posts it, its issue as markdown included."""
    return {"agentId": "agent-1", "runId": "run-1", "connectionInstructions": None,
            "context": {"source": "routine.dispatch", "issueId": "issue-9", "taskId": "issue-9",
                        "wakeReason": "issue_assigned", "wakeSource": "assignment",
                        "paperclipTaskMarkdown": "x" * 100_000, **context}}


def test_heartbeat_needs_its_header(client, stub):
    beat = routine_wake()
    assert client.post("/paperclip/heartbeat", json=beat).status_code == 401
    assert client.post("/paperclip/heartbeat", json=beat, headers={"X-Agent-World-Heartbeat": "wrong"}).status_code == 401
    assert stub.forwarded == [] and stub.closed == []


def test_heartbeat_relays_a_routine_run_and_closes_its_issue(client, stub):
    response = client.post("/paperclip/heartbeat", json=routine_wake(), headers={"X-Agent-World-Heartbeat": HEARTBEAT})
    assert response.status_code == 200 and response.json() == {"forwarded": True, "closed": True}
    url, body, headers = stub.forwarded[0]
    assert url == f"{AEROTRADE}/api/agent-world/sessions"
    assert json.loads(body) == {"source": "paperclip", "paperclipRunId": "run-1", "taskId": "issue-9",
                                "wakeReason": "issue_assigned", "agentId": "agent-1"}
    assert verify(SECRET, headers["X-Agent-World-Timestamp"], headers["X-Agent-World-Signature"], body, time.time())
    # Under the wake's own run, while the wake is still being answered.
    assert stub.closed == [("issue-9", "run-1", ROUTINE_TAKEN)]


@pytest.mark.parametrize("context", [
    {"source": "on_demand", "wakeReason": "execution_agent_world_session"},  # the service's own run
    {"source": "issue.create", "wakeReason": "issue_assigned"},  # an issue handed to the Head trader
    {"source": None, "wakeReason": "execution_changes_requested"},  # a declined session
    {"source": None, "wakeReason": "issue_disposition_repair"},  # Paperclip's repair wakes
    {"wakeReason": "routine"},  # the names the docs suggested, which Paperclip never sends
])
def test_heartbeat_ignores_every_other_wake(client, stub, context):
    beat = {"agentId": "a", "runId": "r", "context": {"issueId": "issue-1", **context}}
    response = client.post("/paperclip/heartbeat", json=beat, headers={"X-Agent-World-Heartbeat": HEARTBEAT})
    assert response.status_code == 200 and response.json() == {"forwarded": False, "ignored": True}
    assert stub.forwarded == [] and stub.closed == []


def test_heartbeat_refuses_a_body_past_its_cap(client, stub):
    response = client.post("/paperclip/heartbeat", content=b"x" * (HEARTBEAT_MAX_BYTES + 1),
                           headers={"X-Agent-World-Heartbeat": HEARTBEAT, "Content-Type": "application/json"})
    assert response.status_code == 413 and stub.forwarded == []


def test_heartbeat_answers_200_when_aerotrade_is_down(stub):
    def down(url, body, headers):
        raise ConnectionError("refused")

    app = create_app(make_settings(), worker_factory=stub.worker, register_vendors=False, prepare=False, forward=down,
                     close_issue=stub.close)
    with TestClient(app) as test_client:
        response = test_client.post("/paperclip/heartbeat", json=routine_wake(), headers={"X-Agent-World-Heartbeat": HEARTBEAT})
        assert response.status_code == 200 and response.json() == {"forwarded": False, "closed": True}
        # Closed all the same, saying why, so the routine's next run is not skipped behind it.
        assert stub.closed == [("issue-9", "run-1", ROUTINE_REFUSED.format(why="AeroTrade could not be reached"))]
        bad = test_client.post("/paperclip/heartbeat", content=b"{nope", headers={"X-Agent-World-Heartbeat": HEARTBEAT})
        assert bad.status_code == 200 and bad.json() == {"forwarded": False}


def test_heartbeat_says_aerotrades_refusal_on_the_routine_issue(stub):
    app = create_app(make_settings(), worker_factory=stub.worker, register_vendors=False, prepare=False,
                     forward=lambda url, body, headers: 429, close_issue=stub.close)
    with TestClient(app) as test_client:
        response = test_client.post("/paperclip/heartbeat", json=routine_wake(), headers={"X-Agent-World-Heartbeat": HEARTBEAT})
        assert response.json() == {"forwarded": False, "closed": True}
        assert stub.closed[0][2] == ROUTINE_REFUSED.format(why="HTTP 429")


def test_no_heartbeat_secret_means_no_heartbeat(stub):
    settings = make_settings(PAPERCLIP_HEARTBEAT_SECRET=None)
    assert settings.heartbeat_secret is None
    app = create_app(settings, worker_factory=stub.worker, register_vendors=False, prepare=False, forward=stub.forward)
    with TestClient(app) as test_client:
        response = test_client.post("/paperclip/heartbeat", json=routine_wake(),
                                    headers={"X-Agent-World-Heartbeat": ""})
        assert response.status_code == 401
