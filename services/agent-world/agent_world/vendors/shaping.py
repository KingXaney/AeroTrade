"""Pure formatting for the OpenBB vendor: frames in, TradingAgents' own text formats out.

Each function mirrors what TradingAgents v0.7.1's Yahoo vendor returns for the same tool
(tradingagents/dataflows/vendors/yahoo/), so an analyst reads the same shapes whichever vendor in
the chain served it, and adds the point-in-time line where OpenBB's data needs one. Tested on
stored frames (tests/fixtures/frames.json); no network, no OpenBB import.
"""

from __future__ import annotations

import math
from collections.abc import Iterable, Mapping, Sequence
from datetime import UTC, date, datetime, timedelta
from typing import Any

import pandas as pd

# A latest bar this many calendar days before the requested date is stale (TradingAgents' rule).
MAX_OHLCV_STALE_DAYS = 10
# How long after a period ends its statement is taken to be public, when the vendor gives no
# filing date: a 10-Q is due 40-45 days after the quarter, a 10-K 60-90 days after the year.
FILING_LAG_DAYS = {"quarterly": 45, "annual": 90}
MACRO_MAX_ROWS = 40

# TradingAgents' indicator set and its descriptions, word for word
# (yahoo/market.py get_stock_stats_indicators_window), so the analyst reads the same notes.
INDICATORS: dict[str, str] = {
    "close_50_sma": (
        "50 SMA: A medium-term trend indicator. "
        "Usage: Identify trend direction and serve as dynamic support/resistance. "
        "Tips: It lags price; combine with faster indicators for timely signals."
    ),
    "close_200_sma": (
        "200 SMA: A long-term trend benchmark. "
        "Usage: Confirm overall market trend and identify golden/death cross setups. "
        "Tips: It reacts slowly; best for strategic trend confirmation rather than frequent trading entries."
    ),
    "close_10_ema": (
        "10 EMA: A responsive short-term average. "
        "Usage: Capture quick shifts in momentum and potential entry points. "
        "Tips: Prone to noise in choppy markets; use alongside longer averages for filtering false signals."
    ),
    "macd": (
        "MACD: Computes momentum via differences of EMAs. "
        "Usage: Look for crossovers and divergence as signals of trend changes. "
        "Tips: Confirm with other indicators in low-volatility or sideways markets."
    ),
    "macds": (
        "MACD Signal: An EMA smoothing of the MACD line. "
        "Usage: Use crossovers with the MACD line to trigger trades. "
        "Tips: Should be part of a broader strategy to avoid false positives."
    ),
    "macdh": (
        "MACD Histogram: Shows the gap between the MACD line and its signal. "
        "Usage: Visualize momentum strength and spot divergence early. "
        "Tips: Can be volatile; complement with additional filters in fast-moving markets."
    ),
    "rsi": (
        "RSI: Measures momentum to flag overbought/oversold conditions. "
        "Usage: Apply 70/30 thresholds and watch for divergence to signal reversals. "
        "Tips: In strong trends, RSI may remain extreme; always cross-check with trend analysis."
    ),
    "boll": (
        "Bollinger Middle: A 20 SMA serving as the basis for Bollinger Bands. "
        "Usage: Acts as a dynamic benchmark for price movement. "
        "Tips: Combine with the upper and lower bands to effectively spot breakouts or reversals."
    ),
    "boll_ub": (
        "Bollinger Upper Band: Typically 2 standard deviations above the middle line. "
        "Usage: Signals potential overbought conditions and breakout zones. "
        "Tips: Confirm signals with other tools; prices may ride the band in strong trends."
    ),
    "boll_lb": (
        "Bollinger Lower Band: Typically 2 standard deviations below the middle line. "
        "Usage: Indicates potential oversold conditions. "
        "Tips: Use additional analysis to avoid false reversal signals."
    ),
    "atr": (
        "ATR: Averages true range to measure volatility. "
        "Usage: Set stop-loss levels and adjust position sizes based on current market volatility. "
        "Tips: It's a reactive measure, so use it as part of a broader risk management strategy."
    ),
    "vwma": (
        "VWMA: A moving average weighted by volume. "
        "Usage: Confirm trends by integrating price action with volume data. "
        "Tips: Watch for skewed results from volume spikes; use in combination with other volume analyses."
    ),
    "mfi": (
        "MFI: The Money Flow Index is a momentum indicator that uses both price and volume to measure buying and selling pressure. "
        "Usage: Identify overbought (>80) or oversold (<20) conditions and confirm the strength of trends or reversals. "
        "Tips: Use alongside RSI or MACD to confirm signals; divergence between price and MFI can indicate potential reversals."
    ),
}
NOT_A_TRADING_DAY = "N/A: Not a trading day (weekend or holiday)"

