// Three ways of owning SPY over one window — all at once, in monthly deposits, or not at all —
// walked through the one income clock (lib/trading/income.ts replayIncome). The index stands
// in for SPY with dividends reinvested, as getBenchmarkIndex serves it; idle cash earns the
// T-bill rate exactly as a paper account's does, and a day that needs a rate and has none
// makes the way null, never zero.

import {describe, expect, it} from 'vitest';
import {addCalendarDays, eachCalendarDay} from '@/lib/prices/calendar-days';
import {createIncomeClock, makeRateLookup, replayIncome, type RatePoint} from '@/lib/trading/income';
import {
    buildTimeInMarket,
    cashOnly,
    dollarCostAverage,
    lumpSum,
    MIN_WINDOW_DAYS,
    MAX_LOOKBACK_DAYS,
    monthlyDeposits,
    resolveStart,
    startDateTable,
    summarizeWay,
    tableStarts,
    underwaterSpans,
    type WayPoint,
} from '@/lib/learn/time-in-market';

const isWeekday = (date: string) => ![0, 6].includes(new Date(`${date}T12:00:00Z`).getUTCDay());
const weekdays = (from: string, to: string) => eachCalendarDay(from, to).filter(isWeekday);

// A V: up to a peak at session 60, down 45% of the way to session 120, then a long climb.
const DATES = weekdays('2025-01-06', '2025-12-31');
const vShape = (i: number) => (i <= 60 ? 100 + i * 0.5 : i <= 120 ? 130 - (i - 60) * 0.75 : 85 + (i - 120) * 0.4);
const INDEX = DATES.map((date, i) => ({date, value: vShape(i)}));
const PEAK = DATES[60];
const TROUGH = DATES[120];
const END = DATES[DATES.length - 1];

// A point every weekday, forward-filled over weekends by the lookup, as ^IRX is stored.
const RATES: RatePoint[] = weekdays('2024-12-01', '2025-12-31').map((date) => ({date, discountPct: 4.07}));
const rateOn = makeRateLookup(RATES);
const noRate = makeRateLookup([]);
const AMOUNT = 10_000;
const cents = (x: number) => Math.round(x * 100);

describe('resolveStart', () => {
    const today = '2026-09-29';
    const floor = addCalendarDays(today, -MAX_LOOKBACK_DAYS);
    const ceiling = addCalendarDays(today, -MIN_WINDOW_DAYS);

    it('takes a valid date inside the range as asked', () => {
        expect(resolveStart({requested: '2025-03-03', inception: '2026-01-10', today}))
            .toEqual({from: '2025-03-03', source: 'requested', outOfRange: null, floor, ceiling});
    });

    it('ignores anything that is not one calendar date and starts at the first account\'s inception', () => {
        for (const requested of ['2025-02-30', 'abc', '2025-1-5', '2025-03-03T00:00', '', ['2025-03-03'], 12345, undefined, null]) {
            expect(resolveStart({requested, inception: '2026-01-10', today}), String(requested)).toMatchObject({from: '2026-01-10', source: 'inception', outOfRange: null});
        }
    });

    it('clamps a date before the stored history or too close to today, and says which one it moved', () => {
        expect(resolveStart({requested: '1990-01-01', inception: null, today})).toMatchObject({from: floor, source: 'requested', outOfRange: '1990-01-01'});
        expect(resolveStart({requested: today, inception: null, today})).toMatchObject({from: ceiling, source: 'requested', outOfRange: today});
    });

    it('gives a young account a window long enough to hold three monthly deposits', () => {
        expect(resolveStart({requested: undefined, inception: '2026-09-20', today})).toMatchObject({from: ceiling, source: 'inception', outOfRange: null});
        expect(monthlyDeposits(ceiling, today, AMOUNT).length).toBeGreaterThanOrEqual(3);
    });

    it('starts a year back when there is no account to date it from', () => {
        expect(resolveStart({requested: undefined, inception: null, today})).toMatchObject({from: '2025-09-29', source: 'fallback'});
    });
});

