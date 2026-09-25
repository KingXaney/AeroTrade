// Google News RSS — the search feed that makes open-ended followed topics possible, and
// (since the personal news feed) the query-less front page and topic sections too. No key
// needed; results are opaque redirect links, so headlines (not URLs) carry the identity.

import {FEED_REVALIDATE_SECONDS, GOOGLE_NEWS_BASE, GOOGLE_NEWS_SEARCH_BASE, searchUserAgent, US_EDITION, type GoogleEdition} from "@/lib/news/config";
import {parseRssXml} from "@/lib/news/adapters/rss";
import {formatArticle, validateArticle} from "@/lib/utils";
import {QUERY_MAX_CHARS, TOPIC_SEARCH_WINDOW, newsSearchEnabled} from "@/lib/topics/config";

type NextFetchInit = RequestInit & {next?: {revalidate: number}};

const SEARCH_SOURCE_NAME = 'Google News';

// Operators (site:, when:, quotes, parens) are stripped so user text can only ever be a term.
const cleanTerm = (term: string): string =>
    String(term ?? '')
        .replace(/[\u0000-\u001F\u007F]/g, ' ')
        .replace(/[":()]/g, ' ')
        .replace(/^-+/, '')
        .replace(/\s+/g, ' ')
        .trim();

const quoteTerm = (term: string): string => (/\s/.test(term) ? `"${term}"` : term);

// ("fed rate" OR fomc) -crypto when:1d — built incrementally so truncation never splits a
// phrase, and with the recency window reserved from the budget so it is never the thing
// that gets truncated away.
//
// The window is the ONLY operator that survives into a query. cleanTerm strips ':' from
// every user term before this point, so `when:` can only ever come from the constant here
// — a keyword of "when:1d" is already flattened to "when 1d" and matched as text.
export const buildSearchQuery = (
    keywords: string[],
    exclude: string[],
    {window = TOPIC_SEARCH_WINDOW}: {window?: string | null} = {},
): string => {
    const include = (keywords ?? []).map(cleanTerm).filter(Boolean);
    if (include.length === 0) return '';

    const suffix = window ? ` when:${window}` : '';
    const budget = QUERY_MAX_CHARS - suffix.length;

    const kept: string[] = [];
    for (const term of include) {
        const candidate = kept.length === 0 ? quoteTerm(term) : `(${[...kept, quoteTerm(term)].join(' OR ')})`;
        if (candidate.length > budget) break;
        kept.push(quoteTerm(term));
    }
    if (kept.length === 0) return '';
    let query = kept.length === 1 ? kept[0] : `(${kept.join(' OR ')})`;

    for (const term of (exclude ?? []).map(cleanTerm).filter(Boolean)) {
        const next = `${query} -${quoteTerm(term)}`;
        if (next.length > budget) break;
        query = next;
    }
    return `${query}${suffix}`;
};

export const searchUrlFor = (query: string, edition: GoogleEdition = US_EDITION): string =>
    `${GOOGLE_NEWS_SEARCH_BASE}?q=${encodeURIComponent(query)}&hl=${edition.hl}&gl=${edition.gl}&ceid=${edition.ceid}`;

const NAMED_ENTITIES: Record<string, string> = {
    nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>',
    rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', ndash: '–', mdash: '—', hellip: '…',
};

// The XML parser decodes XML entities; titles still carry HTML ones like &rsquo;.
export const decodeEntities = (value: string): string =>
    value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, code: string) => {
        if (code.startsWith('#')) {
            const hex = code[1] === 'x' || code[1] === 'X';
            const point = hex ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
            return Number.isFinite(point) && point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : match;
        }
        return NAMED_ENTITIES[code.toLowerCase()] ?? match;
    });

const isHttpUrl = (value: string): boolean => {
    try {
        const {protocol} = new URL(value);
        return protocol === 'http:' || protocol === 'https:';
    } catch {
        return false;
    }
};

