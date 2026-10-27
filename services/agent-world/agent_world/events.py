"""The events the service streams to AeroTrade, and the pure machine that derives them from a run.

Every event is JSON with camelCase keys and carries ``seq`` (1, 2, 3… per session), ``at`` (ISO
UTC) and ``sessionId``, which the emitter fills in. Texts are cut to their clamps, never refused.

``StageMachine`` turns what a TradingAgents run streams — ``(namespace, messages, chunk)`` steps,
where ``namespace`` is LangGraph's subgraph path (``("Market Analyst:<task id>",)`` inside an
analyst, ``()`` at the top) — into the desk's events. It is pure: the same steps give the same
events, so a recorded run folds to a pinned list.
"""

from __future__ import annotations

import json
import math
from collections.abc import Callable, Iterable, Mapping, Sequence
from typing import Annotated, Any, Literal

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, TypeAdapter

from agent_world.roles import (
    ANALYST_REPORT_KEYS,
    ANALYST_ROLES,
    REPORT_KEY_TO_ANALYST,
    RISK_SIDES,
    ROLE_IDS,
    TOOL_ROLES,
    TURN_PREFIXES,
    role_for_namespace,
)

CLAMPS = {"report": 12_000, "turn": 6_000, "decision": 8_000, "args": 400, "message": 300,
          "note": 2_000, "short": 80, "error": 200}
MAX_ATTEMPTS = 6
RATINGS = ("Buy", "Overweight", "Hold", "Underweight", "Sell", "REVIEW")
REVIEW = "REVIEW"
UNAVAILABLE_PREFIX = "DATA_UNAVAILABLE:"
NO_DATA_PREFIX = "NO_DATA_AVAILABLE:"


def _cut(limit: int) -> BeforeValidator:
    def cut(value: Any) -> Any:
        return value if value is None else str(value)[:limit]
    return BeforeValidator(cut)


Report = Annotated[str, _cut(CLAMPS["report"])]
Turn = Annotated[str, _cut(CLAMPS["turn"])]
DecisionText = Annotated[str, _cut(CLAMPS["decision"])]
Args = Annotated[str, _cut(CLAMPS["args"])]
Message = Annotated[str, _cut(CLAMPS["message"])]
Note = Annotated[str, _cut(CLAMPS["note"])]
Short = Annotated[str, _cut(CLAMPS["short"])]
ErrorText = Annotated[str | None, _cut(CLAMPS["error"])]
Count = Annotated[int, Field(ge=0)]
def _cents(value: Any) -> float:
    number = float(value)
    return round(number, 6) if math.isfinite(number) and number > 0 else 0.0


Cents = Annotated[float, Field(ge=0), BeforeValidator(_cents)]
RatingName = Literal["Buy", "Overweight", "Hold", "Underweight", "Sell", "REVIEW"]
RoleId = Literal[
    "market", "sentiment", "news", "fundamentals", "bull", "bear", "research-manager", "trader",
    "risk-aggressive", "risk-conservative", "risk-neutral", "portfolio-manager",
]
CostRole = Literal[
    "market", "sentiment", "news", "fundamentals", "bull", "bear", "research-manager", "trader",
    "risk-aggressive", "risk-conservative", "risk-neutral", "portfolio-manager", "memory", "other",
]


class Event(BaseModel):
    """Fields every event carries; the emitter sets seq, at and sessionId."""

    model_config = ConfigDict(extra="forbid")

    seq: int | None = Field(default=None, ge=1)
    at: str | None = None
    type: str
    sessionId: str | None = None


class Models(BaseModel):
    model_config = ConfigDict(extra="forbid")
    provider: Short
    quick: Short
    deep: Short


class SessionStarted(Event):
    type: Literal["session.started"] = "session.started"
    symbols: list[str]
    tradeDate: str
    approval: Literal["owner", "auto"]
    dryRun: bool
    models: Models


class RunStarted(Event):
    type: Literal["run.started"] = "run.started"
    symbol: str
    index: Count
    total: Annotated[int, Field(ge=1)]


class RoleStarted(Event):
    type: Literal["role.started"] = "role.started"
    symbol: str
    role: RoleId


class RoleDone(Event):
    type: Literal["role.done"] = "role.done"
    symbol: str
    role: RoleId


class RoleReport(Event):
    type: Literal["role.report"] = "role.report"
    symbol: str
    role: RoleId
    text: Report
    forced: bool = False


