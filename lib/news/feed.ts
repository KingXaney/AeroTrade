// Server-side pure half of the news feed: preferences → concrete requests, and fetched
// batches → one merged, deduped, bounded list. Still no I/O — feed-store.ts does the
// fetching — so every rule here is unit-tested with fixtures.
//
// Not client-safe: buildSearchQuery lives in the search adapter, which reaches the XML
// parser through rss.ts. The editor imports lib/news/feed-prefs directly.

import {buildSearchQuery, searchUrlFor} from '@/lib/news/adapters/search';
import {dedupeArticles} from '@/lib/news/dedupe';
import {FEED_DIGEST_CAP, FEED_MAX_AGE_SECONDS, GOOGLE_NEWS_BASE, hashId, TOTAL_ARTICLE_CAP} from '@/lib/news/config';
import {
    NEWS_CATEGORIES,
    NEWS_REGIONS,
    planFeedSlots,
    outletKey,
    type FeedSlot,
    type GoogleEdition,
    type NewsCategoryId,
    type NewsFeedPrefs,
    type NewsRegionId,
} from '@/lib/news/feed-prefs';

export * from '@/lib/news/feed-prefs';

// 'topics' is not a request — it is the stored followed-topic articles, injected straight
// into the merge. It has no URL and never reaches feedRequestsFor or planFeedSlots.
export type FeedRequestKind = FeedSlot['kind'] | 'finnhub' | 'topics';

export type FeedRequest = {
    kind: FeedRequestKind;
    /** A Google News RSS URL, or null for the non-Google slots (markets wires, watchlist, Finnhub). */
    url: string | null;
    label: string;
    /** Keep the feed's own order (Google's editorial prominence) instead of sorting by time. */
    keepFeedOrder: boolean;
    region?: NewsRegionId;
    category?: NewsCategoryId;
};

// Don't ask Google for what mergeFeed would throw away: the keyword slot's recency window
// is derived from the feed's own age cut, so the two cannot drift apart. Without any window
// Google News search ranks by relevance and happily returns results months old.
const FEED_SEARCH_WINDOW = `${Math.max(1, Math.round(FEED_MAX_AGE_SECONDS / 86400))}d`;

const editionOf = (region: NewsRegionId): GoogleEdition =>
    (NEWS_REGIONS.find((r) => r.id === region) ?? NEWS_REGIONS[0]).edition;
const editionQuery = (e: GoogleEdition): string => `hl=${e.hl}&gl=${e.gl}&ceid=${e.ceid}`;
const categoryOf = (id: NewsCategoryId) => NEWS_CATEGORIES.find((c) => c.id === id);

// Outlets are never put into the search query: cleanTerm strips operators by design, and a
// "-Reuters" term would drop every story that merely mentions Reuters. Outlet filtering is
// post-fetch only (filterBySources). User text reaches a URL only inside encodeURIComponent.
const toRequest = (prefs: NewsFeedPrefs, slot: FeedSlot): FeedRequest | null => {
    switch (slot.kind) {
        case 'search': {
            const query = buildSearchQuery(prefs.keywords, [], {window: FEED_SEARCH_WINDOW});
            if (!query) return null;
            return {kind: 'search', url: searchUrlFor(query, editionOf(prefs.regions[0] ?? 'US')), label: 'Your keywords', keepFeedOrder: false};
        }
        case 'top':
            return {kind: 'top', region: slot.region, url: `${GOOGLE_NEWS_BASE}?${editionQuery(editionOf(slot.region))}`, label: `Top stories · ${slot.region}`, keepFeedOrder: true};
        case 'section': {
            const category = categoryOf(slot.category);
            if (!category?.section) return null;
            return {
                kind: 'section', category: slot.category, region: slot.region,
                url: `${GOOGLE_NEWS_BASE}/headlines/section/topic/${category.section}?${editionQuery(editionOf(slot.region))}`,
                label: `${category.label} · ${slot.region}`,
                keepFeedOrder: true,
            };
        }
        case 'markets':
            return {kind: 'markets', url: null, label: 'Markets', keepFeedOrder: false};
        case 'watchlist':
            return {kind: 'watchlist', url: null, label: 'Your watchlist', keepFeedOrder: false};
    }
};