// Google titles are "Headline - Outlet"; the <source> element, when present, is authoritative.
const splitHeadline = (title: string, sourceTitle?: string): {headline: string; source: string} => {
    const text = decodeEntities(title).replace(/\s+/g, ' ').trim();
    const cut = text.lastIndexOf(' - ');
    if (cut > 0) {
        const headline = text.slice(0, cut).trim();
        const trailing = text.slice(cut + 3).trim();
        if (headline && trailing) return {headline, source: sourceTitle?.trim() || trailing};
    }
    return {headline: text, source: sourceTitle?.trim() || SEARCH_SOURCE_NAME};
};

// Pure: feed XML → raw articles. Google's <description> is only a list of links, so
// the headline doubles as the summary.
export const parseSearchFeed = (xml: string): RawNewsArticle[] =>
    parseRssXml(xml, SEARCH_SOURCE_NAME)
        .filter((article) => isHttpUrl(article.url ?? ''))
        .map((article) => {
            const {headline, source} = splitHeadline(article.headline ?? '', article.sourceTitle);
            return {...article, headline, source, summary: headline};
        })
        .filter((article) => (article.headline ?? '').length > 0);

// Google returns the same story under several redirect ids: keep one per outlet+headline.
// keepFeedOrder preserves the feed's own order (the front page and topic sections are ranked
// by prominence, not time); the Map keeps first-insertion position even when a later
// duplicate replaces the value.
export const toSearchArticles = (raw: RawNewsArticle[], {keepFeedOrder = false}: {keepFeedOrder?: boolean} = {}): MarketNewsArticle[] => {
    const byKey = new Map<string, MarketNewsArticle>();
    raw.filter(validateArticle).forEach((article, index) => {
        const shaped: MarketNewsArticle = {
            ...formatArticle(article, false, undefined, index),
            sourceType: 'web',
            category: 'general',
            related: '',
        };
        const key = `${shaped.source}|${shaped.headline.toLowerCase()}`;
        const existing = byKey.get(key);
        if (!existing || existing.datetime < shaped.datetime) byKey.set(key, shaped);
    });
    const articles = Array.from(byKey.values());
    return keepFeedOrder ? articles : articles.sort((a, b) => b.datetime - a.datetime);
};

export type GoogleFeedOptions = {limit?: number; keepFeedOrder?: boolean};

// Any Google News RSS URL — search, front page or topic section. NEWS_SEARCH_ENABLED is the
// one kill switch for all of them. The URL must sit under the Google News base: this is the
// only fetch in the app that takes a URL built from user-influenced input, so it can never
// be pointed anywhere else.
export const fetchGoogleNewsFeed = async (url: string, {limit = 40, keepFeedOrder = false}: GoogleFeedOptions = {}): Promise<MarketNewsArticle[]> => {
    if (!newsSearchEnabled() || !url.startsWith(GOOGLE_NEWS_BASE)) return [];
    try {
        const init: NextFetchInit = {
            headers: {'User-Agent': searchUserAgent()},
            // Topic sections answer with a 302 to an opaque topic id; the cache stores the
            // final response.
            redirect: 'follow',
            next: {revalidate: FEED_REVALIDATE_SECONDS},
        };
        const response = await fetch(url, init);
        if (!response.ok) {
            console.error(`Google News feed failed: ${response.status} ${response.statusText}`);
            return [];
        }
        const articles = toSearchArticles(parseSearchFeed(await response.text()), {keepFeedOrder});
        // A 200 that parses to nothing is the shape of a redirect to a consent page; say so.
        if (articles.length === 0) console.warn(`Google News feed returned no items: ${url.split('?')[0]}`);
        return articles.slice(0, Math.max(0, limit));
    } catch (error) {
        console.error('Google News feed error:', error);
        return [];
    }
};

export const fetchNewsForQuery = async (query: string, options: GoogleFeedOptions = {}): Promise<MarketNewsArticle[]> =>
    query.trim() ? fetchGoogleNewsFeed(searchUrlFor(query), options) : [];
