// The weekly run's small decisions and its one-line stamp. Pure.

import {easternParts} from "@/lib/prices/market-hours";

// The job has two crons: Monday 10:00 ET and, as a retry, Tuesday 10:00 ET. A scheduled run on
// any day but Monday is the retry: it has work only while some enrolment is still waiting for
// its week (a Monday the market was closed, or one whose quotes were refused), and otherwise
// leaves Monday's scores and stamp as they are. A run fired by hand is never the retry.
const SCHEDULED_EVENT = 'inngest/scheduled.timer';
const MONDAY = 1;
export const isRetryRun = (eventName: unknown, ts: unknown): boolean =>
    eventName === SCHEDULED_EVENT && typeof ts === 'number' && easternParts(new Date(ts)).weekday !== MONDAY;

export type HeldBack = {userId: string; symbols: string[]};

export type WeeklyRun = {
    enrolled: number;
    traded: number;          // enrolments whose plan was executed
    orders: number;          // orders that filled
    heldBack: readonly HeldBack[];
    failed: readonly string[];
    // False when the market was not open: the week was scored and nothing was claimed.
    open: boolean;
};

const named = (items: readonly string[], limit = 4): string =>
    `${items.slice(0, limit).join(', ')}${items.length > limit ? ` +${items.length - limit} more` : ''}`;

// Who traded, then everyone who did not and why: an enrolment held back for a refused quote
// and one whose run threw are named, never folded into "ran for 1/1".
export const describeWeeklyRun = ({enrolled, traded, orders, heldBack, failed, open}: WeeklyRun): string => {
    if (!open) return `Market closed: week scored, no orders sent; ${enrolled} enrolment(s) wait for the next open run`;
    const parts = [`Navigator ran for ${traded}/${enrolled} user(s), ${orders} order(s) executed`];
    if (heldBack.length > 0) {
        const symbols = [...new Set(heldBack.flatMap((item) => item.symbols))].sort();
        parts.push(`${heldBack.length} held back, no quote for ${named(symbols)}: the week's claim was given back`);
    }
    if (failed.length > 0) parts.push(`${failed.length} failed: ${named(failed.map((userId) => userId.slice(-6)))}`);
    return parts.join('; ');
};