PRICE_COLUMNS = ("Open", "High", "Low", "Close", "Volume")


# ---- shared ----

def price_text(value: float) -> str:
    """A price with six significant digits and at least two decimals (TradingAgents' rule)."""
    if not math.isfinite(value):
        return str(value)
    decimals = 2 if value == 0 else max(2, 5 - math.floor(math.log10(abs(value))))
    whole, _, fraction = f"{value:.{decimals}f}".partition(".")
    return f"{whole}.{fraction.rstrip('0').ljust(2, '0')}"


def parse_day(value: Any) -> date | None:
    """A calendar date from a date, datetime, Timestamp or ISO string (the local date kept)."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    try:
        stamp = pd.Timestamp(value)
    except (ValueError, TypeError):
        return None
    if pd.isna(stamp):
        return None
    return stamp.date()


def bars_frame(rows: Iterable[Mapping[str, Any]] | pd.DataFrame) -> pd.DataFrame:
    """OHLCV rows (any column case, date as a column or the index) as TradingAgents' frame:
    ``Date`` (naive midnight), ``Open High Low Close Volume`` numeric, sorted, closeless rows
    dropped."""
    frame = rows.copy() if isinstance(rows, pd.DataFrame) else pd.DataFrame(list(rows))
    if frame.index.name and str(frame.index.name).lower() in ("date", "datetime"):
        frame = frame.reset_index()
    rename = {}
    for column in frame.columns:
        lowered = str(column).lower()
        if lowered in ("date", "datetime", "index"):
            rename[column] = "Date"
        elif lowered in ("open", "high", "low", "close", "volume"):
            rename[column] = lowered.capitalize()
    frame = frame.rename(columns=rename)
    if "Date" not in frame.columns or "Close" not in frame.columns:
        return pd.DataFrame(columns=["Date", *PRICE_COLUMNS])
    days = frame["Date"].map(parse_day)
    frame = frame.assign(Date=pd.to_datetime(days))
    frame = frame.dropna(subset=["Date"])
    for column in PRICE_COLUMNS:
        if column not in frame.columns:
            frame[column] = float("nan")
        frame[column] = pd.to_numeric(frame[column], errors="coerce")
    frame = frame[["Date", *PRICE_COLUMNS]].sort_values("Date").drop_duplicates("Date", keep="last")
    return frame.dropna(subset=["Close"]).reset_index(drop=True)


def stale_detail(frame: pd.DataFrame, as_of: str, max_days: int = MAX_OHLCV_STALE_DAYS) -> str | None:
    """Why a frame is stale for ``as_of``, or None: its latest bar is more than ``max_days`` before."""
    if frame.empty:
        return None
    requested = parse_day(as_of)
    latest = parse_day(frame["Date"].max())
    if requested is None or latest is None:
        return None
    gap = (requested - latest).days
    if gap > max_days:
        return f"latest row is {latest}, {gap} days before the requested {requested} (stale) — refusing to use it"
    return None


# ---- get_stock_data ----

def stock_csv(frame: pd.DataFrame, symbol: str, start_date: str, end_date: str) -> str:
    """OHLCV between the dates as TradingAgents' get_YFin_data_online writes it."""
    start, end = parse_day(start_date), parse_day(end_date)
    window = frame[(frame["Date"].dt.date >= start) & (frame["Date"].dt.date <= end)]
    lines = ["Date,Open,High,Low,Close,Volume"]
    for row in window.itertuples(index=False):
        prices = [price_text(float(getattr(row, c))) if pd.notna(getattr(row, c)) else "" for c in ("Open", "High", "Low", "Close")]
        volume = "" if pd.isna(row.Volume) else str(int(row.Volume))
        lines.append(",".join([row.Date.strftime("%Y-%m-%d"), *prices, volume]))
    header = f"# Stock data for {symbol.upper()} from {start_date} to {end_date}\n"
    header += f"# Total records: {len(window)}\n\n"
    return header + "\n".join(lines) + "\n"


