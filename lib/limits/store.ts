// The limits panel's read (NOT a 'use server' module): the last week of recorded hits, bounded
// and indexed, shaped by the pure lib/limits/view.ts into one row per registered provider.
// Cached per request beside the brain's system status.

import {cache} from "react";
import LimitEvent from "@/database/models/limit-event.model";
import {connectToDatabase} from "@/database/mongoose";
import {getEasternDateString} from "@/lib/dates";
import {isLimitProviderId, type LimitKind} from "@/lib/limits/registry";
import {limitsView, WEEK_MS, type LimitEvent as LimitEventView, type LimitRow} from "@/lib/limits/view";

// More hits than a week of jobs will file; a runaway loop is cut here, newest first.
const EVENTS_READ_LIMIT = 500;

type LeanEvent = {provider: string; kind: LimitKind; jobId?: string; message?: string; at: Date; day: string};

export const getLimitEvents = async (now: number = Date.now()): Promise<LimitEventView[]> => {
    await connectToDatabase();
    const docs = await LimitEvent.find({at: {$gte: new Date(now - WEEK_MS)}}).sort({at: -1}).limit(EVENTS_READ_LIMIT).lean<LeanEvent[]>();
    return docs.flatMap((doc) => (isLimitProviderId(doc.provider)
        ? [{provider: doc.provider, kind: doc.kind, jobId: doc.jobId ?? null, message: doc.message ?? '', at: new Date(doc.at).getTime(), day: doc.day}]
        : []));
};

export const getLimitsView = cache(async (): Promise<LimitRow[]> => {
    const now = Date.now();
    return limitsView(await getLimitEvents(now), getEasternDateString(new Date(now)), now);
});
