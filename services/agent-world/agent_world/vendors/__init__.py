"""OpenBB registered into TradingAgents' data router, and every vendor call recorded.

``register_openbb()`` adds ``VENDOR_METHODS[method]["openbb"]`` for each method the OpenBB vendor
implements, wraps every vendor function of every method with the recorder (so a tool result can
say which vendor served it and what was tried first), and records the snapshot tool, which
bypasses the router. The chain each category walks is ``DATA_VENDORS``, passed to TradingAgents
as ``config["data_vendors"]`` (lib/agent-world/config.ts DATA_TOOLS mirrors it).
"""

from __future__ import annotations

import logging
from collections.abc import Mapping

from agent_world.config import DEFAULT_DATA_VENDORS

logger = logging.getLogger(__name__)

DATA_VENDORS: dict[str, str] = dict(DEFAULT_DATA_VENDORS)

# Every data tool the analysts call, with the router category it reads (None: it bypasses the
# router and reads Yahoo directly).
DATA_TOOLS: dict[str, str | None] = {
    "get_stock_data": "core_stock_apis",
    "get_indicators": "technical_indicators",
    "get_verified_market_snapshot": None,
    "get_fundamentals": "fundamental_data",
    "get_balance_sheet": "fundamental_data",
    "get_cashflow": "fundamental_data",
    "get_income_statement": "fundamental_data",
    "get_news": "news_data",
    "get_global_news": "news_data",
    "get_insider_transactions": "news_data",
    "get_macro_indicators": "macro_data",
    "get_prediction_markets": "prediction_markets",
}

# The vendors TradingAgents v0.7.1 offers per method, plus OpenBB where this service adds it;
# used to answer /health before (or without) importing TradingAgents.
SUPPORTED: dict[str, tuple[str, ...]] = {
    "get_stock_data": ("alpha_vantage", "yfinance", "openbb"),
    "get_indicators": ("alpha_vantage", "yfinance", "openbb"),
    "get_fundamentals": ("alpha_vantage", "yfinance", "openbb"),
    "get_balance_sheet": ("alpha_vantage", "sec_edgar", "yfinance", "openbb"),
    "get_cashflow": ("alpha_vantage", "sec_edgar", "yfinance", "openbb"),
    "get_income_statement": ("alpha_vantage", "sec_edgar", "yfinance", "openbb"),
    "get_news": ("alpha_vantage", "yfinance", "openbb"),
    "get_global_news": ("yfinance", "alpha_vantage"),
    "get_insider_transactions": ("alpha_vantage", "yfinance", "openbb"),
    "get_macro_indicators": ("fred", "openbb"),
    "get_prediction_markets": ("polymarket",),
}
SNAPSHOT_TOOL = "get_verified_market_snapshot"


def chain_for(method: str, data_vendors: Mapping[str, str],
              supported: Mapping[str, tuple[str, ...]] | None = None) -> list[str]:
    """The vendors a method actually tries, in order: the category's chain, filtered to the
    vendors that serve the method (TradingAgents' route_to_vendor rule)."""
    category = DATA_TOOLS.get(method)
    if category is None:
        return ["yfinance"]
    serves = (supported or SUPPORTED).get(method, ())
    configured = [v.strip() for v in str(data_vendors.get(category, "")).split(",") if v.strip()]
    if not configured or configured == ["default"]:
        return list(serves)
    return [v for v in configured if v in serves]


def chains(data_vendors: Mapping[str, str]) -> dict[str, list[str]]:
    """The chain for every data tool, as /health reports it: read from TradingAgents' live
    ``VENDOR_METHODS`` once OpenBB is registered into it, else from ``SUPPORTED``."""
    supported = None
    if _registered:
        import sys

        router = sys.modules.get("tradingagents.dataflows.router")
        if router is not None:
            supported = {m: tuple(v) for m, v in router.VENDOR_METHODS.items()}
    return {method: chain_for(method, data_vendors, supported) for method in DATA_TOOLS}


_registered = False


def register_openbb(fred_api_key: str | None = None) -> dict[str, list[str]]:
    """Register the OpenBB vendor and the recorder; idempotent. Returns the methods per vendor."""
    global _registered
    from tradingagents.agents import tools as ta_tools
    from tradingagents.dataflows import router

    from agent_world.vendors import openbb_vendor
    from agent_world.vendors.recorder import recorded, wrap_all

    for method, fn in openbb_vendor.VENDOR_FUNCTIONS.items():
        if method not in router.VENDOR_METHODS:
            raise RuntimeError(f"TradingAgents has no data method {method!r}; the vendor no longer fits this version")
        router.VENDOR_METHODS[method].setdefault("openbb", fn)
    wrap_all(router.VENDOR_METHODS)
    # The snapshot tool reads Yahoo without the router; record it under its own name.
    ta_tools.build_verified_market_snapshot = recorded(SNAPSHOT_TOOL, "yfinance", ta_tools.build_verified_market_snapshot)

    if fred_api_key:
        try:
            from openbb import obb

            obb.user.credentials.fred_api_key = fred_api_key
        except Exception as exc:  # the vendor still raises VendorNotConfiguredError without it
            logger.warning("Could not hand OpenBB the FRED key: %s", type(exc).__name__)
    _registered = True
    return {method: list(vendors) for method, vendors in router.VENDOR_METHODS.items()}


def registered() -> bool:
    return _registered
