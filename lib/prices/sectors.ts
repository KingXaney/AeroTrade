// The bridge between the brain's sectors and the tradable sector ETFs. The brain stores a
// sector as the entity 'sector:<slug>'; the universes hold ETFs. Without this map a sector
// narrative — often the heaviest thing in the brain — could not reach any symbol the
// Navigator may buy, and the strategies' sector universe would have no list. Pure.

import {SECTOR_KEY_PREFIX, type SectorSlug} from "@/lib/brain/config";

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
