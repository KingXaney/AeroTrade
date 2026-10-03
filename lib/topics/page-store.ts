// The topics pages' reads (app/(root)/topics/page.tsx — the feed and, under ?edit=1, the manage
// view — and topics/[slug]/page.tsx): each returns the page's whole view, so the pages only
// compose it. Server only.

import {getTopEntities} from "@/lib/brain/store";
import {pickFirstRunTopic} from "@/lib/topics/first-run";
import {topicFeedKey} from "@/lib/topics/feed-key";
import {seedDefaultTopics, shouldSeedDefaults} from "@/lib/topics/seed";
import {isUntouchedDefaultSet} from "@/lib/topics/starters";
import {ensureTopicHasArticles, getCachedTopicsOverview, getMergedTopicFeed, getTopicArticles, getTopicsOverview} from "@/lib/topics/store";
import {brainTopicSuggestions} from "@/lib/topics/suggest-keywords";
import type {MergedTopicArticle, SuggestedTopic, TopicArticleView, TopicOverviewItem, TopicsOverview} from "@/lib/topics/types";

export const MERGED_FEED_SIZE = 24;
export const TOPIC_PAGE_SIZE = 20;
const BRAIN_SUGGESTIONS = 6;

// A failed brain read leaves the empty state with the curated starters alone.
const readBrainSuggestions = async (): Promise<SuggestedTopic[]> => {
    try {
        return brainTopicSuggestions(await getTopEntities(BRAIN_SUGGESTIONS), BRAIN_SUGGESTIONS);
    } catch (error) {
        console.error('Brain suggestions unavailable:', error);
        return [];
    }
};

export type TopicsPageView =
    // Nothing followed, on purpose: the deliberate empty state, never the setup wall.
    | {kind: 'empty'; brainSuggestions: SuggestedTopic[]}
    // /topics?edit=1: the rows to edit or remove and what the picker may add; no feed.
    | {kind: 'manage'; overview: TopicsOverview; preinstalled: boolean; brainSuggestions: SuggestedTopic[]}
    | {
        kind: 'topics';
        overview: TopicsOverview;
        articles: MergedTopicArticle[];
        // The key TopicFeed remounts on (lib/topics/feed-key).
        feedKey: string;
        // The followed set is still exactly the seeded defaults.
        preinstalled: boolean;
    };

export const getTopicsPageView = async (userId: string, {manage = false}: {manage?: boolean} = {}): Promise<TopicsPageView> => {
    // The layout's sidebar card already read this for the request; the re-reads after
    // seeding and the inline fetch below must see those writes, so they skip the cache.
    let overview = await getCachedTopicsOverview(userId);

    // The safety net behind the sign-up seed: it catches every account that predates
    // default topics, and any sign-up where seeding failed. Guarded by topicsSeededAt, so
    // a user who deliberately unfollowed everything is left alone.
    if (overview.topics.length === 0 && await shouldSeedDefaults(userId).catch(() => false)) {
        const seeded = await seedDefaultTopics(userId).catch((error: unknown) => {
            console.error('Could not seed default topics:', error);
            return {created: 0, firstSlug: null};
        });
        if (seeded.created > 0) overview = await getTopicsOverview(userId);
    }

    // Reaching here with nothing means the user removed it all on purpose, so this is a
    // deliberate empty state rather than the setup wall it used to be.
    if (overview.topics.length === 0) return {kind: 'empty', brainSuggestions: await readBrainSuggestions()};

    // The manage view re-renders after every remove, Undo and follow, so it stops here — before
    // the merged feed and the inline first-run fetch — and a round of editing never runs a search.
    if (manage) {
        return {
            kind: 'manage',
            overview,
            preinstalled: isUntouchedDefaultSet(overview.topics.map((t) => t.slug)),
            brainSuggestions: await readBrainSuggestions(),
        };
    }

    let articles = await getMergedTopicFeed(userId, {limit: MERGED_FEED_SIZE});
    if (articles.length === 0) {
        // Topics but nothing to show — the first-run job hasn't run, or couldn't. Fetch
        // for ONE never-fetched topic inline. Bounded (one search per page view) and
        // self-extinguishing (refreshKeywordGroup stamps lastFetchedAt even on zero
        // matches), so a reload never repeats it.
        const candidate = pickFirstRunTopic(overview.topics);
        if (candidate && await ensureTopicHasArticles(candidate)) {
            [overview, articles] = await Promise.all([
                getTopicsOverview(userId),
                getMergedTopicFeed(userId, {limit: MERGED_FEED_SIZE}),
            ]);
        }
    }

    return {
        kind: 'topics',
        overview,
        articles,
        feedKey: topicFeedKey(articles),
        preinstalled: isUntouchedDefaultSet(overview.topics.map((t) => t.slug)),
    };
};

export type TopicPageView = {
    overview: TopicsOverview;
    topic: TopicOverviewItem;
    articles: TopicArticleView[];
    feedKey: string;
};

// Null when the slug is not one of the user's topics.
export const getTopicPageView = async (userId: string, slug: string): Promise<TopicPageView | null> => {
    // The layout's sidebar card already read this for the request; only a read after a
    // write below goes back to the store.
    let overview = await getCachedTopicsOverview(userId);
    let topic = overview.topics.find((t) => t.slug === slug);
    if (!topic) return null;

    // A brand-new topic gets one bounded live fetch so its first visit isn't empty;
    // counts and "refreshed …" come from a second read so the header isn't stale.
    if (await ensureTopicHasArticles(topic)) {
        overview = await getTopicsOverview(userId);
        topic = overview.topics.find((t) => t.slug === slug) ?? topic;
    }
    const articles = await getTopicArticles(topic.keywordSetHash, {limit: TOPIC_PAGE_SIZE});
    return {overview, topic, articles, feedKey: topicFeedKey(articles, topic.keywordSetHash)};
};