# ---- get_indicators ----

def unsupported_indicator(indicator: str) -> str:
    return f"Indicator {indicator} is not supported. Please choose from: {list(INDICATORS.keys())}"


def indicator_values(frame: pd.DataFrame, indicator: str) -> dict[str, str]:
    """The indicator for every bar, by date, computed with stockstats as TradingAgents does."""
    from stockstats import wrap

    data = frame.copy()
    data = data.dropna(subset=["Close"]).copy()
    data[list(PRICE_COLUMNS)] = data[list(PRICE_COLUMNS)].ffill().bfill()
    df = wrap(data)
    df["Date"] = df["Date"].dt.strftime("%Y-%m-%d")
    df[indicator]  # stockstats computes the column on first read
    values: dict[str, str] = {}
    for _, row in df.iterrows():
        value = row[indicator]
        values[row["Date"]] = "N/A" if pd.isna(value) else str(value)
    return values


def indicator_window(values: Mapping[str, str], indicator: str, as_of: str, look_back_days: int) -> str:
    """The indicator for each calendar day from ``as_of`` back ``look_back_days``."""
    end = datetime.strptime(as_of, "%Y-%m-%d")
    before = end - timedelta(days=int(look_back_days))
    lines = []
    current = end
    while current >= before:
        key = current.strftime("%Y-%m-%d")
        lines.append(f"{key}: {values.get(key, NOT_A_TRADING_DAY)}")
        current -= timedelta(days=1)
    return (
        f"## {indicator} values from {before.strftime('%Y-%m-%d')} to {as_of}:\n\n"
        + "\n".join(lines) + "\n"
        + "\n\n"
        + INDICATORS.get(indicator, "No description available.")
    )


# ---- get_fundamentals ----

def _money(value: Any, currency: str | None) -> Any:
    if value is None:
        return None
    return f"{value} {currency}" if currency else value


def _present(value: Any) -> bool:
    if value is None:
        return False
    try:
        return not (isinstance(value, float) and math.isnan(value))
    except TypeError:
        return True


def fundamentals_text(symbol: str, metrics: Mapping[str, Any], profile: Mapping[str, Any]) -> str | None:
    """OpenBB's key metrics and profile in TradingAgents' "# Company Fundamentals" shape; None if empty.

    OpenBB's yfinance provider passes Yahoo's ``dividendYield`` and ``debtToEquity`` through as
    Yahoo gives them, in percent (0.31 is 0.31%; 78.4 is 78.4%, a ratio of 0.78) while the margins
    and returns are fractions, so the two carry their unit as TradingAgents writes them.
    """
    currency = metrics.get("currency") or profile.get("currency")
    dividend_yield = metrics.get("dividend_yield")
    debt_to_equity = metrics.get("debt_to_equity")
    fields = [
        ("Name", profile.get("name")),
        ("Sector", profile.get("sector")),
        ("Industry", profile.get("industry_category")),
        ("Market Cap", _money(metrics.get("market_cap") or profile.get("market_cap"), currency)),
        ("PE Ratio (TTM)", metrics.get("pe_ratio")),
        ("Forward PE", metrics.get("forward_pe")),
        ("PEG Ratio", metrics.get("peg_ratio")),
        ("Price to Book", metrics.get("price_to_book")),
        ("EPS (TTM)", _money(metrics.get("eps_ttm"), currency)),
        ("Forward EPS", _money(metrics.get("eps_forward"), currency)),
        ("Dividend Yield", None if not _present(dividend_yield) else f"{dividend_yield}%"),
        ("Payout Ratio", metrics.get("payout_ratio")),
        ("Beta", metrics.get("beta") if _present(metrics.get("beta")) else profile.get("beta")),
        ("Revenue per Share", _money(metrics.get("revenue_per_share"), currency)),
        ("Revenue Growth (YoY)", metrics.get("revenue_growth")),
        ("Earnings Growth (YoY)", metrics.get("earnings_growth")),
        ("Gross Margin", metrics.get("gross_margin")),
        ("Operating Margin", metrics.get("operating_margin")),
        ("EBITDA Margin", metrics.get("ebitda_margin")),
        ("Profit Margin", metrics.get("profit_margin")),
        ("Return on Equity", metrics.get("return_on_equity")),
        ("Return on Assets", metrics.get("return_on_assets")),
        ("Debt to Equity", None if not _present(debt_to_equity)
         else f"{debt_to_equity}% ({float(debt_to_equity) / 100:.2f}x)"),
        ("Current Ratio", metrics.get("current_ratio")),
        ("Quick Ratio", metrics.get("quick_ratio")),
        ("Book Value", _money(metrics.get("book_value"), currency)),
        ("Enterprise Value", _money(metrics.get("enterprise_value"), currency)),
        ("EV to EBITDA", metrics.get("enterprise_to_ebitda")),
        ("EV to Revenue", metrics.get("enterprise_to_revenue")),
        ("Shares Outstanding", profile.get("shares_outstanding")),
        ("Price Return (1y)", metrics.get("price_return_1y")),
    ]
    lines = [f"{label}: {value}" for label, value in fields if _present(value)]
    if not lines:
        return None
    return f"# Company Fundamentals for {symbol.upper()}\n\n" + "\n".join(lines)


