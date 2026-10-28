// The weekly session's pure parts: which day and kind a run is, its id, when an undecided session
// lapses, the body the service is sent, and the stamp the jobs strip prints. The DB half is
// lib/agent-world/store.ts; the job wrapper is lib/jobs/functions/agent-world.ts.

import {LAPSE_HOURS, LAPSE_WEEKDAY, SESSION_SCHEDULE, SESSION_WAIT_ROUND_MINUTES, SESSION_WAIT_ROUNDS, type ApprovalMode, type PaperclipAgentKey, type Rating, type SessionKind} from "@/lib/agent-world/config";
import type {AgentWorldOff} from "@/lib/agent-world/env";
import type {Book} from "@/lib/agent-world/orders";
import {addCalendarDays, getEasternDateString, getEasternWeekKey} from "@/lib/dates";
import {formatEasternTimestamp} from "@/lib/format";
import {easternParts, easternToInstant, isTradingDay} from "@/lib/prices/market-hours";

// What the event may carry: nothing for a cron; {manual, force, dryRun, by} for the owner's Run now
// and a preview; {manual, source: 'paperclip', paperclip} for a routine fired from Paperclip.
export type AgentWorldEventData = {
    manual: boolean;
    dryRun: boolean;
    force: boolean;
    by: string | null;
    source: 'schedule' | 'owner' | 'paperclip';
    paperclip: {runId: string | null; taskId: string | null} | null;
};

const shortText = (value: unknown, max = 120): string | null => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null);

export const readEventData = (raw: unknown): AgentWorldEventData => {
    const data = (raw ?? {}) as Record<string, unknown>;
    const paperclip = data.paperclip && typeof data.paperclip === 'object' ? data.paperclip as Record<string, unknown> : null;
    const source = data.source === 'paperclip' ? 'paperclip' : data.manual === true ? 'owner' : 'schedule';
    return {
        manual: data.manual === true || source === 'paperclip',
        dryRun: data.dryRun === true,
        force: data.force === true,
        by: shortText(data.by, 200),
        source,
        paperclip: paperclip ? {runId: shortText(paperclip.runId), taskId: shortText(paperclip.taskId)} : null,
    };
};

export type AgentWorldDay = AgentWorldEventData & {
    nowMs: number;
    today: string;
    weekKey: string;
    kind: SessionKind;
    sessionId: string;
    tradingDay: boolean;
};

const pad = (n: number): string => String(Math.floor(n)).padStart(2, '0');

// Anchored to the trigger instant: Inngest re-runs the function body once per step, so a run keeps
// its day, kind and id across every replay. A weekly session's id is its week, which is what makes
// the Tuesday retry and a re-fired cron find it; a manual or preview session is a second session in
// the week, named by the minute and second it was asked for.
export const agentWorldDay = (raw: unknown, at: Date): AgentWorldDay => {
    const data = readEventData(raw);
    const today = getEasternDateString(at);
    const weekKey = getEasternWeekKey(today);
    const kind: SessionKind = data.dryRun ? 'preview' : data.manual ? 'manual' : 'weekly';
    const {minutes} = easternParts(at);
    const stamp = `${today.replaceAll('-', '')}-${pad(minutes / 60)}${pad(minutes % 60)}${pad(at.getUTCSeconds())}`;
    return {
        ...data,
        nowMs: at.getTime(),
        today,
        weekKey,
        kind,
        sessionId: kind === 'weekly' ? `aw-${weekKey}` : `aw-${weekKey}-${kind}-${stamp}`,
        tradingDay: isTradingDay(today),
    };
};

const WEEKDAY_INDEX: Readonly<Record<string, number>> = {Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6};
const HOUR_MS = 3_600_000;

// When a session nobody decided lapses: LAPSE_HOURS after it started or the next Friday 15:30 ET
// (config's LAPSE_WEEKDAY), whichever comes first, so a week's orders never outlive the week.
export const lapseDeadline = (startMs: number): number => {
    const today = getEasternDateString(new Date(startMs));
    const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
    const ahead = (WEEKDAY_INDEX[LAPSE_WEEKDAY.day] - weekday + 7) % 7;
    let day = addCalendarDays(today, ahead);
    let weekdayAt = easternToInstant(day, LAPSE_WEEKDAY.hour, LAPSE_WEEKDAY.minute);
    if (weekdayAt <= startMs) {
        day = addCalendarDays(day, 7);
        weekdayAt = easternToInstant(day, LAPSE_WEEKDAY.hour, LAPSE_WEEKDAY.minute);
    }
    return Math.min(startMs + LAPSE_HOURS * HOUR_MS, weekdayAt);
};

const WEEK_MS = 7 * 24 * HOUR_MS;

// When the next weekly session starts after `nowMs`: the next Monday 08:30 ET (config's
// SESSION_SCHEDULE), or the Tuesday after it when that Monday is a market holiday.
export const nextWeeklySession = (nowMs: number): number => {
    const today = getEasternDateString(new Date(nowMs));
    for (let ahead = 0; ahead < 15; ahead++) {
        const date = addCalendarDays(today, ahead);
        const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
        const first = weekday === WEEKDAY_INDEX[SESSION_SCHEDULE.day];
        const retry = weekday === WEEKDAY_INDEX[SESSION_SCHEDULE.retryDay] && !isTradingDay(addCalendarDays(date, -1));
        if (!(first && isTradingDay(date)) && !retry) continue;
        const at = easternToInstant(date, SESSION_SCHEDULE.hour, SESSION_SCHEDULE.minute);
        if (at > nowMs) return at;
    }
    return nowMs + WEEK_MS;
};

// How long the job waits for the service in all.
export const sessionWaitMinutes = (): number => SESSION_WAIT_ROUNDS * SESSION_WAIT_ROUND_MINUTES;

