"""One symbol through the real TradingAgentsGraph (v0.7.1) with a scripted chat model.

Opt-in (``uv run pytest -m integration tests/test_graph_fake_llm.py``): it builds TradingAgents'
own graph and runs every node, so it is slower than the unit tests, but it needs no network and
no key. The model is scripted per role from its prompt; every data tool answers from a "fake"
vendor registered into TradingAgents' router beside OpenBB; the sentiment feeds and the identity
lookup are stubbed. It checks that the runner's events, attribution and costs hold on the real
graph's stream: the twelve roles in pipeline order, tool calls tied to their vendor rows, and a
cost tick for every role.
"""

from __future__ import annotations

import dataclasses
import threading
from typing import Any

import pytest
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, ToolMessage
from langchain_core.outputs import ChatGeneration, ChatResult

from agent_world.contract import RunRequest
from agent_world.roles import ROLE_IDS
from agent_world.runner import run_session
from conftest import AEROTRADE, make_settings

pytestmark = pytest.mark.integration

TODAY_FREE_DATE = "2026-10-23"  # a past date, so TradingAgents' "not in the future" check passes

REPLIES = [
    ("As the Portfolio Manager", "Rating: Buy\n\n**Executive Summary**: The desk adds in two steps.\n\n"
                                 "**Investment Thesis**: The trend and the margin mix carry the case."),
    ("As the Research Manager", "**Decision**: Overweight\n\n**Rationale**: The trend case carries more weight."),
    ("As the Aggressive Risk Analyst", "The staged entry leaves room on the table."),
    ("As the Conservative Risk Analyst", "The first step belongs after the report."),
    ("As the Neutral Risk Analyst", "A smaller first step keeps both views."),
    ("You are a Bull Analyst", "The trend and the services mix point the same way."),
    ("You are a Bear Analyst", "The multiple leaves little cushion into the report."),
    ("You are a trading agent", "The plan maps to adding in two tranches.\n\nFINAL TRANSACTION PROPOSAL: **BUY**"),
    ("You are a financial market sentiment analyst", "**Overall Sentiment:** **Mixed** (Score: 5.0/10)\n\nThin feeds."),
    ("You are a news researcher", "News report: the quarterly report lands on 29 October."),
    ("You are a researcher tasked with analyzing fundamental", "Fundamentals report: margins near 47%."),
    ("You are a trading assistant tasked with analyzing financial markets", "Market report: price above both averages."),
]
FIRST_TOOL = {
    "You are a news researcher": ("get_news", {"start_date": "2026-10-16", "end_date": TODAY_FREE_DATE}),
    "You are a researcher tasked with analyzing fundamental": ("get_fundamentals", {"curr_date": TODAY_FREE_DATE}),
    "You are a trading assistant tasked with analyzing financial markets": (
        "get_stock_data", {"start_date": "2026-09-23", "end_date": TODAY_FREE_DATE}),
}


def _text(messages: list[Any]) -> str:
    parts = []
    for message in messages:
        content = message.content if hasattr(message, "content") else message
        parts.append(content if isinstance(content, str) else str(content))
    return "\n".join(parts)


