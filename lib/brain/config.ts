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
// This is the binding constraint on how much the brain can read: raising the ingest
// caps without raising this only queues articles that never get tagged. Batch size ×
// this budget is the daily article ceiling, and it is sized to match BRAIN_TOTAL_CAP.
export const EXTRACTION_BATCH_SIZE = 20;
export const MAX_EXTRACTION_CALLS_PER_DAY = 8;
// Model choice now lives in lib/ai/models.ts, keyed by task and tier, so the free
// tier still resolves to gemini-2.5-flash-lite for every one of these jobs.
export const UNEXTRACTED_PICKUP_LIMIT = 20;    // yesterday's overflow retried per run
export const NEW_TICKER_VERIFY_BUDGET = 10;    // Finnhub verifications per run
export const THEME_REUSE_LIST_SIZE = 30;       // active themes injected into the prompt
export const REDDIT_IMPORTANCE_CAP = 0.4;      // clamped deterministically post-parse

// How a piece is written, apart from what it covers (the event type): a newsroom reporting,
// the company speaking for itself, a columnist's take, or an unconfirmed claim. The extractor
// labels it, lib/brain/trust.ts may settle it from the outlet, and sanitizeExtraction clamps on
// it — the label is untrusted and only ever lowers a weight.
export const NATURES = ['reported', 'company', 'opinion', 'rumour'] as const;
export type Nature = (typeof NATURES)[number];
// An opinion piece or a rumour counts at most this much importance, however the model rated it.
export const TAKE_IMPORTANCE_CAP = 0.3;
// The share of a piece's tone that joins a name's sentiment average, by nature. Attention
// (importance × relevance) always counts in full: a loud take still shows that people are
// talking, it just does not steer the sentiment.
export const SENTIMENT_SHARE_BY_NATURE: Readonly<Record<Nature, number>> = {reported: 1, company: 0.5, opinion: 0.5, rumour: 0};
// A piece from an outlet that is mostly commentary (lib/brain/trust.ts) weighs this share of
// its importance.
export const COMMENTARY_IMPORTANCE_SHARE = 0.6;

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

// A sector is stored as the entity 'sector:<slug>'.
export const SECTOR_KEY_PREFIX = 'sector:';
