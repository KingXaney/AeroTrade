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
}));

vi.mock('@/lib/prices/store', () => ({
    getLatestBars: async (symbols: string[]) => new Map(symbols.flatMap((symbol) => {
        if (symbol === 'SPY') return [[symbol, {date: '2026-09-29', close: stored.lastClose}]];
        return stored.rates ? [[symbol, {date: '2026-09-29', close: 4.07}]] : [];
    })),
    getBarsForSymbols: async (_symbols: string[], {from}: {from: string}) => {
        stored.barReads += 1;
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
vi.mock('@/lib/trading/account', () => ({
    readAccountsForUser: async () => [{inceptionAt: new Date('2026-03-02T15:00:00Z'), createdAt: new Date('2026-03-02T15:00:00Z')}],
}));

import {getTimeInMarket} from '@/lib/learn/time-in-market-read';
import {TIM_CHART_POINTS} from '@/lib/learn/time-in-market';

describe('getTimeInMarket', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-09-30T14:00:00Z'));
        stored.barReads = 0;
        stored.rateReads = 0;
        stored.rates = true;
        stored.lastClose = 510;
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