class ScriptedChatModel(BaseChatModel):
    """Answers each role from its prompt; calls one tool first where the role has tools."""

    model_name: str = "gemini-2.5-flash-lite"

    @property
    def _llm_type(self) -> str:
        return "scripted"

    def _get_ls_params(self, stop=None, **kwargs):
        params = super()._get_ls_params(stop=stop, **kwargs)
        params["ls_model_name"] = self.model_name
        return params

    def bind_tools(self, tools, **kwargs):
        return self.bind(tools=[getattr(t, "name", None) or t["name"] for t in tools], **kwargs)

    def with_structured_output(self, schema, **kwargs):
        raise NotImplementedError("the scripted model answers in free text")

    def _generate(self, messages, stop=None, run_manager=None, tools=None, **kwargs) -> ChatResult:
        text = _text(messages)
        marker, reply = next(((m, r) for m, r in REPLIES if m in text), ("", "No script for this prompt."))
        tool_calls = []
        if tools and marker in FIRST_TOOL and not any(isinstance(m, ToolMessage) for m in messages):
            name, args = FIRST_TOOL[marker]
            tool_calls = [{"name": name, "args": args, "id": f"call-{name}", "type": "tool_call"}]
            reply = ""
        usage = {"input_tokens": max(1, len(text) // 4), "output_tokens": max(1, len(reply) // 4)}
        usage["total_tokens"] = usage["input_tokens"] + usage["output_tokens"]
        message = AIMessage(content=reply, tool_calls=tool_calls, usage_metadata=usage,
                            response_metadata={"model_name": self.model_name})
        return ChatResult(generations=[ChatGeneration(message=message)])


class FakeClient:
    def __init__(self, model: str, callbacks: list[Any] | None) -> None:
        self.model, self.callbacks = model, callbacks

    def get_llm(self):
        return ScriptedChatModel(model_name=self.model, callbacks=self.callbacks)


class ListEmitter:
    def __init__(self):
        self.events, self.lock = [], threading.Lock()

    def emit(self, event):
        with self.lock:
            self.events.append(event)
        return True

    @property
    def dropped(self):
        return 0


@pytest.fixture
def scripted_graph(monkeypatch, tmp_path):
    from tradingagents.agents.analysts import sentiment_analyst
    from tradingagents.dataflows import router
    from tradingagents.graph import trading_graph

    from agent_world.vendors import register_openbb
    from agent_world.vendors.recorder import recorded

    register_openbb()
    monkeypatch.delenv("TYPESAFE_API_KEY", raising=False)
    monkeypatch.setattr(trading_graph, "create_tier_client",
                        lambda config, tier, **extra: FakeClient(config[f"{tier}_think_llm"], extra.get("callbacks")))
    monkeypatch.setattr(trading_graph, "resolve_instrument_identity", lambda ticker: {"company_name": "Apple Inc."})
    monkeypatch.setattr(sentiment_analyst, "fetch_stocktwits_messages", lambda *a, **k: "<no StockTwits in this test>")
    monkeypatch.setattr(sentiment_analyst, "fetch_reddit_posts", lambda *a, **k: "<no Reddit in this test>")
    for method in router.VENDOR_METHODS:
        fake = recorded(method, "fake", lambda *args, _m=method, **kw: f"# {_m} for {args[0] if args else ''}\nok\n")
        monkeypatch.setitem(router.VENDOR_METHODS[method], "fake", fake)
    settings = make_settings(AGENT_WORLD_DATA_DIR=str(tmp_path))
    vendors = {category: "fake" for category in settings.data_vendors}
    return dataclasses.replace(settings, data_vendors=vendors)


def test_one_symbol_through_the_real_graph(scripted_graph):
    settings = scripted_graph
    request = RunRequest.model_validate({
        "sessionId": "aw-fake-llm", "symbols": ["AAPL"], "tradeDate": TODAY_FREE_DATE,
        "portfolio": {"cash": 100000, "currency": "USD", "positions": []},
        "callbackUrl": f"{AEROTRADE}/api/agent-world/events", "approval": "owner", "dryRun": True,
    })
    emitter = ListEmitter()
    paperclip = type("P", (), {"configured": False})()
    result = run_session(request, emitter, paperclip, settings)
    events = emitter.events
    types = [e.type for e in events]
    assert result.status == "completed", [(e.type, getattr(e, "message", "")) for e in events if "failed" in e.type]
    assert types[0] == "session.started" and types[-1] == "session.completed"

    started = [e.role for e in events if e.type == "role.started"]
    assert started == list(ROLE_IDS), started
    done = [e.role for e in events if e.type == "role.done"]
    assert sorted(done) == sorted(ROLE_IDS)
    # Teams finish in pipeline order: every analyst before the bull, the trader before the risk desk.
    index = {role: done.index(role) for role in ROLE_IDS}
    assert max(index[r] for r in ("market", "sentiment", "news", "fundamentals")) < index["bull"]
    assert index["research-manager"] < index["trader"] < index["risk-aggressive"] < index["portfolio-manager"]

    reports = {e.role: e.text for e in events if e.type == "role.report"}
    assert reports["market"].startswith("Market report") and reports["portfolio-manager"].startswith("Rating: Buy")
    assert [e.side for e in events if e.type == "debate.turn"] == ["bull", "bear"]
    assert [e.role for e in events if e.type == "risk.turn"] == ["risk-aggressive", "risk-conservative", "risk-neutral"]

    calls = {e.callId: e for e in events if e.type == "tool.called"}
    results = {e.callId: e for e in events if e.type == "tool.result"}
    assert {calls[c].role for c in calls} == {"market", "news", "fundamentals"}
    stock = results["call-get_stock_data"]
    assert stock.role == "market" and stock.status == "ok" and stock.vendor == "fake"
    assert [(a.vendor, a.ok) for a in stock.attempts] == [("fake", True)]

    ticks = [e for e in events if e.type == "cost.tick"]
    assert {t.role for t in ticks} == set(ROLE_IDS)
    assert {t.model for t in ticks if t.role in ("research-manager", "portfolio-manager")} == {"gemini-2.5-flash"}
    completed = next(e for e in events if e.type == "run.completed")
    assert completed.rating == "Buy" and completed.stats.toolCalls == 3 and completed.stats.llmCalls >= 15
