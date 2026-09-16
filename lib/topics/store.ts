// Server-only reads for followed topics. Plain module (not 'use server') so the
// reads are never exposed as POST endpoints; the actions live in lib/actions.

import type {Document} from "mongoose";
import {connectToDatabase} from "@/database/mongoose";
import Topic, {type TopicDoc} from "@/database/models/topic.model";
import TopicArticle, {type TopicArticleDoc} from "@/database/models/topic-article.model";
import {refreshKeywordGroup} from "@/lib/topics/refresh";
import type {TopicDigestInput} from "@/lib/topics/digest-section";

const DAY_SECONDS = 24 * 60 * 60;
const DIGEST_TOPIC_CAP = 6;
const DIGEST_ARTICLES_PER_TOPIC = 3;

type LeanTopic = Omit<TopicDoc, keyof Document> & {_id: unknown; createdAt?: Date};

export const toTopicView = (doc: LeanTopic): TopicView => ({
    id: String(doc._id),
    name: doc.name,
    slug: doc.slug,
    keywords: doc.keywords ?? [],
    exclude: doc.exclude ?? [],
    color: doc.color ?? null,
    keywordSetHash: doc.keywordSetHash,
    createdAt: doc.createdAt ? new Date(doc.createdAt).getTime() : 0,
    lastFetchedAt: doc.lastFetchedAt ? new Date(doc.lastFetchedAt).getTime() : null,
    lastSeenAt: doc.lastSeenAt ? new Date(doc.lastSeenAt).getTime() : null,
    refreshRequestedAt: doc.refreshRequestedAt ? new Date(doc.refreshRequestedAt).getTime() : null,
    brief: doc.brief
        ? {
            summary: doc.brief.summary,
            bullets: doc.brief.bullets ?? [],
            date: doc.brief.date,
            generatedAt: new Date(doc.brief.generatedAt).getTime(),
        }
        : null,
});

type ArticleLike = Pick<TopicArticleDoc, 'contentHash' | 'headline' | 'summary' | 'url' | 'source' | 'sourceType' | 'datetime' | 'score' | 'matchedTerms'>;

// Syndicated copies share a headline but not a URL; the reader wants one of them.
const headlineKey = (headline: string): string => headline.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

