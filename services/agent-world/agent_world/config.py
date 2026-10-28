"""The service's settings, read once from the environment. Pure: no I/O beyond the mapping given.

``Settings.from_env(os.environ)`` raises ``ConfigError`` naming every variable that is missing or
unreadable, so a misconfigured service stops at start-up rather than mid-session.
"""

from __future__ import annotations

import copy
import json
import os
from collections.abc import Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

from agent_world.pricing import PricesError, merge_prices, parse_prices
from agent_world.roles import ROLE_IDS

SERVICE_DIR = Path(__file__).resolve().parent.parent

# The data chain per TradingAgents category: each tool tries these vendors in order, using only
# the ones that serve it (lib/agent-world/config.ts DATA_TOOLS mirrors the table).
DEFAULT_DATA_VENDORS: dict[str, str] = {
    "core_stock_apis": "openbb,yfinance",
    "technical_indicators": "openbb,yfinance",
    "fundamental_data": "openbb,sec_edgar,yfinance",
    # get_global_news stays on yfinance: OpenBB's yfinance provider has no world news.
    "news_data": "openbb,yfinance",
    # TradingAgents' FRED pins the vintage to the run date; OpenBB's cannot, so it comes second.
    "macro_data": "fred,openbb",
    # TradingAgents' own default, kept.
    "prediction_markets": "polymarket",
}
DATA_CATEGORIES: tuple[str, ...] = tuple(DEFAULT_DATA_VENDORS)
KNOWN_VENDORS = frozenset({"openbb", "yfinance", "sec_edgar", "alpha_vantage", "fred", "polymarket"})

DEFAULTS = {
    "PORT": 8789,
    "AGENT_WORLD_LLM_PROVIDER": "google",
    "AGENT_WORLD_QUICK_MODEL": "gemini-2.5-flash-lite",
    "AGENT_WORLD_DEEP_MODEL": "gemini-2.5-flash",
    "AGENT_WORLD_MAX_DEBATE_ROUNDS": 1,
    "AGENT_WORLD_MAX_RISK_ROUNDS": 1,
    "AGENT_WORLD_MAX_TOOL_ROUNDS": 8,
    "AGENT_WORLD_RUN_TIMEOUT_S": 600,
}
SUPPORTED_PROVIDERS = frozenset({"google", "anthropic"})


class ConfigError(ValueError):
    """The environment cannot configure the service; the message names every problem."""


def origin_of(url: str) -> str | None:
    """``scheme://host[:port]`` of an http(s) URL, default ports dropped; None when not one."""
    try:
        parts = urlsplit(url.strip())
        port = parts.port
    except ValueError:
        return None
    scheme = (parts.scheme or "").lower()
    host = (parts.hostname or "").lower()
    if scheme not in ("http", "https") or not host or parts.username or parts.password:
        return None
    default = 80 if scheme == "http" else 443
    netloc = f"[{host}]" if ":" in host else host
    if port is not None and port != default:
        netloc = f"{netloc}:{port}"
    return f"{scheme}://{netloc}"


def same_origin(url: str, origin: str) -> bool:
    """Whether ``url`` is on exactly ``origin`` (scheme, host and port)."""
    found = origin_of(url)
    return found is not None and found == origin


def _text(env: Mapping[str, str], name: str) -> str | None:
    value = env.get(name)
    if value is None:
        return None
    value = value.strip()
    return value or None


def _int(env: Mapping[str, str], name: str, low: int, high: int, problems: list[str]) -> int:
    raw = _text(env, name)
    if raw is None:
        return int(DEFAULTS[name])
    try:
        value = int(raw)
    except ValueError:
        problems.append(f"{name} must be a whole number, got {raw!r}")
        return int(DEFAULTS[name])
    if not low <= value <= high:
        problems.append(f"{name} must be between {low} and {high}, got {value}")
        return int(DEFAULTS[name])
    return value


def _json_object(env: Mapping[str, str], name: str, problems: list[str]) -> dict[str, Any]:
    raw = _text(env, name)
    if raw is None:
        return {}
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        problems.append(f"{name} is not JSON ({exc.msg})")
        return {}
    if not isinstance(data, dict):
        problems.append(f"{name} must be a JSON object")
        return {}
    return data


