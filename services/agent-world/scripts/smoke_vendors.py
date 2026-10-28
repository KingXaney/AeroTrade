"""Live smoke check of the OpenBB vendor: every function for one symbol, then the full chain.

    uv run python scripts/smoke_vendors.py [SYMBOL] [--as-of YYYY-MM-DD]

Uses public market data only (Yahoo through OpenBB, SEC EDGAR). It never reads a key: FRED_API_KEY
is removed from this process, so the macro tool shows how the chain behaves without one. For each
method it prints what the OpenBB vendor itself returned (or raised), then what TradingAgents'
router returned walking the configured chain, with the recorder's attempts — where the chain
fell through to the next vendor, and why. Data goes under the service's .data/ directory.
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from datetime import date, timedelta

os.environ["AGENT_WORLD_NO_DOTENV"] = "1"
os.environ.pop("FRED_API_KEY", None)

from agent_world import bootstrap  # noqa: E402
from agent_world.config import Settings  # noqa: E402

CALLS = {
    "get_stock_data": lambda s, d: (s, (date.fromisoformat(d) - timedelta(days=30)).isoformat(), d),
    "get_indicators": lambda s, d: (s, "rsi", d, 10),
    "get_fundamentals": lambda s, d: (s, d),
    "get_balance_sheet": lambda s, d: (s, "quarterly", d),
    "get_cashflow": lambda s, d: (s, "quarterly", d),
    "get_income_statement": lambda s, d: (s, "annual", d),
    "get_news": lambda s, d: (s, (date.fromisoformat(d) - timedelta(days=7)).isoformat(), d),
    "get_insider_transactions": lambda s, d: (s, d),
    "get_macro_indicators": lambda s, d: ("10y_treasury", d, 30),
}


def recent_weekday(days_back: int = 3) -> str:
    day = date.today() - timedelta(days=days_back)
    while day.weekday() >= 5:
        day -= timedelta(days=1)
    return day.isoformat()


def head(text: str, lines: int = 4, width: int = 140) -> str:
    rows = [row[:width] for row in str(text).splitlines() if row.strip()][:lines]
    return "\n      ".join(rows)


def main() -> int:
    parser = argparse.ArgumentParser(description="Smoke-test the OpenBB vendor with live data.")
    parser.add_argument("symbol", nargs="?", default="AAPL")
    parser.add_argument("--as-of", default=recent_weekday())
    args = parser.parse_args()

    settings = Settings.from_env({"AGENT_WORLD_SECRET": "smoke-test-only-secret", "AEROTRADE_URL": "http://localhost:3000",
                                  **{k: v for k, v in os.environ.items() if k in ("AGENT_WORLD_DATA_DIR", "SEC_EDGAR_USER_AGENT")}})
    bootstrap.prepare(settings)

    from tradingagents.dataflows import router
    from tradingagents.dataflows.config import run_config

    from agent_world.vendors import register_openbb
    from agent_world.vendors.openbb_vendor import VENDOR_FUNCTIONS
    from agent_world.vendors.recorder import CURRENT_CALL, SINK, Sink

    register_openbb(None)
    symbol, as_of = args.symbol.upper(), args.as_of
    today = date.today().isoformat()
    print(f"OpenBB vendor smoke for {symbol}, as of {as_of} (today {today}); data under {settings.data_dir}\n")

    plans = [(method, CALLS[method](symbol, as_of)) for method in VENDOR_FUNCTIONS]
    # The profile and FRED through OpenBB serve only a run dated today; show that case too.
    plans.insert(3, ("get_fundamentals", CALLS["get_fundamentals"](symbol, today)))
    plans.append(("get_macro_indicators", CALLS["get_macro_indicators"](symbol, today)))

    for method, call_args in plans:
        print(f"== {method}{call_args}")
        started = time.perf_counter()
        try:
            out = VENDOR_FUNCTIONS[method](*call_args)
            print(f"   openbb ok in {time.perf_counter() - started:.1f}s:\n      {head(out)}")
        except Exception as exc:
            print(f"   openbb raised {type(exc).__name__} in {time.perf_counter() - started:.1f}s: {str(exc)[:200]}")
        sink = Sink()
        sink_token, call_token = SINK.set(sink), CURRENT_CALL.set("smoke")
        try:
            with run_config(settings.ta_config()):
                routed = router.route_to_vendor(method, *call_args)
            outcome = head(routed, lines=2)
        except Exception as exc:
            outcome = f"raised {type(exc).__name__}: {str(exc)[:160]}"
        finally:
            SINK.reset(sink_token)
            CURRENT_CALL.reset(call_token)
        attempts = " -> ".join(f"{r['vendor']}:{'ok' if r['ok'] else 'failed'}({r['ms']}ms)" for r in sink.attempts_for("smoke"))
        print(f"   chain: {attempts or '(no vendor call)'}")
        print(f"   router returned: {outcome}")
        for note in sink.drain_limits():
            print(f"   limit note: {note.provider} {note.status} {note.message[:120]}")
        print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
