---
paths:
  - "lib/trading/**"
  - "components/trading/**"
  - "app/(root)/trade/**"
  - "app/(root)/portfolio/**"
  - "app/(root)/history/**"
  - "app/api/accounts/**"
  - "lib/actions/trading.actions.ts"
  - "lib/actions/accounts.actions.ts"
  - "lib/jobs/functions/trading.ts"
  - "lib/jobs/functions/splits.ts"
  - "lib/learn/copy/trade.ts"
  - "lib/learn/copy/portfolio.ts"
  - "database/models/paper-account.model.ts"
  - "database/models/paper-trade.model.ts"
  - "database/models/account-snapshot.model.ts"
  - "database/models/stock-split.model.ts"
  - "scripts/migration-indexes.mjs"
  - "scripts/qa/qa-trading.mjs"
  - "scripts/qa/qa-books.mjs"
  - "scripts/qa/qa-steady-prices.mjs"
---

# trading

Contracts of this feature that a map cannot show: a part of `AGENTS.md`, kept in a file of its
own so it loads only beside the files its `paths:` name. A `### name` in the text is that
feature's file in this folder; Shared, owner and the numbered invariants are in `AGENTS.md`;
the map is `docs/MAP.md`.

- `/trade` is the Markets section's first page (its tab reads Trade, its heading Markets) since
  the Markets overview and the Trade Desk became one page on 2026-10-13
  (`docs/specs/2026-10-13-markets-trade-merge.md`): the ticker tape, the desk
  (`components/trading/desk/TradeDesk`, chart and ticket on one symbol), the last fill, the open
  positions, then the market scan — `components/stocks/MarketScan`, the four TradingView views as
  `?view=`, each link keeping `symbol` and `account`, one embed at a time. `/markets` redirects
  there from `next.config.ts`, its query carried over. The page's sentences are
  `MARKETS_PAGE_COPY` in `lib/learn/copy/trade`. ⌘K finds the page by its section's name and by
  its tab's (`NavDestination.tab`), so "trade" and "markets" both land on it.
