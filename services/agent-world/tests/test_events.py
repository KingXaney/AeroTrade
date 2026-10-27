import json
from pathlib import Path

import pytest
from langchain_core.messages import AIMessage, ToolMessage

from agent_world import fixture
from agent_world.events import (
    EVENT_TYPES,
    RoleReport,
    StageMachine,
    ToolCalled,
    ToolResult,
    parse_event,
    to_wire,
    tool_status,
)

FIXTURE = fixture.load()
AAPL, MSFT = FIXTURE["runs"]

PINNED_AAPL = [
    "run.started", "role.started market", "role.started sentiment", "role.started news",
    "role.started fundamentals", "tool.called market/get_stock_data", "tool.called news/get_news",
    "tool.called news/get_global_news", "tool.called news/get_macro_indicators",
    "tool.called fundamentals/get_fundamentals", "tool.called fundamentals/get_balance_sheet",
    "tool.called fundamentals/get_insider_transactions", "tool.result market/get_stock_data",
    "limit openbb-yfinance", "tool.result news/get_news", "tool.result news/get_global_news",
    "tool.result news/get_macro_indicators", "tool.called market/get_indicators",
    "tool.called market/get_indicators", "tool.result market/get_indicators",
    "tool.result market/get_indicators", "tool.result fundamentals/get_fundamentals",
    "tool.result fundamentals/get_balance_sheet", "tool.result fundamentals/get_insider_transactions",
    "role.report sentiment", "role.done sentiment", "role.report news", "role.done news",
    "role.report market", "role.done market", "role.report fundamentals", "role.done fundamentals",
    "role.started bull", "memory.note", "debate.turn bull", "role.started bear", "debate.turn bear",
    "role.done bull", "role.done bear", "role.started research-manager", "role.report research-manager",
    "role.done research-manager", "role.started trader", "role.report trader", "role.done trader",
    "role.started risk-aggressive", "risk.turn risk-aggressive", "role.started risk-conservative",
    "risk.turn risk-conservative", "role.started risk-neutral", "risk.turn risk-neutral",
    "role.done risk-aggressive", "role.done risk-conservative", "role.done risk-neutral",
    "role.started portfolio-manager", "role.report portfolio-manager", "role.done portfolio-manager",
    "run.completed Buy",
]
PINNED_MSFT = [
    "run.started", "role.started market", "role.started sentiment", "role.started news",
    "role.started fundamentals", "tool.called market/get_stock_data", "tool.called market/get_indicators",
    "tool.called news/get_news", "tool.called fundamentals/get_fundamentals",
    "tool.called fundamentals/get_income_statement", "tool.result market/get_stock_data",
    "tool.result market/get_indicators", "tool.result news/get_news",
    "tool.result fundamentals/get_fundamentals", "tool.result fundamentals/get_income_statement",
    "role.report sentiment", "role.done sentiment", "role.report news", "role.done news",
    "role.report market", "role.done market", "role.report fundamentals", "role.done fundamentals",
    "role.started bull", "debate.turn bull", "role.started bear", "debate.turn bear", "role.done bull",
    "role.done bear", "role.started research-manager", "role.report research-manager",
    "role.done research-manager", "role.started trader", "role.report trader", "role.done trader",
    "role.started risk-aggressive", "risk.turn risk-aggressive", "role.started risk-conservative",
    "risk.turn risk-conservative", "role.started risk-neutral", "risk.turn risk-neutral",
    "role.done risk-aggressive", "role.done risk-conservative", "role.done risk-neutral",
    "role.started portfolio-manager", "role.report portfolio-manager", "role.done portfolio-manager",
    "run.completed REVIEW",
]


def _who(event) -> str:
    data = event.model_dump()
    if event.type in ("tool.called", "tool.result"):
        return f"{data['role']}/{data['name']}"
    if event.type == "debate.turn":
        return data["side"]
    if event.type == "limit":
        return data["provider"]
    if event.type == "run.completed":
        return data["rating"]
    return data.get("role") or ""


