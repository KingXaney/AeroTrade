"""OpenBB as a TradingAgents data vendor, through its keyless providers (yfinance, SEC, FRED).

Each function takes exactly the positional arguments TradingAgents v0.7.1's tool layer passes to
``route_to_vendor`` (tradingagents/agents/tools.py), returns a string in the shape TradingAgents'
own Yahoo vendor returns, and raises TradingAgents' own error classes so the router moves on to
the next vendor in the chain:

- ``NoMarketDataError``: OpenBB answered with nothing usable for the symbol and date.
- ``VendorUnavailableError``: OpenBB failed, timed out (20 s), or was rate limited; a rate limit
  also leaves a ``limit`` note through the recorder.
- ``VendorNotConfiguredError``: a provider needs a key that is not set (FRED).

Point in time: every date is the run's as-of date, already clamped by the tool layer. Prices and
bars are cut at it; statements count as public only a filing lag after their period ends (45 days
quarterly, 90 annual); insider trades are cut on their SEC filing date; the live profile is served
only for a run dated today (TradingAgents' own withhold notice otherwise); FRED through OpenBB
cannot pin a vintage, so it serves only a run dated today.
"""

from __future__ import annotations

import logging
import threading
import time
from collections import OrderedDict
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeout
from datetime import date, datetime, timedelta
from typing import Any

import pandas as pd

from agent_world.limits import classify
from agent_world.vendors import shaping

logger = logging.getLogger(__name__)

BUDGET_S = 20.0
BARS_TTL_S = 900.0
BARS_KEPT = 32
BARS_YEARS = 5
NEWS_LIMIT = 20
INSIDER_DAYS = 60
INSIDER_LIMIT = 40
MACRO_LOOKBACK_DAYS = 365

_executor = ThreadPoolExecutor(max_workers=8, thread_name_prefix="openbb")
_bars_lock = threading.Lock()
_bar_cache: OrderedDict[tuple[str, str], tuple[float, pd.DataFrame]] = OrderedDict()


def _errors():
    from tradingagents.dataflows import errors

    return errors


def _obb():
    from openbb import obb

    return obb


def _today() -> date:
    return date.today()


def _is_historical(as_of: str | None) -> bool:
    return bool(as_of) and str(as_of) < _today().isoformat()


def _canonical(symbol: str) -> str:
    from tradingagents.dataflows.symbols import normalize_symbol

    return normalize_symbol(symbol)


def _rows(result: Any) -> list[dict[str, Any]]:
    """An OBBject's results as plain dicts."""
    items = getattr(result, "results", None)
    if items is None:
        return []
    if not isinstance(items, list):
        items = [items]
    rows = []
    for item in items:
        if hasattr(item, "model_dump"):
            rows.append(item.model_dump())
        elif isinstance(item, dict):
            rows.append(dict(item))
    return rows


def _call(label: str, fn: Callable[[], Any], *, symbol: str, source: str, empty_is: str = "no-data") -> Any:
    """Run one OpenBB call within the budget, its failures turned into the router's errors."""
    errors = _errors()
    future = _executor.submit(fn)
    try:
        return future.result(timeout=BUDGET_S)
    except FutureTimeout:
        future.cancel()
        raise errors.VendorUnavailableError(f"OpenBB {label} took longer than {BUDGET_S:.0f}s") from None
    except errors.VendorError:
        raise
    except Exception as exc:
        raise _translate(exc, label, symbol=symbol, source=source, empty_is=empty_is) from exc


def _translate(exc: Exception, label: str, *, symbol: str, source: str, empty_is: str) -> Exception:
    errors = _errors()
    name = type(exc).__name__
    text = f"{name}: {exc}"
    lowered = text.lower()
    if name == "EmptyDataError" or "no data" in lowered and "empty" in lowered:
        if empty_is == "unavailable":
            return errors.VendorUnavailableError(f"OpenBB {label} returned nothing for {symbol}")
        return errors.NoMarketDataError(symbol, symbol, f"OpenBB {label} returned no rows")
    if "missing credential" in lowered or name == "UnauthorizedError":
        return errors.VendorNotConfiguredError(f"OpenBB {label}: {exc}".strip()[:300])
    signal = classify(exc, source=source)
    if signal is not None and signal.status == 429:
        return errors.VendorUnavailableError(f"OpenBB {label} rate limited (429): {signal.message}"[:300])
    return errors.VendorUnavailableError(f"OpenBB {label} failed: {text}"[:300])


