'use server';

import {revalidatePath} from "next/cache";
import {isValidObjectId} from "mongoose";
import {connectToDatabase} from "@/database/mongoose";
import Topic, {type TopicDoc} from "@/database/models/topic.model";
import TopicArticle from "@/database/models/topic-article.model";
import {getCurrentUserId} from "@/lib/actions/watchlist.actions";
import {MAX_TOPICS_PER_USER, REFRESH_COOLDOWN_MS, refreshCooldownMessage, refreshCooldownRemainingMs} from "@/lib/topics/config";
import {deriveKeywords, formatIssue, keywordSetHash, slugify, topicInputSchema} from "@/lib/topics/normalize";
import {requestTopicFirstRun, requestTopicRefresh} from "@/lib/topics/events";
import {getTopicArticles, toTopicView} from "@/lib/topics/store";

export type TopicResult = OrderResult & {topic?: TopicView};
export type TopicFeedPageResult = {success: boolean; message?: string; articles: TopicArticleView[]};
export type RefreshTopicResult = OrderResult & {cooldownUntil?: number};   // epoch ms; present whenever a cooldown applies
export type FollowTopicsResult = {success: boolean; message?: string; created: number; firstSlug: string | null};

const FEED_PAGE_MAX = 50;

const revalidateTopics = () => {
    revalidatePath('/topics');
    revalidatePath('/');
};

const parseInput = (input: unknown) => {
    const parsed = topicInputSchema.safeParse(input);
    if (!parsed.success) return {error: formatIssue(parsed.error)} as const;
    const derived = deriveKeywords(parsed.data);
    if (!derived) return {error: 'Add at least one keyword to match articles against.'} as const;
    return {value: parsed.data, derived} as const;
};

// Validate, cap, dedupe, insert. Shared by createTopic and followStarterTopics and
// deliberately NOT queueing anything: the two callers differ in exactly that.
const insertTopic = async (userId: string, input: unknown): Promise<{doc: TopicDoc} | {error: string}> => {
    const parsed = parseInput(input);
    if ('error' in parsed) return {error: parsed.error ?? 'Invalid topic'};
    const {value, derived} = parsed;

    if ((await Topic.countDocuments({userId})) >= MAX_TOPICS_PER_USER) {
        return {error: `You can follow up to ${MAX_TOPICS_PER_USER} topics. Remove one to add another.`};
    }
    const slug = slugify(value.name);
    if (await Topic.exists({userId, slug})) {
        return {error: `You already follow a topic called "${value.name}".`};
    }
    const doc = await Topic.create({
        userId,
        name: value.name,
        slug,
        keywords: derived.keywords,
        exclude: derived.exclude,
        color: value.color ?? undefined,
        keywordSetHash: keywordSetHash(derived.keywords, derived.exclude),
    });
    return {doc};
};

export const createTopic = async (input: unknown): Promise<TopicResult> => {
    const userId = await getCurrentUserId();
    if (!userId) return {success: false, message: 'Not authenticated'};

    try {
        await connectToDatabase();
        const result = await insertTopic(userId, input);
        if ('error' in result) return {success: false, message: result.error};
        // Best effort: the topic exists either way, and its page fetches inline on first visit.
        await requestTopicRefresh(userId, result.doc.keywordSetHash);
        revalidateTopics();
        return {success: true, topic: toTopicView(result.doc.toObject())};
    } catch (error) {
        console.error('Error creating topic:', error);
        return {success: false, message: 'Could not create the topic'};
    }
};

