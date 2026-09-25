// Server-only: the news feed for one user, or for one preference (the digest job has no
// session). Reads live here, in a plain module, so they are never exposed as POST
// endpoints; the writes are in lib/actions/news-feed.actions.ts. The maths — which
// requests to make, how to filter and merge — is pure and tested in lib/news/feed.ts.

import {connectToDatabase} from "@/database/mongoose";
import UserPreferencesModel from "@/database/models/user-preferences.model";
import {getNews} from "@/lib/actions/finnhub.actions";
import {getCachedWatchlistSymbols} from "@/lib/dashboard/cached";
import {fetchGoogleNewsFeed} from "@/lib/news/adapters/search";
import {fetchRssNews} from "@/lib/news/adapters/rss";
import {FEED_FETCH_LIMIT, FEED_WATCHLIST_SYMBOL_CAP} from "@/lib/news/config";
import {
    defaultNewsFeed,
    feedRequestsFor,
    filterBySources,
    mergeFeed,
    normalizeNewsFeed,
    type FeedBatch,
    type FeedRequest,
    type NewsFeedPrefs,
} from "@/lib/news/feed";
import {toFeedArticles} from "@/lib/news/topic-batch";
import {getMergedTopicFeed} from "@/lib/topics/store";
import {newsSearchEnabled} from "@/lib/topics/config";

export type NewsFeedResult = {
    articles: MarketNewsArticle[];
    /** True when the feed is not what the user asked for: Google News is off or answered with nothing. */
    fallback: boolean;
    requested: number;
};

// Any failure reads as the default feed: a page never breaks on a preference.
export const getNewsFeedPrefs = async (userId: string): Promise<NewsFeedPrefs> => {
    try {
        await connectToDatabase();
        const prefs = await UserPreferencesModel.findOne({userId}).select('newsFeed').lean();
        return normalizeNewsFeed(prefs?.newsFeed);
    } catch (error) {
        console.error('Error reading news feed preference:', error);
        return defaultNewsFeed();
    }
};

// What stands in for Google News when it is switched off or empty: the same wires the
// digest runs on, plus Finnhub (watchlist company news when there is one, its market wire
// otherwise). Better than an empty page, and flagged so the page can say so.
const WIRES_FALLBACK: FeedRequest[] = [
    {kind: 'markets', url: null, label: 'Markets', keepFeedOrder: false},
    {kind: 'finnhub', url: null, label: 'Finnhub', keepFeedOrder: false},
];

const fetchRequest = (request: FeedRequest, symbols: string[]): Promise<MarketNewsArticle[]> => {
    switch (request.kind) {
        case 'top':
        case 'section':
        case 'search':
            return request.url
                ? fetchGoogleNewsFeed(request.url, {limit: FEED_FETCH_LIMIT, keepFeedOrder: request.keepFeedOrder})
                : Promise.resolve([]);
        case 'markets':
            return fetchRssNews();
        case 'watchlist':
            return symbols.length > 0 ? getNews(symbols.slice(0, FEED_WATCHLIST_SYMBOL_CAP)) : Promise.resolve([]);
        case 'finnhub':
            return getNews(symbols.length > 0 ? symbols.slice(0, FEED_WATCHLIST_SYMBOL_CAP) : undefined);
        case 'topics':
            // Unreachable: topic articles are read from Mongo and injected into the merge,
            // never planned as a request. Present so the switch stays exhaustive.
            return Promise.resolve([]);
    }
};

type RunResult = {batches: FeedBatch[]; googleAnswered: boolean};

// One dead source never empties the feed: each request settles on its own, and outlet
// filtering runs per batch so a hidden outlet cannot waste a rotation slot in the merge.
// Google's health is judged on its RAW answer, before the outlet filter and the age cut:
// a user who only wants a paywalled outlet, or whose keywords matched nothing today, has
// an empty feed, not an outage.
const runRequests = async (requests: FeedRequest[], prefs: NewsFeedPrefs, symbols: string[]): Promise<RunResult> => {
    const settled = await Promise.allSettled(requests.map((request) => fetchRequest(request, symbols)));
    const batches: FeedBatch[] = [];
    let googleAnswered = false;
    settled.forEach((result, i) => {
        if (result.status === 'fulfilled') {
            if (requests[i].url !== null && result.value.length > 0) googleAnswered = true;
            batches.push({kind: requests[i].kind, articles: filterBySources(result.value, prefs)});
        } else {
            console.error(`News feed request failed (${requests[i].label}):`, result.reason);
        }
    });
    return {batches, googleAnswered};
};

