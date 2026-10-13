# Markets and Trade become one page

**Date:** 2026-10-13
**Status:** Implemented 2026-10-13. Amends [UX revamp](2026-10-02-ux-revamp.md) (the rail's eight sections become seven).

## Context

The rail had a Markets icon and a Trade icon side by side. Markets was two pages — an overview
(`/markets`: a TradingView ticker tape and four screeners, one at a time in `?view=`) and the
watchlist — and Trade was one page of little content: the chart, the order ticket, the last fill
and a strip of open positions. Both were TradingView embeds around a symbol, and the owner found
them near-duplicates with the trade desk too thin. Decision: one page, one icon.

## What changes

- **One section.** `lib/shell/navigation.ts`'s Markets section (id `markets`, icon
  `candlestick_chart`, `match: ['/stocks']`) has two pages: `/trade` (tab "Trade") first, then
  `/watchlist`. The Trade section is gone; the rail has seven icons. A stock page still lights
  Markets.
- **The page.** `/trade` (h1 "Markets", browser title "Markets") is, top to bottom: the header with
  the account switcher and the market status, the ticker tape, the desk (chart and ticket on one
  symbol, unchanged), the last fill, the open positions, then "Scan the market" — the four views
  (Stocks, Heatmap, Crypto, Forex) as `?view=`, one embed at a time, each link keeping `symbol`
  and `account`. Three embeds mount at most (tape, chart, one scan), against the overview's two and
  the desk's one.
- **The old address.** `/markets` redirects to `/trade` from `next.config.ts` (permanent; Next
  passes the query through, so `/markets?view=heatmap` lands on the heatmap). The page file is
  removed.
- **⌘K.** A destination keeps its own tab name beside the ⌘K name (`NavDestination.tab`), and
  `searchPages` matches either, so "trade" still finds the desk (shown as "Markets / Trade") and
  "markets" finds the desk and the watchlist. The palette's second line is the section when it
  differs from the name, else the tab.
- **Words.** The page's sentences are `MARKETS_PAGE_COPY` in `lib/learn/copy/trade.ts`, held to
  the 'copy' tier.

## Not changed

The order ticket, the desk's URL sync, the watchlist page, the stock page, the Trade links
everywhere (`/trade?symbol=X`), the Quick Links widget (it reads the registry).

## Verification

`npm run check`, `npm run build:check`; `npm run qa -- shell auth styles topics culture trading`
and the visual sweep, with the rail, the tabs, the redirect and the scan view in the URL pinned.
