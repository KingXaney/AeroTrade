// Price-history knobs. Yahoo and Stooq are keyless EOD data — be polite and bounded.

export const BACKFILL_CALENDAR_DAYS = 730;     // ~504 trading bars, enough for 12-month momentum
export const BACKFILL_TRIGGER_GAP_DAYS = 10;   // stale beyond this → full backfill
export const TOPUP_CALENDAR_DAYS = 10;         // routine daily append window (covers holidays)
export const STOOQ_DELAY_MS = 300;             // between sequential symbol fetches
export const YAHOO_DELAY_MS = 1500;            // the spacing verified clean against Yahoo's chart endpoint
export const MAX_TRACKED_SYMBOLS = 50;

// Quant strategies need ~3 years of results after a 260-bar warm-up.
export const STRATEGY_BACKFILL_CALENDAR_DAYS = 1560;
// One Inngest step's worth of symbols: 12 × (Yahoo call + spacing) fits a 60 s route budget.
export const PRICE_CHUNK_SIZE = 12;

// The 13-week T-bill yield (a discount rate, annualised %) that paper cash earns interest
// at. Fetched like any symbol; it has no dividends and cannot split.
export const RATE_SYMBOL = '^IRX';

// Dividends become cash this many calendar days after their ex-date — about when a real pay
// date falls, and long enough for the ex-date's bar to settle before anyone relies on it
// (the bar fetched the next morning may not carry Yahoo's rebase yet). Accounts, the SPY
// total-return benchmark and the strategy simulator all use this one number.
export const DIVIDEND_PAY_LAG_DAYS = 5;

// Benchmark ETF snapshotted daily for the performance comparison chart.
export const BENCHMARK_SYMBOL = 'SPY';

// How long the Finnhub fetches behind the stock page's "Key numbers" are cached
// (lib/prices/finnhub.ts); the panel's source line states both, from these.
export const FINANCIALS_REVALIDATE_SECONDS = 60 * 60;
export const PROFILE_REVALIDATE_SECONDS = 24 * 60 * 60;

// ---- The quote sheet (lib/prices/quotes.ts, lib/prices/quote-store.ts) ------------------------
// Every page reads a symbol's price from one stored row; these say how fresh that row is kept
// and how hard Finnhub's free plan (60 calls a minute, 30 a second) may be asked for it.

// While the session is open a row is current for the clock minute it was fetched in and the
// one after: everything fetched in one minute rolls on the same boundary, so a page's prices
// move together or not at all, and no symbol is ever asked twice within sixty seconds — a load
// two seconds before a minute's end and another two seconds after it are one refresh, not two.
export const QUOTE_WINDOW_MS = 60_000;
// After the close a row fetched this long past the bell stays current until the next open
// (the 16:10 ET snapshot job's quotes qualify, so the pages then show what the snapshot recorded).
export const QUOTE_CLOSE_SETTLE_MS = 2 * 60_000;
// A price this recent is shown as it is while its refresh runs behind the answer; an older one
// is refreshed before the page answers. Longer than a row is ever kept (two minutes at most),
// so a reader who keeps turning pages never waits on Finnhub.
export const QUOTE_SERVE_STALE_MS = 5 * 60_000;
// After an attempt that got no price, the symbol is left alone this long.
export const QUOTE_BACKOFF_MS = 60_000;
// While a refusal is this fresh the symbol is retried behind the answer, never waited on: an
// outage must not hold every page up for the fetch timeout, minute after minute.
export const QUOTE_REFUSAL_MEMORY_MS = 10 * 60_000;
// How long a refresh holds the rows it is fetching, so two requests never fetch one symbol.
export const QUOTE_CLAIM_MS = 15_000;
// A stored price older than this is not shown at all (the stored daily close has the same reach,
// lib/trading/config.CLOSE_FALLBACK_DAYS).
export const QUOTE_KEEP_DAYS = 7;
// A row nobody has asked about for this long is collected.
export const QUOTE_ROW_TTL_DAYS = 30;
// At most this many quote calls start in any stretch this long, whoever on the instance asks —
// a page's refresh, a second page's, a fill: under 30 calls a second.
export const QUOTE_BURST = 25;
export const QUOTE_BURST_SPACING_MS = 1_050;
// A quote that has not answered by then is a refusal; a page never hangs on Finnhub.
export const QUOTE_FETCH_TIMEOUT_MS = 4_000;
// The last sixty seconds' quote calls, counted for every instance together: a page's refresh
// takes what is left under the first ceiling, one asked symbol (the order ticket, the chat) goes
// ahead under the second, and a quote a fill, the snapshot job or a plan acts on is never
// refused, only counted before it is asked — so a page that comes after them takes less. A page
// that came first has already taken its share: the ceiling leaves a job 20 calls of the plan's
// 60 in that minute, not a guarantee.
export const QUOTE_PAGE_CEILING = 40;
export const QUOTE_ASKED_CEILING = 52;
// A batch of acting quotes (the snapshot job's chunk, a plan's symbols) that would take the last
// sixty seconds past this waits one minute before it asks, once: by then whatever a page spent
// first has left the window, so the batch is not refused for it. A single quote (a fill) never
// waits. Under the plan's 60 by the few calls that are not counted (profiles, search, news).
export const QUOTE_ACTING_CEILING = 56;
export const QUOTE_ACTING_WAIT_MS = 60_000;
