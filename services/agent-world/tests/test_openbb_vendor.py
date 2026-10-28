"""The OpenBB vendor functions over a stand-in ``obb`` serving the stored frames (no network)."""

import json
import time
from datetime import date
from pathlib import Path
from types import SimpleNamespace

import pytest

from agent_world.vendors import openbb_vendor, shaping

FRAMES = json.loads((Path(__file__).parent / "fixtures" / "frames.json").read_text(encoding="utf-8"))
AS_OF = "2026-10-23"
TODAY = date.today().isoformat()


class EmptyDataError(Exception):
    """Named as OpenBB's own, which the vendor recognises by name."""


def result(rows, extra=None):
    return SimpleNamespace(results=[SimpleNamespace(model_dump=lambda r=r: dict(r)) for r in rows], extra=extra or {})


class FakeObb:
    def __init__(self):
        self.calls = []
        self.fail = {}
        test = self

        def route(name, rows_for):
            def call(*args, **kwargs):
                test.calls.append((name, args, kwargs))
                if name in test.fail:
                    raise test.fail[name]
                return rows_for(*args, **kwargs)
            return call

        def bars(symbol, start_date, end_date, **kw):
            rows = [r for r in FRAMES["bars"] if start_date <= r["date"][:10] <= end_date]
            if not rows:
                raise EmptyDataError("No data found")
            return result(rows)

        self.equity = SimpleNamespace(
            price=SimpleNamespace(historical=route("historical", bars)),
            profile=route("profile", lambda s, **kw: result(FRAMES["profile"])),
            fundamental=SimpleNamespace(
                metrics=route("metrics", lambda s, **kw: result(FRAMES["metrics"])),
                balance=route("balance", lambda s, **kw: result(FRAMES["balance_quarterly"])),
                cash=route("cash", lambda s, **kw: result(FRAMES["balance_quarterly"])),
                income=route("income", lambda s, **kw: result(FRAMES["income_annual"])),
            ),
            ownership=SimpleNamespace(insider_trading=route("insider", lambda s, **kw: result(FRAMES["insider"]))),
        )
        self.news = SimpleNamespace(company=route("news", lambda s, **kw: result(FRAMES["news"])))
        fred = FRAMES["fred"]
        self.economy = SimpleNamespace(fred_series=route(
            "fred", lambda s, **kw: result(fred["rows"], {"results_metadata": {fred["series_id"]: fred["meta"]}})))


@pytest.fixture
def obb(monkeypatch):
    fake = FakeObb()
    monkeypatch.setattr(openbb_vendor, "_obb", lambda: fake)
    openbb_vendor._bar_cache.clear()
    return fake


def errors():
    from tradingagents.dataflows import errors as ta_errors

    return ta_errors


def test_stock_data(obb):
    text = openbb_vendor.get_stock_data("AAPL", "2026-10-19", AS_OF)
    assert text.startswith("# Stock data for AAPL from 2026-10-19 to 2026-10-23\n# Total records: 5\n")
    name, args, kwargs = obb.calls[0]
    assert kwargs["provider"] == "yfinance" and kwargs["adjustment"] == "splits_and_dividends"
    with pytest.raises(errors().NoMarketDataError):
        openbb_vendor.get_stock_data("AAPL", "2026-11-20", "2026-11-25")  # no rows


def test_stale_bars_fall_through(obb):
    with pytest.raises(errors().NoMarketDataError) as caught:
        openbb_vendor.get_stock_data("AAPL", "2026-10-01", "2026-11-10")
    assert "stale" in str(caught.value)


def test_indicators_reuse_one_history(obb):
    rsi = openbb_vendor.get_indicators("AAPL", "rsi", AS_OF, 10)
    macd = openbb_vendor.get_indicators("AAPL", "macd", AS_OF, 10)
    assert rsi.startswith("## rsi values from 2026-10-13 to 2026-10-23:") and macd.startswith("## macd values")
    assert [c[0] for c in obb.calls] == ["historical"]  # fetched once, kept for the next indicator
    bars = shaping.bars_frame(FRAMES["bars"])
    assert rsi == shaping.indicator_window(shaping.indicator_values(bars, "rsi"), "rsi", AS_OF, 10)
    with pytest.raises(ValueError, match="not supported"):
        openbb_vendor.get_indicators("AAPL", "stochrsi", AS_OF, 10)


