"""One worker thread, one session at a time, and what it remembers of the last fifty.

``submit`` answers at once: ``queued`` (the worker takes it), ``known`` (that session id was seen
before; nothing new starts) or ``busy`` (another session holds the worker). A session holds the
worker until its events are flushed and any timed-out graph thread has returned.
"""

from __future__ import annotations

import logging
import queue
import threading
import time
from collections import OrderedDict
from collections.abc import Callable
from typing import Any

from agent_world.config import Settings
from agent_world.contract import RunRequest
from agent_world.emitter import EventEmitter, iso_now
from agent_world.events import SessionFailed
from agent_world.paperclip import PaperclipClient
from agent_world.runner import SessionResult, run_session

logger = logging.getLogger(__name__)

KEEP_SESSIONS = 50
CLOSE_BUDGET_S = 60.0


def default_emitter_factory(settings: Settings) -> Callable[[RunRequest], Any]:
    def make(request: RunRequest) -> EventEmitter:
        return EventEmitter(request.sessionId, request.callbackUrl, settings.secret,
                            aerotrade_url=settings.aerotrade_url, data_dir=settings.data_dir)
    return make


def default_paperclip_factory(settings: Settings) -> Callable[[RunRequest], Any]:
    def make(request: RunRequest) -> PaperclipClient:
        return PaperclipClient(settings.paperclip_url, settings.paperclip_api_key, settings.paperclip_company_id,
                               settings.paperclip_role_keys,
                               run_id=request.paperclip.runId if request.paperclip else None)
    return make


class Worker:
    def __init__(self, settings: Settings, *, run: Callable[..., SessionResult] = run_session,
                 emitter_factory: Callable[[RunRequest], Any] | None = None,
                 paperclip_factory: Callable[[RunRequest], Any] | None = None,
                 keep: int = KEEP_SESSIONS, clock: Callable[[], float] = time.time) -> None:
        self.settings = settings
        self._run = run
        self._emitter_factory = emitter_factory or default_emitter_factory(settings)
        self._paperclip_factory = paperclip_factory or default_paperclip_factory(settings)
        self._keep = keep
        self._clock = clock
        self._lock = threading.Lock()
        self._queue: queue.Queue[RunRequest | None] = queue.Queue(maxsize=1)
        self._sessions: OrderedDict[str, dict[str, Any]] = OrderedDict()
        self._current: str | None = None
        self._stopping = threading.Event()
        self._thread = threading.Thread(target=self._loop, name="agent-world-worker", daemon=True)

    # ---- lifecycle ----

    def start(self) -> None:
        if not self._thread.is_alive():
            self._thread.start()

    def stop(self, timeout_s: float = 5.0) -> None:
        self._stopping.set()
        try:
            self._queue.put_nowait(None)  # wake the loop
        except queue.Full:
            pass
        if self._thread.is_alive():
            self._thread.join(timeout=timeout_s)

    @property
    def alive(self) -> bool:
        return self._thread.is_alive()

    # ---- requests ----

    def submit(self, request: RunRequest) -> tuple[str, str | None]:
        with self._lock:
            if request.sessionId in self._sessions:
                return "known", self._current
            if self._current is not None:
                return "busy", self._current
            self._current = request.sessionId
            self._remember(request.sessionId, {
                "sessionId": request.sessionId,
                "status": "queued",
                "symbols": list(request.symbols),
                "tradeDate": request.trade_date,
                "dryRun": request.dryRun,
                "approval": request.approval,
                "current": None,
                "queuedAt": iso_now(self._clock),
                "startedAt": None,
                "finishedAt": None,
                "outcome": None,
                "message": None,
                "runs": [],
                "delivery": None,
            })
        self._queue.put_nowait(request)
        return "queued", request.sessionId

    def snapshot(self, session_id: str) -> dict[str, Any] | None:
        with self._lock:
            found = self._sessions.get(session_id)
            return None if found is None else {**found, "runs": [dict(r) for r in found["runs"]]}

    def state(self) -> dict[str, Any]:
        with self._lock:
            current = self._sessions.get(self._current) if self._current else None
            where = (current or {}).get("current") or {}
            return {
                "busy": self._current is not None,
                "sessionId": self._current,
                "symbol": where.get("symbol"),
                "index": where.get("index"),
            }

    # ---- the loop ----

    def _remember(self, session_id: str, status: dict[str, Any]) -> None:
        self._sessions[session_id] = status
        self._sessions.move_to_end(session_id)
        while len(self._sessions) > self._keep:
            oldest = next(iter(self._sessions))
            if oldest == self._current:
                break
            self._sessions.popitem(last=False)

    def _update(self, session_id: str, **fields: Any) -> None:
        with self._lock:
            if session_id in self._sessions:
                self._sessions[session_id].update(fields)

    def _loop(self) -> None:
        while not self._stopping.is_set():
            try:
                request = self._queue.get(timeout=0.5)
            except queue.Empty:
                continue
            if request is None:
                continue
            try:
                self._execute(request)
            except Exception:  # never let one session take the worker down
                logger.exception("Session %s ended with an unexpected error", request.sessionId)
            finally:
                with self._lock:
                    if self._current == request.sessionId:
                        self._current = None

    def _execute(self, request: RunRequest) -> None:
        sid = request.sessionId
        self._update(sid, status="running", startedAt=iso_now(self._clock))
        emitter = None
        paperclip = None
        result: SessionResult | None = None
        try:
            emitter = self._emitter_factory(request)
            paperclip = self._paperclip_factory(request)

            def progress(symbol: str, index: int) -> None:
                self._update(sid, current={"symbol": symbol, "index": index})

            result = self._run(request, emitter, paperclip, self.settings, on_progress=progress,
                               should_stop=self._stopping.is_set)
        except Exception as exc:
            logger.exception("Session %s failed", sid)
            message = f"{type(exc).__name__}: the service could not run the session"
            if emitter is not None:
                emitter.emit(SessionFailed(outcome="error", message=message))
            self._update(sid, status="failed", outcome="error", message=message)
        finally:
            delivery = None
            if emitter is not None:
                stats = emitter.close(CLOSE_BUDGET_S) if hasattr(emitter, "close") else None
                if stats is not None:
                    delivery = {"emitted": stats.emitted, "delivered": stats.delivered, "dropped": stats.dropped,
                                "rejected": stats.rejected, "undelivered": stats.undelivered}
            if paperclip is not None and hasattr(paperclip, "close"):
                paperclip.close()
            fields: dict[str, Any] = {"finishedAt": iso_now(self._clock), "current": None, "delivery": delivery}
            if result is not None:
                fields.update(status=result.status, outcome=result.outcome, message=result.message,
                              runs=[{"symbol": r.symbol, "status": r.status, "rating": r.rating, "review": r.review,
                                     "reason": r.reason} for r in result.runs])
            self._update(sid, **fields)
