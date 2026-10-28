"""The recorder, the registration into TradingAgents' router, and the chains /health reports."""

from types import SimpleNamespace
from typing import TypedDict

import pytest
from langchain_core.messages import AIMessage, ToolMessage
from langchain_core.tools import tool
from langgraph.graph import END, START, MessagesState, StateGraph
from langgraph.prebuilt import ToolNode

from agent_world.config import DEFAULT_DATA_VENDORS
from agent_world.runner import stream_steps
from agent_world.stats import AgentWorldStatsHandler
from agent_world.vendors import DATA_TOOLS, SUPPORTED, chain_for, chains, register_openbb
from agent_world.vendors.recorder import CURRENT_CALL, SINK, Sink, recorded


def test_register_adds_openbb_and_records_every_vendor():
    from tradingagents.agents import tools as ta_tools
    from tradingagents.dataflows import router

    from agent_world.vendors.openbb_vendor import VENDOR_FUNCTIONS
    from agent_world.vendors.recorder import RECORDED_FLAG

    register_openbb()
    register_openbb()  # idempotent
    for method in VENDOR_FUNCTIONS:
        assert "openbb" in router.VENDOR_METHODS[method]
    for method, vendors in router.VENDOR_METHODS.items():
        for vendor, impl in vendors.items():
            fn = impl[0] if isinstance(impl, list) else impl
            assert getattr(fn, RECORDED_FLAG, False), (method, vendor)
    assert getattr(ta_tools.build_verified_market_snapshot, RECORDED_FLAG, False)
    # The static table /health falls back to matches TradingAgents' live one once registered.
    assert {m: set(v) for m, v in router.VENDOR_METHODS.items()} == {m: set(v) for m, v in SUPPORTED.items()}
    assert chains(DEFAULT_DATA_VENDORS) == {m: chain_for(m, DEFAULT_DATA_VENDORS) for m in DATA_TOOLS}


def test_chains_follow_the_router_rule():
    assert chain_for("get_stock_data", DEFAULT_DATA_VENDORS) == ["openbb", "yfinance"]
    assert chain_for("get_fundamentals", DEFAULT_DATA_VENDORS) == ["openbb", "yfinance"]  # SEC serves no overview
    assert chain_for("get_cashflow", DEFAULT_DATA_VENDORS) == ["openbb", "sec_edgar", "yfinance"]
    assert chain_for("get_global_news", DEFAULT_DATA_VENDORS) == ["yfinance"]
    assert chain_for("get_insider_transactions", DEFAULT_DATA_VENDORS) == ["openbb", "yfinance"]
    assert chain_for("get_macro_indicators", DEFAULT_DATA_VENDORS) == ["fred", "openbb"]
    assert chain_for("get_prediction_markets", DEFAULT_DATA_VENDORS) == ["polymarket"]
    assert chain_for("get_verified_market_snapshot", DEFAULT_DATA_VENDORS) == ["yfinance"]


def test_router_falls_through_and_the_recorder_sees_both_attempts(monkeypatch):
    from tradingagents.dataflows import router
    from tradingagents.dataflows.config import run_config
    from tradingagents.dataflows.errors import VendorUnavailableError

    def openbb_down(symbol, start, end):
        raise VendorUnavailableError("OpenBB equity.price.historical rate limited (429): YFRateLimitError")

    def yahoo_up(symbol, start, end):
        return f"# Stock data for {symbol} from {start} to {end}"

    monkeypatch.setitem(router.VENDOR_METHODS, "get_stock_data", {
        "openbb": recorded("get_stock_data", "openbb", openbb_down),
        "yfinance": recorded("get_stock_data", "yfinance", yahoo_up),
    })
    sink = Sink()
    token, call = SINK.set(sink), CURRENT_CALL.set("call-1")
    try:
        with run_config({"data_vendors": {"core_stock_apis": "openbb,yfinance"}}):
            out = router.route_to_vendor("get_stock_data", "AAPL", "2026-10-01", "2026-10-23")
    finally:
        SINK.reset(token)
        CURRENT_CALL.reset(call)
    assert out.startswith("# Stock data for AAPL")
    rows = sink.attempts_for("call-1")
    assert [(r["vendor"], r["ok"]) for r in rows] == [("openbb", False), ("yfinance", True)]
    assert "429" in rows[0]["error"] and all(isinstance(r["ms"], int) for r in rows)
    notes = sink.drain_limits()
    assert [(n.provider, n.status, n.fatal) for n in notes] == [("openbb-yfinance", 429, False)]
    assert sink.drain_limits() == []


def test_recorder_is_a_no_op_without_a_sink():
    calls = []
    fn = recorded("get_news", "yfinance", lambda *a: calls.append(a) or "x")
    assert fn("AAPL") == "x" and calls == [("AAPL",)]
    assert recorded("get_news", "yfinance", fn) is fn  # never wrapped twice


def test_langgraph_threads_share_the_runs_sink():
    """A sink set before streaming collects the vendor calls LangGraph makes on its own threads,
    each tagged with the tool call it served (the stats handler names it)."""
    fetch = recorded("get_news", "openbb", lambda q: f"news about {q}")

    @tool
    def get_news(query: str) -> str:
        """News about a query."""
        return fetch(query)

    class State(MessagesState):
        news_report: str
        market_report: str

    def make_analyst(name):
        key = f"{name}_report"

        def agent(state):
            if not any(isinstance(m, ToolMessage) for m in state["messages"]):
                calls = [{"name": "get_news", "args": {"query": f"{name}-{i}"}, "id": f"{name}-call-{i}"} for i in range(2)]
                return {"messages": [AIMessage(content="", tool_calls=calls, id=f"{name}-ai-1")], key: ""}
            return {"messages": [AIMessage(content=f"{name} report", id=f"{name}-ai-2")], key: f"{name} report"}

        out = TypedDict(f"{name}Out", {key: str})
        graph = StateGraph(State, output_schema=out)
        graph.add_node("agent", agent)
        graph.add_node("tools", ToolNode([get_news]))
        graph.add_edge(START, "agent")
        graph.add_conditional_edges("agent", lambda s: "tools" if s["messages"][-1].tool_calls else END, ["tools", END])
        graph.add_edge("tools", "agent")
        return graph.compile()

    top = StateGraph(State)
    top.add_node("News Analyst", make_analyst("news"))
    top.add_node("Market Analyst", make_analyst("market"))
    top.add_edge(START, "News Analyst")
    top.add_edge(START, "Market Analyst")
    top.add_edge(["News Analyst", "Market Analyst"], END)
    compiled = top.compile()

    stats = AgentWorldStatsHandler("AAPL")
    sink = Sink()
    token = SINK.set(sink)
    try:
        graph = SimpleNamespace(config={}, graph=compiled)
        steps = list(stream_steps(graph, {"messages": [("human", "AAPL")], "news_report": "", "market_report": ""},
                                  {"config": {"callbacks": [stats]}}))
    finally:
        SINK.reset(token)
    records = sink.snapshot()
    assert sorted(r["call"] for r in records) == sorted(
        [f"{name}-call-{i}" for name in ("news", "market") for i in range(2)])
    assert all(r["ok"] and r["vendor"] == "openbb" for r in records)
    namespaces = {step[0][0].split(":")[0] for step in steps if step[0]}
    assert namespaces == {"News Analyst", "Market Analyst"}
    assert stats.get_stats()["tool_calls"] == 4


@pytest.mark.parametrize("method", sorted(DATA_TOOLS))
def test_every_data_tool_has_a_chain(method):
    assert chain_for(method, DEFAULT_DATA_VENDORS)
