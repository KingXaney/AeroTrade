// The user's news feed preference: what it is, its bounds, and the pure maths every
// surface shares — the editor (client), the save action (server) and the fetch planner.
//
// Client-safe on purpose: it depends only on zod, the topic keyword normaliser and the
// pure config knobs. lib/news/feed.ts (server) re-exports this and adds the URL builders
// and the merge, which drag the XML parser into the graph and must stay out of the bundle.
//
// "Default" is a value, never a stored document: saving the default unsets the field, and
// a missing field reads back as DEFAULT_NEWS_FEED. Every consumer goes through
// normalizeNewsFeed, so a tampered document degrades to a valid feed, never to an error.

import {z} from 'zod';
import {normalizeKeywordList} from '@/lib/topics/normalize';
import {KEYWORD_MAX, MAX_KEYWORDS} from '@/lib/topics/config';
import {MAX_FEED_REQUESTS, US_EDITION, type GoogleEdition} from '@/lib/news/config';

export type {GoogleEdition};

export type NewsCategoryId =
    | 'top' | 'world' | 'nation' | 'business' | 'technology' | 'science' | 'health' | 'sports' | 'entertainment' | 'markets';
export type NewsRegionId = 'US' | 'GB' | 'CA' | 'AU' | 'IN' | 'SG' | 'IE' | 'NZ' | 'ZA';

export type NewsCategory = {
    id: NewsCategoryId;
    label: string;
    hint: string;
    /** Google News topic section id, or null for the front page ('top') and the markets wires. */
    section: string | null;
};
export type NewsRegion = {id: NewsRegionId; label: string; edition: GoogleEdition};

// Canonical order. Normalisation re-sorts into it, so 'top' always leads a feed and the
// planner's priority (top first, then sections) falls out of the array order.
export const NEWS_CATEGORIES: readonly NewsCategory[] = [
    {id: 'top', label: 'Top stories', hint: "Google's front page — the biggest stories, every subject", section: null},
    {id: 'world', label: 'World', hint: 'International news', section: 'WORLD'},
    {id: 'nation', label: 'National', hint: 'Domestic news and politics for each region', section: 'NATION'},
    {id: 'business', label: 'Business', hint: 'Companies, economy and finance', section: 'BUSINESS'},
    {id: 'technology', label: 'Technology', hint: 'Tech and AI', section: 'TECHNOLOGY'},
    {id: 'science', label: 'Science', hint: 'Research, space and climate', section: 'SCIENCE'},
    {id: 'health', label: 'Health', hint: 'Medicine and public health', section: 'HEALTH'},
    {id: 'sports', label: 'Sports', hint: 'Scores and stories', section: 'SPORTS'},
    {id: 'entertainment', label: 'Entertainment', hint: 'Film, music and culture', section: 'ENTERTAINMENT'},
    {id: 'markets', label: 'Markets', hint: 'CNBC, MarketWatch and Yahoo Finance wires', section: null},
];

// English editions only in v1 (hl=en-XX). Every one of these returned a full front page
// and a WORLD section from this app's servers when the list was written.
const edition = (code: string): GoogleEdition => ({hl: `en-${code}`, gl: code, ceid: `${code}:en`});
export const NEWS_REGIONS: readonly NewsRegion[] = [
    {id: 'US', label: 'United States', edition: US_EDITION},
    {id: 'GB', label: 'United Kingdom', edition: edition('GB')},
    {id: 'CA', label: 'Canada', edition: edition('CA')},
    {id: 'AU', label: 'Australia', edition: edition('AU')},
    {id: 'IN', label: 'India', edition: edition('IN')},
    {id: 'SG', label: 'Singapore', edition: edition('SG')},
    {id: 'IE', label: 'Ireland', edition: edition('IE')},
    {id: 'NZ', label: 'New Zealand', edition: edition('NZ')},
    {id: 'ZA', label: 'South Africa', edition: edition('ZA')},
];

// Offered as one-click chips; anything else is typed. Spelled the way Google's <source>
// element spells them, so a chip matches without going through the domain heuristics.
export const SUGGESTED_OUTLETS: readonly string[] = [
    'Reuters', 'AP News', 'BBC', 'Bloomberg', 'CNBC', 'The Guardian', 'Financial Times',
    'The Wall Street Journal', 'The New York Times', 'NPR', 'Al Jazeera', 'TechCrunch',
];

export const MAX_FEED_CATEGORIES = 6;
export const MAX_FEED_REGIONS = 4;
export const MAX_FEED_OUTLETS = 12;
export const MAX_FEED_KEYWORDS = MAX_KEYWORDS;
export const OUTLET_MAX_CHARS = 60;
// Bound on the raw arrays before normalisation trims them (cf. MAX_INPUT_WIDGETS): a
// hostile payload cannot make the server sort ten thousand strings.
const MAX_INPUT_ITEMS = 32;

