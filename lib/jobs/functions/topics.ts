import {inngest} from "@/lib/jobs/client";
import {newsSearchEnabled} from "@/lib/news/config";
import {inferText} from "@/lib/ai/infer";
import {recordJobRun} from "@/lib/jobs/job-runs";
import {JOBS, triggersOf} from "@/lib/jobs/registry";
import {connectToDatabase} from "@/database/mongoose";
import Topic from "@/database/models/topic.model";
import {loadBriefCandidates, loadStaleKeywordGroups, refreshKeywordGroup, saveTopicBrief, type KeywordGroup} from "@/lib/topics/refresh";
import {buildTopicBriefPrompt} from "@/lib/topics/prompts";
import {parseBriefText} from "@/lib/topics/brief";
import {MAX_BRIEF_CALLS_PER_RUN} from "@/lib/topics/config";
import {ensureTopicHasArticles, getTopicsForUser} from "@/lib/topics/store";

// ─── Followed topics ────────────────────────────────────────────────────────────

const TOPIC_GROUPS_PER_RUN = 60;
const TOPIC_GROUP_THROTTLE = '1s';    // Google News etiquette: one search per second
const BRIEF_THROTTLE_DELAY = '15s';   // same pacing as extraction on the free tier

// Every three hours, re-fetch the keyword sets that have gone longest without one.
// Sets are shared across users, so this is bounded by distinct topics, not by users.
export const refreshTopicFeeds = inngest.createFunction(
    { id: JOBS.topicFeeds.id, triggers: triggersOf(JOBS.topicFeeds) },
    async ({ step }) => {
        if (!newsSearchEnabled()) {
            const message = 'Skipped — NEWS_SEARCH_ENABLED is off';
            await step.run('record-job-run', async () => recordJobRun(JOBS.topicFeeds.id, message));
            return {success: false, message};
        }

        const groups = await step.run('load-groups', async () => loadStaleKeywordGroups(TOPIC_GROUPS_PER_RUN));

        let refreshed = 0;
        let inserted = 0;
        let failed = 0;
        for (let i = 0; i < groups.length; i++) {
            const group = groups[i];
            if (i > 0) await step.sleep(`group-throttle-${i}`, TOPIC_GROUP_THROTTLE);
            try {
                const result = await step.run(`refresh-group-${group.keywordSetHash}`, async () => refreshKeywordGroup(group));
                refreshed += 1;
                inserted += result.inserted;
            } catch (error) {
                // One bad keyword set (blocked query, parse failure) never aborts the run.
                failed += 1;
                console.error(`Topic keyword set ${group.keywordSetHash} failed:`, error);
            }
        }

        const summary = `Refreshed ${refreshed}/${groups.length} keyword sets, ${inserted} new articles${failed ? `, ${failed} failed` : ''}`;
        await step.run('record-job-run', async () => recordJobRun(JOBS.topicFeeds.id, summary));
        return {success: true, message: summary};
    },
);

// Fired when a topic is created/edited or the user presses "Refresh now". The action
// already took a per-topic cooldown claim on the promise that this will run, so the
// per-user bound is a *throttle* (excess runs queue) rather than a rateLimit (excess
// events are dropped — which would make that promise a lie past six an hour).
export const refreshTopicOnDemand = inngest.createFunction(
    {
        id: JOBS.topicOnDemand.id,
        triggers: triggersOf(JOBS.topicOnDemand),
        concurrency: [{ limit: 1, key: 'event.data.keywordSetHash' }],
        throttle: { limit: 6, period: '1h', key: 'event.data.userId' },
    },
    async ({ event, step }) => {
        const keywordSetHash = Number(event.data?.keywordSetHash);
        const userId = String(event.data?.userId ?? '');
        if (!Number.isFinite(keywordSetHash) || !userId) return {success: false, message: 'Skipped — no keyword set on the event'};
        if (!newsSearchEnabled()) return {success: false, message: 'Skipped — NEWS_SEARCH_ENABLED is off'};

        const group = await step.run('load-group', async (): Promise<KeywordGroup | null> => {
            await connectToDatabase();
            const topic = await Topic.findOne({keywordSetHash}).select('keywords exclude').lean<{keywords: string[]; exclude: string[]} | null>();
            return topic ? {keywordSetHash, keywords: topic.keywords ?? [], exclude: topic.exclude ?? []} : null;
        });
        if (!group) return {success: false, message: 'Skipped — the topic no longer exists'};

        const result = await step.run(`refresh-group-${keywordSetHash}`, async () => refreshKeywordGroup(group));
        const summary = `On-demand refresh: ${result.inserted} new of ${result.matched} matched`;
        await step.run('record-job-run', async () => recordJobRun(JOBS.topicOnDemand.id, summary));
        return {success: true, message: summary};
    },
);