describe('monthlyDeposits', () => {
    it('falls on the same day each month, the month\'s last day when it has fewer', () => {
        expect(monthlyDeposits('2025-01-31', '2025-05-15', AMOUNT).map((d) => d.date)).toEqual(['2025-01-31', '2025-02-28', '2025-03-31', '2025-04-30']);
        expect(monthlyDeposits('2024-01-31', '2024-03-01', AMOUNT).map((d) => d.date)).toEqual(['2024-01-31', '2024-02-29']);
    });

    it('splits the amount into whole cents that add back to it exactly', () => {
        const three = monthlyDeposits('2025-01-06', '2025-03-20', AMOUNT);
        expect(three.map((d) => d.amount)).toEqual([3333.34, 3333.33, 3333.33]);
        for (const end of ['2025-02-01', '2025-07-09', '2025-12-31']) {
            const deposits = monthlyDeposits('2025-01-06', end, AMOUNT);
            expect(deposits.reduce((sum, d) => sum + cents(d.amount), 0)).toBe(cents(AMOUNT));
        }
    });
});

describe('lumpSum', () => {
    it('is the index scaled to the amount on every session, and never needs a rate', () => {
        const series = lumpSum(INDEX, {start: PEAK, end: END}, AMOUNT, noRate);
        expect(series).not.toBeNull();
        const points = series?.points ?? [];
        expect(points[0].date).toBe(PEAK);
        expect(points.at(-1)?.date).toBe(END);
        for (const point of points) {
            const idx = INDEX.find((p) => p.date === point.date)?.value ?? NaN;
            expect(Math.abs(point.value - AMOUNT * idx / vShape(60))).toBeLessThanOrEqual(1e-9);
            expect(point.contributed).toBe(AMOUNT);
        }
    });
});

describe('cashOnly', () => {
    it('is replayIncome with no trades: its last point is the replay\'s cash plus the final day\'s rows', () => {
        const series = cashOnly(INDEX, {start: PEAK, end: END}, AMOUNT, rateOn);
        const clock = createIncomeClock({rateOn, dividends: new Map()});
        const replay = replayIncome({from: PEAK, to: END, startCash: AMOUNT, startHoldings: new Map(), trades: [], clock});
        const finalRows = replay.rows.filter((r) => r.date === END).reduce((sum, r) => sum + r.amount, 0);
        expect(Math.abs((series?.points.at(-1)?.value ?? NaN) - (replay.cash + finalRows))).toBeLessThanOrEqual(1e-9);
        // One point per session, not per calendar day, so the three ways line up on the chart.
        expect(series?.points.map((p) => p.date)).toEqual(DATES.slice(60));
    });

    it('is null, never zero, when a day in the window has no usable rate', () => {
        const gap = RATES.filter((r) => r.date < '2025-06-02' || r.date > '2025-06-20');
        expect(cashOnly(INDEX, {start: PEAK, end: END}, AMOUNT, makeRateLookup(gap))).toBeNull();
        expect(cashOnly(INDEX, {start: PEAK, end: END}, AMOUNT, noRate)).toBeNull();
    });
});