class DebateTurn(Event):
    type: Literal["debate.turn"] = "debate.turn"
    symbol: str
    side: Literal["bull", "bear"]
    round: Annotated[int, Field(ge=1, le=20)]
    text: Turn


class RiskTurn(Event):
    type: Literal["risk.turn"] = "risk.turn"
    symbol: str
    role: Literal["risk-aggressive", "risk-conservative", "risk-neutral"]
    round: Annotated[int, Field(ge=1, le=20)]
    text: Turn


class ToolCalled(Event):
    type: Literal["tool.called"] = "tool.called"
    symbol: str
    role: RoleId
    name: Short
    args: Args
    callId: Short


class Attempt(BaseModel):
    model_config = ConfigDict(extra="forbid")
    vendor: Short
    ok: bool
    error: ErrorText = None


def _cap_attempts(value: Any) -> Any:
    if not isinstance(value, list):
        return value
    collapsed: list[Any] = []
    for item in value:
        if collapsed and collapsed[-1] == item:
            continue
        collapsed.append(item)
    return collapsed[:MAX_ATTEMPTS]


class ToolResult(Event):
    type: Literal["tool.result"] = "tool.result"
    symbol: str
    role: RoleId
    callId: Short
    name: Short
    status: Literal["ok", "unavailable", "no-data"]
    chars: Count
    vendor: Short | None = None
    ms: Annotated[int, Field(ge=0, le=3_600_000)] | None = None
    attempts: Annotated[list[Attempt], BeforeValidator(_cap_attempts)] = Field(default_factory=list)


class CostTick(Event):
    type: Literal["cost.tick"] = "cost.tick"
    symbol: str
    role: CostRole
    model: Short
    inputTokens: Count
    outputTokens: Count
    costCents: Cents
    llmCalls: Annotated[int, Field(ge=1)]
    pricing: Literal["known", "unknown"]


class MemoryNote(Event):
    type: Literal["memory.note"] = "memory.note"
    symbol: str
    text: Note


class Limit(Event):
    type: Literal["limit"] = "limit"
    symbol: str | None = None
    provider: Short
    status: Annotated[int, Field(ge=0, le=999)]
    message: Message
    fatal: bool


class RunStats(BaseModel):
    model_config = ConfigDict(extra="forbid")
    llmCalls: Count = 0
    toolCalls: Count = 0
    tokensIn: Count = 0
    tokensOut: Count = 0
    costCents: Cents = 0.0


class RunCompleted(Event):
    type: Literal["run.completed"] = "run.completed"
    symbol: str
    rating: RatingName
    review: bool
    decision: DecisionText
    stats: RunStats


class RunFailed(Event):
    type: Literal["run.failed"] = "run.failed"
    symbol: str
    reason: Literal["timeout", "error", "limit"]
    message: Message


class RunSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")
    symbol: str
    rating: RatingName
    review: bool


class SessionCompleted(Event):
    type: Literal["session.completed"] = "session.completed"
    runs: list[RunSummary]
    tokensIn: Count
    tokensOut: Count
    costCents: Cents
    llmCalls: Count
    toolCalls: Count
    dropped: Count


class SessionFailed(Event):
    type: Literal["session.failed"] = "session.failed"
    outcome: Literal["error", "limit", "budget", "timeout"]
    message: Message


AnyEvent = Annotated[
    SessionStarted | RunStarted | RoleStarted | RoleDone | RoleReport | DebateTurn | RiskTurn
    | ToolCalled | ToolResult | CostTick | MemoryNote | Limit | RunCompleted | RunFailed
    | SessionCompleted | SessionFailed,
    Field(discriminator="type"),
]
EVENT_ADAPTER: TypeAdapter[Any] = TypeAdapter(AnyEvent)
EVENT_TYPES: tuple[str, ...] = (
    "session.started", "run.started", "role.started", "tool.called", "tool.result", "role.report",
    "role.done", "debate.turn", "risk.turn", "cost.tick", "memory.note", "limit", "run.completed",
    "run.failed", "session.completed", "session.failed",
)
# Dropped first under back-pressure, and only these: the structural events never are.
DROPPABLE_TYPES = frozenset({"cost.tick", "debate.turn", "risk.turn", "tool.called", "tool.result"})
TERMINAL_SESSION_TYPES = frozenset({"session.completed", "session.failed"})
TERMINAL_RUN_TYPES = frozenset({"run.completed", "run.failed"})


def parse_event(data: Mapping[str, Any]) -> Event:
    """An event read back from its JSON form (tests, the fixture export)."""
    return EVENT_ADAPTER.validate_python(dict(data))


