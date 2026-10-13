// The culture brain's fold, applied: every brand entity is read once, the pure planner
// (lib/culture/fold.ts) decides the writes and the deletes, and one bulkWrite moves them. A plain
// server module, called from the daily Inngest job with the run's id so a retry is a no-op.

import CultureEntity, {type CultureEntityDoc} from "@/database/models/culture-entity.model";
import {connectToDatabase} from "@/database/mongoose";
import {planCultureFold, type CultureEntityState, type CultureFoldWrite} from "@/lib/culture/fold";
import type {CultureFold} from "@/lib/culture/types";

type LeanEntity = Pick<CultureEntityDoc,
    'key' | 'weightFast' | 'sentimentSumFast' | 'weightSlow' | 'sentimentSumSlow' | 'decayedTo'
    | 'links' | 'thesisSince' | 'peakSlowWeight' | 'lastSeenAt' | 'lastFoldRunId' | 'attentionDay'>;

export const toCultureState = (doc: LeanEntity): CultureEntityState => ({
    key: doc.key,
    weightFast: doc.weightFast,
    sentimentSumFast: doc.sentimentSumFast,
    weightSlow: doc.weightSlow,
    sentimentSumSlow: doc.sentimentSumSlow,
    decayedTo: doc.decayedTo,
    links: (doc.links ?? []).map((link) => ({key: link.key, weight: link.weight})),
    thesisSince: doc.thesisSince ? new Date(doc.thesisSince).getTime() : null,
    peakSlowWeight: doc.peakSlowWeight ?? 0,
    lastSeenAtMs: new Date(doc.lastSeenAt).getTime(),
    lastFoldRunId: doc.lastFoldRunId ?? null,
    attentionDay: doc.attentionDay ?? null,
});

// The planner speaks in epoch milliseconds; the document stores dates.
const toUpdate = ({set}: CultureFoldWrite): Record<string, unknown> => {
    const {lastSeenAt, thesisSince, ...rest} = set;
    return {
        ...rest,
        thesisSince: typeof thesisSince === 'number' ? new Date(thesisSince) : null,
        ...(typeof lastSeenAt === 'number' ? {lastSeenAt: new Date(lastSeenAt)} : {}),
    };
};

export const foldCultureIntoBrain = async (
    folds: readonly CultureFold[],
    {today, nowMs, runId}: {today: string; nowMs: number; runId: string},
): Promise<{entitiesTouched: number; deleted: number; attentionFolded: number}> => {
    await connectToDatabase();
    const docs = (await CultureEntity.find({}).lean<LeanEntity[]>()).map(toCultureState);
    const plan = planCultureFold({docs, folds, today, nowMs, runId});

    if (plan.writes.length > 0) {
        await CultureEntity.bulkWrite(
            plan.writes.map((write) => {
                const set = toUpdate(write);
                // A touched entity carries its lastSeenAt in $set; a decayed one exists already,
                // and Mongo refuses the same path in $set and $setOnInsert.
                const update = 'lastSeenAt' in set ? {$set: set} : {$set: set, $setOnInsert: {lastSeenAt: new Date(nowMs)}};
                return {updateOne: {filter: {key: write.key}, update, upsert: true}};
            }),
            {ordered: false},
        );
    }
    let deleted = 0;
    if (plan.deletes.length > 0) {
        deleted = (await CultureEntity.deleteMany({key: {$in: plan.deletes}})).deletedCount ?? 0;
    }
    return {entitiesTouched: plan.entitiesTouched, deleted, attentionFolded: plan.attentionFolded};
};
