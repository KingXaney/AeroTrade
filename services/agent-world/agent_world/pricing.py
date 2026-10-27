"""What a model call costs: USD per million tokens, matched on the model id's longest prefix.

PRICES — written 2026-10-27 from the providers' published list prices as last known to the author.
They have NOT been checked against the live pricing pages, and providers change them: check every
row against https://ai.google.dev/gemini-api/docs/pricing and https://www.anthropic.com/pricing
before relying on a figure, and override rows with AGENT_WORLD_PRICES (JSON) rather than editing
here. Paperclip's budget stop is the real cap; these cents are an estimate for the page.

Gemini 3.x rows are left out on purpose: no figure for them could be verified, so they price as
"unknown" (cost 0) until AGENT_WORLD_PRICES names them.
"""

from __future__ import annotations

import json
import math
from collections.abc import Mapping
from dataclasses import dataclass

PRICES_CHECKED = "2026-10-27"

# model id prefix -> (input USD per 1M tokens, output USD per 1M tokens)
PRICES: dict[str, tuple[float, float]] = {
    # Google Gemini (paid tier, text, prompts up to 200k tokens)
    "gemini-2.5-flash-lite": (0.10, 0.40),
    "gemini-2.5-flash": (0.30, 2.50),
    "gemini-2.5-pro": (1.25, 10.00),
    "gemini-2.0-flash-lite": (0.075, 0.30),
    "gemini-2.0-flash": (0.10, 0.40),
    # Anthropic Claude
    "claude-haiku-4-5": (1.00, 5.00),
    "claude-sonnet-4-5": (3.00, 15.00),
    "claude-sonnet-4": (3.00, 15.00),
    "claude-opus-4-5": (5.00, 25.00),
    "claude-opus-4-1": (15.00, 75.00),
}


class PricesError(ValueError):
    """AGENT_WORLD_PRICES could not be read."""


@dataclass(frozen=True)
class Price:
    model: str
    input_per_m: float
    output_per_m: float
    known: bool


def normalize_model(model: str | None) -> str:
    """A model id as the table keys it: lower case, without a ``models/`` path prefix."""
    value = (model or "").strip().lower()
    if value.startswith("models/"):
        value = value[len("models/"):]
    return value


def parse_prices(raw: str | None) -> dict[str, tuple[float, float]]:
    """Rows from AGENT_WORLD_PRICES: ``{"model": [in, out]}`` or ``{"model": {"input": x, "output": y}}``."""
    if raw is None or not raw.strip():
        return {}
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise PricesError(f"AGENT_WORLD_PRICES is not JSON: {exc}") from exc
    if not isinstance(data, dict):
        raise PricesError("AGENT_WORLD_PRICES must be a JSON object of model -> [input, output]")
    rows: dict[str, tuple[float, float]] = {}
    for model, value in data.items():
        if isinstance(value, Mapping):
            pair = (value.get("input"), value.get("output"))
        elif isinstance(value, (list, tuple)) and len(value) == 2:
            pair = (value[0], value[1])
        else:
            raise PricesError(f"AGENT_WORLD_PRICES[{model!r}] must be [input, output] USD per 1M tokens")
        try:
            inp, out = float(pair[0]), float(pair[1])
        except (TypeError, ValueError) as exc:
            raise PricesError(f"AGENT_WORLD_PRICES[{model!r}] holds a non-number") from exc
        if not (math.isfinite(inp) and math.isfinite(out)) or inp < 0 or out < 0:
            raise PricesError(f"AGENT_WORLD_PRICES[{model!r}] must be finite and not negative")
        rows[normalize_model(str(model))] = (inp, out)
    return rows


def merge_prices(override: Mapping[str, tuple[float, float]] | None = None,
                 base: Mapping[str, tuple[float, float]] = PRICES) -> dict[str, tuple[float, float]]:
    """The table with the environment's rows laid over it."""
    merged = {normalize_model(k): (float(v[0]), float(v[1])) for k, v in base.items()}
    merged.update({normalize_model(k): (float(v[0]), float(v[1])) for k, v in (override or {}).items()})
    return merged


def price_for(model: str | None, prices: Mapping[str, tuple[float, float]] = PRICES) -> Price:
    """The row whose key is the longest prefix of the model id; unknown models price at 0."""
    name = normalize_model(model)
    best = None
    for prefix in prices:
        if name.startswith(prefix) and (best is None or len(prefix) > len(best)):
            best = prefix
    if best is None:
        return Price(model=name, input_per_m=0.0, output_per_m=0.0, known=False)
    inp, out = prices[best]
    return Price(model=name, input_per_m=inp, output_per_m=out, known=True)


def cost_cents(model: str | None, input_tokens: int, output_tokens: int,
               prices: Mapping[str, tuple[float, float]] = PRICES) -> tuple[float, bool]:
    """(US cents, whether the model was priced) for one call's tokens."""
    price = price_for(model, prices)
    usd = (max(0, input_tokens) * price.input_per_m + max(0, output_tokens) * price.output_per_m) / 1_000_000
    return usd * 100, price.known
