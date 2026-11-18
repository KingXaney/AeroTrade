---
paths:
  - "lib/prices/**"
  - "lib/actions/stocks.actions.ts"
  - "database/models/price-*.model.ts"
  - "database/index-guard.ts"
---

# prices

Contracts of this feature that a map cannot show: a part of `AGENTS.md`, kept in a file of its
own so it loads only beside the files its `paths:` name. A `### name` in the text is that
feature's file in this folder; Shared, owner and the numbered invariants are in `AGENTS.md`;
the map is `docs/MAP.md`.

- Daily bars come from Yahoo first, Stooq as the fallback (`lib/prices/store`), alongside
  dividends, the T-bill rate, the SPY total-return index, signals and the NYSE calendar
  (`lib/prices/market-hours`). The app writes a share class as Finnhub does (`BRK.B`); the providers
  are asked for `BRK-B` (`yahooTicker`, `stooqTicker`). `PriceSeriesMeta.listedOn` is the company's
  first session from Yahoo's chart: a history that starts there is deep enough (`decideFetchWindow`)
  and its dividends are needed only from there (`lib/prices/coverage.coversWindow`).
- `lib/prices/finnhub` (profiles, financials, search, company news, and the raw quote call
  `fetchQuote`) is a plain module; client components reach search and quotes through
  `lib/actions/stocks.actions`. `FINNHUB_API_URL` points it, and the culture earnings calendar, at
  the browser QA's stand-in.
- The quote sheet is the one way a quote reaches the app: `lib/prices/quote-store` over one row
  per symbol (`database/models/price-quote.model.ts`), its rules pure in `lib/prices/quotes`
  (`windowStart`, `planRead`, `servable`, `askedPrice`, `grantedOfMinute`, `readQuoteAnswer`), its
  numbers in `lib/prices/config`. `lib/prices/quote-store.getSheetQuotes` is what a page SHOWS:
  answered from the rows, one answer per symbol per server render (a React `cache`d map, so the
  layout, the page and a page's second price map cannot disagree). A row is kept for the clock
  minute it was fetched in and the next — everything fetched in one minute falls due together,
  and no symbol is asked twice inside sixty seconds — then once after the close has settled until
  the next open (`lib/prices/market-hours.lastSessionClose`; the 16:10 snapshot's quotes qualify).
  The refresh runs behind the answer (`after()`) when every due price is under
  `QUOTE_SERVE_STALE_MS` old, or is one Finnhub just answered nothing for
  (`QUOTE_REFUSAL_MEMORY_MS`: an outage never holds every page up); before the answer for a symbol
  never asked about, a first page after idle, or `wait: 'current'` — one asked symbol (the order
  ticket's Last Price, the chat's quote), which is answered only with this window's price or a
  recent one, never an older row. A refresh takes the minute's budget first — one counter for
  every instance (`lib/rate-limit.bumpCounter`), read over the last sixty seconds: pages under
  `QUOTE_PAGE_CEILING`, an asked symbol under `QUOTE_ASKED_CEILING` — then claims the rows it may
  ask (two requests never fetch one symbol; a symbol the budget leaves out is never claimed, and
  one never seen gets no row), starts its calls through the instance's one pacer (`QUOTE_BURST`
  in any second), writes a price only over an older one, and reads an empty or zero answer, a
  refusal or a timeout as no price: the stored price stays, the symbol waits `QUOTE_BACKOFF_MS`,
  the refusal is filed once a refresh, and a failed write never costs the page the rows it read.
  Only a ticker-shaped string is a symbol (`normalizeSymbols`), and the ticket's two actions (its
  Last Price and its symbol search) answer the signed-in reader alone. `lib/prices/quote-store.getFreshQuotes` (and `getFreshQuote`) is
  what a fill, the snapshot job or a plan ACTS on: Finnhub asked at that moment, uncached (Next's
  fetch cache serves a stale entry of any age, and any `revalidatePath` makes it a miss), counted
  before it is asked and never refused — a batch the last sixty seconds have no room for waits a
  minute first (`QUOTE_ACTING_CEILING`), one quote never — then written into the sheet. A page
  that comes after it takes less; a page that came first has already taken its share.
  `lib/prices/__tests__/quote-guard.test.ts` keeps `fetchQuote` to the store alone. The store
  builds the model's unique index itself, after connecting, through `database/index-guard.indexGuard`
  — the one way a write that relies on an index asks for it (the daily brief's claim does too):
  never `await Model.init()`, which is rejected for good on a process whose model was compiled
  while the connection was opening. The guard shares one attempt, forgets a failure and never
  throws; a caller that cannot go on without the index (the claim) refuses for itself. Without a key the sheet
  answers nothing and reads nothing. `QUOTE_SESSION=open` is the browser QA's: every instant in
  session. The design and its measurements: `docs/specs/2026-11-10-steady-prices.md`.
- `lib/prices/action-limits` (import-free) holds the per-reader counts on the two actions that ask
  Finnhub on a person's say-so, counted by `lib/rate-limit.takeRateLimit`: the stock search twice
  — 60 a minute (`search:<userId>`), which a reader typing the longest query a key at a time does
  not reach, and 300 an hour (`search:hour:<userId>`), which a loop meets in five minutes — and an
  order 20 a minute (`order:<userId>`). `searchQuery` is the search's input check: a string of at
  most 40 characters, trimmed, read before anything is spent. `lib/actions/stocks.actions.searchStocks`
  answers the stocks found (none is `[]`) or `null` when the search did not answer — no session,
  the count spent, or Finnhub gave nothing back (`lib/prices/finnhub.findStocks`) — and the boxes
  never say "no stocks found" of a search that did not look (`lib/shell/palette`). Nothing typed
  is the popular list, which asks Finnhub nothing and is not counted.
