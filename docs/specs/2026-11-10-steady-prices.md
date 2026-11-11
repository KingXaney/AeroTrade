# Steady prices: one price sheet, and an account switch that costs one request

**Date:** 2026-11-10
**Status:** Implemented 2026-11-10.

## Context

The owner reported that swapping between paper accounts on `/portfolio` changes the prices, "leaving
an uncertain calculation". Measured on production, Tuesday 2026-11-10 14:10–14:20 ET, market open,
four accounts, by recording the page while clicking Account Comparison rows:

| Moment | Header line | MSFT | Culture · Quiet |
|---|---|---|---|
| First load after idle | "13 holdings · live valuation" | $545.18 | $10,393.81 |
| Click → Spike (+1.9 s) | "12 holdings · live valuation" | $533.83 | $10,304.79 |
| Click → Quiet (50 s later) | "13 holdings · valued at the Nov 9 close" | $545.18 | $10,425.49 |

One account read three values inside two minutes. Three price bases took turns: hours-old cached
quotes (equal to the Nov 9 closes, labelled "live"), fresh quotes, and the stored Nov 9 closes after
Finnhub refused a burst. The click itself: the buttons dim for 0.4–0.8 s, come back while the old
account is still shown for about a second, then the whole page swaps.

Causes, each read from the installed Next 16.3.8 source and the app's code:

1. **Quotes sat in Next's fetch cache** (`force-cache`, `revalidate: 30`). On a dynamic request a
   stale entry of any age is returned at once and refetched in the background; only a 200
   overwrites it. Nothing bounds the age. The same cache served jobs, fills and server actions.
2. **Every `revalidatePath` made those entries a miss** for the page being rendered.
   `setActiveAccount` called it four times, so each switch fetched all 31–36 quotes of the page in
   the foreground at once (Finnhub's free plan: 60 a minute, 30 a second). Every other action that
   revalidates `/`, `/dashboard`, `/trade` or `/portfolio` (orders, games, topics, the lab) did the
   same to the next render of those paths.
3. **A switch was two full renders**: the action's own response re-rendered the route (a cookie
   write alone does that), then `router.refresh()` rendered it again; with `?account=` in the URL it
   could be three.
4. **A refused quote read as `{}`**, and the page fell back to the newest stored daily close: an
   older basis than the quote it replaced.
5. **The words did not know a quote's age.** "live valuation" meant only "the market is open and no
   holding fell back".
6. **The pending state ended when the action answered**, not when the new page committed; the two
   switch controls did not share it; a disabled button dropped focus.

## What changed

### 1. The quote sheet

One stored row per symbol holds the newest quote the app has received: `PriceQuote`
(`database/models/price-quote.model.ts`, collection `pricequotes`): `symbol` (unique, upper case),
`price`, `changePercent`, `fetchedAt` (when Finnhub was asked for that answer), `refusedAt` (the last
attempt that got no price), `claimedUntil` and `claimedBy` (a refresh in flight), `updatedAt` (a
30-day TTL collects symbols nobody asks about). Market data has no environment: previews and
production share the rows, as they share `PriceBar`.

Everything that **shows** a price reads the sheet; nothing on a request path asks Finnhub per render.
Everything that **acts** on a price (a fill, the daily snapshot, a plan that sizes orders) asks
Finnhub directly, uncached, and writes what it got into the sheet.

- `lib/prices/quotes.ts` (pure, unit-tested): the window, what is due and whether a read waits,
  what may be served, what a Finnhub answer means, the budget of the last sixty seconds, the pacer,
  what counts as a symbol.
- `lib/prices/quote-store.ts` (Mongo and Finnhub): `getSheetQuotes(symbols, {wait})`,
  `getSheetQuote(symbol, {wait})`, `getFreshQuotes(symbols)`, `getFreshQuote(symbol)`.
