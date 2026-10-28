"""Signed, ordered batches of a session's events to AeroTrade's webhook.

One sender thread posts ``{"sessionId", "events": [...]}`` batches (at most 100 events and 256 KiB),
one batch in flight, in the order the events were emitted. ``seq`` is given when an event joins a
batch, so the stream the webhook sees is 1, 2, 3… with no holes even when events were coalesced or
dropped before sending. A batch the webhook refuses as malformed (400/401/404/413) is dropped and
counted; any other failure is retried in place (0.5 s · 2ⁿ, at most 30 s), so order holds.

The queue is bounded: under back-pressure only cost ticks, debate and risk turns and tool events
are dropped (counted in ``dropped``); the structural events never are. Cost ticks for one
(symbol, role, model) emitted within ``coalesce_s`` of each other are merged into one.
"""

from __future__ import annotations

import json
import logging
import threading
import time
from collections import deque
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from agent_world.config import origin_of
from agent_world.events import (
    DROPPABLE_TYPES,
    TERMINAL_RUN_TYPES,
    TERMINAL_SESSION_TYPES,
    Event,
    to_wire,
)
from agent_world.signing import signed_headers

logger = logging.getLogger(__name__)

QUEUE_MAX = 2000
BATCH_MAX_EVENTS = 100
BATCH_MAX_BYTES = 256 * 1024
COALESCE_S = 2.0
BACKOFF_BASE_S = 0.5
BACKOFF_CAP_S = 30.0
REJECTED_STATUSES = frozenset({400, 401, 404, 413})

# transport(url, body, headers) -> HTTP status; raises on a network failure.
Transport = Callable[[str, bytes, Mapping[str, str]], int]


class OriginError(ValueError):
    """A callback URL that is not on AEROTRADE_URL's origin."""


def iso_now(clock: Callable[[], float] = time.time) -> str:
    """ISO 8601 UTC with a Z and millisecond precision."""
    stamp = datetime.fromtimestamp(clock(), tz=UTC)
    return stamp.strftime("%Y-%m-%dT%H:%M:%S.") + f"{stamp.microsecond // 1000:03d}Z"


def httpx_transport(timeout_s: float = 10.0) -> Transport:
    import httpx

    client = httpx.Client(timeout=timeout_s, follow_redirects=False)

    def send(url: str, body: bytes, headers: Mapping[str, str]) -> int:
        return client.post(url, content=body, headers=dict(headers)).status_code

    return send


def serialize(session_id: str, events: list[dict[str, Any]]) -> bytes:
    """The batch body, serialized once: the bytes signed are the bytes sent."""
    payload = {"sessionId": session_id, "events": events}
    return json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


@dataclass
class _Pending:
    event: dict[str, Any]
    first: float


@dataclass
class EmitterStats:
    emitted: int = 0
    delivered: int = 0
    dropped: int = 0
    rejected: int = 0
    coalesced: int = 0
    retries: int = 0
    undelivered: int = 0
    last_status: int | None = None
    last_error: str | None = None
    undelivered_path: str | None = None
    statuses: list[int] = field(default_factory=list)


