// Starter topics: the six seeded for every new account, plus the rest offered as chips.
// Keywords are written the way headlines phrase them (matching is whole-word and literal,
// so 'electric vehicle' does not hit 'electric vehicles'), already normalised so
// normalizeKeywordList drops nothing — it re-sorts, so compare these as sets, not arrays.
//
// The default set is finance-first with two world-news topics, because a terminal whose
// only opinion is the Fed reads like a terminal that has never heard of anywhere else.

import {slugify} from "@/lib/topics/normalize";

export type StarterGroup = 'finance' | 'world';

export type StarterTopic = {name: string; keywords: string[]; exclude?: string[]; group: StarterGroup};

export const STARTER_TOPICS: StarterTopic[] = [
    {
        name: 'Fed rate decisions',
        group: 'finance',
        keywords: ['federal reserve', 'fomc', 'fed funds rate', 'rate cut', 'rate hike', 'jerome powell', 'fed meeting', 'interest rate decision'],
    },
    {
        name: 'AI chips',
        group: 'finance',
        keywords: ['nvidia', 'ai chips', 'ai chip', 'ai accelerators', 'tsmc', 'data center gpu', 'blackwell', 'amd instinct'],
    },
    {
        name: 'Big Tech earnings',
        group: 'finance',
        keywords: ['big tech earnings', 'apple earnings', 'microsoft earnings', 'alphabet earnings', 'amazon earnings', 'meta earnings', 'nvidia earnings', 'magnificent seven'],
    },
    {
        name: 'Oil & energy',
        group: 'finance',
        keywords: ['crude oil', 'opec', 'brent crude', 'wti', 'natural gas', 'oil prices', 'oil production', 'lng'],
    },
    {
        // No bare 'war': whole-word matching would pull in "price war" and "bidding war".
        name: 'Geopolitics',
        group: 'world',
        keywords: ['geopolitical', 'sanctions', 'nato', 'united nations', 'ceasefire', 'peace talks', 'foreign policy', 'diplomatic talks'],
    },
    {
        name: 'World economy',
        group: 'world',
        keywords: ['global economy', 'imf', 'world bank', 'tariffs', 'trade war', 'supply chain', 'european central bank', 'bank of japan'],
    },
    {
        name: 'Electric vehicles',
        group: 'finance',
        keywords: ['electric vehicles', 'electric vehicle', 'ev sales', 'tesla', 'rivian', 'byd', 'ev charging', 'ev tax credit'],
    },
    {
        name: 'Crypto regulation',
        group: 'finance',
        keywords: ['crypto regulation', 'bitcoin etf', 'sec crypto', 'stablecoin bill', 'coinbase', 'crypto legislation', 'digital asset', 'cftc crypto'],
    },
    {
        name: 'Housing market',
        group: 'finance',
        keywords: ['housing market', 'mortgage rates', 'home prices', 'home sales', 'housing starts', 'homebuilders', 'case-shiller', 'rent prices'],
    },
    {
        name: 'US elections',
        group: 'world',
        keywords: ['us election', 'midterm elections', 'midterms', 'senate race', 'swing state', 'ballot measure', 'presidential election', 'election results'],
    },
];

// What a new account is seeded with. Named rather than sliced, so reordering the list
// above for the chip UI can never silently change what every new user receives.
export const DEFAULT_TOPIC_NAMES: readonly string[] = [
    'Fed rate decisions',
    'AI chips',
    'Big Tech earnings',
    'Oil & energy',
    'Geopolitics',
    'World economy',
];

export const defaultTopics = (): StarterTopic[] =>
    DEFAULT_TOPIC_NAMES
        .map((name) => STARTER_TOPICS.find((t) => t.name === name))
        .filter((t): t is StarterTopic => t !== undefined);

export const defaultTopicSlugs = (): string[] => defaultTopics().map((t) => slugify(t.name));

// Whether the user still has exactly what we seeded. Drives the one-line "these came
// preinstalled" notice, which then extinguishes itself the moment they add, remove or
// rename anything — no dismissal flag to store and no state to keep in sync.
export const isUntouchedDefaultSet = (slugs: readonly string[]): boolean => {
    const defaults = defaultTopicSlugs();
    if (slugs.length !== defaults.length) return false;
    const have = new Set(slugs);
    return defaults.every((slug) => have.has(slug));
};
