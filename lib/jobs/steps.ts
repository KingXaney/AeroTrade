// The helpers every scheduled job builds its steps with. Pure, so vitest pins them.

import {getEasternDateString} from "@/lib/dates";

// Inngest step ids must be [a-zA-Z0-9_-]; user ids, emails, the strategies' sentinel owner and
// symbols such as BRK.B carry other characters. Idempotent: a sanitised id passes unchanged.
export const stepId = (raw: string): string => raw.replace(/[^a-zA-Z0-9_-]/g, '_');

// Bounded slices in order, none dropped — one step per slice keeps each inside the route's
// time budget. A size below 1 is treated as 1.
export const chunk = <T>(items: readonly T[], size: number): T[][] => {
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += Math.max(1, size)) {
        chunks.push(items.slice(i, i + Math.max(1, size)));
    }
    return chunks;
};

// A job's ET day comes from its triggering event, never the clock: Inngest replays the
// function body for every step, so a run that crosses midnight ET would otherwise save under
// one day and later look for another. The clock is the fallback only for an event with no ts.
export const eventDay = (ts: unknown): string =>
    getEasternDateString(new Date(typeof ts === 'number' ? ts : Date.now()));
