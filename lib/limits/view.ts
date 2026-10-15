// The limits panel's rows (pure): one per registered provider, in the registry's order, with
// the hits recorded against it today and over the last week, the latest hit, and a state the
// panel colours. A provider with no hit recorded is 'clear' — which says only that nothing was
// recorded, never that the app is within its limits (a provider that fails silently records
// nothing).

import {LIMIT_PROVIDERS, type LimitKind, type LimitProvider, type LimitProviderId} from "@/lib/limits/registry";

export type LimitEvent = {
    provider: LimitProviderId;
    kind: LimitKind;
    jobId: string | null;
    message: string;
    at: number;     // epoch ms
    day: string;    // the ET day
};

export type LimitState = 'clear' | 'hit-week' | 'hit-today';

export type LimitRow = LimitProvider & {
    state: LimitState;
    hitsToday: number;
    hitsWeek: number;
    lastHit: {at: number; kind: LimitKind; jobId: string | null; message: string} | null;
};

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export const limitsView = (events: readonly LimitEvent[], today: string, now: number): LimitRow[] =>
    LIMIT_PROVIDERS.map((provider) => {
        const mine = events.filter((event) => event.provider === provider.id && event.at <= now && event.at > now - WEEK_MS);
        const hitsToday = mine.filter((event) => event.day === today).length;
        const latest = [...mine].sort((a, b) => b.at - a.at)[0] ?? null;
        return {
            ...provider,
            state: hitsToday > 0 ? 'hit-today' : mine.length > 0 ? 'hit-week' : 'clear',
            hitsToday,
            hitsWeek: mine.length,
            lastHit: latest ? {at: latest.at, kind: latest.kind, jobId: latest.jobId, message: latest.message} : null,
        };
    });

// The rows with a hit first, newest hit first, then the rest in the registry's order.
export const sortedLimitRows = (rows: readonly LimitRow[]): LimitRow[] => {
    const hit = rows.filter((row) => row.lastHit !== null).sort((a, b) => (b.lastHit?.at ?? 0) - (a.lastHit?.at ?? 0));
    const clear = rows.filter((row) => row.lastHit === null);
    return [...hit, ...clear];
};