# ---- the three statements ----

def statement_cutoff(as_of: str, freq: str) -> tuple[date, int]:
    """(last period end that counts as filed by ``as_of``, the lag used)."""
    lag = FILING_LAG_DAYS["annual" if freq.lower() == "annual" else "quarterly"]
    return parse_day(as_of) - timedelta(days=lag), lag


def statement_csv(rows: Sequence[Mapping[str, Any]] | pd.DataFrame, symbol: str, freq: str, title: str,
                  as_of: str) -> str | None:
    """A statement's periods filed by ``as_of`` (period end + the filing lag), line items as rows
    and periods as columns like yfinance's frames; None when no period is old enough."""
    frame = rows.copy() if isinstance(rows, pd.DataFrame) else pd.DataFrame(list(rows))
    if frame.empty or "period_ending" not in frame.columns:
        return None
    cutoff, lag = statement_cutoff(as_of, freq)
    frame = frame.assign(_end=frame["period_ending"].map(parse_day)).dropna(subset=["_end"])
    frame = frame[frame["_end"] <= cutoff].sort_values("_end", ascending=False)
    if frame.empty:
        return None
    columns = [c for c in frame.columns if c not in ("period_ending", "_end", "fiscal_period", "fiscal_year", "symbol")]
    table = frame.set_index(frame["_end"].map(lambda d: d.isoformat()))[columns].T
    table = table.dropna(how="all")
    table.index = [str(i).replace("_", " ").title() for i in table.index]
    table.index.name = None
    header = (
        f"# {title} data for {symbol.upper()} ({freq})\n"
        f"# Periods ended on or before {cutoff.isoformat()}: taken as filed by {as_of} "
        f"(a {lag}-day filing lag; this vendor gives no filing date)\n"
    )
    return header + table.to_csv()


# ---- get_news ----

