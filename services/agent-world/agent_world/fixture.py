"""Replays a recorded stream (tests/fixtures/stream_chunks.json) through the StageMachine.

Used by the tests and by scripts/export_fixture.py, which writes the event stream AeroTrade's QA
stub plays. The fixture holds steps in the shapes ``runner.stream_steps`` yields, with messages as
dicts; ``rehydrate`` turns them back into LangChain messages so the machine reads real ones.
"""

from __future__ import annotations

import json
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Any

from agent_world.events import (
    CostTick,
    DebateTurn,
    Event,
    Limit,
    RiskTurn,
    RoleReport,
    StageMachine,
    ToolCalled,
)
from agent_world.pricing import PRICES, cost_cents

FIXTURE_PATH = Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "stream_chunks.json"


def load(path: Path | str = FIXTURE_PATH) -> dict[str, Any]:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def rehydrate(message: Mapping[str, Any]) -> Any:
    """A message dict as the LangChain message the stream carries."""
    from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

    kind = message.get("type")
    if kind == "ai":
        return AIMessage(content=message.get("content", ""), id=message.get("id"),
                         tool_calls=[{"name": c["name"], "args": c.get("args", {}), "id": c.get("id"), "type": "tool_call"}
                                     for c in message.get("tool_calls") or []])
    if kind == "tool":
        return ToolMessage(content=message.get("content", ""), tool_call_id=message["tool_call_id"],
                           name=message.get("name"), id=message.get("id"))
    return HumanMessage(content=message.get("content", ""), id=message.get("id"))


def _rehydrate_chunk(chunk: Any) -> Any:
    if isinstance(chunk, Mapping) and "messages" in chunk:
        return {**chunk, "messages": [rehydrate(m) for m in chunk["messages"]]}
    return chunk


def _tick_role(event: Event) -> str | None:
    """The role whose cost tick goes just before this event: the first visible work of the role."""
    if isinstance(event, RoleReport):
        return event.role
    if isinstance(event, DebateTurn):
        return event.side
    if isinstance(event, RiskTurn):
        return event.role
    return None


def fold_run(run: Mapping[str, Any], *, index: int, total: int, max_debate_rounds: int = 1,
             max_risk_rounds: int = 1, max_tool_rounds: int | None = 8, costs: bool = True,
             prices: Mapping[str, tuple[float, float]] = PRICES) -> list[tuple[float, Event]]:
    """``(seconds since the run started, event)`` for one recorded run, start to finish.

    With ``costs`` each role's recorded usage becomes one cost tick, placed just before the role's
    first report or turn (as the emitter's coalescing would send it).
    """
    from tradingagents.agents.rating import run_rating

    attempts: Mapping[str, Sequence[Mapping[str, Any]]] = run.get("attempts") or {}
    machine = StageMachine(run["symbol"], index, total, max_debate_rounds=max_debate_rounds,
                           max_risk_rounds=max_risk_rounds, max_tool_rounds=max_tool_rounds,
                           attempts_for=lambda call_id: list(attempts.get(call_id, [])))
    usage = {row["role"]: row for row in run.get("usage") or []}
    ticked: set[str] = set()
    out: list[tuple[float, Event]] = [(0.0, e) for e in machine.start()]
    final_state: dict[str, Any] = {}
    tool_calls = 0

    def tick(role: str) -> CostTick | None:
        row = usage.get(role)
        if not costs or row is None or role in ticked:
            return None
        ticked.add(role)
        cents, known = cost_cents(row["model"], row["inputTokens"], row["outputTokens"], prices)
        return CostTick(symbol=run["symbol"], role=role, model=row["model"], inputTokens=row["inputTokens"],
                        outputTokens=row["outputTokens"], costCents=cents, llmCalls=row["llmCalls"],
                        pricing="known" if known else "unknown")

    for step in run["steps"]:
        t = float(step.get("t", 0))
        messages = [rehydrate(m) for m in step.get("messages") or []]
        chunk = _rehydrate_chunk(step.get("chunk"))
        for event in machine.feed(step.get("namespace") or (), messages, chunk):
            role = _tick_role(event)
            cost = tick(role) if role else None
            if cost is not None:
                out.append((t, cost))
            if isinstance(event, ToolCalled):
                tool_calls += 1
            out.append((t, event))
        for note in step.get("limits") or []:
            out.append((t, Limit(symbol=run["symbol"], **note)))
        if not step.get("namespace") and isinstance(step.get("chunk"), Mapping):
            final_state.update(step["chunk"])

    rows = list(usage.values())
    stats = {
        "llmCalls": sum(int(r["llmCalls"]) for r in rows),
        "toolCalls": tool_calls,
        "tokensIn": sum(int(r["inputTokens"]) for r in rows),
        "tokensOut": sum(int(r["outputTokens"]) for r in rows),
        "costCents": round(sum(cost_cents(r["model"], r["inputTokens"], r["outputTokens"], prices)[0] for r in rows), 6)
        if costs else 0.0,
    }
    end = float(run.get("end", out[-1][0] if out else 0.0))
    for role in usage:
        cost = tick(role)
        if cost is not None:
            out.append((end, cost))
    out += [(end, e) for e in machine.finish(run_rating(final_state), final_state, stats)]
    return out
