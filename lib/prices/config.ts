// Price-history knobs. Stooq is keyless EOD data — be polite and bounded.

export const BACKFILL_CALENDAR_DAYS = 730;     // ~504 trading bars, enough for 12-month momentum
export const BACKFILL_TRIGGER_GAP_DAYS = 10;   // stale beyond this → full backfill
export const TOPUP_CALENDAR_DAYS = 10;         // routine daily append window (covers holidays)
export const STOOQ_DELAY_MS = 300;             // between sequential symbol fetches
export const MAX_TRACKED_SYMBOLS = 50;
