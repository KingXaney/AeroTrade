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
