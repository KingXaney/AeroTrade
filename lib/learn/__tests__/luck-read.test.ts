// The read behind "Luck or skill", with the price store and the snapshot reader stubbed: which
// session the window ends on while the morning price job is still storing the large caps, and
// that the day memo never pins a read taken before they land.
//
// The night's income job tops SPY (and the T-bill series) up at 00:05 ET; the large caps arrive
// with the 09:35 weekday strategies job, in chunks. At 08:00 SPY already has yesterday's close
// and 28 of the 40 large caps do not.

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const stored = vi.hoisted(() => ({
    // symbol → the dates it has a close on (every stored close is 100 at the start, 110 at the end)
    latest: new Map<string, string>(),
    holdReads: [] as {from: string; to: string}[],
    snapshotReads: [] as string[],
}));

vi.mock('@/lib/prices/store', () => ({
    getLatestBars: async (symbols: string[]) => new Map(symbols.flatMap((s) => {
        const date = stored.latest.get(s);
        return date ? [[s, {date, close: 110}]] : [];
    })),
    getHoldWindowBars: async (symbols: string[], from: string, to: string) => {
        stored.holdReads.push({from, to});
        const bars = symbols.flatMap((symbol) => {
            const latest = stored.latest.get(symbol);
            if (!latest) return [];
            return [{symbol, date: from, close: 100}, ...(latest >= to ? [{symbol, date: to, close: 110}] : [])];
        });
        return {bars, dividends: []};
    },
    getRatePoints: async () => [],
}));
vi.mock('@/lib/trading/account', () => ({
    getLastSnapshotBetween: async (_accountId: string, _from: string, to: string) => {
        stored.snapshotReads.push(to);
        return {date: to, totalValue: 105_000, startingBalance: 100_000};
    },
}));

import {getLuckOrSkill} from '@/lib/learn/luck-read';
import {LARGE_CAPS} from '@/lib/strategies/universe';

const YESTERDAY = '2026-09-29';
const DAY_BEFORE = '2026-09-28';
const account = {accountId: 'acct1', inceptionAt: Date.parse('2026-08-03T15:00:00Z'), startingBalance: 100_000, unpriced: 0, holdings: 3, ownFills: true};

const setLatest = (spy: string, caps: (i: number) => string) => {
    stored.latest = new Map([['SPY', spy], ['^IRX', spy], ...LARGE_CAPS.map((s, i) => [s, caps(i)] as [string, string])]);
};

describe('getLuckOrSkill', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        stored.holdReads = [];
        stored.snapshotReads = [];
    });
    afterEach(() => vi.useRealTimers());

    it('ends on the last session the whole pool has, and is not pinned by a read taken before the prices land', async () => {
        vi.setSystemTime(new Date('2026-09-30T12:00:00Z'));   // 08:00 ET
        setLatest(YESTERDAY, (i) => (i < 12 ? YESTERDAY : DAY_BEFORE));
        const early = await getLuckOrSkill(account);
        expect(early).toMatchObject({status: 'ready', end: DAY_BEFORE, pool: LARGE_CAPS.length});
        expect(stored.snapshotReads).toEqual([DAY_BEFORE]);

        vi.setSystemTime(new Date('2026-09-30T20:00:00Z'));   // 16:00 ET, the same ET day
        setLatest(YESTERDAY, () => YESTERDAY);
        const later = await getLuckOrSkill({...account, accountId: 'acct2'});
        expect(later).toMatchObject({status: 'ready', end: YESTERDAY, pool: LARGE_CAPS.length});
        expect(stored.holdReads.map((r) => r.to)).toEqual([DAY_BEFORE, YESTERDAY]);
    });

    it('reads a window once per day while its data stays the same', async () => {
        vi.setSystemTime(new Date('2026-10-01T14:00:00Z'));
        setLatest(YESTERDAY, () => YESTERDAY);
        await getLuckOrSkill(account);
        await getLuckOrSkill({...account, accountId: 'acct2'});
        expect(stored.holdReads).toHaveLength(1);
    });

    it('drops a large cap the price job has stopped serving rather than holding the window back', async () => {
        vi.setSystemTime(new Date('2026-10-02T14:00:00Z'));
        setLatest('2026-10-01', (i) => (i === 0 ? '2026-09-10' : '2026-10-01'));
        const view = await getLuckOrSkill(account);
        expect(view).toMatchObject({status: 'ready', end: '2026-10-01', pool: LARGE_CAPS.length - 1});
    });

    it('draws the sample but no "you" on an account without a fill of the learner\'s, and reads no snapshot for it', async () => {
        vi.setSystemTime(new Date('2026-10-03T14:00:00Z'));
        setLatest('2026-10-02', () => '2026-10-02');
        const view = await getLuckOrSkill({...account, ownFills: false});
        expect(view).toMatchObject({status: 'ready', yours: null, withheld: 'not-yours'});
        expect(stored.snapshotReads).toEqual([]);
    });
});
