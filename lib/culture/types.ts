// The culture brain's shapes: a catalog brand, its listed owner, and what the daily job stores
// about it. Import-free and client-safe, so the page, the tests and the job share one vocabulary.

// Where a brand sits in a young consumer's day. A category is also the denominator of the
// Quiet picker's category-share term, so a private brand's surge counts against its listed peers.
export const CULTURE_CATEGORIES = [
    'drinks', 'snacks', 'fast-food', 'apparel', 'footwear', 'beauty', 'devices',
    'apps', 'gaming', 'streaming', 'fitness', 'money', 'retail', 'toys',
] as const;
export type CultureCategory = (typeof CULTURE_CATEGORIES)[number];

// How a brand's owner trades: a US listing, an NYSE/Nasdaq ADR, or an over-the-counter ADR
// that Finnhub's free tier may not quote (the universe verifies, never assumes).
export type Listing = 'us' | 'adr' | 'otc';

// A plain alias matches case-insensitively as a whole word; a cased alias matches only as
// written ('Target', 'Gap', 'Prime', 'On'), so the common noun never counts as the brand.
export type BrandAlias = string | {term: string; cased: true};

export type BrandOwner = {
    company: string;
    // The same shape the news brain's ticker guard accepts.
    ticker: string;
    listing: Listing;
    // 'YYYY-MM-DD': the acquisition or listing date, so the backtest treats the brand as untraded
    // before it (Poppi → PepsiCo in 2025, Rhode → e.l.f. in 2025).
    since?: string;
};

export type CultureBrand = {
    // Kebab-case, unique, never renamed: it is the entity key and the attention series key.
    id: string;
    name: string;
    category: CultureCategory;
    // The name itself is NOT implied — list it, so a brand called 'On' can leave it out.
    aliases: readonly BrandAlias[];
    // null = private or otherwise untradable: tracked for context, never traded.
    owner: BrandOwner | null;
    // Free text when the owner is null ('ByteDance', 'Grupo Bimbo').
    parent?: string;
    // Article titles as the pageviews API wants them (underscores, exact case); views are summed.
    wikipedia: readonly string[];
    // App Store `artistName` values, matched exactly (case-insensitive).
    appArtists?: readonly string[];
    // App Store app names, matched exactly (case-insensitive); tried before the artist.
    appNames?: readonly string[];
    // Only the optional YouTube search rotation reads this (off by default).
    youtubeQuery?: string;
};

// The sources the daily job stores an attention row or an item from.
export const CULTURE_SOURCES = ['wikipedia', 'appstore', 'youtube', 'reddit', 'news', 'social'] as const;
export type CultureSource = (typeof CULTURE_SOURCES)[number];

// The sources that produce items (text the model labels); the other two produce series only.
export type CultureItemSource = 'reddit' | 'news' | 'youtube' | 'social';

// A point of a brand's daily attention series: a day and a value where more means more
// attention (pageviews, a chart score, a count of items).
export type AttentionPoint = {date: string; value: number};

// One stored attention row as the adapters hand it to the store.
export type AttentionRow = {brand: string; source: CultureSource; date: string; value: number};

// An item as an adapter hands it to the store (before it is deduped and stored).
export type CultureItemInput = {
    source: CultureItemSource;
    // 'r/GenZ', an outlet, a channel.
    sourceName: string;
    title: string;
    body: string;
    url: string;
    // Unix seconds.
    datetime: number;
    // Reddit score, YouTube views; absent for news.
    score?: number;
};

// The model's label for what an item says about a brand.
export const CULTURE_SIGNALS = ['adoption', 'hype', 'backlash', 'substitution', 'drop', 'price', 'fading', 'other'] as const;
export type CultureSignal = (typeof CULTURE_SIGNALS)[number];

// One brand's mention inside an item, as the fold reads it.
export type CultureMention = {key: string; sentiment: number; relevance: number};

// What the fold takes: an item the model (or the alias matcher) read, or a day's attention
// surprise from a series. Both carry the source so the planner can weigh them.
export type CultureFold = {
    kind: 'item' | 'attention';
    source: CultureSource;
    importance: number;
    entities: CultureMention[];
};

// A brand entity as the pages, the widgets and the picker read it.
export type CultureEntitySummary = {
    key: string;
    displayName: string;
    category: CultureCategory;
    ticker: string | null;
    listing: Listing | null;
    weightFast: number;
    weightSlow: number;
    sentimentFast: number;
    sentimentSlow: number;
    thesisSince: number | null;
    lastSeenAt: number;
};
