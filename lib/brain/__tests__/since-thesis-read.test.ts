// The "since thesis" read with the price store stubbed: each ticker is read from its own thesis
// date (SPY from the earliest), and the day memo is keyed on the stored data's stamp, so a line
// appears as soon as its bars are stored — never pinned to a read taken before they were.

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {Bar} from '@/lib/prices/signals';

const stored = vi.hoisted(() => ({
    bars: new Map<string, Bar[]>(),
    requests: [] as {symbol: string; from: string}[][],
}));

vi.mock('@/lib/prices/store', () => ({
    getLatestBars: async (symbols: string[]) => new Map(symbols.flatMap((symbol) => {
        const last = stored.bars.get(symbol)?.at(-1);
        return last ? [[symbol, {date: last.date, close: last.close}]] : [];
    })),
    getBarsFrom: async (requests: {symbol: string; from: string}[]) => {
        stored.requests.push(requests);
        return new Map(requests.map(({symbol, from}) => [symbol, (stored.bars.get(symbol) ?? []).filter((bar) => bar.date >= from)]));
    },
}));

import {getSinceThesis} from '@/lib/brain/store';

const thesis = (key: string, weightSlow: number, since: string) => ({
    key, type: 'ticker' as const, displayName: key, weightFast: 1, weightSlow, sentimentFast: 0, sentimentSlow: 0,
    thesisSince: Date.parse(`${since}T15:00:00Z`), lastSeenAt: Date.parse(`${since}T15:00:00Z`),
});
const series = (from: string, to: string, close: (i: number) => number): Bar[] => {
    const out: Bar[] = [];
    for (let t = Date.parse(`${from}T12:00:00Z`), i = 0; t <= Date.parse(`${to}T12:00:00Z`); t += 86_400_000) {
        if ([0, 6].includes(new Date(t).getUTCDay())) continue;
        out.push({date: new Date(t).toISOString().slice(0, 10), close: close(i++)});
    }
    return out;
};

describe('getSinceThesis', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-09-30T14:00:00Z'));
        stored.bars = new Map();
        stored.requests = [];
    });
    afterEach(() => vi.useRealTimers());

    it('reads each ticker from its own thesis date and SPY from the earliest', async () => {
        stored.bars = new Map([
            ['NVDA', series('2026-08-01', '2026-09-29', (i) => 100 + i)],
            ['AMD', series('2026-08-01', '2026-09-29', (i) => 50 + i)],
            ['SPY', series('2026-08-01', '2026-09-29', () => 500)],
        ]);
        const lines = await getSinceThesis([thesis('NVDA', 9, '2026-09-01'), thesis('AMD', 8, '2026-09-21')]);
        expect(stored.requests).toEqual([[{symbol: 'NVDA', from: '2026-09-01'}, {symbol: 'AMD', from: '2026-09-21'}, {symbol: 'SPY', from: '2026-09-01'}]]);
        expect(Object.keys(lines).sort()).toEqual(['AMD', 'NVDA']);
        expect(lines.AMD.from).toBe('2026-09-21');
        // The same data again the same day: nothing re-read.
        await getSinceThesis([thesis('NVDA', 9, '2026-09-01'), thesis('AMD', 8, '2026-09-21')]);
        expect(stored.requests).toHaveLength(1);
    });

    it('shows a line once its bars are stored, the same day as a read that found none', async () => {
        const theses = [thesis('QATH', 9, '2026-09-10')];
        expect(await getSinceThesis(theses)).toEqual({});
        stored.bars = new Map([
            ['QATH', series('2026-09-01', '2026-09-29', (i) => 100 * (1 + 0.004 * i))],
            ['SPY', series('2026-09-01', '2026-09-29', (i) => 500 * (1 + 0.001 * i))],
        ]);
        const lines = await getSinceThesis(theses);
        expect(lines.QATH).toMatchObject({from: '2026-09-10', to: '2026-09-29'});
        // …and a later close moves the line too.
        stored.bars.set('QATH', [...(stored.bars.get('QATH') ?? []), {date: '2026-09-30', close: 200}]);
        stored.bars.set('SPY', [...(stored.bars.get('SPY') ?? []), {date: '2026-09-30', close: 600}]);
        expect((await getSinceThesis(theses)).QATH.to).toBe('2026-09-30');
        expect(stored.requests).toHaveLength(3);
    });
});
