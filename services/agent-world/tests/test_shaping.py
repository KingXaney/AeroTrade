import json
from datetime import UTC, datetime
from pathlib import Path

import pandas as pd
import pytest

from agent_world.vendors import shaping

FRAMES = json.loads((Path(__file__).parent / "fixtures" / "frames.json").read_text(encoding="utf-8"))
AS_OF = "2026-10-23"


@pytest.fixture(scope="module")
def bars() -> pd.DataFrame:
    return shaping.bars_frame(FRAMES["bars"])


def test_price_text_matches_tradingagents():
    from tradingagents.dataflows.vendors.yahoo.common import price_text

    for value in (347.730011, 0.0, 0.000123456, 12.5, 1234567.891, -3.2, 99.999999):
        assert shaping.price_text(value) == price_text(value)


def test_bars_frame_normalizes_any_shape(bars):
    assert list(bars.columns) == ["Date", "Open", "High", "Low", "Close", "Volume"]
    assert bars["Date"].is_monotonic_increasing
    assert bars["Date"].iloc[-1] == pd.Timestamp(AS_OF)
    shuffled = pd.DataFrame(FRAMES["bars"][::-1]).set_index("date")
    shuffled.index.name = "date"
    again = shaping.bars_frame(shuffled)
    assert again["Close"].tolist() == bars["Close"].tolist()
    assert shaping.bars_frame([{"when": "2026-01-01"}]).empty


def test_stock_csv_mirrors_the_yahoo_vendor(bars):
    text = shaping.stock_csv(bars, "AAPL", "2026-10-19", "2026-10-25")
    lines = text.splitlines()
    assert lines[0] == "# Stock data for AAPL from 2026-10-19 to 2026-10-25"
    assert lines[1] == "# Total records: 5"
    assert lines[3] == "Date,Open,High,Low,Close,Volume"
    assert lines[4].startswith("2026-10-19,") and lines[-1].startswith("2026-10-23,")
    row = bars[bars["Date"] == pd.Timestamp("2026-10-23")].iloc[0]
    assert lines[-1] == ",".join(["2026-10-23", *(shaping.price_text(row[c]) for c in ("Open", "High", "Low", "Close")),
                                  str(int(row["Volume"]))])


def test_stale_frames_are_named(bars):
    assert shaping.stale_detail(bars, AS_OF) is None
    assert shaping.stale_detail(bars, "2026-11-01") is None  # 9 days: a long weekend, not stale
    detail = shaping.stale_detail(bars, "2026-11-10")
    assert detail and "stale" in detail and "2026-10-23" in detail


@pytest.mark.parametrize("indicator", ["rsi", "close_50_sma", "close_200_sma", "macd", "boll_ub", "atr", "vwma", "mfi"])
def test_indicators_match_tradingagents_on_the_same_bars(monkeypatch, bars, indicator):
    """Same bars in, the same text out as TradingAgents' own stockstats path."""
    from tradingagents.dataflows.vendors.yahoo import market

    monkeypatch.setattr(market, "load_ohlcv", lambda symbol, as_of, fill_gaps=True: bars.copy())
    theirs = market.get_stock_stats_indicators_window("AAPL", indicator, AS_OF, 30)
    ours = shaping.indicator_window(shaping.indicator_values(bars, indicator), indicator, AS_OF, 30)
    assert ours == theirs


def test_unsupported_indicator_reads_as_tradingagents_says_it():
    from tradingagents.dataflows.vendors.yahoo import market

    with pytest.raises(ValueError) as theirs:
        market.get_stock_stats_indicators_window("AAPL", "stochrsi", AS_OF, 30)
    assert shaping.unsupported_indicator("stochrsi") == str(theirs.value)


def test_fundamentals_text():
    text = shaping.fundamentals_text("AAPL", FRAMES["metrics"][0], FRAMES["profile"][0])
    assert text.startswith("# Company Fundamentals for AAPL\n\n")
    assert "Name: Apple Inc." in text and "Sector: Technology" in text and "Industry: Consumer Electronics" in text
    metrics = FRAMES["metrics"][0]
    assert f"Dividend Yield: {metrics['dividend_yield']}%" in text
    d2e = metrics["debt_to_equity"]
    assert f"Debt to Equity: {d2e}% ({d2e / 100:.2f}x)" in text
    assert shaping.fundamentals_text("AAPL", {}, {}) is None