export const getNewsFeedForPrefs = async (
    prefs: NewsFeedPrefs,
    {limit, watchlistSymbols = [], topicArticles = []}: {limit: number; watchlistSymbols?: string[]; topicArticles?: MarketNewsArticle[]},
): Promise<NewsFeedResult> => {
    const planned = feedRequestsFor(prefs);
    const googlePlanned = planned.some((request) => request.url !== null);
    // The watchlist enters the feed — the Finnhub fallback included — only when the feed
    // asks for it, whatever a caller happens to have at hand.
    const symbols = prefs.includeWatchlist ? watchlistSymbols : [];

    // NEWS_SEARCH_ENABLED is the one kill switch for every Google News request. With it
    // off, keep the non-Google slots the user chose and add the wires.
    let requests = planned;
    let fallback = false;
    if (googlePlanned && !newsSearchEnabled()) {
        const kept = planned.filter((request) => request.url === null);
        requests = [...kept, ...WIRES_FALLBACK.filter((w) => !kept.some((k) => k.kind === w.kind))];
        fallback = true;
    }

    const first = await runRequests(requests, prefs, symbols);
    let batches = first.batches;
    // The outage test is deliberately made on the REQUESTED feed alone. Topic articles are
    // read from Mongo, so they can neither prove nor disprove that Google answered, and
    // letting them mask an outage would drop the "standing in" flag the page shows.
    if (googlePlanned && !fallback && !first.googleAnswered && mergeFeed(batches, {limit}).length === 0) {
        // Google answered with nothing (outage, a redirect to a consent page): the wires
        // beat an empty page, as long as the page says they are standing in.
        batches = (await runRequests(WIRES_FALLBACK, prefs, symbols)).batches;
        fallback = true;
    }

    // Topics lead the rotation: they are the most explicit statement of interest the user
    // has made. mergeFeed is round-robin, so this is a tie-break and a bounded share, not
    // a weighting — the topic batch can never swamp the rest of the feed.
    const topics: FeedBatch[] = topicArticles.length > 0 ? [{kind: 'topics', articles: topicArticles}] : [];
    return {articles: mergeFeed([...topics, ...batches], {limit}), fallback, requested: requests.length};
};

// How many stored topic articles are offered to the merge. The round-robin bounds their
// actual share; this only decides how deep the topic queue is when wires run dry.
export const TOPIC_FEED_BATCH = 12;

// The user's followed topics as feed articles. Best effort: a news page must never break
// because the topics collection is unreachable.
export const getTopicFeedBatch = async (userId: string, limit = TOPIC_FEED_BATCH): Promise<MarketNewsArticle[]> => {
    try {
        return toFeedArticles(await getMergedTopicFeed(userId, {limit}));
    } catch (error) {
        console.error('Topic articles unavailable for the news feed:', error);
        return [];
    }
};

// The feed for a signed-in page or widget. Watchlist symbols are only read when the feed
// asks for them, through the per-request cache the layout and loaders already share.
//
// This is also where followed topics enter the news. Callers that take this path get them
// for free; the digest calls getNewsFeedForPrefs directly and so does NOT, on purpose —
// it already prints a dedicated "Your topics" section and would otherwise run the same
// stories twice in one email.
export const getNewsFeed = async (userId: string, {limit}: {limit: number}): Promise<NewsFeedResult> => {
    const prefs = await getNewsFeedPrefs(userId);
    const [watchlistSymbols, topicArticles] = await Promise.all([
        prefs.includeWatchlist
            ? getCachedWatchlistSymbols(userId).catch((error: unknown) => { console.error('Watchlist unavailable for the news feed:', error); return [] as string[]; })
            : Promise.resolve([] as string[]),
        getTopicFeedBatch(userId),
    ]);
    return getNewsFeedForPrefs(prefs, {limit, watchlistSymbols, topicArticles});
};