def _fold(run, index, **kw):
    return [event for _, event in fixture.fold_run(run, index=index, total=2, costs=False, **kw)]


def _compact(events):
    return [f"{e.type} {_who(e)}".strip() for e in events]


def test_aapl_folds_to_the_pinned_events():
    assert _compact(_fold(AAPL, 0)) == PINNED_AAPL


def test_msft_folds_to_the_pinned_events():
    assert _compact(_fold(MSFT, 1)) == PINNED_MSFT


def test_every_role_starts_reports_or_turns_and_finishes_once():
    events = _fold(AAPL, 0)
    from agent_world.roles import ROLE_IDS

    for role in ROLE_IDS:
        started = [e for e in events if e.type == "role.started" and e.role == role]
        done = [e for e in events if e.type == "role.done" and e.role == role]
        assert len(started) == 1 and len(done) == 1, role
        assert events.index(started[0]) < events.index(done[0])


def test_texts_carry_only_the_new_turn():
    events = _fold(AAPL, 0)
    bull = next(e for e in events if e.type == "debate.turn" and e.side == "bull")
    assert bull.round == 1 and bull.text.startswith("The trend, the services mix")
    assert "Bull Analyst:" not in bull.text
    neutral = next(e for e in events if e.type == "risk.turn" and e.role == "risk-neutral")
    assert neutral.text.startswith("Both sides agree on direction")
    pm = next(e for e in events if isinstance(e, RoleReport) and e.role == "portfolio-manager")
    assert pm.text.splitlines()[0] == "Rating: Buy"


def test_tool_results_carry_the_recorder_rows():
    events = _fold(AAPL, 0)
    results = {e.callId: e for e in events if isinstance(e, ToolResult)}
    fell_through = results["call-aapl-mkt-1"]
    assert fell_through.status == "ok" and fell_through.vendor == "yfinance"
    assert [(a.vendor, a.ok) for a in fell_through.attempts] == [("openbb", False), ("yfinance", True)]
    assert fell_through.ms == 912 + 655
    unavailable = results["call-aapl-fund-2"]
    assert unavailable.status == "unavailable" and unavailable.vendor is None and len(unavailable.attempts) == 3
    assert results["call-aapl-news-1"].vendor == "openbb"
    called = next(e for e in events if isinstance(e, ToolCalled) and e.callId == "call-aapl-mkt-1")
    assert json.loads(called.args) == {"end_date": "2026-10-26", "start_date": "2026-09-25"}


def test_review_path():
    events = _fold(MSFT, 1)
    completed = events[-1]
    assert completed.type == "run.completed" and completed.rating == "REVIEW" and completed.review is True
    # Without the Portfolio Manager's own rating in the state, the decision text is read: none here.
    machine = StageMachine("MSFT", 1, 2)
    final = {"final_trade_decision": MSFT["steps"][-1]["chunk"]["final_trade_decision"]}
    from tradingagents.agents.rating import run_rating

    assert run_rating(final) == "REVIEW"
    assert machine.finish(run_rating(final), final)[-1].rating == "REVIEW"
    # The AAPL decision's opening line is read as Buy.
    assert run_rating({"final_trade_decision": AAPL["steps"][-1]["chunk"]["final_trade_decision"]}) == "Buy"
    # Anything outside the scale is REVIEW.
    assert machine.finish("Strong Buy", final)[-1].rating == "REVIEW"


def test_messages_are_deduplicated_by_id():
    machine = StageMachine("AAPL", 0, 1)
    machine.start()
    call = AIMessage(content="", id="ai-1", tool_calls=[{"name": "get_stock_data", "args": {}, "id": "c1", "type": "tool_call"}])
    result = ToolMessage(content="DATA_UNAVAILABLE: none", tool_call_id="c1", name="get_stock_data")
    namespace = ("Market Analyst:abc",)
    first = machine.feed(namespace, [call], None) + machine.feed(namespace, [result], None)
    again = machine.feed(namespace, [call, result], None)
    assert [e.type for e in first] == ["tool.called", "tool.result"]
    assert again == []
    assert first[1].status == "unavailable" and first[1].attempts == []