export type NewsFeedPrefs = {
    categories: NewsCategoryId[];
    regions: NewsRegionId[];
    /** When non-empty, only these outlets are shown. Display spelling is kept; matching uses outletKey. */
    includeSources: string[];
    excludeSources: string[];
    /** Normalised like topic keywords; fetched as one Google News search. */
    keywords: string[];
    /** Fold in Finnhub company news for the user's watchlist symbols. */
    includeWatchlist: boolean;
};

export const defaultNewsFeed = (): NewsFeedPrefs => ({
    categories: ['top'],
    regions: ['US'],
    includeSources: [],
    excludeSources: [],
    keywords: [],
    includeWatchlist: false,
});

// Read-only reference for comparisons; callers that need to mutate take defaultNewsFeed().
export const DEFAULT_NEWS_FEED: Readonly<NewsFeedPrefs> = defaultNewsFeed();

const list = (max: number, itemMax: number, what: string) =>
    z.array(z.string().max(itemMax, {error: `${what} can be at most ${itemMax} characters`}))
        .max(max, {error: `Too many ${what.toLowerCase()}s`})
        .default([]);

// Lenient by design: unknown keys are stripped and unknown ids are dropped later by
// normalizeNewsFeed. The schema only refuses shapes that cannot be meant.
export const NewsFeedSchema = z.object({
    categories: list(MAX_INPUT_ITEMS, 32, 'Category'),
    regions: list(MAX_INPUT_ITEMS, 8, 'Region'),
    includeSources: list(MAX_INPUT_ITEMS, OUTLET_MAX_CHARS, 'Outlet'),
    excludeSources: list(MAX_INPUT_ITEMS, OUTLET_MAX_CHARS, 'Outlet'),
    keywords: list(MAX_INPUT_ITEMS, KEYWORD_MAX, 'Keyword'),
    includeWatchlist: z.boolean().default(false),
});

export type NewsFeedInput = z.infer<typeof NewsFeedSchema>;

const CATEGORY_INDEX = new Map(NEWS_CATEGORIES.map((c, i) => [c.id as string, i]));
const REGION_INDEX = new Map(NEWS_REGIONS.map((r, i) => [r.id as string, i]));
const CATEGORY_LABEL = new Map(NEWS_CATEGORIES.map((c) => [c.id, c.label]));

export const isCategoryId = (value: unknown): value is NewsCategoryId =>
    typeof value === 'string' && CATEGORY_INDEX.has(value);
export const isRegionId = (value: unknown): value is NewsRegionId =>
    typeof value === 'string' && REGION_INDEX.has(value);

const pickIds = <T extends string>(raw: unknown, index: Map<string, number>, max: number): T[] => {
    if (!Array.isArray(raw)) return [];
    const seen = new Set<string>();
    for (const item of raw) {
        if (typeof item === 'string' && index.has(item)) seen.add(item);
    }
    return Array.from(seen)
        .sort((a, b) => (index.get(a) ?? 0) - (index.get(b) ?? 0))
        .slice(0, max) as T[];
};

// Identity of an outlet however it is spelled: "Reuters", "reuters.com" and
// "https://www.reuters.com/" agree; so do "The Guardian", "Guardian" and "theguardian.com".
// Known non-match: an outlet whose domain is an abbreviation ("latimes.com" vs
// "Los Angeles Times") — the suggested-outlets row spells names the way Google does.
export const outletKey = (name: string): string =>
    String(name ?? '')
        .normalize('NFKC')
        .trim()
        .toLowerCase()
        .replace(/^(https?:\/\/)?(www\.)?/, '')
        .replace(/\.(co\.uk|com|co|org|net|news|uk)(\/.*)?$/, '')
        .replace(/[^\p{L}\p{N}]+/gu, '')
        .replace(/^the/, '');

const cleanOutlets = (raw: unknown, max: number): string[] => {
    if (!Array.isArray(raw)) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of raw) {
        if (typeof item !== 'string') continue;
        const name = item.normalize('NFKC').replace(/\s+/g, ' ').trim();
        if (!name || name.length > OUTLET_MAX_CHARS) continue;
        const key = outletKey(name);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push(name);
        if (out.length >= max) break;
    }
    return out;
};