def to_wire(event: Event | Mapping[str, Any]) -> dict[str, Any]:
    """The JSON-ready dict of an event, keys in the order seq, at, type, sessionId, fields."""
    data = event.model_dump(mode="json") if isinstance(event, BaseModel) else dict(event)
    head = {key: data[key] for key in ("seq", "at", "type", "sessionId") if key in data}
    return {**head, **{k: v for k, v in data.items() if k not in head}}


def normalize_rating(rating: str | None) -> str:
    return rating if rating in RATINGS else REVIEW


def tool_status(content: str) -> str:
    """A tool result's status, read from TradingAgents' sentinels."""
    text = content.lstrip()
    if text.startswith(UNAVAILABLE_PREFIX):
        return "unavailable"
    if text.startswith(NO_DATA_PREFIX):
        return "no-data"
    return "ok"


def attempts_summary(records: Sequence[Mapping[str, Any]]) -> tuple[str | None, int | None, list[dict[str, Any]]]:
    """(vendor that served, total ms, attempts) from the recorder's rows for one tool call."""
    if not records:
        return None, None, []
    attempts = [{"vendor": str(r.get("vendor") or "unknown"), "ok": bool(r.get("ok")),
                 "error": (str(r["error"])[:CLAMPS["error"]] if r.get("error") else None)} for r in records]
    served = [r for r in records if r.get("ok")]
    vendor = str(served[-1].get("vendor")) if served else None
    ms = int(sum(max(0, int(r.get("ms") or 0)) for r in records))
    return vendor, min(ms, 3_600_000), attempts


# ---- message helpers: work on langchain messages and on their dict form alike ----

def _get(message: Any, name: str, default: Any = None) -> Any:
    if isinstance(message, Mapping):
        return message.get(name, default)
    return getattr(message, name, default)


def _kind(message: Any) -> str:
    kind = _get(message, "type")
    if isinstance(kind, str):
        return kind
    if isinstance(message, (tuple, list)) and message:
        return str(message[0])
    return ""


def _content_text(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, Mapping) and item.get("type") == "text":
                parts.append(str(item.get("text") or ""))
        return "\n".join(p for p in parts if p)
    return "" if content is None else str(content)


def _message_key(message: Any) -> str:
    message_id = _get(message, "id")
    if message_id:
        return f"id:{message_id}"
    kind = _kind(message)
    if kind == "tool":
        return f"tool:{_get(message, 'tool_call_id')}"
    calls = _get(message, "tool_calls") or []
    if calls:
        return "calls:" + ",".join(str(_get(c, "id")) for c in calls)
    return f"{kind}:{hash(_content_text(_get(message, 'content')))}"


def _strip_turn(new_text: str, speaker: str) -> str:
    text = new_text.strip()
    prefix = TURN_PREFIXES.get(speaker, "")
    if prefix and text.startswith(prefix):
        text = text[len(prefix):].strip()
    return text


AttemptsFor = Callable[[str], Sequence[Mapping[str, Any]]]


