# Brokerage income: interest on cash, real dividends, a total-return benchmark

**Status:** Implemented — merged to `main` in `e1ac613` (PR #23, 2026-09-28).

## Why

Investigating why the AI Navigator lagged the market found four causes; one was idle cash.
The Navigator sits about 80% invested, and paper cash earned nothing. Real brokers pay interest
on swept cash (the request cited Moomoo), so paper accounts should too.

Paying interest on cash alone would have been dishonest in a way that matters. Every account
earned **price return only**: holdings paid no dividends, and the SPY benchmark recorded SPY's
price. Interest on cash with nothing else subsidises holding cash against both the holdings and
the benchmark. So all three ship together, for every account — users', the AI Navigator's, and
the eight quant strategy accounts, whose backtests replay the same income — applied
retroactively from each account's inception.

## What

| | |
|---|---|
| Interest | Daily, on end-of-day cash, at the 13-week T-bill rate (`^IRX`) converted from a discount yield to bond-equivalent, minus `CASH_YIELD_SPREAD` 0.25 pt — 3.92% APY at today's 4.07% |
| Dividends | Real amounts, on the shares held at the close before the ex-date, paid `DIVIDEND_PAY_LAG_DAYS` (5) after it |
| Benchmark | SPY total return, dividends reinvested on the same timetable accounts are paid |
| When | Nightly at 00:05 ET, every day, through yesterday; a never-credited account replays from inception |
| Where it shows | "earning X% APY" under Buying Power, the income split under Total Return, an Income tile, an Income panel, chat |

Expectation, measured: for the Navigator ≈ +0.8 pts a year. It is realism, not the fix for its
underperformance.

## Data, without new requests

**Rate.** `^IRX` through the existing Yahoo client and `ensureBars`: 1,255 daily points over five
years, no nulls.

**Dividends from `adjclose`.** Yahoo builds adjclose by discounting earlier prices at each
ex-date, so `dividend[t] = close[t−1] × (1 − (adj[t−1]/close[t−1]) / (adj[t]/close[t]))`.
Validated against Yahoo's own feed: 278 dividends across twelve symbols, none missed, none
spurious. The chart's `events` param is still not used (it drew a 429).

- Valid only **inside one payload** — Yahoo rebases every historical adjclose on each
  distribution — so it runs at parse time and the amount is stored on the bar.
- A bar the payload cannot vouch for (its first, or a missing adjclose) stays **unknown**, never
  0, so it can never erase a stored value.
- The noise floor is **measured**: adjclose noise peaks at 8.8e-7 of price, the smallest real
  dividend is 4.7e-5 (NVDA). `DIVIDEND_NOISE_FLOOR = 1e-5` clears both by an order of magnitude.
- `PriceSeriesMeta` records the one unbroken date range a symbol's dividends can be trusted for.
  A gap between fetches is never bridged.

## The one convention (`lib/income/accrual.ts`)

For each calendar day *d*: **open(d)** fixes ex-date-*d* dividends on the holdings at the end of
*d−1*; *d*'s trades apply; **close(d)** accrues interest on the end-of-day cash and pays any
dividend dated *d*. Rows dated *d* become cash at the start of *d+1*, so a snapshot or decision
on day *s* contains every row dated before *s*. The nightly job, the back-credit and the strategy
simulator all step this one clock; nothing else implements it.

## Crediting without transactions (`lib/income/store.ts`)

1. **Reconcile first.** Starting balance + every trade + every credit must equal the account's
   cash and positions. One that does not is skipped and named in the job summary — interest is
   never compounded onto a history that is wrong.
2. **Readiness.** Income advances only as far as the data supports: a T-bill rate for every day
   (≤ 7 days stale), dividend coverage for every held symbol. **Missing data delays income; it
   never becomes a permanent zero.** A symbol Yahoo has failed to serve for 30 days is released.
3. **Writes, each idempotent:**
   - rows upserted with `$setOnInsert` (a retry keeps the first amount);
   - one update credits the **stored** rows and moves `incomeThrough`, guarded on the watermark
     and `inceptionAt` (a retry, a concurrent run or a reset mid-run cannot credit twice);
   - each snapshot is topped up to "every row before my date", guarded by its own
     `incomeThrough`; the 16:10 snapshot job records which income its cash already contains.

Exercised against a real Mongo: a rerun changes nothing; two concurrent runs credit exactly once;
a stored row from a "crashed" run is what gets credited; a rate outage holds the watermark; a
reset starts clean. Income lives in `AccountIncome`, never `PaperTrade` (trade count, win rate,
realized P&L, the CSV and a strategy's first-run check all read trades).

## Strategies

The simulator walks the same clock inside its trading loop, in the same order — open(d),
fills, close(d) — every calendar day, weekends and skipped days included. A parity test runs the
**live** replay over the simulator's own fills: identical rows, including a buy on an ex-date
(not paid) and a quarterly 60/40 rebalance that sells SPY on its own ex-date (still paid).

On real data, buy-and-hold SPY over the three-year backtest window: SPY total return +82.80%, new
rules +80.22%, old price-only rules +74.70%. The remaining 2.6 points is real — dividends arrive
as cash rather than reinvested, plus the 1% cash floor — and the caveat says so.

`ENGINE_VERSION` 3 rebuilds every backtest, **gated on data**: a saved rebuild is stamped and
never redone, so it waits until every universe symbol's dividends and the rate cover the window.
A pending rebuild refetches deep history only for symbols lacking coverage.

## Benchmark

`lib/prices/total-return.ts` chains `close × F`, with `F` moving only when a dividend is
reinvested — exactly the closes when nothing is paid. Every "vs SPY" reads it (the `/portfolio`
chart, the widget, the strategy pages, the leaderboard), with a live leg from SPY's quote so
today's account is never compared with yesterday's SPY. `BenchmarkSnapshot` is still written;
it is read only on a cold start before any SPY bar exists.

## Verification

- Unit: dividend inference and coverage, the field round trip, the rate conversion, the clock
  (entitlement both ways, compounding equivalence, stored-history replay), reconciliation,
  readiness, the index, the run summary, and the parity test. 845 tests.
- `scripts/qa/qa-income.mjs`: the real job through the Inngest dev server, scoped to its own
  account — back-credit from inception, a second run changes nothing, snapshots shifted once, the
  page, trade count and CSV unchanged, reset clears everything. All ten browser suites pass.

## Rollout

Deploy. The first 00:05 ET run fetches price history (chunked) and back-credits every account
whose data is ready; the rest follow as coverage fills in. The next strategies run sees engine
version 3 and rebuilds backtests once coverage is complete. No manual trigger is needed. The
Brain status strip shows "Interest & dividends" with credited and skipped accounts.

## Notes and out of scope

- **Friends leaderboard:** an untouched account now earns ~3.9% a year, a floor above any flat or
  losing strategy — what a real brokerage does too, but it changes the ranking.
- **Splits** are not handled for paper positions (pre-existing); a dividend on a position held
  across a split would be mis-scaled.
- `getQuote` without a Finnhub key now returns an empty quote without a request: every such
  request was a guaranteed 401 whose error log opened Next's dev overlay.
- Out of scope: margin interest, withholding tax, DRIP, promotional rate tiers.
