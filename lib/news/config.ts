// Single knob file for the multi-source news digest — feeds, caps, and identity strings are swappable here without code changes.

export type NewsFeed = {name: string; url: string};

export const RSS_FEEDS: NewsFeed[] = [
    {name: "CNBC Top News", url: "https://www.cnbc.com/id/100003114/device/rss/rss.html"},
    {name: "MarketWatch Top Stories", url: "https://feeds.content.dowjones.io/public/rss/mw_topstories"},
    {name: "Yahoo Finance", url: "https://finance.yahoo.com/news/rssindex"},
];

export const yahooSymbolFeed = (symbol: string): NewsFeed => {
    const upper = symbol.toUpperCase();
    return {
        name: `Yahoo Finance ${upper}`,
        url: `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${upper}&region=US&lang=en-US`,
    };
};

export const MAX_SYMBOL_FEEDS = 5;

export const SUBREDDITS: {name: string; minScore: number}[] = [
    {name: "stocks", minScore: 50},
    {name: "wallstreetbets", minScore: 100},
];

export const REDDIT_POST_LIMIT = 25;

export const SEC_FORM_TYPES = ["8-K", "10-Q", "10-K"];

export const SEC_LOOKBACK_DAYS = 7;

export const SEC_MAX_SYMBOLS = 10;

export const SOURCE_CAPS: Record<NewsSourceType, number> = {finance: 6, rss: 6, reddit: 4, sec: 4};

export const TOTAL_ARTICLE_CAP = 16;

// The news brain ingests with wider caps than the email digest.
export const BRAIN_SOURCE_CAPS: Record<NewsSourceType, number> = {finance: 18, rss: 18, reddit: 8, sec: 4};
export const BRAIN_TOTAL_CAP = 40;

export const FEED_REVALIDATE_SECONDS = 900;

export const contactEmail = (): string => process.env.SEC_CONTACT_EMAIL || "contact@aerotrade.local";

export const redditUserAgent = (): string => "AeroTrade/1.0 (paper-trading news digest; contact " + contactEmail() + ")";

export const secUserAgent = (): string => "AeroTrade " + contactEmail();

// djb2 constants — named so the hash stays auditable without magic numbers inline.
const DJB2_SEED = 5381;
const DJB2_SHIFT = 5;

export const hashId = (input: string): number => {
    let hash = DJB2_SEED;
    for (let i = 0; i < input.length; i++) {
        // hash * 33 + charCode, forced into 32-bit space each step to stay deterministic.
        hash = ((hash << DJB2_SHIFT) + hash + input.charCodeAt(i)) | 0;
    }
    // >>> 0 coerces to unsigned so ids are always positive 32-bit integers, stable across runs.
    return hash >>> 0;
};
