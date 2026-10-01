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
