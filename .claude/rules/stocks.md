---
paths:
  - "lib/stocks/**"
  - "components/stocks/**"
  - "app/(root)/stocks/**"
  - "app/(root)/watchlist/**"
  - "lib/actions/watchlist.actions.ts"
---

# stocks

Contracts of this feature that a map cannot show: a part of `AGENTS.md`, kept in a file of its
own so it loads only beside the files its `paths:` name. A `### name` in the text is that
feature's file in this folder; Shared, owner and the numbered invariants are in `AGENTS.md`;
the map is `docs/MAP.md`.

- `lib/stocks/key-numbers` states the stock page's feed figures as sentences that say what each
  divides: only the metric names it lists become rows; a missing or non-finite figure hides its
  row; its source line states the fetches' cache from `lib/prices/config`'s
  `FINANCIALS_REVALIDATE_SECONDS`/`PROFILE_REVALIDATE_SECONDS`.
- `lib/stocks/rules-see` is "What the rules see": each watching strategy's stored row, read by
  `lib/strategies/learn/board-narration.readBoardRow`; shared dates and values stated once.
- `components/stocks/KeyNumbers` and `components/stocks/RulesSee` are one disclosure each.
- /watchlist's own add control is `components/stocks/AddToWatchlist` (a button in the page
  title's actions and in the empty panel, and the dialog it opens): a stock search over a pick
  list that calls `addToWatchlist` through `runWithToast` and stays on the page, since the action
  revalidates /watchlist. It is not a second `components/shell/SearchCommand` (no window key
  listener, stocks only). Its rows are the pure `lib/stocks/watchlist-add.addRows` over
  `lib/shell/palette.paletteRows`: no row while the search for the text in the box is out; a
  search that did not answer is said as that, never as "no stocks found"; a stock already on the
  list is marked and cannot be run, and is left out of the suggestions. Its sentences are
  `WATCHLIST_COPY.add` in `lib/learn/copy/watchlist`. The focus returns to the button that opened
  it, and to the title's when the empty panel leaves with its own.
- The name a row is added under is the name the watchlist saves, so the suggestions carry
  company names (`POPULAR_STOCK_NAMES` in `lib/stocks/popular`, held equal to the symbols by its
  test), and a searched stock, which Finnhub names in capitals (`lib/stocks/watchlist-add.isShouting`),
  is saved under its profile's name when there is one (`lib/actions/watchlist.actions.addToWatchlist`).
- `components/stocks/StockHit` is the one stock search row, shared by ⌘K and the add dialog.
- `components/stocks/TradingViewWidget` takes `height: number | null`: null renders the title and
  the frame and embeds nothing until the height is a number (`components/stocks/useTradingViewWidget`).
  An embed's place is held only by a height on its container (`className`): the stylesheet sizes
  the widget's own box to 100% of that, so a height given to the inner box holds nothing, and
  without one the page under an embed moves when its frame arrives.
