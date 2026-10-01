// What the second opinion looks at — the active theses, the narrative leaderboard, the latest
// model-portfolio decisions and the raw recent headlines — read with the MongoDB driver from
// whichever handle the caller holds. Dependency-free on purpose (type imports only, which
// Node's type stripping erases): lib/brain/opinion.ts passes Mongoose's connection.db, and
// scripts/second-opinion-local.mjs, which loads this file directly, passes its own. One
// reader, so the CLI path's prompt data cannot drift from the server's.

import type {Db} from "mongodb";
import type {SecondOpinionContext} from "@/lib/brain/prompts";

export const SECOND_OPINION_HEADLINE_COUNT = 15;
export const SECOND_OPINION_NARRATIVE_COUNT = 12;
// Active theses are unbounded in the brain; cap what reaches the prompt so a
// busy narrative period can't balloon the request (and the bill with it).
export const SECOND_OPINION_THESIS_COUNT = 20;

// The collections the models write, under Mongoose's pluralised names, and SuggestionSet's
// GLOBAL_SUGGESTIONS_USER. This file cannot import the models; a test holds both to them.
export const OPINION_COLLECTIONS = {entities: 'brainentities', suggestionSets: 'suggestionsets', news: 'newsitems'} as const;
export const GLOBAL_SUGGESTIONS_SCOPE = 'global';

// lib/brain/decay's sentimentAvg, which this file cannot import; a test holds the two equal.
const sentimentAvg = (sum: number, weight: number): number => (Math.abs(weight) < 1e-9 ? 0 : sum / weight);
const round2 = (n: number): number => Number(n.toFixed(2));

type EntityRow = {
    key: string;
    type: string;
    displayName: string;
    weightSlow?: number;
    sentimentSumSlow?: number;
    thesisSince?: Date | null;
};
type SuggestionRow = {date: string; kind?: string; items?: {symbol: string; action: string; targetWeight?: number; reasons?: string[]}[]};
type HeadlineRow = {headline: string; source: string; sourceType: string; publishedDate: string};

const slowSentiment = (e: EntityRow): number => round2(sentimentAvg(e.sentimentSumSlow ?? 0, e.weightSlow ?? 0));

export const readOpinionContext = async (db: Db): Promise<SecondOpinionContext> => {
    const entities = db.collection<EntityRow>(OPINION_COLLECTIONS.entities);
    const [thesisDocs, narrativeDocs, latestSet, headlines] = await Promise.all([
        entities.find({thesisSince: {$ne: null}}).sort({weightSlow: -1}).limit(SECOND_OPINION_THESIS_COUNT).toArray(),
        entities.find({}).sort({weightSlow: -1}).limit(SECOND_OPINION_NARRATIVE_COUNT).toArray(),
        db.collection<SuggestionRow>(OPINION_COLLECTIONS.suggestionSets)
            .findOne({userId: GLOBAL_SUGGESTIONS_SCOPE}, {sort: {date: -1}}),
        // datetime is unix seconds and unindexed, so this is a top-K sort over the whole
        // collection — project narrowly, since the clipboard path runs it inside a
        // click-synchronous server action.
        db.collection<HeadlineRow>(OPINION_COLLECTIONS.news)
            .find({}, {projection: {headline: 1, source: 1, sourceType: 1, publishedDate: 1, _id: 0}})
            .sort({datetime: -1}).limit(SECOND_OPINION_HEADLINE_COUNT).toArray(),
    ]);

    return {
        theses: thesisDocs.map((e) => ({
            name: e.displayName,
            type: e.type,
            weightSlow: round2(e.weightSlow ?? 0),
            sentimentSlow: slowSentiment(e),
            activeSinceMs: e.thesisSince ? new Date(e.thesisSince).getTime() : null,
        })),
        narratives: narrativeDocs.map((e) => ({
            key: e.key,
            type: e.type,
            displayName: e.displayName,
            weightSlow: round2(e.weightSlow ?? 0),
            sentimentSlow: slowSentiment(e),
            thesisActive: Boolean(e.thesisSince),
        })),
        decisions: latestSet
            ? {
                date: latestSet.date,
                kind: latestSet.kind ?? 'executed',
                items: (latestSet.items ?? []).map((i) => ({
                    symbol: i.symbol,
                    action: i.action,
                    targetWeightPct: Math.round((i.targetWeight ?? 0) * 100),
                    reasons: i.reasons ?? [],
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