def test_fundamentals_only_for_today(obb):
    withheld = openbb_vendor.get_fundamentals("AAPL", AS_OF)
    assert "withheld" in withheld and obb.calls == []
    served = openbb_vendor.get_fundamentals("AAPL", TODAY)
    assert served.startswith("# Company Fundamentals for AAPL") and "Name: Apple Inc." in served


def test_statements_apply_the_filing_lag(obb):
    text = openbb_vendor.get_balance_sheet("AAPL", "quarterly", "2026-08-13")
    assert "2026-06-30" not in text.splitlines()[2]
    assert obb.calls[-1][2] == {"period": "quarter", "limit": 5, "provider": "yfinance"}
    annual = openbb_vendor.get_income_statement("AAPL", "annual", AS_OF)
    assert "2025-09-30" in annual.splitlines()[2] and obb.calls[-1][2]["period"] == "annual"
    with pytest.raises(errors().NoMarketDataError):
        openbb_vendor.get_cashflow("AAPL", "quarterly", "2025-01-01")


def test_news_window_and_empty_feed(obb, monkeypatch):
    text = openbb_vendor.get_news("AAPL", "2026-10-19", "2026-10-26")
    assert "Apple suppliers report steady iPhone 18 builds" in text and "Mumbai" not in text
    with pytest.raises(errors().VendorUnavailableError):
        openbb_vendor.get_news("AAPL", "2026-01-01", "2026-01-08")
    obb.fail["news"] = EmptyDataError("No data was returned for the given symbol(s)")
    with pytest.raises(errors().VendorUnavailableError, match="returned nothing"):
        openbb_vendor.get_news("AAPL", "2026-10-19", "2026-10-26")


def test_insider_cut_on_filing_date(obb):
    text = openbb_vendor.get_insider_transactions("AAPL", "2026-10-20")
    assert "2026-10-22" not in text and "2026-10-19" in text
    kwargs = obb.calls[-1][2]
    assert kwargs["provider"] == "sec" and str(kwargs["end_date"]) == "2026-10-20"
    obb.fail["insider"] = EmptyDataError("nothing")
    assert openbb_vendor.get_insider_transactions("AAPL", "2026-10-20").startswith("No insider transactions filed")


def test_macro_serves_today_only(obb):
    with pytest.raises(errors().VendorUnavailableError, match="today's revision"):
        openbb_vendor.get_macro_indicators("10y_treasury", AS_OF, 30)
    text = openbb_vendor.get_macro_indicators("10y_treasury", TODAY, 3650)
    assert text.startswith("## FRED: Market Yield") and obb.calls[-1][1] == ("DGS10",)
    assert openbb_vendor.get_macro_indicators("bank of japan rate", TODAY).startswith("FRED: ")
    obb.fail["fred"] = RuntimeError("[Error] -> Missing credential 'fred_api_key'.")
    with pytest.raises(errors().VendorNotConfiguredError):
        openbb_vendor.get_macro_indicators("cpi", TODAY)


def test_rate_limits_and_failures_become_router_errors(obb):
    obb.fail["historical"] = RuntimeError("YFRateLimitError: Too Many Requests. Rate limited. Try after a while.")
    with pytest.raises(errors().VendorUnavailableError, match=r"rate limited \(429\)"):
        openbb_vendor.get_stock_data("AAPL", "2026-10-19", AS_OF)
    obb.fail["historical"] = KeyError("close")
    with pytest.raises(errors().VendorUnavailableError, match="failed"):
        openbb_vendor.get_stock_data("AAPL", "2026-10-19", AS_OF)


def test_a_slow_call_is_cut_at_the_budget(obb, monkeypatch):
    monkeypatch.setattr(openbb_vendor, "BUDGET_S", 0.2)
    obb.equity.profile = lambda s, **kw: time.sleep(1) or result(FRAMES["profile"])
    obb.equity.fundamental.metrics = lambda s, **kw: time.sleep(1) or result(FRAMES["metrics"])
    started = time.monotonic()
    with pytest.raises(errors().VendorUnavailableError, match="longer than"):
        openbb_vendor.get_fundamentals("AAPL", TODAY)
    assert time.monotonic() - started < 0.9