- `lib/trading/valuation.buildHoldingsPriceMap` is the quote map a page values holdings with:
  the quote sheet's price (### prices), or the symbol's newest stored daily close within
  `CLOSE_FALLBACK_DAYS` (`lib/trading/config`) — whichever is the later price
  (`lib/trading/analytics.withStoredCloses`, a close standing for the end of its session,
  `lib/prices/market-hours.sessionCloseOf`). So a close stands in for a symbol the sheet has no
  price for, replaces a quote from before that close's session, and never replaces a quote from
  this session: a refusal cannot move a holding to an older basis. A close is priced, not stale,
  and dated (`PriceInfo.closeDate`, `EnrichedPosition.closeDate`, the chat's `priceAsOf`); a quote
  carries when it was fetched (`PriceInfo.asOf`, `EnrichedPosition.quoteAt`). Both are said once,
  in the holdings line (`HOLDINGS_COPY.summary` over `analytics.countAtClose` and
  `analytics.oldestQuoteAt`: "prices as of 2:15 PM ET", never "live"; "valued at last close" only
  when the market is closed and every quote was fetched after the bell), and a close in the price
  cell's title, never a per-row flag. A benchmark's live point reads `analytics.livePrice`, never a
  stored close. `lib/trading/valuation.buildSheetPriceMap` is the sheet alone, where a miss stays a
  miss ("had you held"); `lib/trading/valuation.buildFreshPriceMap` asks Finnhub at that moment,
  for whatever acts on a price — the snapshot job, the Navigator's plan, a culture enrolment's first
  orders; a fill reads `lib/prices/quote-store.getFreshQuote` — and there a missing quote stays
  missing.
- A holding whose symbol has stopped quoting is **gone** (`lib/prices/gone.isGone`, pure: the quote
  sheet has received no price for it in `GONE_AFTER_SESSIONS`, three, sessions, or never;
  `lib/prices/quote-store.getGoneSymbols` reads it, and nothing is gone without a Finnhub key). An
  unpriced holding that is not gone is an outage and waits; a gone one would wait for ever, so it
  is valued at its newest stored close of any age within `LAST_CLOSE_LOOKBACK_DAYS`, dated — on
  a page (`buildHoldingsPriceMap` drops a sheet quote older than the gone cutoff,
  `analytics.withoutGoneQuotes`, so the stored-close passes date the holding; its last fallback
  is a close of any age) and in the daily snapshot, which marks the row
  (`AccountSnapshot.atClose`). `/portfolio` gives a gone holding one action in place of Trade and
  Sell, "Close at the last close" (`components/trading/portfolio/CloseOutButton`,
  `lib/actions/trading.actions.closeOutHolding`, `lib/trading/close-out.closeOutGoneHolding`): the
  whole holding sold at that close, the fill's reason saying so (`GONE_COPY`). It is the ONE fill
  made without a live quote, the server decides whether the symbol is gone, and `executeOrder`
  is unchanged.
- Switching the active account is one write that renders nothing and one page request.
  `components/trading/accounts/useSwitchAccount` posts to `app/api/accounts/active/route.ts` (same
  origin by `lib/same-origin.sameOriginRequest`, the session, `getOwnedAccount`, then the HTTP-only
  cookie through `lib/trading/active-cookie`), then asks for the page once: `router.refresh()`, or,
  where `?account=` named the old account, `router.replace` to the address without it with
  `{scroll: false}` (`lib/trading/account-switch.switchHref`). Never a server action for this and
  never a `revalidatePath`: a cookie set in an action re-renders the page inside the action's own
  response, and a revalidation makes every cached fetch of the path a miss. The account being
  opened lives outside React (`components/trading/accounts/switch-store`), so the menu, the
  comparison rows, `components/trading/accounts/AccountHeading` and
  `components/trading/accounts/AccountRegion` show one answer from the click on
  (`lib/trading/account-switch.switchView`): the row picked is `aria-current`, the heading names it
  over "Opening …" (`SWITCH_COPY` in `lib/learn/copy/portfolio`), and the old account's panels are
  `aria-busy`, `inert` and faded — `.account-region[data-pending]` in `app/globals.css` fades each
  panel's content on `--motion-fast`, never the panel, whose backdrop blur an ancestor's opacity
  would cut — until the page arrives. The controls that switch are never `disabled` (a disabled
  button drops the focus the click gave it): a pick made mid-switch is ignored. The order ticket and
  the sell dialog refuse to submit while a switch is pending, and a sell dialog belongs to the
  account it was opened on (it is gone once the page is another's), so an order never lands in the
  account on its way out. The hook instance that was asked owns its switch: it ends it when the page
  arrives, after `PAGE_PATIENCE_MS`, and when it unmounts, and only a failed write toasts — the
  write is awaited outside any transition, which would hold every other navigation behind it.
- `lib/trading/ledger.getTradeLedger` is the one cached PaperTrade read a page makes. Every
  per-account trade read — the ledger, bounded history, the CSV, the comparison table, `/history`'s
  feed, the chat's sell totals — starts at the account's `inceptionAt` through the ledger's
  `epochTrades`/`epochTradesOf`. The ledger, the bounded history, `/history`'s feed and the CSV
  hand back the fills as the account's books hold them now, from the account's own document: with
  a fill whose row is still to be inserted (`pendingFill`, below) and with a fill from before a
  split restated in today's shares (`splits`, below).
- `lib/trading/fill.applyFill` is the one fill arithmetic, shared by
  `lib/trading/orders.executeOrder`, the strategy simulator and `lib/trading/receipts`, which
  replays each fill through it (the trade log and `/trade`'s `LastFill`). Orders are whole shares;
  a holding may carry a fraction of one (a split leaves it), so a sell that would leave less than
  one share sells the fraction too and the result says how many shares moved (`quantity`, what the
  trade row stores; `lib/format.formatShares` prints it), and a holding of less than one share
  sells as one (`lib/trading/order-math.sellableShares` is the most whole shares a sell may
  name, for the ticket, its presets and the sell dialog; `executeOrder` takes an automated exit's
  sub-share quantity only against such a holding). `{exact: true}` is a replay's: a stored or
  restated fill moves exactly what its row says.
- A fill is recoverable. `lib/trading/orders.commitFill` moves cash and positions in ONE account
  write that also carries the trade row it is about to insert (`PaperAccount.pendingFill`, the row's
  `_id` chosen first), guarded on `cash`, on `splitRev` and on no fill already waiting; then
  `lib/trading/pending-fill.settlePendingFill` inserts the row (a duplicate key is done) and unsets
  the field. A failure after the account write is a FILLED order and answers as one, never "Order
  failed"; the next order (`loadAccountForFill`), the nightly income job and the split job settle
  what was left, and until then the reads above add the pending row (`lib/trading/pending`, pure).
  An automated caller passes an `idempotencyKey` (the Navigator's is
  `lib/navigator/run.navigatorOrderKey`, per week, side and symbol).
- Stock splits: the books are kept in TODAY'S shares (`lib/trading/splits`, pure;
  `docs/specs/2026-11-17-books-integrity.md`). A split is one `StockSplit` row per symbol and
  ex-date, read from Yahoo's chart with `events=split` in a call of its own
  (`lib/prices/yahoo.fetchYahooSplits`; the bars call never carries `events`), with `prevClose`,
  the close before it in the new basis from the same payload. `lib/trading/splits-store`
  applies it to each account holding the symbol in one guarded write: the position rebuilt from
  the account's own restated fills (`positionFromFills`; an account whose position does not
  rebuild from its trades is skipped and named), the split appended to `PaperAccount.splits` with
  that account's cut (`cutFor`: the split's 09:30 ET instant, or, for a fill between the previous
  close and the ex-date's close, where its price says the basis turned), `splitRev` bumped. The
  account's own list is what its ledger is read with (`restateFill`: quantity × ratio, price ÷
  ratio, total and realised P&L untouched; `lib/income/store` restates the trades it replays, and
  the Income panel a dividend paid before the split, `restateDividend`), so the stored position
  and the ledger never disagree. Stored trade rows are never rewritten. The trade log says it once
  under the table (`SPLIT_COPY.note`, only for splits that restated a fill shown). A dividend row
  is restated only when it went ex before the split AND was written before the account applied it
  (`AppliedSplit.appliedAt`): the income job writes later rows in today's shares already.