@dataclass(frozen=True)
class Settings:
    secret: str
    aerotrade_url: str
    aerotrade_origin: str
    port: int = 8789
    heartbeat_secret: str | None = None
    paperclip_url: str | None = None
    paperclip_api_key: str | None = None
    paperclip_company_id: str | None = None
    paperclip_role_keys: dict[str, str] = field(default_factory=dict)
    llm_provider: str = "google"
    quick_model: str = "gemini-2.5-flash-lite"
    deep_model: str = "gemini-2.5-flash"
    max_debate_rounds: int = 1
    max_risk_rounds: int = 1
    max_tool_rounds: int = 8
    run_timeout_s: int = 600
    prices: dict[str, tuple[float, float]] = field(default_factory=merge_prices)
    data_vendors: dict[str, str] = field(default_factory=lambda: dict(DEFAULT_DATA_VENDORS))
    fred_api_key: str | None = None
    sec_edgar_user_agent: str | None = None
    data_dir: Path = SERVICE_DIR / ".data"
    results_dir: Path | None = None
    cache_dir: Path | None = None
    memory_log_path: Path | None = None
    google_key_present: bool = False
    anthropic_key_present: bool = False

    @classmethod
    def from_env(cls, env: Mapping[str, str]) -> Settings:
        problems: list[str] = []

        secret = _text(env, "AGENT_WORLD_SECRET")
        if secret is None:
            problems.append("AGENT_WORLD_SECRET is required (the HMAC secret shared with AeroTrade)")
        elif len(secret) < 16:
            problems.append("AGENT_WORLD_SECRET must be at least 16 characters")

        aerotrade_url = _text(env, "AEROTRADE_URL")
        aerotrade_origin = origin_of(aerotrade_url) if aerotrade_url else None
        if aerotrade_url is None:
            problems.append("AEROTRADE_URL is required (the only origin events may be sent to)")
        elif aerotrade_origin is None:
            problems.append(f"AEROTRADE_URL must be an http(s) URL, got {aerotrade_url!r}")

        provider = (_text(env, "AGENT_WORLD_LLM_PROVIDER") or str(DEFAULTS["AGENT_WORLD_LLM_PROVIDER"])).lower()
        if provider not in SUPPORTED_PROVIDERS:
            problems.append(f"AGENT_WORLD_LLM_PROVIDER must be one of {sorted(SUPPORTED_PROVIDERS)}, got {provider!r}")

        # Keys for the twelve desk roles; any other entry (the Head trader's own key, which is
        # PAPERCLIP_API_KEY, or the Execution desk's) is ignored rather than refused.
        role_keys: dict[str, str] = {}
        for role, key in _json_object(env, "PAPERCLIP_ROLE_KEYS", problems).items():
            if role not in ROLE_IDS:
                continue
            if not isinstance(key, str) or not key.strip():
                problems.append(f"PAPERCLIP_ROLE_KEYS[{role!r}] must be a non-empty string")
            else:
                role_keys[role] = key.strip()

        vendors = dict(DEFAULT_DATA_VENDORS)
        for category, chain in _json_object(env, "AGENT_WORLD_DATA_VENDORS", problems).items():
            if category not in DEFAULT_DATA_VENDORS:
                problems.append(f"AGENT_WORLD_DATA_VENDORS names an unknown category {category!r}")
                continue
            names = [v.strip() for v in str(chain).split(",") if v.strip()] if isinstance(chain, str) else []
            unknown = [v for v in names if v not in KNOWN_VENDORS]
            if not names or unknown:
                problems.append(f"AGENT_WORLD_DATA_VENDORS[{category!r}] must list vendors from "
                                f"{sorted(KNOWN_VENDORS)}, got {chain!r}")
                continue
            vendors[category] = ",".join(names)

        try:
            prices = merge_prices(parse_prices(env.get("AGENT_WORLD_PRICES")))
        except PricesError as exc:
            problems.append(str(exc))
            prices = merge_prices()

        port = _int(env, "PORT", 1, 65535, problems)
        debate = _int(env, "AGENT_WORLD_MAX_DEBATE_ROUNDS", 1, 5, problems)
        risk = _int(env, "AGENT_WORLD_MAX_RISK_ROUNDS", 1, 5, problems)
        tools = _int(env, "AGENT_WORLD_MAX_TOOL_ROUNDS", 1, 40, problems)
        timeout = _int(env, "AGENT_WORLD_RUN_TIMEOUT_S", 30, 7200, problems)

        data_dir_raw = _text(env, "AGENT_WORLD_DATA_DIR")
        data_dir = Path(data_dir_raw).expanduser() if data_dir_raw else SERVICE_DIR / ".data"

        def optional_path(name: str) -> Path | None:
            raw = _text(env, name)
            return Path(raw).expanduser() if raw else None

        if problems:
            raise ConfigError("; ".join(problems))

        return cls(
            secret=secret or "",
            aerotrade_url=aerotrade_url or "",
            aerotrade_origin=aerotrade_origin or "",
            port=port,
            heartbeat_secret=_text(env, "PAPERCLIP_HEARTBEAT_SECRET"),
            paperclip_url=(_text(env, "PAPERCLIP_URL") or "").rstrip("/") or None,
            paperclip_api_key=_text(env, "PAPERCLIP_API_KEY"),
            paperclip_company_id=_text(env, "PAPERCLIP_COMPANY_ID"),
            paperclip_role_keys=role_keys,
            llm_provider=provider,
            quick_model=_text(env, "AGENT_WORLD_QUICK_MODEL") or str(DEFAULTS["AGENT_WORLD_QUICK_MODEL"]),
            deep_model=_text(env, "AGENT_WORLD_DEEP_MODEL") or str(DEFAULTS["AGENT_WORLD_DEEP_MODEL"]),
            max_debate_rounds=debate,
            max_risk_rounds=risk,
            max_tool_rounds=tools,
            run_timeout_s=timeout,
            prices=prices,
            data_vendors=vendors,
            fred_api_key=_text(env, "FRED_API_KEY"),
            sec_edgar_user_agent=_text(env, "SEC_EDGAR_USER_AGENT"),
            data_dir=data_dir,
            results_dir=optional_path("TRADINGAGENTS_RESULTS_DIR"),
            cache_dir=optional_path("TRADINGAGENTS_CACHE_DIR"),
            memory_log_path=optional_path("TRADINGAGENTS_MEMORY_LOG_PATH"),
            google_key_present=bool(_text(env, "GOOGLE_API_KEY") or _text(env, "GEMINI_API_KEY")),
            anthropic_key_present=bool(_text(env, "ANTHROPIC_API_KEY")),
        )

    # ---- derived ----

    @property
    def paperclip_configured(self) -> bool:
        return bool(self.paperclip_url and self.paperclip_api_key and self.paperclip_company_id)

    @property
    def models(self) -> dict[str, str]:
        return {"provider": self.llm_provider, "quick": self.quick_model, "deep": self.deep_model}

    @property
    def ta_results_dir(self) -> Path:
        return self.results_dir or self.data_dir / "tradingagents" / "results"

    @property
    def ta_cache_dir(self) -> Path:
        return self.cache_dir or self.data_dir / "tradingagents" / "cache"

    @property
    def ta_memory_log_path(self) -> Path:
        return self.memory_log_path or self.data_dir / "tradingagents" / "memory" / "trading_memory.md"

    @property
    def openbb_dir(self) -> Path:
        return self.data_dir / "openbb"

    @property
    def undelivered_dir(self) -> Path:
        return self.data_dir / "undelivered"

    def ta_config(self, base: Mapping[str, Any] | None = None) -> dict[str, Any]:
        """The TradingAgents config dict for a run.

        With ``base`` (TradingAgents' DEFAULT_CONFIG) the result is complete, merged the way
        TradingAgents merges (dict values one level deep); without it, only this service's keys.
        TradingAgentsGraph does not fill missing keys itself, so the runner always passes a base.
        """
        ours: dict[str, Any] = {
            "llm_provider": self.llm_provider,
            "quick_think_llm": self.quick_model,
            "deep_think_llm": self.deep_model,
            # A tier on its own provider or endpoint would bypass the settings above.
            "quick_think_provider": None,
            "deep_think_provider": None,
            "max_debate_rounds": self.max_debate_rounds,
            "max_risk_discuss_rounds": self.max_risk_rounds,
            "max_tool_rounds": self.max_tool_rounds,
            "checkpoint_enabled": False,
            "data_vendors": dict(self.data_vendors),
            "results_dir": str(self.ta_results_dir),
            "data_cache_dir": str(self.ta_cache_dir),
            "memory_log_path": str(self.ta_memory_log_path),
        }
        if base is None:
            return ours
        merged: dict[str, Any] = copy.deepcopy(dict(base))
        for key, value in ours.items():
            if isinstance(value, dict) and isinstance(merged.get(key), dict):
                merged[key] = {**merged[key], **value}
            else:
                merged[key] = value
        return merged


def settings_from_os() -> Settings:
    return Settings.from_env(os.environ)