describe('dollarCostAverage', () => {
    it('invests each deposit at the first session on or after it, and its last point is the replay\'s', () => {
        // 2025-05-03 is a Saturday: that deposit waits for Monday the 5th, earning the weekend's interest.
        const window = {start: '2025-02-03', end: END};
        const series = dollarCostAverage(INDEX, window, AMOUNT, rateOn);
        const deposits = monthlyDeposits('2025-02-03', END, AMOUNT);
        expect(series?.deposits).toEqual(deposits);
        expect(deposits.map((d) => d.date)).toContain('2025-05-03');

        const sessionOn = (date: string) => INDEX.find((p) => p.date >= date);
        const trades = deposits.map((d) => {
            const session = sessionOn(d.date);
            return {date: session?.date ?? '', symbol: 'SPY', side: 'buy' as const, quantity: d.amount / (session?.value ?? NaN), total: d.amount};
        });
        expect(trades[deposits.findIndex((d) => d.date === '2025-05-03')].date).toBe('2025-05-05');
        const clock = createIncomeClock({rateOn, dividends: new Map()});
        const replay = replayIncome({from: window.start, to: END, startCash: 0, startHoldings: new Map(), trades, deposits, clock});
        const finalRows = replay.rows.filter((r) => r.date === END).reduce((sum, r) => sum + r.amount, 0);
        const units = trades.reduce((sum, t) => sum + t.quantity, 0);
        expect(replay.rows.some((r) => r.date === '2025-05-03')).toBe(true);
        expect(Math.abs((series?.points.at(-1)?.value ?? NaN) - (replay.cash + finalRows + units * INDEX[INDEX.length - 1].value))).toBeLessThanOrEqual(1e-9);
        expect(cents(series?.points.at(-1)?.contributed ?? NaN)).toBe(cents(AMOUNT));
    });

    it('counts only what has been deposited so far as contributed', () => {
        const points = dollarCostAverage(INDEX, {start: '2025-02-03', end: END}, AMOUNT, rateOn)?.points ?? [];
        const onMarch3 = points.find((p) => p.date === '2025-03-03');
        expect(cents(onMarch3?.contributed ?? NaN)).toBe(cents(2 * AMOUNT / 11) + 1);   // 11 deposits, the first cents go to the earliest
        expect(points.every((p, i) => i === 0 || p.contributed >= points[i - 1].contributed)).toBe(true);
    });

    it('is the lump sum when the window holds a single deposit', () => {
        const window = {start: PEAK, end: DATES[70]};
        expect(dollarCostAverage(INDEX, window, AMOUNT, rateOn)?.points).toEqual(lumpSum(INDEX, window, AMOUNT, rateOn)?.points);
    });

    it('needs a rate only on a day it holds cash: weekday deposits never sit idle, a weekend one does', () => {
        // Jan 6, Feb 6 and Mar 6 are all weekdays — nothing waits overnight.
        expect(dollarCostAverage(INDEX, {start: '2025-01-06', end: '2025-03-31'}, AMOUNT, noRate)).not.toBeNull();
        expect(dollarCostAverage(INDEX, {start: '2025-02-03', end: END}, AMOUNT, noRate)).toBeNull();
    });
});

const pt = (date: string, value: number, contributed = 100): WayPoint => ({date, value, contributed});

describe('underwaterSpans', () => {
    it('finds each run of sessions below the dollars put in, to the cent', () => {
        const spans = underwaterSpans([pt('d1', 100), pt('d2', 99), pt('d3', 98), pt('d4', 99.999), pt('d5', 101), pt('d6', 97)]);
        expect(spans.map(({from, to, sessions, ongoing}) => ({from, to, sessions, ongoing}))).toEqual([
            {from: 'd2', to: 'd3', sessions: 2, ongoing: false},
            {from: 'd6', to: 'd6', sessions: 1, ongoing: true},
        ]);
        expect(spans[0].deepestPct).toBeCloseTo(-2, 12);
        expect(spans[1].deepestPct).toBeCloseTo(-3, 12);
        expect(underwaterSpans([pt('d1', 100), pt('d2', 101)])).toEqual([]);
        expect(underwaterSpans([])).toEqual([]);
    });
});

describe('summarizeWay', () => {
    it('ends, changes and counts in whole cents that add up', () => {
        const summary = summarizeWay({points: [pt('d1', 100, 100), pt('d2', 90.004, 150), pt('d3', 160.126, 150)], deposits: [{date: 'd1', amount: 100}, {date: 'd2', amount: 50}]});
        expect(summary).toEqual({
            contributedCents: 15_000, endCents: 16_013, changeCents: 1_013, deposits: 2, sessions: 3, underwaterSessions: 1,
            longest: {from: 'd2', to: 'd2', sessions: 1, ongoing: false, deepestPct: (90.004 / 150 - 1) * 100},
        });
        expect(summarizeWay(null)).toBeNull();
    });

    it('reads the V differently from its peak and from its low', () => {
        const fromPeak = summarizeWay(lumpSum(INDEX, {start: PEAK, end: END}, AMOUNT, rateOn));
        const fromLow = summarizeWay(lumpSum(INDEX, {start: TROUGH, end: END}, AMOUNT, rateOn));
        expect(fromPeak?.underwaterSessions).toBeGreaterThan(60);
        expect(fromPeak?.longest?.from).toBe(DATES[61]);
        expect(fromLow?.underwaterSessions).toBe(0);
        expect(fromLow?.longest).toBeNull();
        expect(fromLow?.changeCents).toBeGreaterThan(fromPeak?.changeCents ?? Infinity);
    });
});