def _utc(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def in_window(published: datetime | None, start: datetime, end: datetime, now: datetime | None = None) -> bool:
    """TradingAgents' window rule: ``[start, end + 1 day)`` in UTC; undated only when the window
    reaches the present."""
    end_utc = _utc(end)
    if published is not None:
        return _utc(start) <= _utc(published) < end_utc + timedelta(days=1)
    return end_utc >= (now or datetime.now(UTC)) - timedelta(days=1)


def published_at(value: Any) -> datetime | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value
    try:
        stamp = pd.Timestamp(value)
    except (ValueError, TypeError):
        return None
    return None if pd.isna(stamp) else stamp.to_pydatetime()


def news_text(articles: Sequence[Mapping[str, Any]], ticker: str, start_date: str, end_date: str,
              now: datetime | None = None) -> str | None:
    """Articles published in the window, in TradingAgents' news format; None when none are."""
    start = datetime.strptime(start_date, "%Y-%m-%d")
    end = datetime.strptime(end_date, "%Y-%m-%d")
    chosen = [a for a in articles if in_window(published_at(a.get("date")), start, end, now)]
    if not chosen:
        return None
    out = ""
    for article in chosen:
        out += f"### {article.get('title') or 'No title'} (source: {article.get('source') or 'Unknown'})\n"
        summary = article.get("summary") or article.get("text") or ""
        if summary:
            out += f"{summary}\n"
        if article.get("url"):
            out += f"Link: {article['url']}\n"
        out += "\n"
    return f"## {ticker} News, from {start_date} to {end_date}:\n\n{out}"


# ---- get_insider_transactions ----

INSIDER_COLUMNS = ("filing_date", "transaction_date", "owner_name", "owner_title", "transaction_type",
                   "acquisition_or_disposition", "securities_transacted", "transaction_price",
                   "securities_owned", "form")


def insider_csv(rows: Sequence[Mapping[str, Any]] | pd.DataFrame, symbol: str, as_of: str) -> str:
    """Form 4 rows filed on or before ``as_of``, newest first, in TradingAgents' insider shape."""
    frame = rows.copy() if isinstance(rows, pd.DataFrame) else pd.DataFrame(list(rows))
    cutoff = parse_day(as_of)
    if not frame.empty and "filing_date" in frame.columns:
        frame = frame.assign(_filed=frame["filing_date"].map(parse_day)).dropna(subset=["_filed"])
        frame = frame[frame["_filed"] <= cutoff].sort_values("_filed", ascending=False)
    else:
        frame = pd.DataFrame()
    if frame.empty:
        return f"No insider transactions filed for symbol '{symbol.upper()}' on or before {as_of}"
    columns = [c for c in INSIDER_COLUMNS if c in frame.columns]
    table = frame[columns].copy()
    for column in ("filing_date", "transaction_date"):
        if column in table.columns:
            table[column] = table[column].map(lambda v: (parse_day(v) or v))
    header = (f"# Insider Transactions data for {symbol.upper()}\n"
              f"# SEC Form 4 filings filed on or before {as_of}\n")
    return header + table.to_csv(index=False)


# ---- get_macro_indicators ----

def macro_text(series_id: str, points: Sequence[tuple[str, Any]], meta: Mapping[str, Any], start_date: str,
               as_of: str) -> str:
    """A FRED series in TradingAgents' macro report shape, marked as today's revision."""
    title = meta.get("title") or series_id
    units = meta.get("units") or ""
    frequency = meta.get("frequency") or ""
    seasonal = meta.get("seasonal_adjustment") or ""
    header = (
        f"## FRED: {title} ({series_id})\n"
        f"- Units: {units}\n"
        f"- Frequency: {frequency}{f' ({seasonal})' if seasonal else ''}\n"
        f"- Window: {start_date} to {as_of}\n"
        f"- Vintage: values as revised today (served through OpenBB, which does not pin the vintage)\n"
    )
    clean = [(d, v) for d, v in points if v is not None and not (isinstance(v, float) and math.isnan(v))]
    if not clean:
        return header + f"\nNo observations for {series_id} in this window."
    first_date, first_val = clean[0]
    last_date, last_val = clean[-1]
    try:
        delta = float(last_val) - float(first_val)
        base = float(first_val)
        pct = f" ({delta / base * 100:+.2f}%)" if base != 0 else ""
        summary = (f"\n**Latest:** {last_val} ({last_date}) | **Change from {first_date} to {last_date}:** "
                   f"{delta:+.2f}{pct}, from {first_val}\n")
    except (TypeError, ValueError):
        summary = f"\n**Latest:** {last_val} ({last_date})\n"
    shown, note = clean, ""
    if len(clean) > MACRO_MAX_ROWS:
        shown = clean[-MACRO_MAX_ROWS:]
        note = f"\n_(showing the most recent {MACRO_MAX_ROWS} of {len(clean)} observations)_\n"
    table = "\n| Date | Value |\n| --- | --- |\n" + "\n".join(f"| {d} | {v} |" for d, v in shown) + "\n"
    return header + summary + note + table