class EventEmitter:
    """One session's event stream to AeroTrade."""

    def __init__(self, session_id: str, callback_url: str, secret: str, *, aerotrade_url: str,
                 data_dir: Path | str | None = None, transport: Transport | None = None,
                 queue_max: int = QUEUE_MAX, batch_max_events: int = BATCH_MAX_EVENTS,
                 batch_max_bytes: int = BATCH_MAX_BYTES, coalesce_s: float = COALESCE_S,
                 clock: Callable[[], float] = time.time, monotonic: Callable[[], float] = time.monotonic,
                 sleep: Callable[[float], None] | None = None, start: bool = True) -> None:
        origin = origin_of(aerotrade_url)
        if origin is None or origin_of(callback_url) != origin:
            raise OriginError(f"callback URL must be on {origin or 'AEROTRADE_URL'}'s origin")
        self.session_id = session_id
        self.callback_url = callback_url
        self._secret = secret
        self._data_dir = Path(data_dir) if data_dir is not None else None
        self._transport = transport or httpx_transport()
        self._queue_max = queue_max
        self._batch_max_events = batch_max_events
        self._batch_max_bytes = batch_max_bytes
        self._coalesce_s = coalesce_s
        self._clock = clock
        self._monotonic = monotonic
        self._stop = threading.Event()
        self._sleep = sleep or (lambda seconds: self._stop.wait(seconds))
        self._cond = threading.Condition()
        self._queue: deque[dict[str, Any]] = deque()
        self._pending: dict[tuple[str, str, str], _Pending] = {}
        self._in_flight: list[dict[str, Any]] | None = None
        self._next_seq = 1
        self._closed = False
        self._idle = threading.Event()
        self._idle.set()
        self.stats = EmitterStats()
        self._thread = threading.Thread(target=self._run, name=f"emitter-{session_id}", daemon=True)
        if start:
            self._thread.start()

    # ---- producing ----

    @property
    def dropped(self) -> int:
        return self.stats.dropped

    def emit(self, event: Event | Mapping[str, Any]) -> bool:
        """Queue one event; False once the emitter is closed."""
        data = to_wire(event)
        data["sessionId"] = self.session_id
        data.pop("seq", None)
        if not data.get("at"):
            data["at"] = iso_now(self._clock)
        with self._cond:
            if self._closed:
                return False
            self.stats.emitted += 1
            kind = data.get("type")
            now = self._monotonic()
            if kind == "cost.tick":
                self._coalesce(data, now)
            else:
                if kind in TERMINAL_RUN_TYPES:
                    self._flush_pending(now, symbol=data.get("symbol"), force=True)
                elif kind in TERMINAL_SESSION_TYPES:
                    self._flush_pending(now, force=True)
                self._enqueue(data)
            self._cond.notify_all()
            return True

    def emit_all(self, events: list[Event] | tuple[Event, ...]) -> None:
        for event in events:
            self.emit(event)

    def _coalesce(self, data: dict[str, Any], now: float) -> None:
        key = (str(data.get("symbol")), str(data.get("role")), str(data.get("model")))
        pending = self._pending.get(key)
        if pending is not None and now - pending.first < self._coalesce_s:
            merged = pending.event
            for name in ("inputTokens", "outputTokens", "llmCalls"):
                merged[name] = int(merged.get(name, 0)) + int(data.get(name, 0))
            merged["costCents"] = round(float(merged.get("costCents", 0)) + float(data.get("costCents", 0)), 6)
            if data.get("pricing") == "unknown":
                merged["pricing"] = "unknown"
            merged["at"] = data["at"]
            self.stats.coalesced += 1
            return
        if pending is not None:
            self._enqueue(pending.event)
        self._pending[key] = _Pending(event=data, first=now)

    def _flush_pending(self, now: float, *, symbol: Any = None, force: bool = False) -> None:
        for key in list(self._pending):
            pending = self._pending[key]
            if (force and (symbol is None or key[0] == str(symbol))) or now - pending.first >= self._coalesce_s:
                del self._pending[key]
                self._enqueue(pending.event)

    def _enqueue(self, data: dict[str, Any]) -> None:
        if len(self._queue) >= self._queue_max:
            if data.get("type") in DROPPABLE_TYPES:
                self.stats.dropped += 1
                return
            # A structural event takes the place of the oldest droppable one, else goes over the cap.
            for index, queued in enumerate(self._queue):
                if queued.get("type") in DROPPABLE_TYPES:
                    del self._queue[index]
                    self.stats.dropped += 1
                    break
        self._queue.append(data)
        self._idle.clear()

    # ---- sending ----

    def _take_batch(self) -> list[dict[str, Any]] | None:
        """The next batch, its events given their seq; None when nothing is ready."""
        with self._cond:
            self._flush_pending(self._monotonic())
            if not self._queue:
                if not self._pending:
                    self._idle.set()
                return None
            batch: list[dict[str, Any]] = []
            size = len(serialize(self.session_id, []))
            while self._queue and len(batch) < self._batch_max_events:
                candidate = {"seq": self._next_seq, **self._queue[0]}
                extra = len(json.dumps(candidate, separators=(",", ":"), ensure_ascii=False).encode("utf-8")) + 1
                if batch and size + extra > self._batch_max_bytes:
                    break
                self._queue.popleft()
                batch.append(candidate)
                self._next_seq += 1
                size += extra
            self._in_flight = batch
            return batch

    def _deliver(self, batch: list[dict[str, Any]]) -> bool:
        """Send one batch until it is delivered or refused; False when stopped first."""
        body = serialize(self.session_id, batch)
        attempt = 0
        while True:
            headers = signed_headers(self._secret, body, self._clock())
            try:
                status = int(self._transport(self.callback_url, body, headers))
                self.stats.last_status = status
                self.stats.statuses.append(status)
                del self.stats.statuses[:-20]
            except Exception as exc:  # network failure: retry in place
                status = None
                self.stats.last_error = f"{type(exc).__name__}: {exc}"[:300]
            if status is not None and 200 <= status < 300:
                self.stats.delivered += len(batch)
                return True
            if status in REJECTED_STATUSES:
                self.stats.rejected += len(batch)
                logger.error("AeroTrade refused a batch of %d events for %s (HTTP %s); dropped",
                             len(batch), self.session_id, status)
                return True
            if self._stop.is_set():
                return False
            delay = min(BACKOFF_CAP_S, BACKOFF_BASE_S * (2 ** attempt))
            attempt += 1
            self.stats.retries += 1
            logger.warning("Batch for %s not delivered (%s); retrying in %.1fs", self.session_id,
                           status if status is not None else self.stats.last_error, delay)
            self._sleep(delay)
            if self._stop.is_set():
                return False

    def _run(self) -> None:
        while not self._stop.is_set():
            batch = self._take_batch()
            if batch is None:
                with self._cond:
                    if self._closed and not self._queue and not self._pending:
                        self._idle.set()
                        return
                    self._cond.wait(timeout=0.25)
                continue
            if not self._deliver(batch):
                return
            with self._cond:
                self._in_flight = None
                if not self._queue and not self._pending:
                    self._idle.set()

    # ---- closing ----

    def flush(self, timeout_s: float = 10.0) -> bool:
        """Wait until every queued event is delivered or refused; True when the queue is empty."""
        with self._cond:
            self._flush_pending(self._monotonic(), force=True)
            self._cond.notify_all()
        return self._idle.wait(timeout_s)

    def close(self, budget_s: float = 60.0) -> EmitterStats:
        """Stop taking events, deliver what is queued within the budget, keep the rest on disk."""
        with self._cond:
            self._closed = True
            self._flush_pending(self._monotonic(), force=True)
            self._cond.notify_all()
        if self._thread.is_alive():
            self._thread.join(timeout=max(0.0, budget_s))
        self._stop.set()
        with self._cond:
            self._cond.notify_all()
        if self._thread.is_alive():
            self._thread.join(timeout=2.0)
        with self._cond:
            # The batch in flight is kept too: it was neither delivered nor refused.
            leftovers = list(self._in_flight or [])
            for queued in self._queue:
                leftovers.append({"seq": self._next_seq, **queued})
                self._next_seq += 1
            self._queue.clear()
        if leftovers:
            self.stats.undelivered = len(leftovers)
            self._write_undelivered(leftovers)
        return self.stats

    def _write_undelivered(self, events: list[dict[str, Any]]) -> None:
        if self._data_dir is None:
            logger.error("%d events for %s were not delivered and no data dir is set", len(events), self.session_id)
            return
        folder = self._data_dir / "undelivered"
        folder.mkdir(parents=True, exist_ok=True)
        path = folder / f"{self.session_id}.json"
        payload = {"sessionId": self.session_id, "callbackUrl": self.callback_url,
                   "writtenAt": iso_now(self._clock), "events": events}
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
        self.stats.undelivered_path = str(path)
        logger.error("%d undelivered events for %s written to %s", len(events), self.session_id, path)