// The account as the service's agents are told it (TradingAgents' PortfolioContext).
export const portfolioOf = (book: Book) => ({
    cash: Math.round(book.cash * 100) / 100,
    currency: 'USD',
    positions: book.positions.filter((p) => p.quantity > 0).map((p) => ({
        ticker: p.symbol,
        quantity: p.quantity,
        averagePrice: p.avgCost > 0 ? Math.round(p.avgCost * 100) / 100 : null,
    })),
});

// The body of the signed POST /runs (services/agent-world's RunRequest), serialised once so the
// bytes sent are the bytes signed.
export const runRequestBody = ({day, symbols, book, callbackUrl, approval, paperclip}: {
    day: Pick<AgentWorldDay, 'sessionId' | 'today' | 'dryRun'>;
    symbols: readonly string[];
    book: Book;
    callbackUrl: string;
    approval: ApprovalMode;
    paperclip: {issueId: string | null; runId: string | null; agentIds: Partial<Record<PaperclipAgentKey, string>>} | null;
}): string => JSON.stringify({
    sessionId: day.sessionId,
    symbols,
    tradeDate: day.today,
    portfolio: portfolioOf(book),
    callbackUrl,
    paperclip,
    approval,
    dryRun: day.dryRun,
});

const OFF_REASON: Readonly<Record<AgentWorldOff, string>> = {
    'disabled': 'AGENT_WORLD_ENABLED is false',
    'unconfigured': 'no service configured (AGENT_WORLD_SERVICE_URL and AGENT_WORLD_SERVICE_SECRET)',
    'no-approver': 'owner approval with nobody to approve (AGENT_WORLD_OWNER_EMAILS or LAB_OWNER_EMAILS)',
};

const ratingsText = (ratings: Readonly<Record<string, Rating>>): string => {
    const parts = Object.entries(ratings).map(([symbol, rating]) => `${symbol} ${rating}`);
    return parts.length > 0 ? `ratings ${parts.join(', ')}` : 'no ratings';
};

export type RunStamp =
    | {outcome: 'off'; reason: AgentWorldOff}
    | {outcome: 'holiday'; weekKey: string; today: string}
    | {outcome: 'already'; weekKey: string}
    | {outcome: 'live'; sessionId: string; liveSessionId: string}
    | {outcome: 'refused'; sessionId: string; status: number; message: string}
    | {outcome: 'no-answer'; sessionId: string}
    | {outcome: 'service-failed'; sessionId: string; reason: string; message: string}
    | {outcome: 'preview'; sessionId: string; ratings: Readonly<Record<string, Rating>>; orders: number}
    | {outcome: 'no-orders'; sessionId: string; ratings: Readonly<Record<string, Rating>>}
    | {outcome: 'awaiting'; sessionId: string; ratings: Readonly<Record<string, Rating>>; orders: number; lapseAt: number}
    | {outcome: 'declined'; sessionId: string}
    | {outcome: 'lapsed'; sessionId: string; at: number}
    | {outcome: 'executed'; sessionId: string; auto: boolean; orders: number; filled: number; firstFailure: string | null; mirrored: boolean | null};

// The jobs strip's line for a run: what happened, in one sentence a person reads at a glance. Every
// signed-in reader sees the strip, so a decision is "the owner's", never an address.
export const describeRun = (stamp: RunStamp): string => {
    const head = (id: string) => `Trading agent world (${id})`;
    switch (stamp.outcome) {
        case 'off':
            return `Trading agent world: off (${OFF_REASON[stamp.reason]})`;
        case 'holiday':
            return `Trading agent world (week of ${stamp.weekKey}): ${stamp.today} is not a trading day; the Tuesday run takes the week`;
        case 'already':
            return `Trading agent world (week of ${stamp.weekKey}): already ran this week`;
        case 'live':
            return `${head(stamp.sessionId)}: not started, ${stamp.liveSessionId} is still in progress`;
        case 'refused':
            return `${head(stamp.sessionId)}: the service refused the run (HTTP ${stamp.status}${stamp.message ? `: ${stamp.message}` : ''}); session failed`;
        case 'no-answer':
            return `${head(stamp.sessionId)}: no answer from the service in ${sessionWaitMinutes()} minutes; session failed`;
        case 'service-failed':
            return `${head(stamp.sessionId)}: the service stopped (${stamp.reason}: ${stamp.message})`;
        case 'preview':
            return `${head(stamp.sessionId)}, preview: ${ratingsText(stamp.ratings)}; ${stamp.orders} order(s) planned, none sent`;
        case 'no-orders':
            return `${head(stamp.sessionId)}: ${ratingsText(stamp.ratings)}; no order (every rating kept the book as it is)`;
        case 'awaiting':
            return `${head(stamp.sessionId)}: ${ratingsText(stamp.ratings)}; ${stamp.orders} order(s) planned; awaiting the owner (lapses ${formatEasternTimestamp(stamp.lapseAt)})`;
        case 'declined':
            return `${head(stamp.sessionId)}: declined by the owner; nothing traded`;
        case 'lapsed':
            return `${head(stamp.sessionId)}: lapsed at ${formatEasternTimestamp(stamp.at)} with no decision; nothing traded`;
        case 'executed': {
            const failed = stamp.orders - stamp.filled;
            const who = stamp.auto ? 'approved automatically' : 'approved by the owner';
            const paperclip = stamp.mirrored === true ? '; Paperclip updated' : stamp.mirrored === false ? '; Paperclip not reached' : '';
            return `${head(stamp.sessionId)}: ${who}; ${stamp.filled}/${stamp.orders} order(s) filled${failed > 0 ? `; ${failed} failed (${stamp.firstFailure ?? 'no message'})` : ''}${paperclip}`;
        }
    }
};
