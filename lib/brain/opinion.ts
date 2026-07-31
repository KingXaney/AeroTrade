// Claude second-opinion plumbing (NOT a 'use server' module). The deterministic
// navigator still makes every trade — Claude only critiques what the brain and
// allocator already decided. A stronger narrator, never a second trader.

import SecondOpinion, {type SecondOpinionSource} from "@/database/models/second-opinion.model";
import NewsItem from "@/database/models/news-item.model";
import SuggestionSet, {GLOBAL_SUGGESTIONS_USER} from "@/database/models/suggestion-set.model";
import {connectToDatabase} from "@/database/mongoose";
import {getActiveTheses, getBrainDigestData} from "@/lib/brain/queries";
import type {SecondOpinionContext} from "@/lib/brain/prompts";
import {
    SECOND_OPINION_HEADLINE_COUNT,
    SECOND_OPINION_MAX_CHARS,
    SECOND_OPINION_NARRATIVE_COUNT,
    SECOND_OPINION_THESIS_COUNT,
    stripMarkdownLinks,
} from "@/lib/brain/opinion-text";

export {
    CLI_MODEL_LABEL,
    MANUAL_MODEL_LABEL,
    SECOND_OPINION_HEADLINE_COUNT,
    SECOND_OPINION_MAX_CHARS,
    stripMarkdownLinks,
} from "@/lib/brain/opinion-text";

export const SECOND_OPINION_MODEL = 'claude-opus-5';
// On Claude Opus 5 thinking is on by default and shares this cap with the
// visible text — leave headroom so the answer never truncates mid-thought.
export const SECOND_OPINION_MAX_TOKENS = 16000;
// Paid API behind a button: refuse regeneration while a fresh opinion exists.
export const SECOND_OPINION_MIN_INTERVAL_MS = 15 * 60 * 1000;

export const isSecondOpinionConfigured = (): boolean => Boolean(process.env.ANTHROPIC_API_KEY);

// What Claude gets to look at: the theses, the narrative leaderboard, the latest
// model-portfolio decisions and the raw recent headlines. scripts/second-opinion-local.mjs
// reproduces these reads with the raw driver — keep the two in step.
export const gatherOpinionContext = async (): Promise<SecondOpinionContext> => {
    await connectToDatabase();
    const [theses, narratives, latestSet, headlines] = await Promise.all([
        getActiveTheses(),
        getBrainDigestData(SECOND_OPINION_NARRATIVE_COUNT),
        SuggestionSet.findOne({userId: GLOBAL_SUGGESTIONS_USER}).sort({date: -1})
            .lean<{date: string; kind?: string; items: SuggestionItem[]}>(),
        // datetime is unindexed, so this is a top-K sort over the whole
        // collection — project narrowly, since the clipboard path runs it inside
        // a click-synchronous server action.
        NewsItem.find({}, {headline: 1, source: 1, sourceType: 1, publishedDate: 1, _id: 0})
            .sort({datetime: -1}).limit(SECOND_OPINION_HEADLINE_COUNT)
            .lean<Array<{headline: string; source: string; sourceType: string; publishedDate: string}>>(),
    ]);

    return {
        theses: theses.slice(0, SECOND_OPINION_THESIS_COUNT).map((t) => ({
            name: t.displayName,
            type: t.type,
            weightSlow: Number(t.weightSlow.toFixed(2)),
            sentimentSlow: Number(t.sentimentSlow.toFixed(2)),
            activeSinceMs: t.thesisSince,
        })),
        narratives,
        decisions: latestSet
            ? {
                date: latestSet.date,
                kind: latestSet.kind ?? 'executed',
                items: latestSet.items.map((i) => ({
                    symbol: i.symbol,
                    action: i.action,
                    targetWeightPct: Math.round(i.targetWeight * 100),
                    reasons: i.reasons,
                })),
            }
            : null,
        headlines: headlines.map((h) => ({
            headline: h.headline,
            source: h.source,
            kind: h.sourceType,
            date: h.publishedDate,
        })),
    };
};

export type SecondOpinionView = {
    opinionMd: string;
    model: string;
    source: SecondOpinionSource;
    generatedAt: number; // epoch ms
};

export const getLatestSecondOpinion = async (userId: string): Promise<SecondOpinionView | null> => {
    if (!userId) return null;
    await connectToDatabase();
    // Sorted rather than a bare findOne: a script writing before Mongoose ever
    // built the unique index could leave a duplicate, and natural order would
    // then hand back the stale one.
    const doc = await SecondOpinion.findOne({scope: userId}).sort({generatedAt: -1})
        .lean<{opinionMd?: string; modelUsed?: string; source?: SecondOpinionSource; generatedAt?: Date}>();
    // A row can exist as a rate-limit claim before any answer has been written;
    // react-markdown throws on a non-string child, so treat that as "nothing yet".
    if (!doc || typeof doc.opinionMd !== 'string' || !doc.opinionMd || !doc.generatedAt) return null;
    return {
        opinionMd: doc.opinionMd,
        model: doc.modelUsed ?? 'Claude',
        source: doc.source ?? 'api',
        generatedAt: new Date(doc.generatedAt).getTime(),
    };
};

// Every writer (API job, local CLI script, clipboard paste) lands here so the
// stored shape and the link-stripping stay identical across paths.
export const saveSecondOpinion = async (
    {userId, opinionMd, modelUsed, source}: {userId: string; opinionMd: string; modelUsed: string; source: SecondOpinionSource},
): Promise<void> => {
    await connectToDatabase();
    await SecondOpinion.updateOne(
        {scope: userId},
        {
            $set: {
                opinionMd: stripMarkdownLinks(opinionMd).slice(0, SECOND_OPINION_MAX_CHARS),
                modelUsed,
                source,
                generatedAt: new Date(),
                requestedBy: userId,
            },
        },
        {upsert: true},
    );
};