describe('startDateTable', () => {
    it('steps back a quarter at a time from today', () => {
        expect(tableStarts('2025-12-31')).toEqual(['2025-09-30', '2025-06-30', '2025-03-31', '2024-12-31', '2024-09-30', '2024-06-30', '2024-03-31', '2023-12-31']);
    });

    it('runs the three ways from each start the stored history reaches, to the same end', () => {
        const rows = startDateTable(INDEX, rateOn, tableStarts('2025-12-31'), AMOUNT);
        expect(rows.map((r) => r.start)).toEqual(['2025-09-30', '2025-06-30', '2025-03-31']);
        for (const row of rows) {
            const lump = summarizeWay(lumpSum(INDEX, {start: row.start, end: END}, AMOUNT, rateOn));
            expect(row.ways.lumpSum).toBe((lump?.changeCents ?? NaN) / (lump?.contributedCents ?? NaN) * 100);
            expect(row.ways.cashOnly).not.toBeNull();
        }
        expect(startDateTable(INDEX, noRate, ['2025-06-30'], AMOUNT)[0].ways.cashOnly).toBeNull();
    });
});

describe('buildTimeInMarket', () => {
    const resolved = resolveStart({requested: PEAK, inception: null, today: '2026-01-02'});

    it('lines the three ways up on one set of sessions, each starting at one dollar per dollar', () => {
        const view = buildTimeInMarket({index: INDEX, rates: RATES, resolved, amount: AMOUNT, starts: []});
        expect(view.status).toBe('ok');
        expect(view.start).toBe(PEAK);
        expect(view.end).toBe(END);
        expect(view.sessions).toBe(DATES.length - 60);
        expect(view.deposits).toBe(monthlyDeposits(PEAK, END, AMOUNT).length);
        expect(view.ways.dollarCostAverage?.deposits).toBe(view.deposits);
        expect(view.chart.dates).toEqual(DATES.slice(60));
        expect(view.chart.lines.map((l) => l.key)).toEqual(['lumpSum', 'dollarCostAverage', 'cashOnly']);
        for (const line of view.chart.lines) {
            expect(line.values).toHaveLength(view.chart.dates.length);
            expect(line.values[0]).toBeCloseTo(1, 3);
        }
        expect(view.rateGap).toBeNull();
    });

    it('drops a way the rates cannot price and names the first day without one', () => {
        const rates = RATES.filter((r) => r.date < '2025-06-02' || r.date > '2025-06-20');
        const view = buildTimeInMarket({index: INDEX, rates, resolved, amount: AMOUNT, starts: []});
        expect(view.ways.cashOnly).toBeNull();
        expect(view.ways.lumpSum).not.toBeNull();
        expect(view.chart.lines.map((l) => l.key)).not.toContain('cashOnly');
        // The last point before the gap is Fri May 30; usableRate carries it seven days, through Jun 6.
        expect(view.rateGap).toBe('2025-06-07');
    });

    it('says so when the stored history does not reach the window', () => {
        const view = buildTimeInMarket({index: INDEX.slice(0, 1), rates: RATES, resolved: resolveStart({requested: DATES[0], inception: null, today: '2026-01-02'}), amount: AMOUNT, starts: []});
        expect(view.status).toBe('no-history');
        expect(view.chart.lines).toEqual([]);
    });
});