def test_a_report_after_the_last_tool_round_is_forced():
    machine = StageMachine("AAPL", 0, 1, max_tool_rounds=1)
    machine.start()
    namespace = ("News Analyst:abc",)
    call = AIMessage(content="", id="ai-1", tool_calls=[{"name": "get_news", "args": {}, "id": "c1", "type": "tool_call"}])
    machine.feed(namespace, [call], None)
    events = machine.feed(namespace, [AIMessage(content="report", id="ai-2")], {"news_report": "News report text."})
    report = next(e for e in events if e.type == "role.report")
    assert report.role == "news" and report.forced is True


def test_an_empty_analyst_report_still_closes_the_analyst():
    machine = StageMachine("AAPL", 0, 1)
    machine.start()
    state = {"market_report": "m", "sentiment_report": "s", "news_report": "", "fundamentals_report": "f",
             "investment_debate_state": {}, "risk_debate_state": {}}
    machine.feed((), [], {"market_report": ""})  # the run's input
    events = machine.feed((), [], state)
    assert ("role.done", "news") in [(e.type, getattr(e, "role", None)) for e in events]
    assert not any(e.type == "role.report" and e.role == "news" for e in events)
    assert events[-1].type == "role.started" and events[-1].role == "bull"


def test_texts_are_cut_to_their_clamps():
    long = "x" * 20_000
    report = RoleReport(symbol="AAPL", role="market", text=long)
    assert len(report.text) == 12_000
    called = ToolCalled(symbol="AAPL", role="market", name="n" * 200, args=long, callId="c" * 200)
    assert len(called.args) == 400 and len(called.name) == 80 and len(called.callId) == 80
    result = ToolResult(symbol="AAPL", role="market", callId="c", name="get_news", status="ok", chars=1,
                        attempts=[{"vendor": f"v{i}", "ok": False, "error": "e" * 500} for i in range(9)])
    assert len(result.attempts) == 6 and len(result.attempts[0].error) == 200
    machine = StageMachine("AAPL", 0, 1)
    turn = machine.feed((), [], {"investment_debate_state": {"bull_history": "\nBull Analyst: " + long, "count": 1,
                                                             "current_response": "Bull Analyst: x"}})
    assert len(next(e for e in turn if e.type == "debate.turn").text) == 6_000
    failed = machine.fail("error", "m" * 1000)[0]
    assert len(failed.message) == 300


def test_tool_status_reads_the_sentinels():
    assert tool_status("DATA_UNAVAILABLE: x") == "unavailable"
    assert tool_status("  NO_DATA_AVAILABLE: x") == "no-data"
    assert tool_status("# Stock data for AAPL") == "ok"


def test_exported_stream_is_valid_and_up_to_date():
    """scripts/qa/fixtures/agent-world-events.json is what scripts/export_fixture.py writes now."""
    import importlib.util

    service = Path(__file__).resolve().parent.parent
    spec = importlib.util.spec_from_file_location("export_fixture", service / "scripts" / "export_fixture.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    payload = module.build(fixture.load())
    assert module.check(payload) == []
    on_disk = json.loads(module.DEFAULT_OUT.read_text(encoding="utf-8"))
    assert on_disk == payload, "run: uv run python scripts/export_fixture.py"
    for event in on_disk["events"]:
        assert event["type"] in EVENT_TYPES
        assert to_wire(parse_event(event)) == event


@pytest.mark.parametrize("run,index", [(AAPL, 0), (MSFT, 1)])
def test_folding_is_deterministic(run, index):
    assert [to_wire(e) for e in _fold(run, index)] == [to_wire(e) for e in _fold(run, index)]
