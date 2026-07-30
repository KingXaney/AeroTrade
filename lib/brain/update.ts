// DB fold for the news brain: apply a run's sanitized extractions to the
// BrainEntity graph. The math is pure (lib/brain/decay.ts); this layer moves
// documents. Plain server module, called from the daily Inngest job.

import BrainEntity, {type BrainEntityDoc} from "@/database/models/brain-entity.model";
import {connectToDatabase} from "@/database/mongoose";
import {
    decayEntity,
    foldLink,
    foldMentions,
    pruneLinks,
    shouldDeleteEntity,
    updateThesis,
    type EntityState,
    type Mention,
} from "@/lib/brain/decay";
import {buildDisplayName} from "@/lib/brain/extraction";
import {ENTITY_EPSILON} from "@/lib/brain/config";
import {getEasternDateString} from "@/lib/utils";

export type ArticleFold = {
    importance: number;
    entities: {key: string; type: 'ticker' | 'sector' | 'theme'; sentiment: number; relevance: number}[];
};

const toState = (doc: BrainEntityDoc | null, today: string): EntityState => doc ? {
    weightFast: doc.weightFast,
    sentimentSumFast: doc.sentimentSumFast,
    weightSlow: doc.weightSlow,
    sentimentSumSlow: doc.sentimentSumSlow,
    decayedTo: doc.decayedTo,
    links: (doc.links ?? []).map((l) => ({key: l.key, weight: l.weight})),
    thesisSince: doc.thesisSince ? new Date(doc.thesisSince).getTime() : null,
    peakSlowWeight: doc.peakSlowWeight ?? 0,
} : {
    weightFast: 0,
    sentimentSumFast: 0,
    weightSlow: 0,
    sentimentSumSlow: 0,
    decayedTo: today,
    links: [],
    thesisSince: null,
    peakSlowWeight: 0,
};

// Fold one run's extractions into the graph. Callers pass only THIS run's
// extractions (never re-fold old articles); runId makes an Inngest step RETRY an
// exact no-op per entity (a fresh run has a new runId and folds normally).
export const foldExtractionsIntoBrain = async (
    articles: ArticleFold[],
    verifiedTickers: Set<string>,
    runId?: string,
): Promise<{entitiesTouched: number; deleted: number}> => {
    await connectToDatabase();
    const today = getEasternDateString();
    const nowMs = Date.now();

    // Group mentions + co-mention links per entity key across the run's articles.
    const mentionsByKey = new Map<string, {type: 'ticker' | 'sector' | 'theme'; mentions: Mention[]; coMentions: Map<string, number>}>();
    for (const article of articles) {
        for (const entity of article.entities) {
            const entry = mentionsByKey.get(entity.key) ?? {type: entity.type, mentions: [], coMentions: new Map<string, number>()};
            entry.mentions.push({sentiment: entity.sentiment, importance: article.importance, relevance: entity.relevance});
            for (const other of article.entities) {
                if (other.key === entity.key) continue;
                // Symmetric link mass: min importance is shared, relevance product scales it.
                const add = article.importance * entity.relevance * other.relevance;
                entry.coMentions.set(other.key, (entry.coMentions.get(other.key) ?? 0) + add);
            }
            mentionsByKey.set(entity.key, entry);
        }
    }

    let entitiesTouched = 0;
    for (const [key, entry] of mentionsByKey) {
        const doc = await BrainEntity.findOne({key});
        if (runId && doc?.lastFoldRunId === runId) {
            // Step retry after a partially-committed fold — this entity already
            // absorbed this run's mentions; folding again would double the mass.
            entitiesTouched++;
            continue;
        }
        let state = decayEntity(toState(doc, today), today);
        state = foldMentions(state, entry.mentions);
        for (const [linkKey, addWeight] of entry.coMentions) {
            state = foldLink(state, linkKey, addWeight);
        }
        state = updateThesis(state, nowMs);
        state = {...state, links: pruneLinks(state.links)};

        await BrainEntity.updateOne(
            {key},
            {
                $set: {
                    type: entry.type,
                    displayName: buildDisplayName(key, entry.type),
                    weightFast: state.weightFast,
                    sentimentSumFast: state.sentimentSumFast,
                    weightSlow: state.weightSlow,
                    sentimentSumSlow: state.sentimentSumSlow,
                    decayedTo: state.decayedTo,
                    lastSeenAt: new Date(),
                    thesisSince: state.thesisSince ? new Date(state.thesisSince) : null,
                    peakSlowWeight: state.peakSlowWeight,
                    links: state.links,
                    ...(runId ? {lastFoldRunId: runId} : {}),
                    ...(entry.type === 'ticker' && verifiedTickers.has(key) ? {verified: true} : {}),
                },
            },
            {upsert: true},
        );
        entitiesTouched++;
    }

    // Decay entities NOT mentioned this run too (their decayedTo lags), then prune
    // the dead ones. Bounded: only entities that still carry any weight.
    const stale = await BrainEntity.find({decayedTo: {$ne: today}, $or: [{weightFast: {$gte: ENTITY_EPSILON}}, {weightSlow: {$gte: ENTITY_EPSILON}}]});
    for (const doc of stale) {
        let state = decayEntity(toState(doc, today), today);
        state = updateThesis(state, nowMs);
        state = {...state, links: pruneLinks(state.links)};
        await BrainEntity.updateOne({_id: doc._id}, {
            $set: {
                weightFast: state.weightFast,
                sentimentSumFast: state.sentimentSumFast,
                weightSlow: state.weightSlow,
                sentimentSumSlow: state.sentimentSumSlow,
                decayedTo: state.decayedTo,
                thesisSince: state.thesisSince ? new Date(state.thesisSince) : null,
                peakSlowWeight: state.peakSlowWeight,
                links: state.links,
            },
        });
    }

    // Delete fully-faded, long-unseen entities.
    const candidates = await BrainEntity.find({weightFast: {$lt: ENTITY_EPSILON}, weightSlow: {$lt: ENTITY_EPSILON}});
    let deleted = 0;
    for (const doc of candidates) {
        if (shouldDeleteEntity(toState(doc, today), new Date(doc.lastSeenAt).getTime(), nowMs)) {
            await BrainEntity.deleteOne({_id: doc._id});
            deleted++;
        }
    }

    return {entitiesTouched, deleted};
};
