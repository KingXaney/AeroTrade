// The one in-process memo the request-path reads share: kept for one day (or one run), at most
// `limit` keys, and — through remember() — only for answers the caller says are worth keeping.

import {describe, expect, it, vi} from 'vitest';
import {createDayMemo, remember} from '@/lib/day-memo';

describe('createDayMemo', () => {
    it('keeps values for the day they were stored and forgets them when the date turns', () => {
        const memo = createDayMemo<number>(2);
        memo.set('a', '2026-09-25', 1);
        expect(memo.get('a', '2026-09-25')).toBe(1);
        expect(memo.get('a', '2026-09-26')).toBeUndefined();
        expect(memo.get('a', '2026-09-25')).toBeUndefined();
    });

    it('holds at most `limit` keys, dropping the oldest', () => {
        const memo = createDayMemo<number>(2);
        memo.set('a', 'd', 1);
        memo.set('b', 'd', 2);
        memo.set('c', 'd', 3);
        expect(memo.get('a', 'd')).toBeUndefined();
        expect(memo.get('b', 'd')).toBe(2);
        expect(memo.get('c', 'd')).toBe(3);
    });
});

describe('remember', () => {
    it('loads once per key and day, and again once the key or the day changes', async () => {
        const memo = createDayMemo<string>(8);
        const load = vi.fn(async () => 'value');
        expect(await remember(memo, 'k', 'd1', load)).toBe('value');
        expect(await remember(memo, 'k', 'd1', load)).toBe('value');
        expect(load).toHaveBeenCalledTimes(1);
        await remember(memo, 'other', 'd1', load);
        await remember(memo, 'k', 'd2', load);
        expect(load).toHaveBeenCalledTimes(3);
    });

    it('keeps only what `keep` accepts, so a partial answer is read again', async () => {
        const memo = createDayMemo<number>(8);
        let calls = 0;
        const load = async () => (calls += 1);
        await remember(memo, 'k', 'd', load, (n) => n >= 2);
        await remember(memo, 'k', 'd', load, (n) => n >= 2);
        await remember(memo, 'k', 'd', load, (n) => n >= 2);
        expect(calls).toBe(2);
    });

    it('stores nothing when the load throws', async () => {
        const memo = createDayMemo<number>(8);
        await expect(remember(memo, 'k', 'd', async () => { throw new Error('down'); })).rejects.toThrow('down');
        expect(memo.get('k', 'd')).toBeUndefined();
    });
});