// First-run onboarding: follow a batch of starters in one call and queue ONE fill
// job for all of them. Each topic used to fire its own refresh event, and the
// on-demand job's per-user rate limit *drops* anything past six an hour rather than
// queueing it — so picking all eight starters silently left two never fetched.
export const followStarterTopics = async (inputs: unknown): Promise<FollowTopicsResult> => {
    const userId = await getCurrentUserId();
    if (!userId) return {success: false, message: 'Not authenticated', created: 0, firstSlug: null};
    if (!Array.isArray(inputs) || inputs.length === 0) {
        return {success: false, message: 'Pick at least one topic to follow.', created: 0, firstSlug: null};
    }

    try {
        await connectToDatabase();
        let created = 0;
        let firstSlug: string | null = null;
        let lastError: string | undefined;
        for (const input of inputs.slice(0, MAX_TOPICS_PER_USER)) {
            // Per item, so one bad insert (a duplicate-slug race from a second tab, a
            // transient Mongo error) costs that topic, not the ones already created.
            try {
                const result = await insertTopic(userId, input);
                if ('error' in result) { lastError = result.error; continue; }
                created += 1;
                firstSlug ??= result.doc.slug;
            } catch (error) {
                console.error('Error following a starter topic:', error);
                lastError = 'One of the topics could not be followed';
            }
        }
        if (created > 0) await requestTopicFirstRun(userId);
        revalidateTopics();
        if (created === 0) return {success: false, message: lastError ?? 'Could not follow those topics', created, firstSlug};
        return {success: true, message: created < inputs.length ? lastError : undefined, created, firstSlug};
    } catch (error) {
        console.error('Error following starter topics:', error);
        return {success: false, message: 'Could not follow those topics', created: 0, firstSlug: null};
    }
};

export const updateTopic = async (topicId: string, input: unknown): Promise<TopicResult> => {
    const userId = await getCurrentUserId();
    if (!userId) return {success: false, message: 'Not authenticated'};
    if (!isValidObjectId(topicId)) return {success: false, message: 'Unknown topic'};

    const parsed = parseInput(input);
    if ('error' in parsed) return {success: false, message: parsed.error};
    const {value, derived} = parsed;

    try {
        await connectToDatabase();
        const existing = await Topic.findOne({_id: topicId, userId});
        if (!existing) return {success: false, message: 'Unknown topic'};

        const slug = slugify(value.name);
        if (slug !== existing.slug && await Topic.exists({userId, slug})) {
            return {success: false, message: `You already follow a topic called "${value.name}".`};
        }
        const hash = keywordSetHash(derived.keywords, derived.exclude);
        const keywordsChanged = hash !== existing.keywordSetHash;

        const update: Record<string, unknown> = {
            $set: {name: value.name, slug, keywords: derived.keywords, exclude: derived.exclude, keywordSetHash: hash, color: value.color ?? null},
        };
        // A new keyword set means a new feed: the old brief no longer describes it.
        if (keywordsChanged) update.$unset = {brief: 1, lastFetchedAt: 1};
        const doc = await Topic.findOneAndUpdate({_id: topicId, userId}, update, {new: true});
        if (!doc) return {success: false, message: 'Unknown topic'};

        if (keywordsChanged) await requestTopicRefresh(userId, hash);
        revalidateTopics();
        return {success: true, topic: toTopicView(doc.toObject())};
    } catch (error) {
        console.error('Error updating topic:', error);
        return {success: false, message: 'Could not update the topic'};
    }
};

export const deleteTopic = async (topicId: string): Promise<OrderResult> => {
    const userId = await getCurrentUserId();
    if (!userId) return {success: false, message: 'Not authenticated'};
    if (!isValidObjectId(topicId)) return {success: false, message: 'Unknown topic'};

    try {
        await connectToDatabase();
        const doc = await Topic.findOneAndDelete({_id: topicId, userId});
        if (!doc) return {success: false, message: 'Unknown topic'};
        // Articles are shared per keyword set; drop them only when nobody follows the set any more.
        if (!(await Topic.exists({keywordSetHash: doc.keywordSetHash}))) {
            await TopicArticle.deleteMany({keywordSetHash: doc.keywordSetHash});
        }
        revalidateTopics();
        return {success: true};
    } catch (error) {
        console.error('Error deleting topic:', error);
        return {success: false, message: 'Could not remove the topic'};
    }
};