def test_statements_count_only_periods_past_the_filing_lag():
    rows = FRAMES["balance_quarterly"]
    ends = sorted(r["period_ending"] for r in rows)
    # The newest quarter ends 2026-06-30: public from 2026-08-14 under the 45-day lag.
    before = shaping.statement_csv(rows, "AAPL", "quarterly", "Balance Sheet", "2026-08-13")
    after = shaping.statement_csv(rows, "AAPL", "quarterly", "Balance Sheet", "2026-08-14")
    assert ends[-1] == "2026-06-30"
    assert "2026-06-30" not in before.splitlines()[2]
    assert "2026-06-30" in after.splitlines()[2]
    assert after.splitlines()[0] == "# Balance Sheet data for AAPL (quarterly)"
    assert "45-day filing lag" in after.splitlines()[1]
    assert "Total Assets" in after
    assert shaping.statement_csv(rows, "AAPL", "quarterly", "Balance Sheet", "2025-01-01") is None


def test_annual_statement_lag():
    rows = FRAMES["income_annual"]
    newest = max(r["period_ending"] for r in rows)
    text = shaping.statement_csv(rows, "AAPL", "annual", "Income Statement", "2025-12-01")
    assert newest == "2025-09-30" and newest not in text.splitlines()[2]
    assert "90-day filing lag" in text
    assert newest in shaping.statement_csv(rows, "AAPL", "annual", "Income Statement", "2025-12-29").splitlines()[2]


def test_news_is_windowed():
    now = datetime(2026, 10, 27, tzinfo=UTC)
    text = shaping.news_text(FRAMES["news"], "AAPL", "2026-10-19", "2026-10-26", now=now)
    assert text.startswith("## AAPL News, from 2026-10-19 to 2026-10-26:\n\n")
    assert "### Apple suppliers report steady iPhone 18 builds (source: Reuters)" in text
    assert "Link: https://example.com/news/1" in text
    assert "Mumbai" not in text
    assert shaping.news_text(FRAMES["news"], "AAPL", "2026-08-01", "2026-08-31", now=now) is None


def test_undated_news_only_counts_for_a_window_that_reaches_today():
    undated = [{"title": "Undated item", "source": "Wire", "url": "https://example.com/x", "date": None}]
    now = datetime(2026, 10, 27, tzinfo=UTC)
    assert shaping.news_text(undated, "AAPL", "2026-10-20", "2026-10-27", now=now) is not None
    assert shaping.news_text(undated, "AAPL", "2026-09-01", "2026-09-08", now=now) is None


def test_insider_rows_are_cut_on_filing_date():
    rows = FRAMES["insider"]
    text = shaping.insider_csv(rows, "AAPL", "2026-10-20")
    assert text.startswith("# Insider Transactions data for AAPL\n# SEC Form 4 filings filed on or before 2026-10-20\n")
    assert "2026-10-22" not in text  # filed after the as-of date
    assert "2026-10-19" in text
    assert shaping.insider_csv(rows, "AAPL", "2026-01-01").startswith("No insider transactions filed for symbol 'AAPL'")


def test_macro_text():
    fred = FRAMES["fred"]
    points = [(r["date"], r[fred["series_id"]]) for r in fred["rows"]]
    text = shaping.macro_text(fred["series_id"], points, fred["meta"], "2025-10-23", AS_OF)
    assert text.startswith("## FRED: Market Yield on U.S. Treasury Securities at 10-Year Constant Maturity (DGS10)\n")
    assert "- Frequency: Daily (Not Seasonally Adjusted)" in text
    assert "values as revised today" in text
    assert "**Latest:** 4.01 (2026-10-23)" in text
    assert "| 2026-10-21 |" not in text  # a missing observation is skipped
    assert "No observations" in shaping.macro_text("DGS10", [], {}, "2025-10-23", AS_OF)