def _bars(symbol: str, start: str, end: str) -> pd.DataFrame:
    """Daily bars, split- and dividend-adjusted as TradingAgents' Yahoo bars are."""
    obb = _obb()
    result = _call(
        "equity.price.historical",
        lambda: obb.equity.price.historical(symbol, start_date=start, end_date=end, provider="yfinance",
                                            adjustment="splits_and_dividends"),
        symbol=symbol, source="openbb-yfinance",
    )
    frame = shaping.bars_frame(_rows(result))
    if frame.empty:
        raise _errors().NoMarketDataError(symbol, symbol, f"no rows between {start} and {end}")
    return frame


def _history_to(symbol: str, as_of: str) -> pd.DataFrame:
    """Five years of bars up to ``as_of``, kept for 15 minutes: an analyst asks for one
    indicator at a time over the same history."""
    key = (symbol, as_of)
    now = time.monotonic()
    with _bars_lock:
        hit = _bar_cache.get(key)
        if hit is not None and now - hit[0] < BARS_TTL_S:
            _bar_cache.move_to_end(key)
            return hit[1]
    end = datetime.strptime(as_of, "%Y-%m-%d").date()
    start = end - timedelta(days=365 * BARS_YEARS + 2)
    frame = _bars(symbol, start.isoformat(), end.isoformat())
    frame = frame[frame["Date"].dt.date <= end].reset_index(drop=True)
    with _bars_lock:
        _bar_cache[key] = (now, frame)
        while len(_bar_cache) > BARS_KEPT:
            _bar_cache.popitem(last=False)
    return frame


# ---- the vendor functions, in TradingAgents' argument order ----

def get_stock_data(symbol: str, start_date: str, end_date: str) -> str:
    """OHLCV between two dates (core_stock_apis)."""
    errors = _errors()
    canonical = _canonical(symbol)
    frame = _bars(canonical, start_date, end_date)
    detail = shaping.stale_detail(frame, end_date)
    if detail:
        raise errors.NoMarketDataError(symbol, canonical, detail)
    return shaping.stock_csv(frame, canonical, start_date, end_date)


def get_indicators(symbol: str, indicator: str, curr_date: str, look_back_days: int = 30) -> str:
    """One stockstats indicator over the look-back window (technical_indicators)."""
    errors = _errors()
    if indicator not in shaping.INDICATORS:
        raise ValueError(shaping.unsupported_indicator(indicator))
    canonical = _canonical(symbol)
    frame = _history_to(canonical, curr_date)
    detail = shaping.stale_detail(frame, curr_date)
    if detail:
        raise errors.NoMarketDataError(symbol, canonical, detail)
    try:
        values = shaping.indicator_values(frame, indicator)
    except Exception as exc:
        raise errors.NoMarketDataError(symbol, canonical, f"{indicator} could not be computed: {exc}") from exc
    return shaping.indicator_window(values, indicator, curr_date, int(look_back_days or 30))


def get_fundamentals(ticker: str, as_of_date: str | None = None) -> str:
    """Key metrics and profile, for a run dated today only (fundamental_data)."""
    from tradingagents.dataflows.date_window import withhold_live_profile

    errors = _errors()
    canonical = _canonical(ticker)
    withheld = withhold_live_profile(as_of_date, canonical)
    if withheld:
        return withheld
    obb = _obb()
    metrics = _rows(_call("equity.fundamental.metrics",
                          lambda: obb.equity.fundamental.metrics(canonical, provider="yfinance"),
                          symbol=canonical, source="openbb-yfinance"))
    try:
        profile = _rows(_call("equity.profile", lambda: obb.equity.profile(canonical, provider="yfinance"),
                              symbol=canonical, source="openbb-yfinance"))
    except errors.NoMarketDataError:
        profile = []
    text = shaping.fundamentals_text(canonical, metrics[0] if metrics else {}, profile[0] if profile else {})
    if text is None:
        raise errors.NoMarketDataError(ticker, canonical, "no fundamental fields")
    return text


def _statement(route: str, title: str, ticker: str, freq: str, as_of_date: str | None) -> str:
    errors = _errors()
    canonical = _canonical(ticker)
    as_of = as_of_date or _today().isoformat()
    period = "annual" if str(freq).lower() == "annual" else "quarter"
    label = "annual" if period == "annual" else "quarterly"
    obb = _obb()
    fetch = getattr(obb.equity.fundamental, route)
    rows = _rows(_call(f"equity.fundamental.{route}",
                       lambda: fetch(canonical, period=period, limit=5, provider="yfinance"),
                       symbol=canonical, source="openbb-yfinance"))
    text = shaping.statement_csv(rows, canonical, label, title, as_of)
    if text is None:
        cutoff, lag = shaping.statement_cutoff(as_of, label)
        raise errors.NoMarketDataError(ticker, canonical,
                                       f"no {label} {title.lower()} period ended by {cutoff} ({lag}-day filing lag)")
    return text