// One event per onboarding batch (see followStarterTopics): fills every topic this user
// has never fetched, spaced like the cron sweep. This is NOT the per-topic on-demand
// path on purpose — that job is rate-limited per user, and Inngest's rateLimit drops
// excess events rather than queueing them, so a batch of eight starters lost two.
export const fillFirstRunTopics = inngest.createFunction(
    {
        id: JOBS.topicFirstRun.id,
        triggers: triggersOf(JOBS.topicFirstRun),
        concurrency: [{ limit: 1, key: 'event.data.userId' }],
        rateLimit: { limit: 3, period: '1h', key: 'event.data.userId' },
    },
    async ({ event, step }) => {
        const userId = String(event.data?.userId ?? '');
        if (!userId) return {success: false, message: 'Skipped — no user on the event'};
        if (!newsSearchEnabled()) return {success: false, message: 'Skipped — NEWS_SEARCH_ENABLED is off'};

        const topics = await step.run('load-unfetched-topics', async () =>
            (await getTopicsForUser(userId)).filter((t) => t.lastFetchedAt === null));

        let filled = 0;
        let failed = 0;
        for (let i = 0; i < topics.length; i++) {
            const topic = topics[i];
            if (i > 0) await step.sleep(`first-run-throttle-${i}`, TOPIC_GROUP_THROTTLE);
            try {
                // Same path as a topic page's first visit: inherit a sibling's articles when
                // someone already follows this keyword set, search otherwise.
                if (await step.run(`fill-topic-${topic.id}`, async () => ensureTopicHasArticles(topic))) filled += 1;
            } catch (error) {
                failed += 1;
                console.error(`First-run fill failed for topic ${topic.slug}:`, error);
            }
        }

        const summary = `Filled ${filled}/${topics.length} new topics${failed ? `, ${failed} failed` : ''}`;
        await step.run('record-job-run', async () => recordJobRun(JOBS.topicFirstRun.id, summary));
        return {success: true, message: summary};
    },
);

// Daily "what changed today" per keyword set, after the morning refresh and before the
// noon digest. Bounded calls on the free tier; one brief serves every user on that set.
export const generateTopicBriefs = inngest.createFunction(
    { id: JOBS.topicBriefs.id, triggers: triggersOf(JOBS.topicBriefs) },
    async ({ step }) => {
        const candidates = await step.run('load-candidates', async () => loadBriefCandidates(MAX_BRIEF_CALLS_PER_RUN));

        let written = 0;
        for (let i = 0; i < candidates.length; i++) {
            const candidate = candidates[i];
            if (i > 0) await step.sleep(`brief-throttle-${i}`, BRIEF_THROTTLE_DELAY);

            const prompt = buildTopicBriefPrompt(candidate.name, candidate.articles);
            const response = await inferText(step, {task: 'topicBrief', stepId: `brief-${candidate.keywordSetHash}`, prompt});

            written += await step.run(`save-brief-${candidate.keywordSetHash}`, async () => {
                const parsed = parseBriefText(response.text);
                if (!parsed) return 0;
                return saveTopicBrief(candidate.keywordSetHash, parsed, candidate.articleHashes, response.model);
            });
        }

        const summary = `Wrote ${written} topic briefs from ${candidates.length} keyword sets`;
        await step.run('record-job-run', async () => recordJobRun(JOBS.topicBriefs.id, summary));
        return {success: true, message: summary};
    },
);