const dedupeByHeadline = <T extends {headline: string}>(items: T[]): T[] => {
    const seen = new Set<string>();
    return items.filter((item) => {
        const key = headlineKey(item.headline);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
};

const toArticleView = (doc: ArticleLike): TopicArticleView => ({
    contentHash: doc.contentHash,
    headline: doc.headline,
    summary: doc.summary ?? '',
    url: doc.url,
    source: doc.source ?? '',
    sourceType: doc.sourceType,
    datetime: doc.datetime,
    score: doc.score ?? 0,
    matchedTerms: doc.matchedTerms ?? [],
});

export const getTopicsForUser = async (userId: string): Promise<TopicView[]> => {
    await connectToDatabase();
    const docs = await Topic.find({userId}).sort({createdAt: 1}).lean<LeanTopic[]>();
    return docs.map(toTopicView);
};

export const getTopicBySlug = async (userId: string, slug: string): Promise<TopicView | null> => {
    await connectToDatabase();
    const doc = await Topic.findOne({userId, slug}).lean<LeanTopic | null>();
    return doc ? toTopicView(doc) : null;
};

const unseenCountFor = async (topic: TopicView): Promise<number> => {
    const filter: Record<string, unknown> = {keywordSetHash: topic.keywordSetHash};
    if (topic.lastSeenAt) filter.datetime = {$gt: Math.floor(topic.lastSeenAt / 1000)};
    return TopicArticle.countDocuments(filter);
};

// Counts and the latest article per keyword set in one aggregation; unseen counts
// depend on each user's lastSeenAt, so they are one small count per topic (≤12).
export const getTopicsOverview = async (userId: string): Promise<TopicsOverview> => {
    const topics = await getTopicsForUser(userId);
    if (topics.length === 0) return {topics: [], unseenTotal: 0};

    const hashes = Array.from(new Set(topics.map((t) => t.keywordSetHash)));
    const rows = await TopicArticle.aggregate<{_id: number; count: number; latest: ArticleLike}>([
        {$match: {keywordSetHash: {$in: hashes}}},
        {$sort: {datetime: -1}},
        {$group: {_id: '$keywordSetHash', count: {$sum: 1}, latest: {$first: '$$ROOT'}}},
    ]);
    const byHash = new Map(rows.map((r) => [r._id, r]));
    const unseen = await Promise.all(topics.map(unseenCountFor));

    const items: TopicOverviewItem[] = topics.map((t, i) => {
        const row = byHash.get(t.keywordSetHash);
        return {
            ...t,
            unseenCount: unseen[i],
            articleCount: row?.count ?? 0,
            latest: row ? toArticleView(row.latest) : null,
        };
    });
    return {topics: items, unseenTotal: items.reduce((sum, t) => sum + t.unseenCount, 0)};
};

export const getTopicArticles = async (
    keywordSetHash: number,
    {limit = 50, before}: {limit?: number; before?: number} = {},
): Promise<TopicArticleView[]> => {
    await connectToDatabase();
    const filter: Record<string, unknown> = {keywordSetHash};
    if (before) filter.datetime = {$lt: before};
    // Over-fetch so dropping syndicated duplicates still fills the page.
    const docs = await TopicArticle.find(filter).sort({datetime: -1, score: -1}).limit(limit * 2).lean<ArticleLike[]>();
    return dedupeByHeadline(docs).slice(0, limit).map(toArticleView);
};

export const getTopicFeed = async (
    userId: string,
    slug: string,
    opts: {limit?: number; before?: number} = {},
): Promise<{topic: TopicView; articles: TopicArticleView[]} | null> => {
    const topic = await getTopicBySlug(userId, slug);
    if (!topic) return null;
    return {topic, articles: await getTopicArticles(topic.keywordSetHash, opts)};
};

// Newest articles across every followed topic, tagged with the topic they came from.
export const getMergedTopicFeed = async (
    userId: string,
    {limit = 6, before}: {limit?: number; before?: number} = {},
): Promise<MergedTopicArticle[]> => {
    const topics = await getTopicsForUser(userId);
    if (topics.length === 0) return [];
    const topicByHash = new Map<number, TopicView>();
    for (const t of topics) if (!topicByHash.has(t.keywordSetHash)) topicByHash.set(t.keywordSetHash, t);

    const filter: Record<string, unknown> = {keywordSetHash: {$in: Array.from(topicByHash.keys())}};
    if (before) filter.datetime = {$lt: before};
    // Over-fetch so URL dedupe across topics still fills the page.
    const docs = await TopicArticle.find(filter).sort({datetime: -1}).limit(limit * 3).lean<(ArticleLike & {keywordSetHash: number})[]>();

    const seenUrls = new Set<string>();
    const seenHeadlines = new Set<string>();
    const merged: MergedTopicArticle[] = [];
    for (const doc of docs) {
        const key = headlineKey(doc.headline);
        if (seenUrls.has(doc.url) || seenHeadlines.has(key)) continue;
        seenUrls.add(doc.url);
        seenHeadlines.add(key);
        const topic = topicByHash.get(doc.keywordSetHash);
        if (!topic) continue;
        merged.push({...toArticleView(doc), topicId: topic.id, topicName: topic.name, topicSlug: topic.slug, topicColor: topic.color});
        if (merged.length >= limit) break;
    }
    return merged;
};

export const getTopicsDigestData = async (userId: string): Promise<TopicDigestInput[]> => {
    const {topics} = await getTopicsOverview(userId);
    const since = Math.floor(Date.now() / 1000) - DAY_SECONDS;
    const picked = topics.slice(0, DIGEST_TOPIC_CAP);
    return Promise.all(picked.map(async (t) => {
        const recent = await TopicArticle.find({keywordSetHash: t.keywordSetHash, datetime: {$gte: since}})
            .sort({score: -1, datetime: -1})
            .limit(DIGEST_ARTICLES_PER_TOPIC)
            .lean<ArticleLike[]>();
        const newCount = await TopicArticle.countDocuments({keywordSetHash: t.keywordSetHash, datetime: {$gte: since}});
        return {
            name: t.name,
            slug: t.slug,
            brief: t.brief ? {summary: t.brief.summary, bullets: t.brief.bullets} : null,
            newCount,
            articles: recent.map((a) => ({headline: a.headline, url: a.url, source: a.source ?? ''})),
        };
    }));
};

// First visit to a brand-new topic: one bounded live fetch so the page isn't empty
// until the next scheduled refresh. Never called from dashboard loaders.
export const ensureTopicHasArticles = async (topic: TopicView): Promise<boolean> => {
    if (topic.lastFetchedAt !== null) return false;
    await connectToDatabase();
    if (await TopicArticle.exists({keywordSetHash: topic.keywordSetHash})) {
        // Someone else already fetched this keyword set: inherit their stamp so the
        // header doesn't read "never refreshed" and the cron orders this set correctly.
        const sibling = await Topic.findOne({keywordSetHash: topic.keywordSetHash, lastFetchedAt: {$ne: null}})
            .select('lastFetchedAt').lean<{lastFetchedAt?: Date} | null>();
        await Topic.updateOne({_id: topic.id}, {$set: {lastFetchedAt: sibling?.lastFetchedAt ?? new Date()}});
        return true;
    }
    try {
        await refreshKeywordGroup({keywordSetHash: topic.keywordSetHash, keywords: topic.keywords, exclude: topic.exclude});
        return true;
    } catch (error) {
        console.error(`Inline refresh failed for topic ${topic.slug}:`, error);
        return false;
    }
};