export const feedRequestsFor = (prefs: NewsFeedPrefs): FeedRequest[] =>
    planFeedSlots(prefs).slots.map((slot) => toRequest(prefs, slot)).filter((r): r is FeedRequest => r !== null);

// Include narrows to the listed outlets; hide removes. Empty lists hand back the same array.
export const filterBySources = (
    articles: MarketNewsArticle[],
    prefs: Pick<NewsFeedPrefs, 'includeSources' | 'excludeSources'>,
): MarketNewsArticle[] => {
    if (prefs.includeSources.length === 0 && prefs.excludeSources.length === 0) return articles;
    const include = new Set(prefs.includeSources.map(outletKey));
    const exclude = new Set(prefs.excludeSources.map(outletKey));
    return articles.filter((a) => {
        const key = outletKey(a.source ?? '');
        if (include.size > 0 && !include.has(key)) return false;
        return !exclude.has(key);
    });
};

// Google article ids are case-sensitive base64url, so this keeps case where normalizeUrl
// (built for tracking-parameter noise on publisher URLs) would lowercase and could merge
// two different stories. Query and fragment carry only tracking (?oc=5).
export const feedUrlKey = (url: string): string => url.split('#')[0].split('?')[0].replace(/\/+$/, '');

const headlineKey = (headline: string): string =>
    headline.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export type FeedBatch = {kind: FeedRequestKind; articles: MarketNewsArticle[]};

// The ranking rule. Batches arrive in request priority. Take one unseen article from each
// in turn until the limit — so a 70-item section can never swamp the 38-item front page,
// and every feed the user picked gets a bounded share. Within a batch the fetcher's order
// stands: Google's editorial prominence for the front page and sections (the rank is a
// cross-outlet signal a time sort would throw away), newest-first for search and wires.
// `now` is injected so the age cut is deterministic and nothing here reads the clock.
export const mergeFeed = (
    batches: FeedBatch[],
    {limit, now = Math.floor(Date.now() / 1000), maxAgeSeconds = FEED_MAX_AGE_SECONDS}: {limit: number; now?: number; maxAgeSeconds?: number},
): MarketNewsArticle[] => {
    const cutoff = now - maxAgeSeconds;
    const queues = batches.map((b) => b.articles.filter((a) => typeof a.datetime === 'number' && a.datetime >= cutoff));
    const cursors = queues.map(() => 0);
    const seenUrls = new Set<string>();
    const seenHeadlines = new Set<string>();
    const out: MarketNewsArticle[] = [];

    let progressed = true;
    while (out.length < limit && progressed) {
        progressed = false;
        for (let i = 0; i < queues.length && out.length < limit; i++) {
            const queue = queues[i];
            while (cursors[i] < queue.length) {
                const article = queue[cursors[i]++];
                const urlKey = feedUrlKey(article.url);
                const textKey = headlineKey(article.headline);
                if (seenUrls.has(urlKey) || seenHeadlines.has(textKey)) continue;
                seenUrls.add(urlKey);
                seenHeadlines.add(textKey);
                // formatArticle's `id + index` collides across batches; key on the URL instead.
                out.push({...article, id: hashId(urlKey)});
                progressed = true;
                break;
            }
        }
    }
    return out;
};

// The digest's article list with the user's feed folded in, under the email's total cap.
// The feed gets RESERVED room: the market pool arrives already trimmed to that same cap
// (SOURCE_CAPS sum to TOTAL_ARTICLE_CAP), so appending and re-slicing would squeeze the
// feed out entirely whenever every wire is healthy — the normal case. Only feed stories
// the pool does not already carry earn a slot, and the pool yields from its tail, which
// capAndOrder ordered finance → rss → sec → reddit, so social chatter goes first. An
// empty feed leaves the pool untouched. dedupeArticles is the digest's own rule.
export const pickDigestArticles = (
    aggregated: MarketNewsArticle[],
    feed: MarketNewsArticle[],
    {feedCap = FEED_DIGEST_CAP, totalCap = TOTAL_ARTICLE_CAP}: {feedCap?: number; totalCap?: number} = {},
): MarketNewsArticle[] => {
    const pool = dedupeArticles(aggregated);
    const tail = dedupeArticles([...pool, ...feed]).slice(pool.length, pool.length + Math.max(0, feedCap));
    const total = Math.max(0, totalCap);
    return [...pool.slice(0, Math.max(0, total - tail.length)), ...tail].slice(0, total);
};
