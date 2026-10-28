"""run_session end to end over a scripted graph: the recorded fixture streamed in LangGraph's shapes."""

import dataclasses
import threading
import time
import uuid
from types import SimpleNamespace

import pytest
from langchain_core.messages import AIMessage
from langchain_core.outputs import ChatGeneration, LLMResult

from agent_world import fixture
from agent_world.contract import RunRequest
from agent_world.limits import LimitSignal
from agent_world.roles import ROLE_BY_ID
from agent_world.runner import run_session
from agent_world.vendors.recorder import SINK
from conftest import AEROTRADE, make_settings

FIXTURE = fixture.load()
RUNS = {run["symbol"]: run for run in FIXTURE["runs"]}


class ListEmitter:
    def __init__(self):
        self.events = []
        self.lock = threading.Lock()

    def emit(self, event):
        with self.lock:
            self.events.append(event)
        return True

    @property
    def dropped(self):
        return 0

    def types(self):
        return [e.type for e in self.events]


class FakePaperclip:
    def __init__(self, me=None, configured=True):
        self.configured = configured
        self._me = me if me is not None else {"id": "head-1", "status": "active", "budgetMonthlyCents": 3000,
                                              "spentMonthlyCents": 120}
        self.calls = []

    def me(self, key=None):
        self.calls.append(("me",))
        return self._me if self._me != "down" else None

    def start_run(self, issue_id, agent_id):
        self.calls.append(("start_run", issue_id, agent_id))
        return "run-on-issue"

    def comment(self, issue_id, body):
        self.calls.append(("comment", issue_id, body))
        return True

    def done(self, issue_id, comment):
        self.calls.append(("done", issue_id, comment))
        return True

    def blocked(self, issue_id, comment):
        self.calls.append(("blocked", issue_id, comment))
        return True

    def cost_event(self, **kw):
        self.calls.append(("cost", kw))
        return True

    def named(self, name):
        return [c for c in self.calls if c[0] == name]


def _usage_result(model, tokens_in, tokens_out):
    message = AIMessage(content="", usage_metadata={"input_tokens": tokens_in, "output_tokens": tokens_out,
                                                    "total_tokens": tokens_in + tokens_out},
                        response_metadata={"model_name": model})
    return LLMResult(generations=[[ChatGeneration(message=message)]])


class ScriptedGraph:
    """Streams one recorded run in LangGraph's (namespace, mode, chunk) shape and plays its model
    calls and vendor rows into the handlers the runner wired."""

    def __init__(self, run, callbacks, *, stall_s=0.0, fail=None):
        self.config = {}
        self.run = run
        self.stats = callbacks[0]
        self.stall_s = stall_s
        self.fail = fail
        self.recorded = []
        self.propagator = SimpleNamespace(get_graph_args=lambda callbacks=None: {"config": {"callbacks": callbacks or []}})
        self.graph = SimpleNamespace(stream=self._stream)

    def create_run_state(self, symbol, trade_date, asset_type="stock", portfolio=None):
        self.portfolio = portfolio
        return {"messages": [("human", symbol)]}

    def record_decision(self, symbol, trade_date, final_state):
        self.recorded.append((symbol, trade_date))

    def _models(self):
        for row in self.run["usage"]:
            node = ROLE_BY_ID[row["role"]].node
            metadata = {"langgraph_node": node, "ls_model_name": row["model"]}
            if row["role"] in ("market", "sentiment", "news", "fundamentals"):
                metadata = {"langgraph_node": "agent", "langgraph_checkpoint_ns": f"{node}:t|agent:a",
                            "ls_model_name": row["model"]}
            run_id = uuid.uuid4()
            self.stats.on_chat_model_start({}, [[]], run_id=run_id, metadata=metadata)
            self.stats.on_llm_end(_usage_result(row["model"], row["inputTokens"], row["outputTokens"]), run_id=run_id)

    def _stream(self, graph_input, subgraphs, stream_mode, config):
        sink = SINK.get()
        for index, step in enumerate(self.run["steps"]):
            if self.stall_s and index == 2:
                time.sleep(self.stall_s)
            if self.fail is not None and index == 3:
                raise self.fail
            messages = [fixture.rehydrate(m) for m in step["messages"]]
            for message in messages:
                if message.type == "tool":
                    for row in self.run["attempts"].get(message.tool_call_id, []):
                        sink.add({**row, "call": message.tool_call_id})
            for note in step.get("limits") or []:
                sink.note_limit(LimitSignal(note["provider"], note["status"], note["message"], note["fatal"]))
            if index == len(self.run["steps"]) - 1:
                self._models()
            if step["namespace"]:
                result = {"messages": messages, **(step["chunk"] or {})}
                yield tuple(step["namespace"]), "tasks", {"id": "t", "name": "agent", "result": result}
            else:
                yield (), "values", {**step["chunk"], "messages": messages}


