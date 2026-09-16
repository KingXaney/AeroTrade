// Starter topics offered on the empty state. Keywords are written the way headlines
// phrase them (matching is whole-word and literal, so 'electric vehicle' does not hit
// 'electric vehicles'), already normalised so they pass normalizeKeywordList unchanged.

export type StarterTopic = {name: string; keywords: string[]; exclude?: string[]};

export const STARTER_TOPICS: StarterTopic[] = [
    {
        name: 'Fed rate decisions',
        keywords: ['federal reserve', 'fomc', 'fed funds rate', 'rate cut', 'rate hike', 'jerome powell', 'fed meeting', 'interest rate decision'],
    },
    {
        name: 'AI chips',
        keywords: ['nvidia', 'ai chips', 'ai chip', 'ai accelerators', 'tsmc', 'data center gpu', 'blackwell', 'amd instinct'],
    },
    {
        name: 'Electric vehicles',
        keywords: ['electric vehicles', 'electric vehicle', 'ev sales', 'tesla', 'rivian', 'byd', 'ev charging', 'ev tax credit'],
    },
    {
        name: 'Crypto regulation',
        keywords: ['crypto regulation', 'bitcoin etf', 'sec crypto', 'stablecoin bill', 'coinbase', 'crypto legislation', 'digital asset', 'cftc crypto'],
    },
    {
        name: 'Housing market',
        keywords: ['housing market', 'mortgage rates', 'home prices', 'home sales', 'housing starts', 'homebuilders', 'case-shiller', 'rent prices'],
    },
    {
        name: 'US elections',
        keywords: ['us election', 'midterm elections', 'midterms', 'senate race', 'swing state', 'ballot measure', 'presidential election', 'election results'],
    },
    {
        name: 'Oil & energy',
        keywords: ['crude oil', 'opec', 'brent crude', 'wti', 'natural gas', 'oil prices', 'oil production', 'lng'],
    },
    {
        name: 'Big Tech earnings',
        keywords: ['big tech earnings', 'apple earnings', 'microsoft earnings', 'alphabet earnings', 'amazon earnings', 'meta earnings', 'nvidia earnings', 'magnificent seven'],
    },
];
