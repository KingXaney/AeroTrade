"""Which failures are a provider's limit, and whether they end the session.

A model refusal (Gemini or Anthropic: rate limit, quota, auth, overloaded) is fatal: every later
call would meet it too, so the session ends with ``session.failed{outcome: "limit"}``. A data
vendor's refusal (Yahoo through OpenBB or TradingAgents, SEC, FRED) is not: the chain moves on and
the run continues, and the page files the note.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

MESSAGE_MAX = 300

_STATUS = re.compile(r"(?<!\d)(401|403|429|500|502|503|504|529)(?!\d)")
_SECRET_PARAM = re.compile(r"(?i)((?:api_?key|key|token|apikey)=)[^&\s'\"]+")

# Words a provider uses for "you have hit a ceiling", by family.
_RATE = re.compile(r"(?i)rate[ _-]?limit|too many requests|resource[_ ]exhausted|ratelimit|\b429\b")
_QUOTA = re.compile(r"(?i)\bquota\b|insufficient[_ ]quota|billing|credit balance")
_AUTH = re.compile(r"(?i)api[_ ]key not valid|invalid[_ ]api[_ ]key|unauthenticated|permission[_ ]denied"
                   r"|authentication[_ ]error|\b401\b|\b403\b")
_OVERLOADED = re.compile(r"(?i)overloaded|\b529\b|\b503\b|service unavailable|unavailable\b")

_MODEL_MODULES = {
    "google.genai": "gemini",
    "google.api_core": "gemini",
    "langchain_google_genai": "gemini",
    "anthropic": "anthropic",
    "langchain_anthropic": "anthropic",
}
_MODEL_ERROR_NAMES = {
    "ModelRateLimitError": 429,
    "ModelAuthenticationError": 401,
    "ModelPermissionDeniedError": 403,
    "RateLimitError": 429,
    "AuthenticationError": 401,
    "PermissionDeniedError": 403,
    "OverloadedError": 529,
    "GoogleRateLimitError": 429,
    "GoogleAuthenticationError": 401,
    "GooglePermissionDeniedError": 403,
}

# A data vendor's name (as TradingAgents' router knows it, or OpenBB's provider) -> the provider
# id AeroTrade's limits registry files it under.
VENDOR_PROVIDERS = {
    "yfinance": "openbb-yfinance",
    "openbb-yfinance": "openbb-yfinance",
    "sec": "sec",
    "sec_edgar": "sec",
    "fred": "fred",
    "alpha_vantage": "alpha-vantage",
    "polymarket": "polymarket",
}


@dataclass(frozen=True)
class LimitSignal:
    provider: str
    status: int
    message: str
    fatal: bool


def scrub(text: str) -> str:
    """A message safe to send on: credentials in query strings blanked, cut to the clamp."""
    return _SECRET_PARAM.sub(r"\1***", " ".join(str(text).split()))[:MESSAGE_MAX]


def _chain(exc: BaseException) -> list[BaseException]:
    seen: list[BaseException] = []
    current: BaseException | None = exc
    while current is not None and current not in seen and len(seen) < 8:
        seen.append(current)
        current = current.__cause__ or current.__context__
    return seen


def _status_of(chain: list[BaseException], text: str) -> int | None:
    for exc in chain:
        for attr in ("status_code", "code", "status"):
            value = getattr(exc, attr, None)
            if isinstance(value, int) and 100 <= value <= 599:
                return value
        response = getattr(exc, "response", None)
        value = getattr(response, "status_code", None)
        if isinstance(value, int):
            return value
        name = type(exc).__name__
        if name in _MODEL_ERROR_NAMES:
            return _MODEL_ERROR_NAMES[name]
    found = _STATUS.search(text)
    return int(found.group(1)) if found else None


_HINTS = {"google": "gemini", "gemini": "gemini", "anthropic": "anthropic"}


def _model_provider(chain: list[BaseException], text: str, source: str | None,
                    model_hint: str | None) -> str | None:
    for exc in chain:
        module = type(exc).__module__ or ""
        for prefix, provider in _MODEL_MODULES.items():
            if module == prefix or module.startswith(prefix + "."):
                return provider
    if source in _HINTS:
        return _HINTS[source]
    if any(type(exc).__name__.startswith("Model") and "langchain_core" in (type(exc).__module__ or "")
           for exc in chain):
        lowered = text.lower()
        if "gemini" in lowered or "generativelanguage" in lowered:
            return "gemini"
        if "anthropic" in lowered or "claude" in lowered:
            return "anthropic"
        # LangChain's own model error carries no provider; the configured one made the call.
        return _HINTS.get(model_hint or "")
    return None


def _vendor_provider(text: str, source: str | None) -> str | None:
    if source and source in VENDOR_PROVIDERS:
        return VENDOR_PROVIDERS[source]
    lowered = text.lower()
    if "fred_api_key" in lowered or "fred" in lowered and ("credential" in lowered or "not set" in lowered):
        return "fred"
    if "sec edgar" in lowered or "sec.gov" in lowered:
        return "sec"
    if "yahoo" in lowered or "yfinance" in lowered or "yfratelimit" in lowered:
        return "openbb-yfinance"
    return None


def classify(item: BaseException | str | None, *, source: str | None = None,
             model_hint: str | None = None) -> LimitSignal | None:
    """A limit signal for a failure, or None when it is not one.

    ``source`` names where the failure came from when the text alone cannot say: a vendor
    ("yfinance", "sec_edgar", "fred", "openbb-yfinance", "sec") or a model provider ("gemini",
    "anthropic"). ``model_hint`` is the configured model provider, used only for LangChain's
    provider-neutral model errors.
    """
    if item is None:
        return None
    if isinstance(item, BaseException):
        chain = _chain(item)
        text = " | ".join(f"{type(e).__name__}: {e}" for e in chain)
    else:
        chain = []
        text = str(item)
    status = _status_of(chain, text)

    model = _model_provider(chain, text, source, model_hint)
    if model is not None:
        if status in (429,) or _RATE.search(text) or _QUOTA.search(text):
            return LimitSignal(model, 429, scrub(text), True)
        if status in (401, 403) or _AUTH.search(text):
            return LimitSignal(model, status if status in (401, 403) else 401, scrub(text), True)
        if status in (503, 529) or _OVERLOADED.search(text):
            return LimitSignal(model, status if status in (503, 529) else 503, scrub(text), True)
        return None

    vendor = _vendor_provider(text, source)
    if vendor is None:
        return None
    lowered = text.lower()
    if vendor == "fred" and ("fred_api_key" in lowered or "credential" in lowered or "not set" in lowered):
        return LimitSignal("fred", 401, "FRED_API_KEY is not set, so FRED macro series are skipped", False)
    if status == 429 or _RATE.search(text):
        return LimitSignal(vendor, 429, scrub(text), False)
    if vendor == "sec" and status == 403:
        # SEC answers 403 both for a missing User-Agent and when its rate threshold is exceeded.
        return LimitSignal(vendor, 403, scrub(text), False)
    return None
