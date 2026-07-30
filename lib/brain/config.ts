// Knobs for the news brain: dual-timescale decay, extraction budget, thesis detection.

// Fast layer answers "what's hot this week" (display); slow layer is persistent
// narrative mass and drives allocation.
export const HALF_LIFE_FAST_DAYS = 5;
export const HALF_LIFE_SLOW_DAYS = 60;
export const DAILY_DECAY_FAST = 0.5 ** (1 / HALF_LIFE_FAST_DAYS);   // ≈ 0.8706
export const DAILY_DECAY_SLOW = 0.5 ** (1 / HALF_LIFE_SLOW_DAYS);   // ≈ 0.9885

// Graph hygiene.
export const LINK_EPSILON = 0.05;
export const ENTITY_EPSILON = 0.02;
export const ENTITY_STALE_DAYS = 60;

// LLM extraction budget (Gemini free tier: strictly bounded, batched, sequenced).
export const EXTRACTION_BATCH_SIZE = 20;
export const MAX_EXTRACTION_CALLS_PER_DAY = 4;
export const EXTRACTION_MODEL = 'gemini-2.5-flash-lite';
export const UNEXTRACTED_PICKUP_LIMIT = 20;    // yesterday's overflow retried per run
export const NEW_TICKER_VERIFY_BUDGET = 10;    // Finnhub verifications per run
export const THEME_REUSE_LIST_SIZE = 30;       // active themes injected into the prompt
export const REDDIT_IMPORTANCE_CAP = 0.4;      // clamped deterministically post-parse

// Thesis detection on the slow layer: sustained narrative mass becomes a thesis;
// the thesis dies when slow weight falls below this fraction of its peak.
export const THESIS_WEIGHT_THRESHOLD = 5;
export const THESIS_EXIT_FRACTION = 0.4;

// The 11 GICS-ish sector slugs the extractor may use (whitelist-enforced).
export const SECTOR_SLUGS = [
    'energy',
    'technology',
    'financials',
    'healthcare',
    'industrials',
    'consumer-staples',
    'consumer-discretionary',
    'utilities',
    'materials',
    'real-estate',
    'communication-services',
] as const;

export type SectorSlug = (typeof SECTOR_SLUGS)[number];