// Never throws. Anything unrecognised degrades to the default piece by piece, and a feed
// can never come out empty: with no categories, keywords or watchlist it is the front page.
export const normalizeNewsFeed = (input: unknown): NewsFeedPrefs => {
    if (typeof input !== 'object' || input === null) return defaultNewsFeed();
    const raw = input as Record<string, unknown>;

    const categories = pickIds<NewsCategoryId>(raw.categories, CATEGORY_INDEX, MAX_FEED_CATEGORIES);
    const regions = pickIds<NewsRegionId>(raw.regions, REGION_INDEX, MAX_FEED_REGIONS);
    const includeSources = cleanOutlets(raw.includeSources, MAX_FEED_OUTLETS);
    const included = new Set(includeSources.map(outletKey));
    // Include wins over hide: an outlet in both lists is one the user wants.
    const excludeSources = cleanOutlets(raw.excludeSources, MAX_FEED_OUTLETS).filter((o) => !included.has(outletKey(o)));
    const keywords = normalizeKeywordList(Array.isArray(raw.keywords) ? raw.keywords.filter((k): k is string => typeof k === 'string') : [], MAX_FEED_KEYWORDS);
    const includeWatchlist = raw.includeWatchlist === true;

    if (regions.length === 0) regions.push('US');
    if (categories.length === 0 && keywords.length === 0 && !includeWatchlist) categories.push('top');

    return {categories, regions, includeSources, excludeSources, keywords, includeWatchlist};
};

const sameSet = (a: readonly string[], b: readonly string[]): boolean => {
    if (a.length !== b.length) return false;
    const sa = [...a].sort();
    const sb = [...b].sort();
    return sa.every((v, i) => v === sb[i]);
};

// Order-insensitive; outlets compare by identity, not spelling. Meant for normalised
// values (run drafts through normalizeNewsFeed first).
export const newsFeedEqual = (a: NewsFeedPrefs, b: NewsFeedPrefs): boolean =>
    sameSet(a.categories, b.categories)
    && sameSet(a.regions, b.regions)
    && sameSet(a.includeSources.map(outletKey), b.includeSources.map(outletKey))
    && sameSet(a.excludeSources.map(outletKey), b.excludeSources.map(outletKey))
    && sameSet(a.keywords, b.keywords)
    && a.includeWatchlist === b.includeWatchlist;

export const isDefaultNewsFeed = (prefs: NewsFeedPrefs): boolean => newsFeedEqual(prefs, DEFAULT_NEWS_FEED);

const joinNames = (names: string[]): string =>
    names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
const count = (n: number, noun: string): string => `${n} ${noun}${n === 1 ? '' : 's'}`;

// One line that says what the feed is: "Top stories · US",
// "Top stories, World & Business · US, GB · 2 keywords · 1 outlet hidden · + watchlist".
export const describeNewsFeed = (prefs: NewsFeedPrefs): string => {
    const parts: string[] = [];
    const categories = prefs.categories.map((id) => CATEGORY_LABEL.get(id) ?? id);
    parts.push(categories.length > 0 ? joinNames(categories) : 'Your keywords');
    parts.push(prefs.regions.join(', '));
    if (prefs.keywords.length > 0 && categories.length > 0) parts.push(count(prefs.keywords.length, 'keyword'));
    if (prefs.includeSources.length > 0) parts.push(`only ${count(prefs.includeSources.length, 'outlet')}`);
    if (prefs.excludeSources.length > 0) parts.push(`${count(prefs.excludeSources.length, 'outlet')} hidden`);
    if (prefs.includeWatchlist) parts.push('+ watchlist');
    return parts.join(' · ');
};

export type FeedSlot =
    | {kind: 'search'}
    | {kind: 'markets'}
    | {kind: 'watchlist'}
    | {kind: 'top'; region: NewsRegionId}
    | {kind: 'section'; category: NewsCategoryId; region: NewsRegionId};

// What one page view will fetch, in priority order: the user's keywords first (their most
// explicit intent), then every category in canonical order across every region (so the
// front page comes before any section), then the markets wires, then the watchlist.
// This is the ONLY place the fan-out is truncated; `dropped` lets the editor say so.
export const planFeedSlots = (prefs: NewsFeedPrefs): {slots: FeedSlot[]; dropped: number} => {
    const all: FeedSlot[] = [];
    if (prefs.keywords.length > 0) all.push({kind: 'search'});
    for (const category of prefs.categories) {
        if (category === 'markets') continue;
        for (const region of prefs.regions) {
            all.push(category === 'top' ? {kind: 'top', region} : {kind: 'section', category, region});
        }
    }
    if (prefs.categories.includes('markets')) all.push({kind: 'markets'});
    if (prefs.includeWatchlist) all.push({kind: 'watchlist'});
    return {slots: all.slice(0, MAX_FEED_REQUESTS), dropped: Math.max(0, all.length - MAX_FEED_REQUESTS)};
};
