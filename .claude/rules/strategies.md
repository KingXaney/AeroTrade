---
paths:
  - "lib/strategies/**"
  - "components/strategies/**"
  - "app/(root)/strategies/**"
  - "app/api/strategies/**"
  - "lib/actions/strategies.actions.ts"
  - "lib/jobs/functions/strategies.ts"
  - "database/models/strategy-*.model.ts"
  - "scripts/qa/qa-strategies.mjs"
---

# strategies

Contracts of this feature that a map cannot show: a part of `AGENTS.md`, kept in a file of its
own so it loads only beside the files its `paths:` name. A `### name` in the text is that
feature's file in this folder; Shared, owner and the numbered invariants are in `AGENTS.md`;
the map is `docs/MAP.md`.

- Catalog, rules, engine and simulator are pure: `lib/strategies/engine.runStrategyDay` is one day
  for live and backtest alike; `lib/strategies/params` is the one reader of `def.params`.
- `lib/strategies/universe.strategiesWatching`: the strategies whose boards carry a symbol — at
  most 4, and what lets `/stocks/[symbol]` render keyless for one.
- `lib/strategies/page-store` reads: `getBoardRowsForSymbol` one `$elemMatch`-projected findOne per
  watching strategy, newest run first; `getLatestRun` one strategy's newest run, one findOne (the
  detail page and the chat read it); `getStrategyLedger` a strategy's whole current-epoch ledger,
  for its CSV export.
- What-if lab, pure layer `lib/strategies/whatif`: `PARAM_RANGES` the only knobs a setting may
  turn; `applyOverrides` lays a setting over a catalog def without touching it (a `top` also sets
  `slots`); `gridFor` the fixed ≤4 single-knob variants the nightly job precomputes;
  `paramDiff`/`toWhatIfView` what a page prints and draws, labelled from `lib/learn/copy/whatif`.
- What-if grid: `lib/strategies/runner.simulateVariantsForStrategy` — one strategies-job step per
  strategy, inside the backtest's readiness guard, bars loaded once, simulated on the readiness
  guard's own T-bill points — runs only when `lib/strategies/job-helpers.variantsDue` says the
  backtest was rebuilt (a new version or a resimulate: its `computedAt` moved) or the grid moved.
  `lib/strategies/store.saveVariants` writes it to `StrategyBacktest.variants`, an array with no
  default beside `variantsVersion` and `variantsFor` (the build's `computedAt`), never through
  `saveBacktest`.
- What-if view: `lib/strategies/whatif.whatIfLab` shows a variant only beside the backtest version, build and dates it
  was computed with; the client `components/strategies/WhatIfLab` renders it with `SimulatedStats`
  as `#whatif-stats`, `neutral` — no sign colour says which setting is ahead; the tiles' labels are
  `lib/learn/copy/simulated`.
- `lib/strategies/learn/`: `replay` is pure; `board-narration` is "Read this board"
  (`components/strategies/BoardReading`) — the signal board's top row read by a narrator per
  strategy from `row.values` and the catalog's parameters (its `readBoardRow` also serves the stock
  page).
- Time in the market, `lib/strategies/learn/time-in-market`: the same $10,000 owned three ways in
  SPY — all at once, monthly deposits, cash only — as shares at its closes, its dividends and every
  cent of cash through `replayIncome` with its optional `deposits`; a day holding cash with no
  usable rate voids the way; the chart is decimated to `TIM_CHART_POINTS`.
  `lib/strategies/learn/time-in-market-store` reads SPY's bars and bounded ^IRX points, memoised for
  the day on their latest points' stamp. It renders only on `/strategies/buy-and-hold-spy`, as
  `components/strategies/TimeInMarket` with three `SeriesTiles` and `PerformanceChart`'s dollar mode.
- A fill's one "What the rule saw" is `components/learn/ReasonGloss` inside
  `components/strategies/ReasonDisclosure`.
