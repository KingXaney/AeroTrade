// The read behind "Time in the market", with the price store and the account read stubbed:
// SPY's history, the T-bill points and the start-date table are read once per ET day while the
// stored data stays the same, and read again as soon as its stamp (the latest SPY close and
// T-bill point) moves — a rate removed or a close added is never hidden behind the memo.

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const stored = vi.hoisted(() => ({
    rates: true,
    lastClose: 510,
    barReads: 0,
    rateReads: 0,
    barsFrom: [] as string[],
    // Each account's current record: inceptionAt, or createdAt for one from before it existed.
    accounts: [{inceptionAt: new Date('2026-03-02T15:00:00Z'), createdAt: new Date('2026-03-02T15:00:00Z')}] as {inceptionAt?: Date; createdAt: Date}[],
}));

vi.mock('@/lib/prices/store', () => ({
    getLatestBars: async (symbols: string[]) => new Map(symbols.flatMap((symbol) => {
        if (symbol === 'SPY') return [[symbol, {date: '2026-09-29', close: stored.lastClose}]];
        return stored.rates ? [[symbol, {date: '2026-09-29', close: 4.07}]] : [];
    })),
    getBarsForSymbols: async (_symbols: string[], {from}: {from: string}) => {
        stored.barReads += 1;
        stored.barsFrom.push(from);
        const bars: {date: string; close: number; dividend?: number}[] = [];
        for (let t = Date.parse(`${from}T12:00:00Z`); t <= Date.parse('2026-09-29T12:00:00Z'); t += 86_400_000) {
            const date = new Date(t).toISOString().slice(0, 10);
            if ([0, 6].includes(new Date(t).getUTCDay())) continue;
            bars.push({date, close: date === '2026-09-29' ? stored.lastClose : 500});
        }
        return new Map([['SPY', bars]]);
    },
    getRatePoints: async ({from}: {from: string}) => {
        stored.rateReads += 1;
        return stored.rates ? [{date: from, discountPct: 4.07}, {date: '2026-09-29', discountPct: 4.07}].concat(
            Array.from({length: 800}, (_, i) => ({date: new Date(Date.parse(`${from}T12:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10), discountPct: 4.07})),
        ).sort((a, b) => a.date.localeCompare(b.date)) : [];
    },
}));
vi.mock('@/lib/trading/accounts', () => ({
    readAccountsForUser: async () => stored.accounts,
}));

import {getTimeInMarket} from '@/lib/strategies/learn/time-in-market-store';
import {TIM_CHART_POINTS} from '@/lib/strategies/learn/time-in-market';

describe('getTimeInMarket', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-09-30T14:00:00Z'));
        stored.barReads = 0;
        stored.rateReads = 0;
        stored.barsFrom = [];
        stored.rates = true;
        stored.lastClose = 510;
        stored.accounts = [{inceptionAt: new Date('2026-03-02T15:00:00Z'), createdAt: new Date('2026-03-02T15:00:00Z')}];
    });
    afterEach(() => vi.useRealTimers());

    it('reads the history once for learners who share it, and ships a decimated chart', async () => {
        const one = await getTimeInMarket('user-1', undefined);
        const two = await getTimeInMarket('user-2', '2026-03-02');
        expect(stored.barReads).toBe(1);
        expect(stored.rateReads).toBe(1);
        expect(one?.status).toBe('ok');
        expect(one?.table.length).toBeGreaterThan(0);
        expect(two?.table).toEqual(one?.table);
        expect(one?.chart.dates.length).toBeLessThanOrEqual(TIM_CHART_POINTS);
        expect(one?.chart.dates.at(-1)).toBe('2026-09-29');
    });

    it('reaches back past the table\'s earliest start, not only the window\'s: eight rows a quarter apart', async () => {
        vi.setSystemTime(new Date('2026-10-05T14:00:00Z'));   // a fresh day: nothing memoised yet
        const view = await getTimeInMarket('user-1', undefined);
        // The window starts on the account's inception; six of the eight starts are before it.
        expect(view?.start).toBe('2026-03-02');
        // The earliest start, Sat Oct 5 2024, opens on Monday the 7th: the read begins a week
        // before it, so a close on or before it is stored and the row is kept, not dropped as
        // "before the stored history".
        expect(stored.barsFrom).toEqual(['2024-09-28']);
        // Two years back a quarter at a time, each on the first session on or after its date.
        expect(view?.table.map((row) => row.start)).toEqual([
            '2026-07-06', '2026-04-06', '2026-01-05', '2025-10-06', '2025-07-07', '2025-04-07', '2025-01-06', '2024-10-07',
        ]);
    });

    it('starts on the earliest current record among the learner\'s accounts, whichever was opened first', async () => {
        vi.setSystemTime(new Date('2026-10-06T14:00:00Z'));
        // The first account opened was reset in June; a second one has run since January.
        stored.accounts = [
            {inceptionAt: new Date('2026-06-15T15:00:00Z'), createdAt: new Date('2025-11-03T15:00:00Z')},
            {inceptionAt: new Date('2026-01-12T15:00:00Z'), createdAt: new Date('2026-01-12T15:00:00Z')},
            {createdAt: new Date('2026-02-02T15:00:00Z')},
        ];
        const view = await getTimeInMarket('user-3', undefined);
        expect(view?.inception).toBe('2026-01-12');
        expect(view?.resolved).toMatchObject({from: '2026-01-12', source: 'inception'});
    });

    it('reads again when a rate goes missing or a new close lands, the same day', async () => {
        vi.setSystemTime(new Date('2026-10-01T14:00:00Z'));   // a fresh day: nothing memoised yet
        const before = await getTimeInMarket('user-1', undefined);
        expect(before?.ways.cashOnly).not.toBeNull();
        stored.rates = false;
        const noRate = await getTimeInMarket('user-1', undefined);
        expect(noRate?.ways.cashOnly).toBeNull();
        stored.rates = true;
        stored.lastClose = 520;
        const moved = await getTimeInMarket('user-1', undefined);
        expect(moved?.ways.lumpSum?.endCents).not.toBe(before?.ways.lumpSum?.endCents);
        expect(stored.barReads).toBe(3);
    });
});