def get_balance_sheet(ticker: str, freq: str = "quarterly", as_of_date: str | None = None) -> str:
    return _statement("balance", "Balance Sheet", ticker, freq, as_of_date)


def get_cashflow(ticker: str, freq: str = "quarterly", as_of_date: str | None = None) -> str:
    return _statement("cash", "Cash Flow", ticker, freq, as_of_date)


def get_income_statement(ticker: str, freq: str = "quarterly", as_of_date: str | None = None) -> str:
    return _statement("income", "Income Statement", ticker, freq, as_of_date)


def get_news(ticker: str, start_date: str, end_date: str) -> str:
    """Company news in the window (news_data). An empty feed is not an absence of news, so it is
    reported as this vendor being unavailable and the next one is asked."""
    errors = _errors()
    canonical = _canonical(ticker)
    obb = _obb()
    articles = _rows(_call("news.company",
                           lambda: obb.news.company(canonical, limit=NEWS_LIMIT, provider="yfinance"),
                           symbol=canonical, source="openbb-yfinance", empty_is="unavailable"))
    text = shaping.news_text(articles, ticker, start_date, end_date)
    if text is None:
        raise errors.VendorUnavailableError(
            f"OpenBB's Yahoo feed has no {canonical} article dated {start_date}..{end_date}; it serves recent items only")
    return text


def get_insider_transactions(ticker: str, as_of_date: str | None = None) -> str:
    """SEC Form 4 filings filed on or before the as-of date (news_data)."""
    canonical = _canonical(ticker)
    as_of = as_of_date or _today().isoformat()
    end = datetime.strptime(as_of, "%Y-%m-%d").date()
    start = end - timedelta(days=INSIDER_DAYS)
    obb = _obb()
    try:
        rows = _rows(_call("equity.ownership.insider_trading",
                           lambda: obb.equity.ownership.insider_trading(canonical, start_date=start, end_date=end,
                                                                        limit=INSIDER_LIMIT, provider="sec"),
                           symbol=canonical, source="sec"))
    except _errors().NoMarketDataError:
        rows = []
    return shaping.insider_csv(rows, canonical, as_of)


def get_macro_indicators(indicator: str, as_of_date: str, look_back_days: int | None = None) -> str:
    """A FRED series through OpenBB (macro_data, after TradingAgents' own FRED)."""
    from tradingagents.dataflows.vendors.fred import _resolve_series_id

    errors = _errors()
    if _is_historical(as_of_date):
        raise errors.VendorUnavailableError(
            "OpenBB's FRED route serves today's revision only; a past run needs FRED's own vintage")
    try:
        series_id = _resolve_series_id(indicator)
    except ValueError as exc:
        return f"FRED: {exc}"
    days = int(look_back_days) if look_back_days else MACRO_LOOKBACK_DAYS
    end = datetime.strptime(as_of_date, "%Y-%m-%d").date()
    start = (end - timedelta(days=days)).isoformat()
    obb = _obb()
    result = _call("economy.fred_series",
                   lambda: obb.economy.fred_series(series_id, start_date=start, end_date=end.isoformat(),
                                                   provider="fred"),
                   symbol=series_id, source="fred")
    rows = _rows(result)
    points = []
    for row in rows:
        day = shaping.parse_day(row.get("date"))
        if day is not None and day <= end:
            points.append((day.isoformat(), row.get(series_id, row.get("value"))))
    extra = getattr(result, "extra", None) or {}
    meta = (extra.get("results_metadata") or {}).get(series_id, {}) if isinstance(extra, dict) else {}
    return shaping.macro_text(series_id, points, meta, start, as_of_date)


VENDOR_FUNCTIONS: dict[str, Callable[..., str]] = {
    "get_stock_data": get_stock_data,
    "get_indicators": get_indicators,
    "get_fundamentals": get_fundamentals,
    "get_balance_sheet": get_balance_sheet,
    "get_cashflow": get_cashflow,
    "get_income_statement": get_income_statement,
    "get_news": get_news,
    "get_insider_transactions": get_insider_transactions,
    "get_macro_indicators": get_macro_indicators,
}
