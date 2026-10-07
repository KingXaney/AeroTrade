// An account's results row: written only for players with an account whose figures moved or who
// were dealt into the hand that completed, for every account at the close, never for a guest; the
// upsert's seq guard; and what a failed write does next — a duplicate key retries once as an update,
// a retry that matches nothing means a newer row won, anything else is logged.

import {describe, expect, it} from 'vitest';
import {afterRetry, isDuplicateKey, onWriteError, resultRows, resultWrite} from '@/lib/poker-night/results';
import type {TableState} from '@/lib/poker-night/types';
import {deal, F, host, moves, ok, play, T0, table} from './fixtures';

const players = [
    {pid: 'p0', userId: 'u0'},
    {pid: 'p1', userId: null},
    {pid: 'p2', userId: 'u2'},
];

const start = (): TableState => table({0: 1000, 1: 1000, 2: 1000}, {lastBigBlind: 0});

describe('resultRows', () => {
    it('writes every account in the ledger for a new room and never a guest', () => {
        const rows = resultRows(players, null, start());
        expect(rows.map((r) => [r.userId, r.pid])).toEqual([['u0', 'p0'], ['u2', 'p2']]);
        expect(rows[0]).toMatchObject({bought: 1000, cashedOut: 0, chips: 1000, net: 0, closed: false});
    });

    it('writes nothing when no figure moved', () => {
        const s = start();
        expect(resultRows(players, s, s)).toEqual([]);
        expect(resultRows(players, s, structuredClone(s))).toEqual([]);
    });

    it('writes only the accounts whose figures moved', () => {
        // p0 sits out, so the hand is p1 (a guest) against p2 (an account), who folds the small blind.
        const before = play(start(), {type: 'sit-out', by: 'p0', at: T0});
        const s = moves(deal(before, {holes: {1: 'AhAd', 2: 'KhKd'}}), F);
        expect(s.hand!.phase).toBe('complete');
        const rows = resultRows(players, before, s);
        expect(rows.map((r) => r.userId)).toEqual(['u2']);
        expect(rows[0]).toMatchObject({hands: 1, net: -10, chips: 990});
    });

    it('writes an account dealt into the hand that completed, though the completion left its figures alone', () => {
        // Three-handed, the button (p2, an account) folds first with nothing in; then the small
        // blind (p0) folds and the hand completes. p2's hands count moved at the deal, not now.
        const dealt = deal(start(), {holes: {0: 'AhAd', 1: 'KhKd', 2: 'QhQd'}});
        expect(dealt.hand!.button).toBe(2);
        const folded = moves(dealt, F);
        const done = moves(folded, F);
        expect(done.hand!.phase).toBe('complete');
        expect(resultRows(players, folded, done).map((r) => r.userId)).toEqual(['u0']);
        const pids = done.hand!.seats.map((p) => p.pid);
        const rows = resultRows(players, folded, done, pids);
        expect(rows.map((r) => r.userId)).toEqual(['u0', 'u2']);
        expect(rows[1]).toMatchObject({pid: 'p2', hands: 1, net: 0});
    });

    it('writes every account at the close, marked closed, figures moved or not', () => {
        const s = start();
        const closed = ok(host(s, {op: 'end'}));
        const rows = resultRows(players, s, closed);
        expect(rows.map((r) => r.userId)).toEqual(['u0', 'u2']);
        expect(rows.every((r) => r.closed)).toBe(true);
        expect(rows[0]).toMatchObject({cashedOut: 1000, chips: 0, net: 0});
        // Once closed, a later commit writes only what moves.
        expect(resultRows(players, closed, closed)).toEqual([]);
    });
});

describe('resultWrite', () => {
    it('upserts absolute figures behind a seq guard', () => {
        const [row] = resultRows(players, null, start());
        const write = resultWrite(row, {env: 'production', roomId: 'r1', code: 'K7QXM4', tableName: 'Friday', seq: 42, at: T0});
        expect(write.filter).toEqual({env: 'production', roomId: 'r1', userId: 'u0', seq: {$lt: 42}});
        expect(write.update.$set).toMatchObject({pid: 'p0', bought: 1000, net: 0, env: 'production', code: 'K7QXM4', tableName: 'Friday', seq: 42, closed: false});
        expect(write.update.$set).not.toHaveProperty('userId');
        expect(write.update.$set.lastAt).toEqual(new Date(T0));
        expect(write.update.$setOnInsert).toEqual({firstAt: new Date(T0)});
    });
});

describe('a failed write', () => {
    it('retries a duplicate key once as an update, and logs anything else', () => {
        expect(isDuplicateKey({code: 11000})).toBe(true);
        expect(isDuplicateKey(new Error('boom'))).toBe(false);
        expect(onWriteError({code: 11000}, 'upsert')).toBe('retry-update');
        expect(onWriteError({code: 11000}, 'update')).toBe('log');
        expect(onWriteError(new Error('network'), 'upsert')).toBe('log');
        expect(onWriteError(null, 'upsert')).toBe('log');
    });

    it('reads a retry that matched nothing as a newer row having won', () => {
        expect(afterRetry(1)).toBe('written');
        expect(afterRetry(0)).toBe('newer-row-won');
    });
});
