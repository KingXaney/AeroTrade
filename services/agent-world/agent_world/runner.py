"""One session: Paperclip's preflight, then TradingAgents over each symbol, streamed as events.

``run_session`` runs on the worker thread. Each symbol's graph runs on a thread of its own under
a watchdog (``AGENT_WORLD_RUN_TIMEOUT_S``): a run that outlasts it is reported as
``run.failed{reason: "timeout"}``, its later output is suppressed, and the session moves to the
next symbol. Python cannot stop a thread, so the timed-out one keeps running until its current
model or tool call returns; the worker waits for it before taking another session.

The stream loop is TradingAgents' own ``stream_run`` (tradingagents/graph/trading_graph.py),
replicated so each step keeps LangGraph's namespace: a message from inside an analyst's subgraph
is then attributed to that analyst.
"""

from __future__ import annotations

import logging
import threading
import time
from collections.abc import Callable, Iterator, Mapping
from dataclasses import dataclass, field
from typing import Any

from agent_world.config import Settings
from agent_world.contract import RunRequest
from agent_world.emitter import iso_now
from agent_world.events import (
    REVIEW,
    Event,
    Limit,
    Models,
    RunFailed,
    RunSummary,
    SessionCompleted,
    SessionFailed,
    SessionStarted,
    StageMachine,
    normalize_rating,
)
from agent_world.limits import LimitSignal, classify, scrub
from agent_world.paperclip import COMMENT_MAX, HEAD_TRADER, budget_stop
from agent_world.roles import SELECTED_ANALYSTS
from agent_world.vendors.recorder import SINK, Sink

logger = logging.getLogger(__name__)

STRAY_JOIN_S = 1800.0


class Emits:
    """What the runner needs from the emitter (EventEmitter, or a list in tests)."""

    def emit(self, event: Event) -> bool:  # pragma: no cover - protocol
        raise NotImplementedError

    @property
    def dropped(self) -> int:  # pragma: no cover - protocol
        return 0


def stream_steps(graph: Any, graph_input: Any, args: Mapping[str, Any]) -> Iterator[tuple[tuple[str, ...], list[Any], Any]]:
    """``TradingAgentsGraph.stream_run``, keeping the namespace of every step.

    Yields ``(namespace, messages, chunk)``: inside an analyst's subgraph, a finished task's
    messages and its report dict (or None); at the top, the whole state after each step.
    """
    from tradingagents.dataflows.config import run_config_context

    stream_args = {**dict(args), "stream_mode": ["values", "tasks"]}
    context = run_config_context(graph.config)
    stream = context.run(graph.graph.stream, graph_input, subgraphs=True, **stream_args)
    try:
        while (step := context.run(next, stream, None)) is not None:
            namespace, mode, chunk = step
            if namespace:
                result = chunk.get("result") if mode == "tasks" else None
                if isinstance(result, dict):
                    report = {k: v for k, v in result.items() if k != "messages" and v}
                    if result.get("messages") or report:
                        yield tuple(namespace), list(result.get("messages") or []), report or None
            elif mode == "values":
                yield (), list(chunk.get("messages") or []), chunk
    finally:
        context.run(stream.close)


def default_graph_factory(*, selected_analysts: tuple[str, ...], config: dict[str, Any], callbacks: list[Any]) -> Any:
    from tradingagents.graph.trading_graph import TradingAgentsGraph

    return TradingAgentsGraph(selected_analysts=selected_analysts, debug=False, config=config, callbacks=callbacks)


@dataclass
class RunOutcome:
    symbol: str
    status: str = "pending"  # completed | failed
    rating: str | None = None
    review: bool = False
    reason: str | None = None
    message: str | None = None
    decision: str = ""
    totals: dict[str, Any] = field(default_factory=dict)
    usage: list[dict[str, Any]] = field(default_factory=list)
    fatal: LimitSignal | None = None


@dataclass
class SessionResult:
    session_id: str
    status: str  # completed | failed
    outcome: str | None = None
    message: str | None = None
    runs: list[RunOutcome] = field(default_factory=list)
    totals: dict[str, Any] = field(default_factory=dict)


