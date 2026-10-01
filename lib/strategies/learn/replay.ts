// Decision replay: pairs a strategy fill with the stored board row and planned order
// the rule looked at that morning. Pure; the read (getBoardRowsForFills) lives in
// lib/strategies/page-store.ts.

import {getEasternDateString} from "@/lib/utils";
import {STRATEGY_RUN_TTL_DAYS} from "@/lib/strategies/config";
import type {SignalRow} from "@/lib/strategies/types";
import type {RunOrderView} from "@/lib/strategies/views";
import {daysBetween} from "@/lib/learn/facts";
import {REPLAY_COPY} from "@/lib/learn/copy/replay";

export type ReplayRun = {asOf: string; board: readonly SignalRow[]; orders: readonly RunOrderView[]};
export type ReplayMatch = {row: SignalRow | null; order: RunOrderView | null};

// A strategy fills on the morning of its run date, so the ET date of the fill is the
// run's date.
export const fillDate = (createdAtMs: number): string => getEasternDateString(new Date(createdAtMs));

export const isReplayExpired = (date: string, today: string): boolean =>
    daysBetween(date, today) > STRATEGY_RUN_TTL_DAYS;

export const matchFillToRun = (run: ReplayRun, symbol: string, side: 'buy' | 'sell'): ReplayMatch => ({
    row: run.board.find((r) => r.symbol === symbol) ?? null,
    order: run.orders.find((o) => o.symbol === symbol && o.side === side) ?? null,
});

export const describeReplay = (match: ReplayMatch | null, asOf: string | null, expired: boolean): string => {
    if (match && asOf && (match.row || match.order)) return REPLAY_COPY.caption(asOf);
    return expired ? REPLAY_COPY.expired : REPLAY_COPY.missing;
};

// The reason a fill's "What the rule saw" decodes and hands to "Ask in chat": the planned
// order's while the run record lasts, else the reason the fill itself stores — an expired
// record loses the board row, not the rule's words. Null when neither has any.
export const replayReason = (match: ReplayMatch | null, fillReason: string | undefined): string | null => {
    const reason = match?.order?.reason ?? fillReason;
    return reason && reason.trim() !== '' ? reason : null;
};