- `lib/prices/finnhub.ts`: `fetchQuote(symbol)` is the raw call — `cache: 'no-store'`, a
  four-second timeout, an answer that says whether Finnhub answered, refused or could not be
  reached; only `quote-store` imports it (a guard test holds the import graph). The base URL is
  `FINNHUB_API_URL` when set (the browser QA's stand-in), as `TIINGO_API_URL` is; the culture
  earnings calendar reads the same override.
- `lib/trading/analytics.withStoredCloses` chooses between a quote and a stored daily close.

**The window.** A row is current for the clock minute it was fetched in and the one after.
Everything fetched in one minute therefore falls due on the same boundary — a page's prices move
together or not at all — and no symbol is asked twice inside sixty seconds: a load two seconds
before a minute ends and another two seconds after it are one refresh, not two. While the session
is closed the same holds until the close has settled (`QUOTE_CLOSE_SETTLE_MS`, two minutes); a row
fetched after that stays current until the next open, so an evening, a weekend or a holiday costs
one fetch per symbol. The 16:10 ET snapshot job's quotes are written through, so after it the pages
show the prices the snapshot recorded. `lib/prices/market-hours.lastSessionClose` gives that close.

**A display read** (`getSheetQuotes`), for the symbols one caller asks:

1. One `find` for their rows. A per-render memo (React `cache` holding a symbol → promise map)
   hands a symbol the same answer wherever in one server render it is asked, so the layout, the
   page and a page's second price map cannot disagree.
2. A symbol is **due** when it has no row or its row is out of the window, unless an attempt for
   it got nothing within `QUOTE_BACKOFF_MS` (60 s) or another request holds its claim.
3. Nothing due: answer from the rows. No Finnhub call, whatever page, account or instance asks.
4. Something due:
   - if every due symbol has a price under `QUOTE_SERVE_STALE_MS` old (5 minutes — longer than a
     row is ever kept, so a reader who keeps turning pages never waits), or is one Finnhub
     answered nothing for (never, or within `QUOTE_REFUSAL_MEMORY_MS`, 10 minutes: an outage must
     not hold every page up for the fetch timeout): **answer from the rows now** and refresh in
     `after()`; the next render reads the new sheet;
   - otherwise (a symbol never asked about, a first page after a long idle, or `wait: 'current'`):
     refresh first, then answer.
5. A refresh takes the budget (below) for its symbols, oldest first, then claims the rows it may
   ask — one conditional update for the rows that exist, an insert for a symbol never seen, a
   duplicate key read as "someone else has it" — and hands back what it did not win. A symbol the
   budget leaves out is never claimed; if it has a row it waits a back-off, and one never seen
   gets no row at all. Every quote call on an instance starts through one pacer (at most
   `QUOTE_BURST`, 25, in any 1.05 s, whoever asks), and the answers are written in one
   `bulkWrite`. A price (`c` > 0) is written only over an older `fetchedAt`. An empty or zero
   answer (Finnhub's free plan answers a burst that way), a non-200 or a timeout sets `refusedAt`
   and leaves the price and its `fetchedAt` alone; a refusal is filed once a refresh
   (`reportLimit`) and the calls of that refresh not yet started are not sent. A page makes two
   reads — every account's holdings, then the benchmark — so at most two rows are filed for it.
   A refresh that fails (the claim, the counter, the write) costs the new prices, never the rows
   already read.

`wait: 'recent'` is the default (pages, the stock page among them). `wait: 'current'` is for one
asked symbol — the order ticket's "Last Price" (`lib/actions/stocks.actions.getQuote`) and the
chat's `getStockQuote` — and is answered only with this window's price or one under five minutes
old, never an older row; the chat's answer carries the time (`asOf`). The ticket's action answers
the signed-in reader alone, and only a ticker-shaped string is a symbol (`normalizeSymbols`), so
nothing typed can become a row or a call.

**What a row is worth.** A row's price is shown while it is no older than `QUOTE_KEEP_DAYS` (7).
When a row was fetched before the last session closed, `buildHoldingsPriceMap` compares it with
the symbol's newest stored daily close (the same 7-day bars read as before, made only for those
symbols): whichever is later in time wins, the bar's time being its session's close. So a refusal
never moves a holding back to an older basis: today's 1:58 PM quote outlasts yesterday's close, and
yesterday's close replaces a quote from the day before.

**A fresh read** (`getFreshQuotes`, `getFreshQuote`): counted against the budget before it is
asked, then `fetchQuote` through the pacer, then one write of the prices into the sheet (only over
an older `fetchedAt`). Nothing here can fail the caller. A miss is `{}`, as before: a fill refuses,
a snapshot skips the account, a plan leaves the symbol out.

**The budget.** One counter per clock minute (`RateLimit`, key `finnhub:quotes:<minute>`, bumped
through `lib/rate-limit.bumpCounter`), read over the last sixty seconds — this minute's count and
the part of the previous minute's still inside them:

- a page refresh is granted what is left under `QUOTE_PAGE_CEILING` (40), and only the calls it
  then makes stay counted;
- an asked read goes ahead under `QUOTE_ASKED_CEILING` (52);
- a fresh read is never refused. A batch (the snapshot job's chunk, a plan's symbols, the culture
  week's quote check) that would take the last sixty seconds past `QUOTE_ACTING_CEILING` (56)
  waits one minute first, once, so a page's refresh that came just before it has left the window;
  one quote (a fill) never waits.

So a page that comes after a job's or a fill's quotes takes less, and a job's batch that comes
after a page's waits instead of being refused. Two limits remain, stated plainly: the pacer is per
instance (two instances can each start 25 calls in one second), and profiles, financials, search
and news are not counted.

**Who reads what.**

| Caller | Before | After |
|---|---|---|
| `getPortfoliosForUser`, `getAccountAnalytics`, `getPortfolio`, friends and strategies leaderboards, culture records, agent world book, broker sync | `buildHoldingsPriceMap` over Next-cached quotes | `buildHoldingsPriceMap` over the sheet, then stored closes |
| trading habits "had you held" | `buildPriceMap` | `buildSheetPriceMap` (the sheet; a miss stays a miss) |
| strategy detail's SPY point | `buildPriceMap` | `buildHoldingsPriceMap` through `livePrice` (a point only from a quote that is the later price) |
| chat `getPaperPortfolio` and the `explainTerm` readers | `buildPriceMap` (so `priceAsOf` could never be set) | `buildHoldingsPriceMap`, as the page |
| stock page header, watchlist and movers (`lib/stocks/stock-data-store.getStocksWithData`) | `getQuote` | `getSheetQuote(s)`; profile and financials unchanged |
| the order ticket, chat `getStockQuote` | `getQuote` | `getSheetQuote(symbol, {wait: 'current'})` |
| `executeOrder`, `applySuggestion`'s buy check, brain ticker check | `getQuote` (Next-cached, any age) | `getFreshQuote` |
| snapshot job (`snapshotBenchmark`, `quoteEntries`), Navigator `planAccountOrders`, culture follow bootstrap, culture weekly quote check | `buildPriceMap` / `getQuote` | `buildFreshPriceMap` / `getFreshQuotes` (same shapes; a miss stays a miss) |

`buildPriceMap` and the client's cached `getQuote` are removed, so no caller keeps the old meaning
by accident.

### 2. The words

`PriceInfo` gains `asOf` (epoch ms: when a sheet quote was fetched; absent on a stored close) and
`EnrichedPosition` gains `quoteAt`. The `/portfolio` header line (`HOLDINGS_COPY.summary`) says, when
no holding is at cost or at a stored close:

- "13 holdings · prices as of 2:15 PM ET": the oldest `quoteAt` among the account's holdings, in
  Eastern time, the day added when it is not today. This replaces "live valuation".
- "13 holdings · valued at last close": the market is closed and every quote was fetched after the
  last close.

When some holdings are at cost or at a stored close and others carry a quote, the existing parts are
followed by "others as of 2:15 PM ET" (nothing is added when the market is closed and those quotes
postdate the close). Said once, in the header line (invariant 8); no per-row flag. The strategies
leaderboard's label reads "valued at the last quote" while the market is open. The sentences are
pure exports in `lib/learn/copy/`, held to the 'copy' tier.

### 3. The switch

- **One request that renders nothing, then one render.** `POST /api/accounts/active`
  (`app/api/accounts/active/route.ts`): same-origin check (`lib/same-origin.ts`), session, the
  account is the caller's own (`getOwnedAccount`), the HTTP-only cookie is set
  (`lib/trading/active-cookie.ts`), `{success, message}`. No `revalidatePath`, no server action, so
  the response carries no render and expires nothing. The client then asks for the page once:
  `router.refresh()`, or, when the URL carries `?account=`, `router.replace` to the URL without it
  with `{scroll: false}`. `setActiveAccount` (the action) is removed.
- **The pending state is shared and ends when the new page commits.** A small client store
  (`components/trading/accounts/switch-store.ts`, read with `useSyncExternalStore`) holds the account
  being opened. `useSwitchAccount` sets it at the click, awaits the write outside any transition
  (React would hold every other navigation behind it), and asks for the page inside one. The hook
  instance that was asked owns its switch: it ends it when the page arrives, when its patience runs
  out, and when it unmounts — a reader who leaves mid-switch is told of no failure and finds nothing
  still "opening" on the next page. Only a failed write toasts (a ten-second timeout included).
- **What shows at once**: the picked row takes the selected tone and `aria-current`, the old one
  drops it; the page's `h1` reads the target's name (`components/trading/accounts/AccountHeading`),
  the line under it reads "Opening Culture · Spike…" as a `role="status"`, and the old account's own
  line keeps its room, unseen, so the page does not jump; the account's own panels and the buttons
  that act on it (`components/trading/accounts/AccountRegion`) are `aria-busy` and `inert`, and the
  panels dim through `.account-region[data-pending]`, which fades each panel's children on
  `--motion-fast`, never the panel itself (an ancestor's opacity would break the glass styles'
  backdrop blur). The token is zeroed by both reduced-motion guards and by brutalist, so the fade is
  then a cut. The order ticket and the sell dialog refuse to submit while a switch is pending, and a
  sell dialog belongs to the account it was opened on (the dashboard has no region).
- **The switch's controls stay focusable**: `aria-disabled` and an ignored click while a switch is
  pending, never `disabled`; the switcher's trigger and items are 44 px tall on a phone; the active
  account is `aria-current` in the comparison rows and a checked radio item in the menu.
- **What it costs**, measured in the browser suite: one `POST /api/accounts/active` (about 10 ms of
  server work) and one request that renders the page. On a `?account=` address the router also
  asks for the route's tree first, a request that renders nothing.

### 4. Browser QA

- `scripts/qa/start-finnhub-stub.mjs` (port 8791, `QA_FINNHUB_PORT`): stands in for Finnhub. Default
  mode `empty` answers every path with its empty shape (a quote `{}`), which is what a keyless
  harness gave, so the existing "no quote" checks hold; `prices` answers quotes from a table that can
  step on each call; `refuse` answers 429; `/__stats` counts calls per symbol.
- `scripts/qa/run.sh` gives the app `FINNHUB_API_KEY=qa-finnhub-key`,
  `FINNHUB_API_URL=http://localhost:$FINNHUB_PORT` and `QUOTE_SESSION=open` (the window treats every
  instant as in session, so a run at night walks the per-minute path; unset in production).
- `scripts/qa/qa-steady-prices.mjs` (suite `steady-prices`): its own user, three accounts on its own
  symbols, the stand-in stepping prices on every call. What it checks is in `scripts/qa/README.md`;
  the header line's words are asserted for the hour the suite runs at (open or closed).

## Not changed

Where a fill gets its price (Finnhub, at the moment of the fill) and what it does on a miss; the
snapshot job's rule that a missing quote skips the account; `enrichPosition`'s at-cost fallback; the
stored-close fallback's seven-day reach and its wording; `?account=` outranking the cookie and every
deep link's address; the comparison table's order (by return); the profile and financials fetches and
their cache; every job's own pacing.

## Not built, and known limits

- A live-updating page (prices that tick without a navigation): it would spend the free plan's
  minute on an idle tab. A price on screen is up to two minutes old before it is due, and is shown
  one render later; the header line says its time.
- A switch made more than five minutes after the last render waits for a refresh and shows new
  prices: time has passed, and the line's time moves with them.
- An "as of" time on the surfaces that never named a basis (comparison rows, the switcher, the rail
  card, Home, the leaderboards' rows). They read the same sheet as the header that says it; when the
  budget cuts a large page short, some of its rows are older than others and nothing on those
  surfaces says so.
- A switch on a `?account=` address ends in `router.replace` alone, which does not empty Next's
  back/forward cache as the old action did: Back can bring out another page as it was for the
  account left (it names that account, and anything done there goes to it). A refresh on top would
  cost a second render of every such switch; taking the parameter out through the history API and
  refreshing makes the router scroll the page to its top.
- Moving company profiles and financials off Next's fetch cache. They are slow-moving and not
  prices; `revalidatePath` still makes them a miss for the next render of a revalidated path, and
  they are not counted in the budget.
- The other account actions' render-twice pattern (create, rename, reset, delete, place order): each
  changed stored rows and now costs no Finnhub quote either way.
- `Model.init()` is still awaited by `lib/email/digest-store` (its one caller before this change);
  on a process whose model was compiled while the connection was opening it is rejected for good.
  The quote store builds its own index instead; the digest claim is left as it was.
- In `next dev`, an HMR refresh can hand `fetchQuote` an old response body, which the sheet then
  stamps as fetched now. Development only.

## Verification

`npm run check` and `npm run build:check`; `npm run qa` (every suite, since the harness now runs
with a Finnhub stand-in) with the new suite's screenshots read by eye; the new suite again against
a production build (`next build`, `next start`); a two-stage review of the code — eight reviewers,
each followed by a skeptic — whose confirmed findings are in the change (the index guard, the
two-minute window and the rolling budget, the ticker-shaped symbols and the signed-in ticket quote,
the switch's ownership, the sell dialog, the kept rows on a failed refresh). After deploy: the same
recorder on the live `/portfolio` — switching accounts changes no number, and the header line
carries the time.