class _RunControl:
    """One symbol's run: its events go out only until it is cancelled (timed out)."""

    def __init__(self, emitter: Emits, symbol: str) -> None:
        self.emitter = emitter
        self.symbol = symbol
        self.lock = threading.Lock()
        self.cancelled = False
        self.sink = Sink()
        self.stats: Any = None
        self.error: BaseException | None = None
        self.rating: str | None = None
        self.decision = ""
        self.done = False
        self._limits_seen: set[tuple[str, int]] = set()

    def emit(self, events: list[Event] | tuple[Event, ...]) -> None:
        with self.lock:
            if self.cancelled:
                return
            for event in events:
                self.emitter.emit(event)

    def emit_tick(self, tick: Event) -> None:
        self.emit([tick])

    def emit_limits(self, signals: list[LimitSignal]) -> None:
        events = []
        for signal in signals:
            key = (signal.provider, signal.status)
            if key in self._limits_seen:
                continue
            self._limits_seen.add(key)
            events.append(Limit(symbol=self.symbol, provider=signal.provider, status=signal.status,
                                message=signal.message, fatal=signal.fatal))
        if events:
            self.emit(events)

    def cancel(self) -> None:
        with self.lock:
            self.cancelled = True
            if self.stats is not None:
                self.stats.muted = True


