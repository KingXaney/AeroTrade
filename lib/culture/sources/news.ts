// Google News, a fixed set of youth-culture queries a day — never one per brand, so the catalog
// can grow without the request count growing. Through the topics' own search adapter and the
// NEWS_SEARCH_ENABLED kill switch. An article is an item; the press is the lagging source, and
// its items fold at the lowest weight (lib/culture/config.ts).

import {CULTURE_ITEM_BODY_CHARS} from "@/lib/culture/config";
import {CULTURE_CATEGORIES, type CultureCategory, type CultureItemInput} from "@/lib/culture/types";
import {buildSearchQuery, fetchNewsForQuery} from "@/lib/news/adapters/search";
import {newsSearchEnabled, SEARCH_WINDOW} from "@/lib/news/config";
import {dedupeArticles} from "@/lib/news/dedupe";
import type {MarketNewsArticle} from "@/lib/news/types";

export type NewsQuery = {name: string; keywords: string[]};

// What the press writes when young consumers move: eight fixed angles.
export const CULTURE_NEWS_QUERIES: readonly NewsQuery[] = [
    {name: 'gen z brands', keywords: ['Gen Z brand', 'Gen Z favorite brands']},
    {name: 'viral products', keywords: ['viral TikTok product', 'TikTok made me buy it']},
    {name: 'sold out', keywords: ['sold out in minutes', 'sold out drop']},
    {name: 'teens', keywords: ['teens favorite app', 'teen survey brands']},
    {name: 'sneaker releases', keywords: ['sneaker release', 'sneaker drop']},
    {name: 'energy drinks', keywords: ['energy drink launch', 'new energy drink']},
    {name: 'collabs', keywords: ['collab drop', 'brand collaboration launch']},
    {name: 'back to school', keywords: ['back to school brands', 'back to school shopping']},
];

// One query per catalog category, so a quiet angle is still read once a day.
export const CATEGORY_SEARCH_TERMS: Record<CultureCategory, string[]> = {
    'drinks': ['energy drink trend', 'soda brand Gen Z'],
    'snacks': ['snack brand trend', 'candy craze'],
    'fast-food': ['fast food chain Gen Z', 'restaurant chain teens'],
    'apparel': ['clothing brand Gen Z', 'fashion trend teens'],
    'footwear': ['sneaker trend', 'shoe brand teens'],
    'beauty': ['skincare brand Gen Z', 'makeup brand teens'],
    'devices': ['gadget teens', 'phone upgrade Gen Z'],
    'apps': ['app Gen Z', 'social media app teens'],
    'gaming': ['video game release', 'gaming trend teens'],
    'streaming': ['streaming teens', 'concert tickets Gen Z'],
    'fitness': ['fitness trend Gen Z', 'wellness trend teens'],
    'money': ['Gen Z money app', 'buy now pay later Gen Z'],
    'retail': ['retailer Gen Z', 'thrift resale Gen Z'],
    'toys': ['collectible toy craze', 'blind box craze'],
};

export const categoryQueries = (): NewsQuery[] =>
    CULTURE_CATEGORIES.map((category) => ({name: category, keywords: CATEGORY_SEARCH_TERMS[category]}));

// Every query as the search adapter takes it (operators stripped, the recency window appended).
export const cultureNewsQueries = (): string[] =>
    [...CULTURE_NEWS_QUERIES, ...categoryQueries()]
        .map((query) => buildSearchQuery(query.keywords, [], {window: SEARCH_WINDOW}))
        .filter((query) => query.length > 0);

export const toNewsItem = (article: MarketNewsArticle): CultureItemInput => ({
    source: 'news',
    sourceName: article.source,
    title: article.headline,
    body: (article.fullSummary || article.summary || '').replace(/\s+/g, ' ').trim().slice(0, CULTURE_ITEM_BODY_CHARS),
    url: article.url,
    datetime: article.datetime,
});

export type NewsFetch = {items: CultureItemInput[]; ok: boolean; skipped: boolean; queries: number};

type FetchOptions = {fetchQuery?: typeof fetchNewsForQuery; enabled?: () => boolean; gapMs?: number};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// The queries' articles, deduped across them, as items. One query failing never costs the rest.
export const fetchCultureNews = async (
    queries: readonly string[],
    {fetchQuery = fetchNewsForQuery, enabled = newsSearchEnabled, gapMs = 0}: FetchOptions = {},
): Promise<NewsFetch> => {
    if (!enabled()) return {items: [], ok: true, skipped: true, queries: queries.length};
    const articles: MarketNewsArticle[] = [];
    let ok = true;
    for (let i = 0; i < queries.length; i++) {
        if (i > 0 && gapMs > 0) await sleep(gapMs);
        try {
            articles.push(...await fetchQuery(queries[i], {limit: 40}));
        } catch (error) {
            ok = false;
            console.error(`Culture news query failed: ${queries[i]}`, error);
        }
    }
    return {items: dedupeArticles(articles).map(toNewsItem), ok, skipped: false, queries: queries.length};
};