- A split reaches an account by three lines, because the minutes after its 09:30 instant are
  when a holding reads as ten shares at a tenth of the price. (1) An order never acts on a
  holding still in old shares: `executeOrder` calls `splits-store.settleSplitsBeforeFill` for a
  symbol the account holds — a stored split in effect is applied first, and a quote more than
  `SPLIT_SUSPECT_MOVE` from the last stored close (`lib/trading/splits.looksLikeSplit`) has
  Yahoo asked about that symbol — and the order is then NOT sent (`SPLIT_COPY.fillApplied`: its
  share count was sized on the old shares; `fillUnchecked` when the check could not be made).
  (2) The `stock-splits` job (`lib/jobs/functions/splits`, weekdays 09:40 ET, trigger `splits`)
  checks every held symbol, rebuilds the bars of a symbol whose split is not yet rebased
  (`StockSplit.rebasedAt`, once per split: bars first, holdings second), then applies. (3) The
  snapshot job applies every outstanding split before it values anything
  (`applySplitsBeforeSnapshot`: Yahoo for the suspects, then `applyStoredSplits`), reads its
  accounts again whatever that step reports, and `writeSnapshots` skips an account whose
  `splitRev` moved since it was read. `outstanding` takes the accounts holding the symbol and,
  for a split of the last ten days, those with a fill of it since the session before (an account
  that sold out in old shares still has the rest coming); a write that loses its guard is tried
  three times and then named in the stamp; an account with nothing to restate still lists the
  split, so it is not looked at again. `STOCK_SPLIT_DETECTION=off` (the browser QA) asks Yahoo
  nothing.