class SessionRunner:
    def __init__(self, request: RunRequest, emitter: Emits, paperclip: Any, settings: Settings, *,
                 graph_factory: Callable[..., Any] | None = None, ta_defaults: Mapping[str, Any] | None = None,
                 on_progress: Callable[..., None] | None = None, should_stop: Callable[[], bool] | None = None,
                 clock: Callable[[], float] = time.time) -> None:
        self.request = request
        self.emitter = emitter
        self.paperclip = paperclip
        self.settings = settings
        self.graph_factory = graph_factory or default_graph_factory
        self._ta_defaults = ta_defaults
        self.on_progress = on_progress or (lambda **_: None)
        self.should_stop = should_stop or (lambda: False)
        self.clock = clock
        self.strays: list[threading.Thread] = []
        self.head_id: str | None = None

    # ---- the session ----

    def run(self) -> SessionResult:
        req = self.request
        issue = req.issue_id
        result = SessionResult(session_id=req.sessionId, status="failed")
        paperclip_on = bool(getattr(self.paperclip, "configured", False))
        unreachable = False

        if paperclip_on:
            me = self.paperclip.me()
            if me is None:
                unreachable = True
            else:
                self.head_id = me.get("id")
                stop = budget_stop(me)
                if stop:
                    return self._fail(result, "budget", stop, issue)
        if paperclip_on and issue and not req.dryRun and not unreachable:
            # A run of the Head trader on the issue, which every comment and update names; the key's
            # own agent first, since an agent may invoke only itself.
            head = self.head_id or req.agent_ids.get(HEAD_TRADER)
            if not head or not self.paperclip.start_run(issue, head):
                logger.warning("Paperclip gave no run on issue %s; its comments may not land", issue)

        self.emitter.emit(SessionStarted(symbols=list(req.symbols), tradeDate=req.trade_date, approval=req.approval,
                                         dryRun=req.dryRun, models=Models(**self.settings.models)))
        if unreachable:
            self.emitter.emit(Limit(symbol=None, provider="paperclip", status=503, fatal=False,
                                    message="Paperclip did not answer; the session runs without it and its costs are not mirrored."))

        total = len(req.symbols)
        for index, symbol in enumerate(req.symbols):
            if self.should_stop():
                return self._fail(result, "error", "The service is stopping; the session ended early.", issue)
            if index > 0 and paperclip_on and not unreachable:
                stop = budget_stop(self.paperclip.me())
                if stop:
                    return self._fail(result, "budget", stop, issue)
            self.on_progress(symbol=symbol, index=index)
            outcome = self._run_symbol(symbol, index, total)
            result.runs.append(outcome)
            self._mirror_run(outcome, issue)
            if outcome.fatal is not None:
                return self._fail(result, "limit", outcome.fatal.message, issue)

        result.totals = self._totals(result.runs)
        completed = [r for r in result.runs if r.status == "completed"]
        if not completed:
            all_timeouts = all(r.reason == "timeout" for r in result.runs)
            outcome = "timeout" if all_timeouts else "error"
            first = next((r.message for r in result.runs if r.message), "no symbol completed")
            return self._fail(result, outcome, f"No symbol completed: {first}", issue)

        self.emitter.emit(SessionCompleted(
            runs=[RunSummary(symbol=r.symbol, rating=normalize_rating(r.rating), review=r.review) for r in completed],
            tokensIn=result.totals["tokensIn"], tokensOut=result.totals["tokensOut"],
            costCents=result.totals["costCents"], llmCalls=result.totals["llmCalls"],
            toolCalls=result.totals["toolCalls"], dropped=int(getattr(self.emitter, "dropped", 0)),
        ))
        result.status = "completed"
        if paperclip_on and issue and not req.dryRun:
            summary = "; ".join(f"{r.symbol} {normalize_rating(r.rating)}" for r in completed)
            failed = [r.symbol for r in result.runs if r.status != "completed"]
            note = f"Session {req.sessionId} finished: {summary}." + (f" Not completed: {', '.join(failed)}." if failed else "")
            self.paperclip.done(issue, note[:COMMENT_MAX])
        return result

    def _fail(self, result: SessionResult, outcome: str, message: str, issue: str | None) -> SessionResult:
        result.status = "failed"
        result.outcome = outcome
        result.message = scrub(message)
        result.totals = self._totals(result.runs)
        self.emitter.emit(SessionFailed(outcome=outcome, message=result.message))
        if getattr(self.paperclip, "configured", False) and issue and not self.request.dryRun:
            self.paperclip.blocked(issue, f"Session {self.request.sessionId} stopped ({outcome}): {result.message}"[:COMMENT_MAX])
        return result

    @staticmethod
    def _totals(runs: list[RunOutcome]) -> dict[str, Any]:
        keys = ("llmCalls", "toolCalls", "tokensIn", "tokensOut")
        totals: dict[str, Any] = {key: sum(int(r.totals.get(key, 0)) for r in runs) for key in keys}
        totals["costCents"] = round(sum(float(r.totals.get("costCents", 0.0)) for r in runs), 6)
        return totals

    # ---- one symbol ----

    def _ta_config(self) -> dict[str, Any]:
        if self._ta_defaults is None:
            from tradingagents.default_config import build_default_config

            self._ta_defaults = build_default_config()
        return self.settings.ta_config(self._ta_defaults)

    def _run_symbol(self, symbol: str, index: int, total: int) -> RunOutcome:
        ctl = _RunControl(self.emitter, symbol)
        outcome = RunOutcome(symbol=symbol)
        thread = threading.Thread(target=self._symbol_thread, args=(symbol, index, total, ctl),
                                  name=f"graph-{symbol}", daemon=True)
        thread.start()
        thread.join(timeout=float(self.settings.run_timeout_s))

        if thread.is_alive():
            ctl.cancel()
            self.strays.append(thread)
            outcome.status, outcome.reason = "failed", "timeout"
            outcome.message = f"{symbol} did not finish within {self.settings.run_timeout_s}s"
            self.emitter.emit(RunFailed(symbol=symbol, reason="timeout", message=outcome.message))
        elif ctl.error is not None:
            outcome.status = "failed"
            signal = classify(ctl.error, model_hint=self.settings.llm_provider)
            if signal is not None and signal.fatal:
                outcome.reason, outcome.fatal = "limit", signal
                outcome.message = signal.message
                ctl.emit([Limit(symbol=symbol, provider=signal.provider, status=signal.status,
                                message=signal.message, fatal=True),
                          RunFailed(symbol=symbol, reason="limit", message=signal.message)])
            else:
                outcome.reason = "error"
                outcome.message = scrub(f"{type(ctl.error).__name__}: {ctl.error}")
                ctl.emit([RunFailed(symbol=symbol, reason="error", message=outcome.message)])
        else:
            outcome.status = "completed"
            outcome.rating = normalize_rating(ctl.rating)
            outcome.review = outcome.rating == REVIEW
            outcome.decision = ctl.decision
        if ctl.stats is not None:
            outcome.totals = ctl.stats.totals()
            outcome.usage = ctl.stats.usage()
        return outcome

    def _symbol_thread(self, symbol: str, index: int, total: int, ctl: _RunControl) -> None:
        SINK.set(ctl.sink)
        try:
            self._symbol_body(symbol, index, total, ctl)
        except BaseException as exc:  # reported by the watchdog side
            ctl.error = exc
            if not ctl.cancelled:
                logger.warning("Run for %s failed: %s", symbol, type(exc).__name__)
        finally:
            ctl.done = True

    def _symbol_body(self, symbol: str, index: int, total: int, ctl: _RunControl) -> None:
        from tradingagents.agents.rating import run_rating
        from tradingagents.portfolio import PortfolioContext, Position

        from agent_world.stats import AgentWorldStatsHandler

        settings = self.settings
        machine = StageMachine(symbol, index, total, max_debate_rounds=settings.max_debate_rounds,
                               max_risk_rounds=settings.max_risk_rounds, max_tool_rounds=settings.max_tool_rounds,
                               attempts_for=ctl.sink.attempts_for)
        stats = AgentWorldStatsHandler(symbol, prices=settings.prices, on_tick=ctl.emit_tick)
        ctl.stats = stats
        ctl.emit(machine.start())

        graph = self.graph_factory(selected_analysts=SELECTED_ANALYSTS, config=self._ta_config(), callbacks=[stats])
        book = self.request.portfolio
        portfolio = PortfolioContext(
            cash=book.cash, currency=book.currency,
            positions=[Position(ticker=p.ticker, quantity=p.quantity, average_price=p.averagePrice)
                       for p in book.positions],
        )
        trade_date = self.request.trade_date
        initial = graph.create_run_state(symbol, trade_date, "stock", portfolio=portfolio)
        args = graph.propagator.get_graph_args(callbacks=[stats])

        final_state: dict[str, Any] = {}
        for namespace, messages, chunk in stream_steps(graph, initial, args):
            if ctl.cancelled:
                return
            ctl.emit(machine.feed(namespace, messages, chunk))
            ctl.emit_limits(ctl.sink.drain_limits())
            if not namespace and isinstance(chunk, Mapping):
                final_state.update(chunk)
        if ctl.cancelled:
            return

        # final_rating comes from the Portfolio Manager's step; run_rating reads it, else reads the
        # decision's own rating line, else REVIEW.
        rating = run_rating(final_state)
        try:
            graph.record_decision(symbol, trade_date, final_state)
        except Exception as exc:  # the state log and memory log are TradingAgents' own record
            logger.warning("Could not record the decision for %s: %s", symbol, type(exc).__name__)
        ctl.rating = rating
        ctl.decision = str(final_state.get("final_trade_decision") or "")
        ctl.emit_limits(ctl.sink.drain_limits())
        ctl.emit(machine.finish(rating, final_state, stats.totals()))

    # ---- Paperclip, best effort ----

    def _mirror_run(self, outcome: RunOutcome, issue: str | None) -> None:
        if not getattr(self.paperclip, "configured", False):
            return
        req = self.request
        occurred = iso_now(self.clock)
        counts: dict[str, int] = {}
        for row in outcome.usage:
            role = row["role"]
            counts[role] = counts.get(role, 0) + 1
            self.paperclip.cost_event(
                role=role, provider=self.settings.llm_provider, model=row["model"],
                input_tokens=row["inputTokens"], output_tokens=row["outputTokens"], cost_cents=row["costCents"],
                occurred_at=occurred, idempotency_key=f"{req.sessionId}:{outcome.symbol}:{role}:{counts[role]}",
                issue_id=issue, agent_ids=req.agent_ids,
            )
        if issue and not req.dryRun and outcome.status == "completed":
            text = f"{outcome.symbol}: {normalize_rating(outcome.rating)}\n\n{outcome.decision}"
            self.paperclip.comment(issue, text[:COMMENT_MAX])

    def join_strays(self, timeout_s: float = STRAY_JOIN_S) -> bool:
        """Wait for timed-out graph threads to return; True when none is left."""
        deadline = time.monotonic() + timeout_s
        for thread in self.strays:
            thread.join(timeout=max(0.0, deadline - time.monotonic()))
        self.strays = [t for t in self.strays if t.is_alive()]
        return not self.strays


def run_session(request: RunRequest, emitter: Emits, paperclip: Any, settings: Settings, **kwargs: Any) -> SessionResult:
    """Run one session to its end on the calling thread (the worker's)."""
    runner = SessionRunner(request, emitter, paperclip, settings, **kwargs)
    try:
        return runner.run()
    finally:
        runner.join_strays()
