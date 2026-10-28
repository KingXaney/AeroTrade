"""Model calls, tokens and cents per role, counted as a run goes.

``AgentWorldStatsHandler`` extends TradingAgents' own CLI handler (which counts calls, tool calls
and tokens) with a role for every model call — read from LangGraph's run metadata at
``on_chat_model_start`` and remembered per ``run_id`` until ``on_llm_end`` — a price for it from
``PRICES``, and a ``cost.tick`` per call. Coalescing the ticks is the emitter's job.

The handler is passed to the two LLM clients (so it sees every model call) and to the graph's run
config (so it sees every tool call); LangChain keeps one copy of a handler that arrives both ways.
"""

from __future__ import annotations

import threading
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Any

from cli.stats_handler import StatsCallbackHandler

from agent_world.events import CostTick
from agent_world.pricing import PRICES, PRICES_CHECKED, cost_cents, normalize_model, price_for
from agent_world.roles import OTHER_ROLE, role_for_metadata
from agent_world.vendors.recorder import CURRENT_CALL

__all__ = ["PRICES", "PRICES_CHECKED", "AgentWorldStatsHandler", "price_for", "cost_cents"]


@dataclass
class Usage:
    role: str
    model: str
    input_tokens: int = 0
    output_tokens: int = 0
    cost_cents: float = 0.0
    llm_calls: int = 0
    known: bool = True

    def as_dict(self) -> dict[str, Any]:
        return {
            "role": self.role,
            "model": self.model,
            "inputTokens": self.input_tokens,
            "outputTokens": self.output_tokens,
            "costCents": self.cost_cents,
            "llmCalls": self.llm_calls,
            "pricing": "known" if self.known else "unknown",
        }


def _model_from_start(serialized: Mapping[str, Any] | None, metadata: Mapping[str, Any] | None,
                      invocation_params: Mapping[str, Any] | None) -> str:
    for source in (metadata or {}, invocation_params or {}):
        for key in ("ls_model_name", "model", "model_name"):
            value = source.get(key)
            if isinstance(value, str) and value:
                return normalize_model(value)
    kwargs = (serialized or {}).get("kwargs") or {}
    for key in ("model", "model_name"):
        value = kwargs.get(key)
        if isinstance(value, str) and value:
            return normalize_model(value)
    return ""


def _model_from_response(response: Any) -> str:
    try:
        message = response.generations[0][0].message
        value = (getattr(message, "response_metadata", None) or {}).get("model_name")
        if isinstance(value, str) and value:
            return normalize_model(value)
    except (AttributeError, IndexError, TypeError):
        pass
    output = getattr(response, "llm_output", None) or {}
    value = output.get("model_name") if isinstance(output, Mapping) else None
    return normalize_model(value) if isinstance(value, str) else ""


def _tokens(response: Any) -> tuple[int, int]:
    try:
        message = response.generations[0][0].message
    except (AttributeError, IndexError, TypeError):
        return 0, 0
    usage = getattr(message, "usage_metadata", None) or {}
    return int(usage.get("input_tokens") or 0), int(usage.get("output_tokens") or 0)


class AgentWorldStatsHandler(StatsCallbackHandler):
    """Per-role usage and cost for one symbol's run."""

    def __init__(self, symbol: str, *, prices: Mapping[str, tuple[float, float]] = PRICES,
                 on_tick: Callable[[CostTick], None] | None = None) -> None:
        super().__init__()
        self.symbol = symbol
        self.prices = prices
        self.on_tick = on_tick
        self.muted = False
        self._aw_lock = threading.Lock()
        self._runs: dict[Any, tuple[str, str]] = {}
        self._usage: dict[tuple[str, str], Usage] = {}

    # ---- model calls ----

    def on_chat_model_start(self, serialized: dict[str, Any], messages: list[list[Any]], **kwargs: Any) -> None:
        super().on_chat_model_start(serialized, messages, **kwargs)
        role = role_for_metadata(kwargs.get("metadata"))
        model = _model_from_start(serialized, kwargs.get("metadata"), kwargs.get("invocation_params"))
        with self._aw_lock:
            self._runs[kwargs.get("run_id")] = (role, model)

    def on_llm_end(self, response: Any, **kwargs: Any) -> None:
        super().on_llm_end(response, **kwargs)
        with self._aw_lock:
            role, model = self._runs.pop(kwargs.get("run_id"), (OTHER_ROLE, ""))
        model = _model_from_response(response) or model or "unknown"
        tokens_in, tokens_out = _tokens(response)
        cents, known = cost_cents(model, tokens_in, tokens_out, self.prices)
        with self._aw_lock:
            usage = self._usage.setdefault((role, model), Usage(role=role, model=model))
            usage.input_tokens += tokens_in
            usage.output_tokens += tokens_out
            usage.cost_cents += cents
            usage.llm_calls += 1
            usage.known = usage.known and known
            muted = self.muted
        if self.on_tick is not None and not muted:
            self.on_tick(CostTick(symbol=self.symbol, role=role, model=model, inputTokens=tokens_in,
                                  outputTokens=tokens_out, costCents=cents, llmCalls=1,
                                  pricing="known" if known else "unknown"))

    def on_llm_error(self, error: BaseException, **kwargs: Any) -> None:
        with self._aw_lock:
            self._runs.pop(kwargs.get("run_id"), None)

    # ---- tool calls: name the call in progress for the data recorder ----

    def on_tool_start(self, serialized: dict[str, Any], input_str: str, **kwargs: Any) -> None:
        super().on_tool_start(serialized, input_str, **kwargs)
        call_id = kwargs.get("tool_call_id")
        CURRENT_CALL.set(str(call_id) if call_id else None)

    def on_tool_end(self, output: Any, **kwargs: Any) -> None:
        CURRENT_CALL.set(None)

    def on_tool_error(self, error: BaseException, **kwargs: Any) -> None:
        CURRENT_CALL.set(None)

    # ---- reads ----

    def usage(self) -> list[dict[str, Any]]:
        """One row per (role, model), in first-call order."""
        with self._aw_lock:
            return [u.as_dict() for u in self._usage.values()]

    def totals(self) -> dict[str, Any]:
        """The run's stats as ``run.completed`` carries them."""
        stats = self.get_stats()
        with self._aw_lock:
            cents = sum(u.cost_cents for u in self._usage.values())
        return {
            "llmCalls": int(stats["llm_calls"]),
            "toolCalls": int(stats["tool_calls"]),
            "tokensIn": int(stats["tokens_in"]),
            "tokensOut": int(stats["tokens_out"]),
            "costCents": round(cents, 6),
        }
