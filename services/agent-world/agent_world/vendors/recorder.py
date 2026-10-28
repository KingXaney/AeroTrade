"""A record of every data-vendor call a run makes, and of the vendors' limit notes.

``register_openbb`` wraps every vendor function in TradingAgents' ``VENDOR_METHODS`` with
``recorded``: each call appends ``{method, vendor, ok, ms, error, call}`` to the ``Sink`` held in
the ``SINK`` context variable. The runner sets a fresh sink before it streams a run; LangGraph runs
each step and each tool call in a copy of that context, and a copy holds the same sink object, so
every thread's calls land in the one list (tests/test_vendors.py checks it on a real graph).

``CURRENT_CALL`` names the tool call in progress: the stats handler sets it in ``on_tool_start``,
which LangChain runs in the tool's own context just before the tool, so a vendor call can say
which tool call it served. A call made outside any tool (the Sentiment Analyst fetches its news
directly) records ``call: None``.
"""

from __future__ import annotations

import functools
import threading
import time
from collections.abc import Callable, MutableMapping
from contextvars import ContextVar
from typing import Any

from agent_world.limits import LimitSignal, classify

RECORDED_FLAG = "__agent_world_recorded__"
ERROR_MAX = 200


class Sink:
    """One run's vendor calls and limit notes; safe to share across threads."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.records: list[dict[str, Any]] = []
        self._limits: list[LimitSignal] = []
        self._limit_cursor = 0

    def add(self, record: dict[str, Any]) -> None:
        with self._lock:
            self.records.append(record)

    def attempts_for(self, call_id: str) -> list[dict[str, Any]]:
        with self._lock:
            return [dict(r) for r in self.records if r.get("call") == call_id]

    def note_limit(self, signal: LimitSignal) -> None:
        with self._lock:
            self._limits.append(signal)

    def drain_limits(self) -> list[LimitSignal]:
        """Limit notes added since the last drain."""
        with self._lock:
            fresh = self._limits[self._limit_cursor:]
            self._limit_cursor = len(self._limits)
            return fresh

    def snapshot(self) -> list[dict[str, Any]]:
        with self._lock:
            return [dict(r) for r in self.records]


SINK: ContextVar[Sink | None] = ContextVar("agent_world_vendor_sink", default=None)
CURRENT_CALL: ContextVar[str | None] = ContextVar("agent_world_tool_call", default=None)


def limit_source(method: str, vendor: str) -> str:
    """Where a vendor call's refusal comes from, for the limits registry."""
    if vendor == "openbb":
        if method == "get_insider_transactions":
            return "sec"
        if method == "get_macro_indicators":
            return "fred"
        return "openbb-yfinance"
    return vendor


def recorded(method: str, vendor: str, fn: Callable[..., Any]) -> Callable[..., Any]:
    """``fn`` with every call written to the current sink (a no-op without one)."""
    if getattr(fn, RECORDED_FLAG, False):
        return fn

    @functools.wraps(fn)
    def wrapper(*args: Any, **kwargs: Any) -> Any:
        sink = SINK.get()
        started = time.perf_counter()
        error: BaseException | None = None
        try:
            return fn(*args, **kwargs)
        except BaseException as exc:
            error = exc
            raise
        finally:
            if sink is not None:
                ms = int((time.perf_counter() - started) * 1000)
                sink.add({
                    "method": method,
                    "vendor": vendor,
                    "ok": error is None,
                    "ms": ms,
                    "error": None if error is None else f"{type(error).__name__}: {error}"[:ERROR_MAX],
                    "call": CURRENT_CALL.get(),
                })
                if error is not None and isinstance(error, Exception):
                    signal = classify(error, source=limit_source(method, vendor))
                    if signal is not None and not signal.fatal:
                        sink.note_limit(signal)

    setattr(wrapper, RECORDED_FLAG, True)
    return wrapper


def wrap_all(vendor_methods: MutableMapping[str, MutableMapping[str, Any]]) -> int:
    """Wrap every vendor function of every method in place; returns how many were wrapped."""
    wrapped = 0
    for method, vendors in vendor_methods.items():
        for vendor, impl in list(vendors.items()):
            if isinstance(impl, list):
                if impl and not getattr(impl[0], RECORDED_FLAG, False):
                    impl[0] = recorded(method, vendor, impl[0])
                    wrapped += 1
            elif callable(impl) and not getattr(impl, RECORDED_FLAG, False):
                vendors[vendor] = recorded(method, vendor, impl)
                wrapped += 1
    return wrapped