- The daily snapshot (`lib/trading/snapshots`, `lib/jobs/functions/trading`): a snapshot is
  permanent, so an account with an unquoted holding that is not gone waits. `writeSnapshots`
  returns what it wrote, valued at a stored close and skipped, and the stamp is
  `lib/trading/snapshot-run.describeSnapshotRun` (pure): how many of the accounts were written, the
  symbols that had no quote, whether SPY was recorded — never a healthy line for a run that wrote
  nothing. The second cron (16:40 ET) is the late pass (`isLatePass`): only the accounts with no
  row for the day that the job itself wrote (`AccountSnapshot.closedAt`; a day-zero seed has
  none), so it asks Finnhub only about those. `full: true` on the event values every account
  again; `accountIds` scopes a run (the browser QA).
- `lib/trading/lots` pairs a sell with the learner's buy notes, FIFO; `lib/trading/analytics` also
  dates the drawdown.
- `lib/trading/lifecycle`: the day-zero snapshot, `restartAccount` (reset and Navigator re-enroll)
  and the delete cascade, which refuses the last account, the one the AI Navigator trades in and
  one a culture picker trades in (`CultureFollow`). `lib/trading/traded-by.tradedBy` is the one read
  of who else trades an account, drawn under its name on `/portfolio` (never when nobody does).
- `lib/trading/csv`: the exports' quoted, formula-safe cells and `tradesCsv`, the one row builder
  both CSV routes (`app/api/accounts/[accountId]/export`, `app/api/strategies/[slug]/export`) share.
- `/portfolio`'s learn panels (`lib/trading/learn/`, drawn by `components/trading/learn/`):
  - `lib/trading/learn/bridge` splits the return to the cent (`ReturnBridge`; the guess lives in
    localStorage, read after mount); `lib/trading/learn/risk` is the typical daily swing (`RiskLens`).
  - `lib/trading/learn/habits` (Trading habits) runs over the learner's own lots: `matchLots` over
    every fill in the account, then a closed lot counts when its sell is `source: 'user'`, an open
    one when its buy is; null under 3 closed lots; the pace set beside the catalog's cadences only
    (`cadenceControls`); drawn by `TradingHabits`. `lib/trading/learn/habits-store` reads only the page's ledger plus at most
    five quotes for "had you held".
  - `lib/trading/learn/random-portfolios` (Luck or skill): a seeded thousand random five-stock
    portfolios from the large caps, equal dollars in whole shares, earning on the income clock —
    each dividend paid on its pay date, cash at the T-bill rate — as the learner's snapshot does.
    `completeSession` ends the window on the last session the whole served pool and SPY have;
    `luckWindow` ends it on the last snapshot's date and withholds the learner's marker — never a
    live at-cost value — when a holding is unpriced and the last session has no snapshot, or when no
    fill in the account is the learner's. `lib/trading/learn/luck-store` reads the pool's latest
    closes (`lib/prices/store.getLatestBars`), one snapshot and `getHoldWindowBars`' edge closes
    plus dividend rows and the window's ^IRX points, memoised per window and T-bill stamp for the
    ET day. `LuckOrSkill` draws it as an SVG histogram with you / SPY / median markers.
- The desk below 1280 px: the ticket is first in the document and the chart is placed on its left
  by `xl:` grid classes, so below xl the two stack ticket-first and the keyboard reaches the ticket
  before the embed's frame. The chart's height is `lib/stocks/tradingview.tradeChartHeight`
  (`TRADE_CHART_HEIGHT`: 560 from xl, 360 below), read from `TRADE_DESK_WIDE_QUERY` through
  useSyncExternalStore; it is null on the server and through hydration, and the embed waits for
  a number (so it is built once). `TRADE_CHART_PLACE_CLASS` holds the chart's place in CSS from
  the first paint, on the embed's container, and `TICKER_TAPE_PLACE_CLASS` the tape's over the
  desk, at the taller of the two heights TradingView draws it at: the page under them does not
  move when their frames arrive a second later (qa-trading measures it).
- `lib/actions/trading.actions.placeOrder` spends the reader's order counter
  (`lib/prices/action-limits.withinOrderLimit`, 20 a minute) before `executeOrder` is reached and
  refuses past it with `ORDER_COPY.tooFast` (`lib/learn/copy/trade`); a counter that cannot be
  written answers as a failed order, never a rejection. The jobs call `executeOrder` themselves
  and are not counted.
