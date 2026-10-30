import {describe, expect, it} from 'vitest';
import type {CultureFeed} from '@/lib/culture/config';
import type {CultureScoringInput} from '@/lib/culture/scoring';
import {SIGNAL_HORIZONS_WEEKS, bookOf, forwardReturn, measureCultureSignals, type MeasuredWeek} from '@/lib/culture/signal-check';
import type {Bar} from '@/lib/prices/signals';

const input = (symbol: string, patch: Partial<CultureScoringInput> = {}): CultureScoringInput => ({
    symbol,
    brands: [{id: symbol.toLowerCase(), name: symbol}],
    attentionAnomaly: 0.1,
    attentionTrend: 0.05,
    attentionPersistence: 2,
    quietAttention: 0.05,
    categoryShare: 0.5,
    attentionSinceReport: 0.1,
    attentionSlow: 2,
    sentimentSlow: 0.1,
    appRank: null,
    hasThesis: false,
    signals: {r63: 0.02, r126: 0.05, r252: 0.1, vol63: 0.2, ma200dist: 0.05},
    barsCount: 300,
    quoted: true,
    brandsCovered: 1,
    ...patch,
});

// Twenty Mondays, one session each, and twelve owners whose next week's return is exactly what
// their attention jump said it would be — plus one owner the week could not buy, whose attention
// says the opposite of what it went on to do.
const WEEKS = 20;
const NAMES = Array.from({length: 12}, (_, j) => `S${j}`);
const calendar = Array.from({length: WEEKS}, (_, k) => new Date(Date.UTC(2024, 0, 1 + 7 * k)).toISOString().slice(0, 10));
const jump = (j: number, k: number) => (((j * 7 + k * 5) % 12) - 5.5) / 10;
const FEEDS: CultureFeed[] = ['price', 'wikipedia'];

const barsFor = (move: (k: number) => number): Bar[] => {
    let price = 100;
    return calendar.map((date, k) => {
        const bar = {date, open: price, close: price};
        price *= 1 + move(k);
        return bar;
    });
};

const bars = new Map<string, Bar[]>([
    ...NAMES.map((name, j) => [name, barsFor((k) => 0.01 * jump(j, k))] as const),
    ['LATE', barsFor((k) => (k % 2 === 0 ? -0.2 : 0.2))],
]);

const weeks: MeasuredWeek[] = calendar.map((_, k) => ({
    index: k,
    feeds: FEEDS,
    inputs: [
        ...NAMES.map((name, j) => input(name, {attentionAnomaly: jump(j, k), attentionTrend: -jump(j, k)})),
        input('LATE', {attentionAnomaly: k % 2 === 0 ? 9 : -9, barsCount: 10}),
    ],
}));

const rows = measureCultureSignals({weeks, calendar, bars, profiles: ['spike', 'quiet', 'price']});
const row = (signal: string, horizonWeeks: number) => rows.find((r) => r.signal === signal && r.horizonWeeks === horizonWeeks);

describe('measureCultureSignals', () => {
    it('finds a term that ranked next week exactly, and one that ranked it backwards', () => {
        expect(row('attentionAnomaly', 1)).toMatchObject({weeks: WEEKS - 1, meanIc: expect.closeTo(1, 12), positiveShare: 1});
        expect(row('attentionTrend', 1)).toMatchObject({meanIc: expect.closeTo(-1, 12), positiveShare: 0});
    });

    it("measures a picker's whole score the same way", () => {
        // Spike's weights lean on the jump more than on the trend that mirrors it.
        expect(row('score:spike', 1)?.meanIc).toBeCloseTo(1, 12);
    });

    it('leaves out the names the week could not buy', () => {
        // LATE's jumps point the wrong way every week; counted, the IC would fall short of 1.
        expect(row('attentionAnomaly', 1)?.meanIc).toBeCloseTo(1, 12);
    });

    it('says nothing of a signal that did not vary, a feed the weeks lacked, or too few weeks ahead', () => {
        // Momentum and the quiet terms are the same for every name; slow attention needs mentions.
        for (const signal of ['momentumLong', 'quietAttention', 'attentionSlow', 'thesis', 'sentimentSlow', 'score:price', 'score:quiet']) {
            expect(rows.some((r) => r.signal === signal)).toBe(false);
        }
        // Thirteen weeks ahead leaves seven weeks to measure, fewer than eight.
        expect(SIGNAL_HORIZONS_WEEKS).toEqual([1, 2, 4, 8, 13]);
        expect(row('attentionAnomaly', 13)).toBeUndefined();
        expect(row('attentionAnomaly', 8)?.weeks).toBe(WEEKS - 8);
    });

    it('is the same for the same weeks', () => {
        expect(measureCultureSignals({weeks, calendar, bars, profiles: ['spike', 'quiet', 'price']})).toEqual(rows);
    });
});

describe('forwardReturn', () => {
    const series: Bar[] = [
        {date: '2024-01-01', open: 100, close: 101},
        {date: '2024-01-03', close: 102, dividend: 1},
        {date: '2024-01-08', open: 103, close: 104},
        {date: '2024-01-09', open: 110, close: 111, dividend: 5},
    ];

    it("runs from one session's open to another's, with the dividends that went ex between them", () => {
        expect(forwardReturn(bookOf(series), '2024-01-01', '2024-01-08')).toBeCloseTo((103 + 1) / 100 - 1, 12);
        // A dividend on the last day counts; one on the first does not.
        expect(forwardReturn(bookOf(series), '2024-01-03', '2024-01-09')).toBeCloseTo((110 + 5) / 102 - 1, 12);
    });

    it('needs a price on both days', () => {
        expect(forwardReturn(bookOf(series), '2024-01-01', '2024-01-02')).toBeNull();
        expect(forwardReturn(undefined, '2024-01-01', '2024-01-08')).toBeNull();
    });
});