def request(symbols=("AAPL", "MSFT"), issue="issue-1", dry_run=False):
    return RunRequest.model_validate({
        "sessionId": "aw-2026-10-26",
        "symbols": list(symbols),
        "tradeDate": "2026-10-26",
        "portfolio": {"cash": 100000, "currency": "USD",
                      "positions": [{"ticker": "AAPL", "quantity": 10, "averagePrice": 180.5}]},
        "callbackUrl": f"{AEROTRADE}/api/agent-world/events",
        "paperclip": {"issueId": issue, "runId": "pc-run-1", "agentIds": {"head-trader": "head-1", "market": "agent-m"}}
        if issue else None,
        "approval": "owner",
        "dryRun": dry_run,
    })


def factory(stall=None, fail=None):
    def make(*, selected_analysts, config, callbacks):
        assert selected_analysts == ("market", "social", "news", "fundamentals")
        assert config["data_vendors"]["core_stock_apis"] == "openbb,yfinance" and config["checkpoint_enabled"] is False
        symbol = make.symbols.pop(0)
        return ScriptedGraph(RUNS[symbol], callbacks, stall_s=(stall or {}).get(symbol, 0.0),
                             fail=(fail or {}).get(symbol))
    make.symbols = ["AAPL", "MSFT"]
    return make


def test_a_session_streams_both_runs_and_closes():
    emitter, paperclip = ListEmitter(), FakePaperclip()
    result = run_session(request(), emitter, paperclip, make_settings(), graph_factory=factory(), ta_defaults={})
    types = emitter.types()
    assert types[0] == "session.started" and types[-1] == "session.completed"
    assert result.status == "completed"
    completed = [e for e in emitter.events if e.type == "run.completed"]
    assert [(e.symbol, e.rating, e.review) for e in completed] == [("AAPL", "Buy", False), ("MSFT", "REVIEW", True)]
    session = emitter.events[-1]
    assert [(r.symbol, r.rating) for r in session.runs] == [("AAPL", "Buy"), ("MSFT", "REVIEW")]
    usage_in = sum(r["inputTokens"] for run in RUNS.values() for r in run["usage"])
    assert session.tokensIn == usage_in and session.costCents > 0 and session.llmCalls == 24
    assert any(e.type == "limit" and e.provider == "openbb-yfinance" and not e.fatal for e in emitter.events)
    ticks = [e for e in emitter.events if e.type == "cost.tick"]
    assert {e.role for e in ticks if e.symbol == "AAPL"} == set(ROLE_BY_ID)
    result_rows = [e for e in emitter.events if e.type == "tool.result" and e.callId == "call-aapl-mkt-1"]
    assert result_rows[0].vendor == "yfinance" and len(result_rows[0].attempts) == 2
    # Paperclip: a run of the Head trader on the issue, one cost event per role and model, a comment
    # per decision, done.
    assert paperclip.named("start_run") == [("start_run", "issue-1", "head-1")]
    costs = [c[1] for c in paperclip.named("cost")]
    assert len(costs) == 24 and costs[0]["idempotency_key"] == "aw-2026-10-26:AAPL:market:1"
    assert all(c["issue_id"] == "issue-1" for c in costs)
    assert [c[2].splitlines()[0] for c in paperclip.named("comment")] == ["AAPL: Buy", "MSFT: REVIEW"]
    assert len(paperclip.named("done")) == 1 and "AAPL Buy; MSFT REVIEW" in paperclip.named("done")[0][2]


def test_a_dry_run_reports_costs_but_leaves_the_issue_alone():
    emitter, paperclip = ListEmitter(), FakePaperclip()
    run_session(request(dry_run=True), emitter, paperclip, make_settings(), graph_factory=factory(), ta_defaults={})
    assert paperclip.named("cost") and not paperclip.named("start_run")
    assert not paperclip.named("comment") and not paperclip.named("done")
    assert emitter.events[0].dryRun is True


