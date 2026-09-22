# Quant strategies

**Status:** implemented on `feat/quant-strategies` (2026-09-21).

## Why

The app could paper-trade many accounts, snapshot them daily and compare them with SPY, and the
AI Navigator showed a scheduled job can trade an account through the same fill path users use.
What it could not do was show how the textbook quantitative strategies are doing *right now*,
or teach what they are. The Strategies tab does both: a leaderboard of eight classic rules
paper-traded live on the same terms as a user's own accounts, and a page per rule that explains
it, shows what it is watching, its holdings, and every fill with the rule's own reason.

## What

| | |
|---|---|
| Strategies | Buy & Hold SPY · 60/40 Quarterly · Golden Cross Sectors · Dual Momentum (GEM) · 12-1 Momentum Top 8 · RSI-2 Mean Reversion · Donchian 55/20 Breakout · Low Volatility Top 10 — fixed in code, versioned |
| Ownership | One system-owned `PaperAccount` per strategy under the sentinel `userId` `system:strategies`, $100,000 each, opened by the job's first run. Everyone sees the same leaderboard; users can *follow* a strategy to pin it in the Quant Strategies dashboard widget |
| Universe | SPY, QQQ, IWM, EFA, TLT, AGG, BIL, GLD · the eleven sector ETFs · forty large caps (59 symbols), listed in `lib/strategies/universe.ts` |
| Live record | Ranked by return since launch; SPY over the same days from the daily benchmark snapshots; drawdown and win rate from the account's own snapshots and fills |
| Simulated record | The same rule run over three years of stored daily bars ending the day before launch, next-open fills; stored apart and never blended with live numbers |
| Timing | Decided every trading morning from the previous close; filled at ~09:35 ET through `executeOrder` (live Finnhub quote); valued at 16:10 ET by the existing snapshot job |
| No AI | Every number and every sentence is deterministic code or catalog copy |

## Rules

All long-only, whole shares, weights × 0.99 (a 1 % cash floor), sized from the previous close ×
1.01, one drift band of 2 % of equity for held positions; entries and exits are unconditional.
Exact rules and reasons live in `lib/strategies/rules/*`; the catalog table in the plan is
reproduced here:

| slug | cadence | universe | rule |
|---|---|---|---|
| `buy-and-hold-spy` | once | SPY | buys SPY at 0.99 on the first run; never trades again |
| `sixty-forty` | quarterly | SPY, AGG | 0.594 / 0.396; each leg re-targeted on the first fresh run of Jan/Apr/Jul/Oct when its drift exceeds the band |
| `golden-cross` | daily | 11 sector ETFs | hold an ETF (1/11 slot) while SMA50 > SMA200 strictly, sell it all when not |
| `dual-momentum` | monthly | SPY, EFA, AGG, BIL | if SPY's 12-month **total** return > BIL's, hold the better of SPY/EFA, else AGG |
| `momentum-12-1` | monthly | 40 large caps | rank by the return from 252 to 21 bars ago; hold the top 8 equal-weight |
| `rsi2-mean-reversion` | daily | 40 large caps | buy when close > SMA200 and Wilder RSI(2) < 10; sell when close > SMA5; 5 slots |
| `donchian-breakout` | daily | 40 large caps | buy when close > prior 55-bar high; sell when close < prior 20-bar low; 8 slots |
| `low-volatility` | monthly | 40 large caps | hold the 10 lowest 63-day realised volatilities equal-weight |

Cadence is state-based: a period is due when the trade date's period key differs from the
last rebalance actually evaluated, so a skipped first trading day catches up on the next fresh
day instead of losing the month.

## Where things live

- `lib/strategies/` — `types` · `config` (rails) · `universe` · `indicators` (SMA, Wilder
  RSI, lagged return, realised vol, rolling channels, rank) · `calendar` (period keys,
  `isRebalanceDue`, `previousTradingDay`) · `catalog` (data only: names, parameters, explainer
  copy, board columns) · `rules/*` (one `decide` per strategy) · `rebalance` (`planOrders`) ·
  `engine` (`buildContext`, `runStrategyDay`, `applyFill`) · `simulate` · `metrics` — all pure
  and unit-tested. `store` (job writes), `queries` (page reads), `follows`, `runner` and
  `job-helpers` are the server side.
- `lib/prices/` — `yahoo.ts` is the new keyless daily-bar provider (OHLCV + adjusted close,
  the in-progress bar dropped); `stooq.ts` stays as the fallback; `ensureBars` is provider-
  aware with a deep OHLC backfill, an overlap check for split re-adjustments and a bounded
  `getBarsForSymbols`.
- `lib/inngest/functions.ts` `strategies-daily` — 09:35 ET weekdays plus a 10:30 retry for
  provider lag; phases: accounts → bars (chunked steps) → freshness gate → per-strategy claim /
  decide / fills / record → backtests on version change → job stamp. `app/run.strategies`
  with `{dryRun, resimulate, force}` via `npm run trigger -- strategies|strategies-preview|strategies-resimulate`.
- Models: `StrategyState` (account pointer, launch date, daily claim, last rebalance),
  `StrategyRun` (the day's board, plan and fills; TTL 400 days), `StrategyBacktest`
  (the simulated record). `PaperTrade` gained `source: 'strategy'` and an optional `reason`.
- Pages: `/strategies` (status strip, leaderboard, reading guide) and `/strategies/[slug]`
  (explainer, performance with a Live | Simulated toggle, holdings, latest decision, signal
  board, live and simulated trade logs, follow). Widget `quant-strategies`.

## Data and timing

- Stooq's keyless CSV endpoint now answers with a JavaScript challenge page, so Yahoo's chart
  endpoint is the primary source (1.5 s spacing, `Mozilla/5.0`, no `events` parameter). Bars
  always end at the previous close. The four dual-momentum legs are topped up with a two-year
  window because adjusted closes are re-based on every distribution.
- Signals use split-adjusted closes; only dual momentum reads adjusted closes, because BIL's
  price return is ~0 % (its yield is paid out) and the T-bill hurdle would otherwise collapse
  into "SPY is positive". Fills, equity and every displayed return are price return, like the
  paper accounts themselves.
- Outside regular hours a manual run is a preview: it decides and records but does not fill.
- A strategy skips its day when more than 10 % of its universe has no fresh bar; the whole run
  skips, without taking claims, when SPY itself is stale (the 10:30 retry then runs).

## Guardrails

- The engine is the only decision path; the job and the simulator both call `runStrategyDay`.
- No look-ahead: a decision on bar *T* sees bars ≤ *T* and fills at *T+1*.
- The sentinel owner never reaches user surfaces: nothing calls `getAccountsForUser` with it,
  and accounts are created only inside the job.
- Every surface names its basis (live vs simulated) and labels unpriced holdings.
- Header nav gaps step down below `xl` and the header list is hidden below `lg` (the drawer
  carries every route) so the eighth item fits.

## Verification

- `npm run check` (lint, typecheck, unit tests incl. indicators, calendar, rebalance, engine,
  catalog, rules, simulate, metrics, views, job helpers, Yahoo parser).
- `scripts/qa/qa-strategies.mjs` plus the nav pins in `qa-topics`, `qa-navigation`,
  `qa-news-feed` and `qa-foundations`.
- A real run: `.env` with `MONGODB_URI` and `FINNHUB_API_KEY`, `npm run dev`, the Inngest dev
  server, `npm run trigger -- strategies-preview` then `-- strategies` during the session.

## Out of scope

A chat tool for strategies · user-built variants · per-user copies · CSV export for strategy
accounts · LLM narration · dividends, fees, ATR sizing · intraday data · a public leaderboard.
