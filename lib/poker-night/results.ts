// An account's night at a table, as PokerResult keeps it after the room is gone: what the results
// store writes after a commit, decided here. Pure.
//
// A row carries absolute totals (never increments) and the room's seq, and the store's upsert only
// replaces a row with an older seq — so writes arriving out of order, or a write that failed and a
// later one that did not, always settle on the newest figures. Rows are written only for players
// with an account, and only when one of their figures moved (lib/poker-night/ledger.ledgerDigest)
// or a hand they were dealt into completed, or for everyone at the table's close.

import {ledgerDigest, type LedgerDigest} from '@/lib/poker-night/ledger';
import type {Env} from '@/lib/poker-night/env';
import type {TableState} from '@/lib/poker-night/types';

export type ResultRow = Omit<LedgerDigest, 'pid'> & {userId: string; pid: string; closed: boolean};

// The rows a commit from `prev` (null for a new room) to `next` writes: one per account holder in
// the ledger whose figures changed, and every account holder's when the table has just closed.
// `dealt`: the players dealt into a hand this commit completed. Their hands count moved at the
// deal, a commit that marks no ledger change, so one whose figures the completion left alone — a
// player who folded early with nothing in — is written now as well.
export const resultRows = (
    players: readonly {pid: string; userId: string | null}[], prev: TableState | null, next: TableState, dealt: readonly string[] = [],
): ResultRow[] => {
    const closed = next.status === 'closed';
    const justClosed = closed && prev?.status !== 'closed';
    const before = new Map((prev ? ledgerDigest(prev) : []).map((d) => [d.pid, JSON.stringify(d)]));
    const dealtIn = new Set(dealt);
    const accounts = new Map<string, string>();
    for (const p of players) if (p.userId !== null) accounts.set(p.pid, p.userId);
    return ledgerDigest(next).flatMap((d) => {
        const userId = accounts.get(d.pid);
        if (userId === undefined) return [];
        if (!justClosed && !dealtIn.has(d.pid) && before.get(d.pid) === JSON.stringify(d)) return [];
        return [{...d, userId, closed}];
    });
};

export type ResultContext = {env: Env; roomId: string; code: string; tableName: string; seq: number; at: number};

// One row's upsert, in the room's env: matched only while the stored row is older than this commit.
export const resultWrite = (row: ResultRow, ctx: ResultContext) => {
    const {userId, ...figures} = row;
    return {
        filter: {env: ctx.env, roomId: ctx.roomId, userId, seq: {$lt: ctx.seq}},
        update: {
            $set: {...figures, env: ctx.env, code: ctx.code, tableName: ctx.tableName, seq: ctx.seq, lastAt: new Date(ctx.at)},
            $setOnInsert: {firstAt: new Date(ctx.at)},
        },
    };
};

export const isDuplicateKey = (error: unknown): boolean =>
    typeof error === 'object' && error !== null && (error as {code?: unknown}).code === 11000;

// When an upsert fails: a duplicate key means a row already exists that the filter did not match —
// one with a newer seq, or a twin upsert that won the race — so the write is tried once more as a
// plain update. Anything else, or a failed retry, is logged and left for the next commit (rows
// carry totals, so the next write heals it).
export const onWriteError = (error: unknown, attempt: 'upsert' | 'update'): 'retry-update' | 'log' =>
    attempt === 'upsert' && isDuplicateKey(error) ? 'retry-update' : 'log';

// The retry matched nothing: a newer row really won, and that is the right outcome.
export const afterRetry = (matched: number): 'written' | 'newer-row-won' => (matched > 0 ? 'written' : 'newer-row-won');

// A night as the lobby lists it (results-store.readRecentResults): an account's totals at one
// table, with when it started and last moved.
export type RecentNight = {
    roomId: string;
    code: string;
    tableName: string;
    bought: number;
    cashedOut: number;
    chips: number;
    net: number;
    hands: number;
    wins: number;
    biggestWin: number;
    closed: boolean;
    firstAt: number;
    lastAt: number;
};