def test_a_run_past_its_timeout_fails_and_the_session_moves_on():
    settings = dataclasses.replace(make_settings(), run_timeout_s=1)
    emitter, paperclip = ListEmitter(), FakePaperclip(configured=False)
    started = time.monotonic()
    result = run_session(request(), emitter, paperclip, settings, graph_factory=factory(stall={"AAPL": 2.5}),
                         ta_defaults={})
    failed = [e for e in emitter.events if e.type == "run.failed"]
    assert [(e.symbol, e.reason) for e in failed] == [("AAPL", "timeout")]
    assert result.status == "completed" and [r.symbol for r in emitter.events[-1].runs] == ["MSFT"]
    # Nothing of the timed-out run arrives after its run.failed.
    after = emitter.events[emitter.events.index(failed[0]) + 1:]
    assert all(getattr(e, "symbol", None) != "AAPL" for e in after if e.type != "session.completed")
    assert time.monotonic() - started >= 2.4  # the stray thread was waited for


def test_a_model_quota_ends_the_session():
    from tradingagents.dataflows.errors import VendorError  # noqa: F401  (TradingAgents is importable)

    from test_limits import _google_error

    emitter, paperclip = ListEmitter(), FakePaperclip()
    error = _google_error(429, "RESOURCE_EXHAUSTED", "You exceeded your current quota")
    result = run_session(request(), emitter, paperclip, make_settings(),
                         graph_factory=factory(fail={"AAPL": error}), ta_defaults={})
    types = emitter.types()
    assert types[-3:] == ["limit", "run.failed", "session.failed"]
    limit, failed, session = emitter.events[-3:]
    assert limit.provider == "gemini" and limit.fatal and limit.status == 429
    assert failed.reason == "limit" and session.outcome == "limit"
    assert "run.started" not in types[types.index("run.failed"):]  # MSFT never started
    assert result.status == "failed" and result.outcome == "limit"
    assert len(paperclip.named("blocked")) == 1 and not paperclip.named("done")


def test_an_error_fails_the_run_not_the_session():
    emitter = ListEmitter()
    result = run_session(request(), emitter, FakePaperclip(configured=False), make_settings(),
                         graph_factory=factory(fail={"AAPL": RuntimeError("graph broke")}), ta_defaults={})
    failed = [e for e in emitter.events if e.type == "run.failed"]
    assert [(e.symbol, e.reason) for e in failed] == [("AAPL", "error")]
    assert "RuntimeError: graph broke" in failed[0].message
    assert result.status == "completed" and emitter.types()[-1] == "session.completed"


def test_no_completed_run_fails_the_session():
    emitter = ListEmitter()
    result = run_session(request(symbols=("AAPL",)), emitter, FakePaperclip(configured=False), make_settings(),
                         graph_factory=factory(fail={"AAPL": RuntimeError("graph broke")}), ta_defaults={})
    assert emitter.types()[-1] == "session.failed" and emitter.events[-1].outcome == "error"
    assert result.status == "failed"


@pytest.mark.parametrize("me", [
    {"id": "head-1", "status": "paused", "budgetMonthlyCents": 3000, "spentMonthlyCents": 10},
    {"id": "head-1", "status": "active", "budgetMonthlyCents": 3000, "spentMonthlyCents": 3000},
])
def test_paperclip_budget_stops_before_any_model_call(me):
    emitter, paperclip = ListEmitter(), FakePaperclip(me=me)
    graphs = factory()
    result = run_session(request(), emitter, paperclip, make_settings(), graph_factory=graphs, ta_defaults={})
    assert emitter.types() == ["session.failed"] and emitter.events[0].outcome == "budget"
    assert graphs.symbols == ["AAPL", "MSFT"]  # no graph was built
    assert result.outcome == "budget" and paperclip.named("blocked")


def test_unreachable_paperclip_is_a_note_and_the_run_goes_on():
    emitter, paperclip = ListEmitter(), FakePaperclip(me="down")
    result = run_session(request(), emitter, paperclip, make_settings(), graph_factory=factory(), ta_defaults={})
    assert emitter.types()[:2] == ["session.started", "limit"]
    note = emitter.events[1]
    assert note.provider == "paperclip" and note.symbol is None and not note.fatal
    assert result.status == "completed" and not paperclip.named("start_run")