export const markTopicSeen = async (topicId: string): Promise<OrderResult> => {
    const userId = await getCurrentUserId();
    if (!userId) return {success: false, message: 'Not authenticated'};
    if (!isValidObjectId(topicId)) return {success: false, message: 'Unknown topic'};
    try {
        await connectToDatabase();
        await Topic.updateOne({_id: topicId, userId}, {$set: {lastSeenAt: new Date()}});
        return {success: true};
    } catch (error) {
        console.error('Error marking topic seen:', error);
        return {success: false, message: 'Could not update the topic'};
    }
};

// Atomic 10-minute claim, then the enqueue. The claim is taken first so a replayed
// request is bounded here as well as by the job's own rate limit — but it is only
// *kept* if the queue accepted the event. Before, the send failure was swallowed and
// this returned "Refresh queued" with the ten minutes already spent.
export const requestTopicRefreshAction = async (topicId: string): Promise<RefreshTopicResult> => {
    const userId = await getCurrentUserId();
    if (!userId) return {success: false, message: 'Not authenticated'};
    if (!isValidObjectId(topicId)) return {success: false, message: 'Unknown topic'};
    try {
        await connectToDatabase();
        const now = new Date();
        const cutoff = new Date(now.getTime() - REFRESH_COOLDOWN_MS);
        // No {new: true}: the pre-update document carries the previous claim, which is
        // exactly what the rollback below has to restore.
        const previous = await Topic.findOneAndUpdate(
            {_id: topicId, userId, $or: [{refreshRequestedAt: {$exists: false}}, {refreshRequestedAt: {$lte: cutoff}}]},
            {$set: {refreshRequestedAt: now}},
        ).lean<TopicDoc | null>();
        if (!previous) {
            const current = await Topic.findOne({_id: topicId, userId})
                .select('refreshRequestedAt').lean<Pick<TopicDoc, 'refreshRequestedAt'> | null>();
            if (!current) return {success: false, message: 'Unknown topic'};
            const remaining = refreshCooldownRemainingMs(current.refreshRequestedAt, now.getTime());
            return {success: false, message: refreshCooldownMessage(remaining), cooldownUntil: now.getTime() + remaining};
        }

        const queued = await requestTopicRefresh(userId, previous.keywordSetHash);
        if (!queued) {
            // No job, no claim — otherwise a queue outage also costs the next ten minutes.
            await Topic.updateOne(
                {_id: topicId, userId, refreshRequestedAt: now},
                previous.refreshRequestedAt
                    ? {$set: {refreshRequestedAt: previous.refreshRequestedAt}}
                    : {$unset: {refreshRequestedAt: 1}},
            );
            return {success: false, message: 'Could not queue the refresh — the job runner is unreachable. Nothing was used up; try again in a moment.'};
        }
        return {success: true, message: 'Refresh queued — new articles land in a moment.', cooldownUntil: now.getTime() + REFRESH_COOLDOWN_MS};
    } catch (error) {
        console.error('Error requesting topic refresh:', error);
        return {success: false, message: 'Could not refresh the topic'};
    }
};

// "Load more" for the feed; session-scoped so one user can't page another's topic.
export const fetchTopicFeedPage = async (
    {topicId, before, limit = 20}: {topicId: string; before?: number; limit?: number},
): Promise<TopicFeedPageResult> => {
    const userId = await getCurrentUserId();
    if (!userId) return {success: false, message: 'Not authenticated', articles: []};
    if (!isValidObjectId(topicId)) return {success: false, message: 'Unknown topic', articles: []};
    try {
        await connectToDatabase();
        const topic = await Topic.findOne({_id: topicId, userId}).select('keywordSetHash').lean<Pick<TopicDoc, 'keywordSetHash'> | null>();
        if (!topic) return {success: false, message: 'Unknown topic', articles: []};
        const safeLimit = Math.max(1, Math.min(FEED_PAGE_MAX, Math.floor(limit)));
        const articles = await getTopicArticles(topic.keywordSetHash, {limit: safeLimit, before});
        return {success: true, articles};
    } catch (error) {
        console.error('Error loading topic feed page:', error);
        return {success: false, message: 'Could not load more articles', articles: []};
    }
};
