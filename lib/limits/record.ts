// Filing a limit hit (server-only, DB-bound): one insert against a registered provider, never
// throwing — the catch site that calls it is already handling a failure, and a tracker that
// fails the job it watches is worse than none. `recordLimitIf` classifies first
// (lib/limits/detect.ts) and files nothing for an error that is not a limit.

import LimitEvent from "@/database/models/limit-event.model";
import {connectToDatabase} from "@/database/mongoose";
import {getEasternDateString} from "@/lib/dates";
import {classifyLimit} from "@/lib/limits/detect";
import type {LimitKind, LimitProviderId} from "@/lib/limits/registry";

export const LIMIT_MESSAGE_MAX = 200;

export type LimitHit = {provider: LimitProviderId; kind: LimitKind; jobId?: string; message: string};

const messageOf = (value: unknown): string => {
    const text = value instanceof Error ? value.message : typeof value === 'string' ? value : JSON.stringify(value) ?? '';
    return text.replace(/\s+/g, ' ').trim().slice(0, LIMIT_MESSAGE_MAX);
};

export const recordLimitHit = async ({provider, kind, jobId, message}: LimitHit): Promise<void> => {
    try {
        await connectToDatabase();
        const at = new Date();
        await LimitEvent.create({provider, kind, ...(jobId ? {jobId} : {}), message: messageOf(message), at, day: getEasternDateString(at)});
    } catch (error) {
        console.error(`Could not record a limit hit for ${provider}:`, error);
    }
};

// Classify and file in one call; the kind filed, or null when the error was not a limit.
export const recordLimitIf = async (provider: LimitProviderId, error: unknown, jobId?: string): Promise<LimitKind | null> => {
    const kind = classifyLimit(provider, error);
    if (kind) await recordLimitHit({provider, kind, jobId, message: messageOf(error)});
    return kind;
};
