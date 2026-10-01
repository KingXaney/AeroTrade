// A news article: raw from a source, and as the feed, the topics and the brain use it.

export type NewsSourceType = 'finance' | 'rss' | 'web' | 'reddit' | 'sec';

export type MarketNewsArticle = {
    id: number;
    headline: string;
    summary: string;
    source: string;
    url: string;
    datetime: number;
    category: string;
    related: string;
    image?: string;
    sourceType?: NewsSourceType;
    fullSummary?: string;     // untruncated text for the news brain
    // Set when the article reached the feed through a followed topic, so the card can
    // say which one. Absent on everything fetched from a wire or a Google section.
    topic?: {name: string; slug: string; color: string | null};
};

export type RawNewsArticle = {
    id: number;
    headline?: string;
    summary?: string;
    source?: string;
    url?: string;
    datetime?: number;
    image?: string;
    category?: string;
    related?: string;
    sourceTitle?: string;     // outlet named by an RSS <source> element, when the feed carries one
};