class StageMachine:
    """One symbol's run, folded from its stream into the desk's events.

    ``start()`` opens the run; ``feed(namespace, messages, chunk)`` takes each streamed step;
    ``finish(rating, final_state)`` closes it. Each returns the events that step produced.
    ``attempts_for(call_id)`` gives the data recorder's rows for a tool call (vendor, ms, attempts).
    """

    def __init__(self, symbol: str, index: int, total: int, *, max_debate_rounds: int = 1,
                 max_risk_rounds: int = 1, max_tool_rounds: int | None = None,
                 attempts_for: AttemptsFor | None = None) -> None:
        self.symbol = symbol
        self.index = index
        self.total = total
        self.max_debate_rounds = max(1, int(max_debate_rounds))
        self.max_risk_rounds = max(1, int(max_risk_rounds))
        self.max_tool_rounds = max_tool_rounds
        self._attempts_for = attempts_for
        self._started: set[str] = set()
        self._done: set[str] = set()
        self._reported: set[str] = set()
        self._seen: set[str] = set()
        self._rounds: dict[str, int] = {}
        self._calls: dict[str, tuple[str, str]] = {}
        self._values = 0
        self._debate_len = {"bull": 0, "bear": 0}
        self._debate_turns = {"bull": 0, "bear": 0}
        self._risk_len = {role: 0 for role in RISK_SIDES}
        self._risk_turns = {role: 0 for role in RISK_SIDES}
        self._memory_note = ""
        self.finished = False

    # ---- lifecycle helpers ----

    def _start(self, role: str) -> list[Event]:
        if role in self._started:
            return []
        self._started.add(role)
        return [RoleStarted(symbol=self.symbol, role=role)]

    def _close(self, role: str) -> list[Event]:
        if role in self._done:
            return []
        events = self._start(role)
        self._done.add(role)
        events.append(RoleDone(symbol=self.symbol, role=role))
        return events

    def _report(self, role: str, text: str, forced: bool = False) -> list[Event]:
        if role in self._reported or not text.strip():
            return []
        self._reported.add(role)
        return [*self._start(role), RoleReport(symbol=self.symbol, role=role, text=text, forced=forced)]

    def _file_analyst(self, role: str, text: str) -> list[Event]:
        if role in self._done:
            return []
        rounds = self._rounds.get(role, 0)
        forced = self.max_tool_rounds is not None and rounds >= self.max_tool_rounds
        events = [*self._report(role, text, forced), *self._close(role)]
        if all(r in self._done for r in ANALYST_ROLES):
            events += self._start("bull")
        return events

    # ---- the three calls ----

    def start(self) -> list[Event]:
        events: list[Event] = [RunStarted(symbol=self.symbol, index=self.index, total=self.total)]
        for role in ANALYST_ROLES:
            events += self._start(role)
        return events

    def feed(self, namespace: Sequence[str] | None, messages: Iterable[Any] | None,
             chunk: Mapping[str, Any] | None) -> list[Event]:
        namespace = tuple(namespace or ())
        role = role_for_namespace(namespace)
        events = self._messages(role, messages or ())
        if namespace:
            for key, text in (chunk or {}).items():
                analyst = REPORT_KEY_TO_ANALYST.get(key)
                if analyst and isinstance(text, str) and text.strip():
                    events += self._file_analyst(analyst, text)
            return events
        if chunk is None:
            return events
        self._values += 1
        return events + self._state(chunk)

    def finish(self, rating: str | None, final_state: Mapping[str, Any],
               stats: Mapping[str, Any] | None = None) -> list[Event]:
        events: list[Event] = []
        decision = str(final_state.get("final_trade_decision") or "")
        if "portfolio-manager" not in self._reported and decision.strip():
            for risk_role in RISK_SIDES:
                events += self._close(risk_role)
            events += self._report("portfolio-manager", decision)
        for role in ROLE_IDS:
            if role in self._started and role != "portfolio-manager":
                events += self._close(role)
        events += self._close("portfolio-manager")
        name = normalize_rating(rating)
        events.append(RunCompleted(symbol=self.symbol, rating=name, review=name == REVIEW,
                                   decision=decision, stats=RunStats(**dict(stats or {}))))
        self.finished = True
        return events

    def fail(self, reason: str, message: str) -> list[Event]:
        self.finished = True
        return [RunFailed(symbol=self.symbol, reason=reason, message=message)]

    # ---- the steps ----

    def _messages(self, role: str | None, messages: Iterable[Any]) -> list[Event]:
        events: list[Event] = []
        for message in messages:
            key = _message_key(message)
            if key in self._seen:
                continue
            self._seen.add(key)
            kind = _kind(message)
            calls = _get(message, "tool_calls") or []
            if kind == "ai" and calls:
                first_name = str(_get(calls[0], "name") or "")
                caller = role or TOOL_ROLES.get(first_name)
                if caller is None:
                    continue
                if caller in ANALYST_ROLES:
                    self._rounds[caller] = self._rounds.get(caller, 0) + 1
                for n, call in enumerate(calls):
                    name = str(_get(call, "name") or "tool")
                    call_id = str(_get(call, "id") or f"{caller}-{self._rounds.get(caller, 0)}-{n}")
                    args = json.dumps(_get(call, "args") or {}, sort_keys=True, default=str, ensure_ascii=False)
                    self._calls[call_id] = (caller, name)
                    events.append(ToolCalled(symbol=self.symbol, role=caller, name=name, args=args, callId=call_id))
            elif kind == "tool":
                call_id = str(_get(message, "tool_call_id") or "")
                known_role, known_name = self._calls.get(call_id, (None, None))
                name = str(_get(message, "name") or known_name or "tool")
                caller = role or known_role or TOOL_ROLES.get(name)
                if caller is None:
                    continue
                content = _content_text(_get(message, "content"))
                records = list(self._attempts_for(call_id)) if self._attempts_for and call_id else []
                vendor, ms, attempts = attempts_summary(records)
                events.append(ToolResult(symbol=self.symbol, role=caller, callId=call_id, name=name,
                                         status=tool_status(content), chars=len(content), vendor=vendor,
                                         ms=ms, attempts=attempts))
        return events

    def _state(self, state: Mapping[str, Any]) -> list[Event]:
        events: list[Event] = []
        debate = state.get("investment_debate_state") or {}
        risk = state.get("risk_debate_state") or {}
        plan = str(state.get("investment_plan") or "")
        trader_plan = str(state.get("trader_investment_plan") or "")
        final = str(state.get("final_trade_decision") or "")
        later = any(str(debate.get(k) or "") for k in ("bull_history", "bear_history")) or plan or trader_plan or final
        every_report = all(str(state.get(key) or "").strip() for key in ANALYST_REPORT_KEYS.values())

        # The first values chunk is the run's input; any later one comes after the analysts'
        # step, so every analyst has filed by then, an empty report included.
        if self._values > 1 or every_report or later:
            for role in ANALYST_ROLES:
                if role not in self._done:
                    text = str(state.get(ANALYST_REPORT_KEYS[role]) or "")
                    events += self._file_analyst(role, text) if text.strip() else self._close(role)
            events += self._start("bull")
            note = str(state.get("memory_note") or "").strip()
            if note and note != self._memory_note:
                self._memory_note = note
                events.append(MemoryNote(symbol=self.symbol, text=note))

        events += self._debate(debate, plan)
        if plan.strip() and "research-manager" not in self._reported:
            events += self._close("bull") + self._close("bear")
            events += self._report("research-manager", plan) + self._close("research-manager")
            events += self._start("trader")
        if trader_plan.strip() and "trader" not in self._reported:
            events += self._report("trader", trader_plan) + self._close("trader")
            events += self._start("risk-aggressive")
        events += self._risk(risk, final)
        if final.strip() and "portfolio-manager" not in self._reported:
            for role in RISK_SIDES:
                events += self._close(role)
            events += self._report("portfolio-manager", final)
        return events

    def _debate(self, debate: Mapping[str, Any], plan: str) -> list[Event]:
        events: list[Event] = []
        current = str(debate.get("current_response") or "")
        sides = ["bull", "bear"]
        if current.startswith("Bull"):
            sides = ["bear", "bull"]  # whoever spoke last is read last
        grew = False
        for side in sides:
            history = str(debate.get(f"{side}_history") or "")
            if len(history) > self._debate_len[side]:
                new = history[self._debate_len[side]:]
                self._debate_len[side] = len(history)
                text = _strip_turn(new, side)
                if not text:
                    continue
                grew = True
                self._debate_turns[side] += 1
                events += self._start(side)
                events.append(DebateTurn(symbol=self.symbol, side=side,
                                         round=min(20, self._debate_turns[side]), text=text))
        if grew and not plan.strip():
            count = int(debate.get("count") or 0)
            if count >= 2 * self.max_debate_rounds:
                events += self._close("bull") + self._close("bear") + self._start("research-manager")
            else:
                events += self._start("bear" if current.startswith("Bull") else "bull")
        return events

    def _risk(self, risk: Mapping[str, Any], final: str) -> list[Event]:
        events: list[Event] = []
        latest = str(risk.get("latest_speaker") or "")
        order = list(RISK_SIDES)
        speaking = {"Aggressive": "risk-aggressive", "Conservative": "risk-conservative", "Neutral": "risk-neutral"}
        last = next((role for word, role in speaking.items() if latest.startswith(word)), None)
        if last in order:
            order.remove(last)
            order.append(last)
        grew = False
        for role in order:
            history = str(risk.get(RISK_SIDES[role]) or "")
            if len(history) > self._risk_len[role]:
                new = history[self._risk_len[role]:]
                self._risk_len[role] = len(history)
                text = _strip_turn(new, role)
                if not text:
                    continue
                grew = True
                self._risk_turns[role] += 1
                events += self._start(role)
                events.append(RiskTurn(symbol=self.symbol, role=role,
                                       round=min(20, self._risk_turns[role]), text=text))
        if grew and not final.strip():
            count = int(risk.get("count") or 0)
            if count >= 3 * self.max_risk_rounds:
                for role in RISK_SIDES:
                    events += self._close(role)
                events += self._start("portfolio-manager")
            else:
                following = {"Aggressive": "risk-conservative", "Conservative": "risk-neutral"}
                upcoming = next((r for w, r in following.items() if latest.startswith(w)), "risk-aggressive")
                events += self._start(upcoming)
        return events
