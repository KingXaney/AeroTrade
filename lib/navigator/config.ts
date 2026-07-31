// Rails for the AI Navigator — tuned for long-horizon thesis holding, not trading.
// Every trading decision flows through these deterministic constants; the LLM never
// picks positions or sizes.

import {type SectorSlug} from "@/lib/brain/config";

export const AI_NAVIGATOR_ACCOUNT_NAME = 'AI Navigator';

export const MAX_POSITIONS = 8;
export const MAX_POSITION_WEIGHT = 0.20;
export const MIN_CASH_WEIGHT = 0.10;
export const MAX_TRADES_PER_WEEK = 3;
export const MIN_HOLDING_TRADING_DAYS = 21;

// Ignore drifts below this fraction of equity — churn control.
export const REBALANCE_BAND = 0.05;

// Hysteresis: entering is harder than staying.
export const ENTRY_SCORE_THRESHOLD = 0.15;
export const EXIT_SCORE_THRESHOLD = 0.0;

// Hard exit triggers that override the minimum holding period.
export const HARD_STOP_DRAWDOWN = 0.25;        // vs avg cost

// Eligibility floor for open-universe symbols.
export const MIN_ARTICLES_FOR_ELIGIBILITY = 3;
export const MIN_DISTINCT_SOURCES = 2;
export const ELIGIBILITY_LOOKBACK_DAYS = 21;
export const MIN_PRICE_BARS = 126;

// Composite score mix — all news components read the SLOW brain layer. The news
// budget is split: 0.20 for the symbol's own coverage, 0.10 for the sector it
// belongs to. Momentum and thesis are untouched by that split.
export const SCORE_WEIGHTS = {newsSlow: 0.20, sentimentSlow: 0.15, momentumLong: 0.35, thesis: 0.20, sectorSlow: 0.10};
export const MOMENTUM_MIX = {r126: 0.5, r252: 0.3, r63: 0.2};
export const VOLATILITY_HAIRCUT = 0.8;         // applied to top-quintile 63d vol

// Sector ETFs are always eligible; SPY is the benchmark, SMH the semis proxy.
export const ALWAYS_ELIGIBLE_SYMBOLS = [
    'XLE', 'XLK', 'XLF', 'XLV', 'XLI', 'XLP', 'XLY', 'XLU', 'XLB', 'XLRE', 'XLC',
    'SPY', 'SMH',
];

// The brain stores sectors as 'sector:<slug>' entities, but the tradable universe
// holds ETFs. Without this bridge a sector narrative — often the heaviest thing in
// the brain — cannot reach any symbol the allocator is allowed to buy.
export const SECTOR_KEY_PREFIX = 'sector:';
export const sectorKeyFor = (slug: SectorSlug): string => `${SECTOR_KEY_PREFIX}${slug}`;

export const SECTOR_TO_ETF: Record<SectorSlug, string> = {
    'energy': 'XLE',
    'technology': 'XLK',
    'financials': 'XLF',
    'healthcare': 'XLV',
    'industrials': 'XLI',
    'consumer-staples': 'XLP',
    'consumer-discretionary': 'XLY',
    'utilities': 'XLU',
    'materials': 'XLB',
    'real-estate': 'XLRE',
    'communication-services': 'XLC',
};

// Reverse view for scoring: an ETF is a proxy for its sector, so it inherits that
// sector's narrative rather than looking like a symbol nobody has written about.
export const ETF_TO_SECTOR_KEY: Record<string, string> = Object.fromEntries(
    (Object.entries(SECTOR_TO_ETF) as [SectorSlug, string][]).map(([slug, etf]) => [etf, sectorKeyFor(slug)]),
);
