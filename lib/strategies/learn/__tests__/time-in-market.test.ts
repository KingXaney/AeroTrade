// Three ways of owning SPY over one window — all at once, in monthly deposits, or not at all —
// walked through the one income clock (lib/income/accrual.ts replayIncome). SPY is held as
// shares at its stored closes and paid its stored dividends the way a paper account is (to the
// shares held the evening before the ex-date, as cash on the pay date); idle cash earns the
// T-bill rate exactly as a paper account's does, and a day that needs a rate and has none
// makes the way null, never zero.

import {describe, expect, it} from 'vitest';
import {addCalendarDays, eachCalendarDay} from '@/lib/dates';
import {createIncomeClock, makeRateLookup, payDateFor, replayIncome} from '@/lib/income/accrual';
import type {RatePoint} from '@/lib/prices/types';
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
    TIM_CHART_POINTS,
    tableStarts,
    underwaterSpans,
    type WayPoint,
} from '@/lib/strategies/learn/time-in-market';

const isWeekday = (date: string) => ![0, 6].includes(new Date(`${date}T12:00:00Z`).getUTCDay());
const weekdays = (from: string, to: string) => eachCalendarDay(from, to).filter(isWeekday);

// A V: up to a peak at session 60, down 45% of the way to session 120, then a long climb.
const DATES = weekdays('2025-01-06', '2025-12-31');
const vShape = (i: number) => (i <= 60 ? 100 + i * 0.5 : i <= 120 ? 130 - (i - 60) * 0.75 : 85 + (i - 120) * 0.4);
const INDEX = DATES.map((date, i) => ({date, value: vShape(i)}));
const PEAK = DATES[60];
const TROUGH = DATES[120];
const END = DATES[DATES.length - 1];
// No dividends in the V: the ways' values are the closes' own arithmetic.
const SPY = {closes: INDEX, dividends: []};

// A point every weekday, forward-filled over weekends by the lookup, as ^IRX is stored.
const RATES: RatePoint[] = weekdays('2024-12-01', '2025-12-31').map((date) => ({date, discountPct: 4.07}));
const rateOn = makeRateLookup(RATES);
const noRate = makeRateLookup([]);
const AMOUNT = 10_000;
const cents = (x: number) => Math.round(x * 100);

// The same ways by hand, off the clock: 4.07% discount → bond-equivalent − 0.25%, compounded
// once per calendar day, the day's interest counted in that day's value.
const F = (1 + (365 * 0.0407 / (360 - 91 * 0.0407) - 0.0025)) ** (1 / 365) - 1;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
// Cash only: the amount compounding every calendar day of the window, the first and last included.
const cashByHand = (start: string, end: string) => AMOUNT * (1 + F) ** (daysBetween(start, end) + 1);
// Monthly deposits on the V: each buys SPY at the close of the first session on or after it;
// one that lands on a weekend earns interest until Monday, and that interest stays as cash.
const dcaByHand = (start: string, end: string): WayPoint[] => {
    const sessions = INDEX.filter((p) => p.date >= start && p.date <= end);
    const buys = monthlyDeposits(start, end, AMOUNT).map((deposit) => {
        const session = sessions.find((p) => p.date >= deposit.date);
        if (!session) throw new Error(`no session after ${deposit.date}`);
        return {deposit, session: session.date, shares: deposit.amount / session.value, idle: deposit.amount * ((1 + F) ** daysBetween(deposit.date, session.date) - 1)};
    });
    return sessions.map((p) => {
        const made = buys.filter((b) => b.deposit.date <= p.date);
        return {
            date: p.date,
            value: made.reduce((sum, b) => sum + b.shares * p.value + b.idle * (1 + F) ** (daysBetween(b.session, p.date) + 1), 0),
            contributed: made.reduce((sum, b) => sum + b.deposit.amount, 0),
        };
    });
};
const pctOfPutIn = (value: number) => (cents(value) - cents(AMOUNT)) / cents(AMOUNT) * 100;

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

    it('moves an inception older than the stored history up to the floor, and says nothing is out of range', () => {
        expect(resolveStart({requested: undefined, inception: '2020-01-02', today})).toEqual({from: floor, source: 'inception', outOfRange: null, floor, ceiling});
        expect(resolveStart({requested: 'abc', inception: '2020-01-02', today})).toMatchObject({from: floor, source: 'inception'});
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
        const series = lumpSum(SPY, {start: PEAK, end: END}, AMOUNT, noRate);
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

describe('dividends on the paper account\'s timetable', () => {
    // Flat SPY at $600; a $1.80 dividend goes ex on Tue 2026-06-16 (the close already reflects it).
    const flat = weekdays('2026-05-20', '2026-09-29').map((date) => ({date, value: 600}));
    const spy = {closes: flat, dividends: [{symbol: 'SPY', exDate: '2026-06-16', perShare: 1.8}]};
    const rates = weekdays('2026-05-01', '2026-09-30').map((date) => ({date, discountPct: 4}));

    it('pays nothing to a purchase made after the ex-date, all at once or in deposits', () => {
        const window = {start: '2026-06-17', end: '2026-09-29'};
        const lump = lumpSum(spy, window, AMOUNT, makeRateLookup(rates));
        expect(lump?.points.every((p) => Math.abs(p.value - AMOUNT) < 1e-9)).toBe(true);
        const monthly = dollarCostAverage(spy, window, AMOUNT, makeRateLookup(rates));
        expect(cents(monthly?.points.at(-1)?.value ?? NaN)).toBe(cents(AMOUNT));
    });

    it('pays shares held the evening before the ex-date, as cash on the pay date, which then earns', () => {
        const window = {start: '2026-06-15', end: '2026-09-29'};
        const lump = lumpSum(spy, window, AMOUNT, makeRateLookup(rates));
        const valueOn = (date: string) => lump?.points.find((p) => p.date === date)?.value ?? NaN;
        const paid = (AMOUNT / 600) * 1.8;
        expect(payDateFor('2026-06-16')).toBe('2026-06-21');
        expect(valueOn('2026-06-19')).toBeCloseTo(AMOUNT, 9);                // owed, not paid yet
        // Paid Sunday; Monday's value holds it and Monday's first cent of interest on it.
        expect(valueOn('2026-06-22') - (AMOUNT + paid)).toBeGreaterThan(0);
        expect(valueOn('2026-06-22') - (AMOUNT + paid)).toBeLessThan(0.01);
        expect(valueOn('2026-09-29')).toBeGreaterThan(AMOUNT + paid);
        // The same end as a paper account holding those shares.
        const clock = createIncomeClock({rateOn: makeRateLookup(rates), dividends: new Map([['2026-06-16', spy.dividends]])});
        const replay = replayIncome({
            from: window.start, to: window.end, startCash: AMOUNT, startHoldings: new Map(), clock,
            trades: [{date: window.start, symbol: 'SPY', side: 'buy', quantity: AMOUNT / 600, total: AMOUNT}],
        });
        const lastRows = replay.rows.filter((r) => r.date === window.end).reduce((sum, r) => sum + r.amount, 0);
        expect(valueOn('2026-09-29')).toBeCloseTo(replay.cash + lastRows + AMOUNT, 9);
    });

    it('holds its dividend cash to the same rule as any cash: no rate, no value', () => {
        const window = {start: '2026-06-15', end: '2026-09-29'};
        expect(lumpSum(spy, window, AMOUNT, makeRateLookup([]))).toBeNull();
        expect(lumpSum(spy, {start: '2026-06-17', end: '2026-09-29'}, AMOUNT, makeRateLookup([]))).not.toBeNull();
    });
});

describe('cashOnly', () => {
    it('is replayIncome with no trades: its last point is the replay\'s cash plus the final day\'s rows', () => {
        const series = cashOnly(SPY, {start: PEAK, end: END}, AMOUNT, rateOn);
        const clock = createIncomeClock({rateOn, dividends: new Map()});
        const replay = replayIncome({from: PEAK, to: END, startCash: AMOUNT, startHoldings: new Map(), trades: [], clock});
        const finalRows = replay.rows.filter((r) => r.date === END).reduce((sum, r) => sum + r.amount, 0);
        expect(Math.abs((series?.points.at(-1)?.value ?? NaN) - (replay.cash + finalRows))).toBeLessThanOrEqual(1e-9);
        // One point per session, not per calendar day, so the three ways line up on the chart.
        expect(series?.points.map((p) => p.date)).toEqual(DATES.slice(60));
    });

    it('is null, never zero, when a day in the window has no usable rate', () => {
        const gap = RATES.filter((r) => r.date < '2025-06-02' || r.date > '2025-06-20');
        expect(cashOnly(SPY, {start: PEAK, end: END}, AMOUNT, makeRateLookup(gap))).toBeNull();
        expect(cashOnly(SPY, {start: PEAK, end: END}, AMOUNT, noRate)).toBeNull();
    });
});

describe('dollarCostAverage', () => {
    it('invests each deposit at the first session on or after it, and its last point is the replay\'s', () => {
        // 2025-05-03 is a Saturday: that deposit waits for Monday the 5th, earning the weekend's interest.
        const window = {start: '2025-02-03', end: END};
        const series = dollarCostAverage(SPY, window, AMOUNT, rateOn);
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
        const points = dollarCostAverage(SPY, {start: '2025-02-03', end: END}, AMOUNT, rateOn)?.points ?? [];
        const onMarch3 = points.find((p) => p.date === '2025-03-03');
        expect(cents(onMarch3?.contributed ?? NaN)).toBe(cents(2 * AMOUNT / 11) + 1);   // 11 deposits, the first cents go to the earliest
        expect(points.every((p, i) => i === 0 || p.contributed >= points[i - 1].contributed)).toBe(true);
    });

    it('is the lump sum when the window holds a single deposit', () => {
        const window = {start: PEAK, end: DATES[70]};
        expect(dollarCostAverage(SPY, window, AMOUNT, rateOn)?.points).toEqual(lumpSum(SPY, window, AMOUNT, rateOn)?.points);
    });

    it('is the deposits\' shares at each close plus the weekend interest they earned, session by session', () => {
        const series = dollarCostAverage(SPY, {start: PEAK, end: END}, AMOUNT, rateOn);
        const byHand = dcaByHand(PEAK, END);
        expect(series?.points.map((p) => p.date)).toEqual(byHand.map((p) => p.date));
        series?.points.forEach((p, i) => {
            expect(Math.abs(p.value - byHand[i].value), p.date).toBeLessThan(1e-6);
            expect(cents(p.contributed), p.date).toBe(cents(byHand[i].contributed));
        });
        // A weekend deposit did wait: the residual interest is in the hand count.
        expect(monthlyDeposits(PEAK, END, AMOUNT).some((d) => !isWeekday(d.date))).toBe(true);
    });

    it('needs a rate only on a day it holds cash: weekday deposits never sit idle, a weekend one does', () => {
        // Jan 6, Feb 6 and Mar 6 are all weekdays — nothing waits overnight.
        expect(dollarCostAverage(SPY, {start: '2025-01-06', end: '2025-03-31'}, AMOUNT, noRate)).not.toBeNull();
        expect(dollarCostAverage(SPY, {start: '2025-02-03', end: END}, AMOUNT, noRate)).toBeNull();
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

    it('is not the drawdown: off its own high but above what went in is not underwater', () => {
        expect(underwaterSpans([pt('d1', 100), pt('d2', 110), pt('d3', 105), pt('d4', 100.01)])).toEqual([]);
        // …and a deposit that lifts what went in can put the same value under it.
        expect(underwaterSpans([pt('d1', 110), pt('d2', 105, 150), pt('d3', 160, 150)]).map((s) => [s.from, s.sessions])).toEqual([['d2', 1]]);
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

    it('adds every span into the day count and names the longest, wherever it falls', () => {
        const deposits = [{date: 'd1', amount: 100}];
        const longerFirst = summarizeWay({points: [pt('d1', 100), pt('d2', 99), pt('d3', 98), pt('d4', 97), pt('d5', 101), pt('d6', 99), pt('d7', 102)], deposits});
        expect(longerFirst).toMatchObject({underwaterSessions: 4, sessions: 7, longest: {from: 'd2', to: 'd4', sessions: 3, ongoing: false}});
        const longerLast = summarizeWay({points: [pt('d1', 100), pt('d2', 99), pt('d3', 101), pt('d4', 98), pt('d5', 97), pt('d6', 96), pt('d7', 95)], deposits});
        expect(longerLast).toMatchObject({underwaterSessions: 5, longest: {from: 'd4', to: 'd7', sessions: 4, ongoing: true}});
    });

    it('counts the monthly way\'s days below the dollars deposited so far, by hand', () => {
        const byHand = dcaByHand(PEAK, END);
        const below = byHand.filter((p) => cents(p.value) < cents(p.contributed)).length;
        const summary = summarizeWay(dollarCostAverage(SPY, {start: PEAK, end: END}, AMOUNT, rateOn));
        expect(below).toBeGreaterThan(0);
        expect(summary?.underwaterSessions).toBe(below);
        expect(summary?.sessions).toBe(byHand.length);
    });

    it('reads the V differently from its peak and from its low', () => {
        const fromPeak = summarizeWay(lumpSum(SPY, {start: PEAK, end: END}, AMOUNT, rateOn));
        const fromLow = summarizeWay(lumpSum(SPY, {start: TROUGH, end: END}, AMOUNT, rateOn));
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
        const rows = startDateTable(SPY, rateOn, tableStarts('2025-12-31'), AMOUNT);
        expect(rows.map((r) => r.start)).toEqual(['2025-09-30', '2025-06-30', '2025-03-31']);
        const ways = {lumpSum, dollarCostAverage, cashOnly};
        for (const row of rows) {
            for (const key of ['lumpSum', 'dollarCostAverage', 'cashOnly'] as const) {
                const way = summarizeWay(ways[key](SPY, {start: row.start, end: END}, AMOUNT, rateOn));
                expect(row.ways[key], `${row.start} ${key}`).toBe((way?.changeCents ?? NaN) / (way?.contributedCents ?? NaN) * 100);
            }
            // Each column by hand: the closes' ratio, the deposits' shares plus weekend interest,
            // and cash compounding every calendar day.
            expect(row.ways.lumpSum).toBeCloseTo(pctOfPutIn(AMOUNT * vShape(DATES.length - 1) / vShape(DATES.indexOf(row.start))), 9);
            expect(row.ways.dollarCostAverage).toBeCloseTo(pctOfPutIn(dcaByHand(row.start, END).at(-1)?.value ?? NaN), 9);
            expect(row.ways.cashOnly).toBeCloseTo(pctOfPutIn(cashByHand(row.start, END)), 9);
        }
        // The three columns are three different numbers on the V.
        expect(new Set(Object.values(rows[1].ways)).size).toBe(3);
        expect(startDateTable(SPY, noRate, ['2025-06-30'], AMOUNT)[0].ways.cashOnly).toBeNull();
    });

    it('starts each row at the first session on or after its date, once per session', () => {
        // Sat Sep 27 and Sun Sep 28 both open on Mon Sep 29; a start before the first stored close
        // and one on the last are left out.
        const rows = startDateTable(SPY, rateOn, ['2025-09-27', '2025-09-28', '2025-09-29', '2024-12-31', END], AMOUNT);
        expect(rows.map((r) => r.start)).toEqual(['2025-09-29']);
        expect(rows[0].ways.lumpSum).toBeCloseTo(pctOfPutIn(AMOUNT * vShape(DATES.length - 1) / vShape(DATES.indexOf('2025-09-29'))), 9);
        expect(startDateTable(SPY, rateOn, ['2025-06-28', '2025-03-29'], AMOUNT).map((r) => r.start)).toEqual(['2025-06-30', '2025-03-31']);
    });
});

describe('buildTimeInMarket', () => {
    const resolved = resolveStart({requested: PEAK, inception: null, today: '2026-01-02'});

    it('lines the three ways up on one set of sessions, each starting at one dollar per dollar', () => {
        const view = buildTimeInMarket({spy: SPY, rates: RATES, resolved, amount: AMOUNT, table: []});
        expect(view.status).toBe('ok');
        expect(view.start).toBe(PEAK);
        expect(view.end).toBe(END);
        expect(view.sessions).toBe(DATES.length - 60);
        expect(view.deposits).toBe(monthlyDeposits(PEAK, END, AMOUNT).length);
        expect(view.ways.dollarCostAverage?.deposits).toBe(view.deposits);
        // Two hundred sessions go to the client as TIM_CHART_POINTS of them, both ends kept.
        expect(DATES.length - 60).toBeGreaterThan(TIM_CHART_POINTS);
        expect(view.chart.dates).toHaveLength(TIM_CHART_POINTS);
        expect(view.chart.dates[0]).toBe(PEAK);
        expect(view.chart.dates.at(-1)).toBe(END);
        expect(view.chart.dates.every((date, i) => DATES.includes(date) && (i === 0 || date > view.chart.dates[i - 1]))).toBe(true);
        expect(view.chart.lines.map((l) => l.key)).toEqual(['lumpSum', 'dollarCostAverage', 'cashOnly']);
        for (const line of view.chart.lines) {
            expect(line.values).toHaveLength(view.chart.dates.length);
            expect(line.values[0]).toBeCloseTo(1, 3);
        }
        // The last charted value is the way's own last session, as the tiles print it: for the
        // monthly way, its end over the dollars it took in — never rebased to its first deposit.
        const [lump, dca, cash] = view.chart.lines;
        expect(lump.values.at(-1)).toBeCloseTo(vShape(DATES.length - 1) / vShape(60), 6);
        expect(cash.values.at(-1)).toBeCloseTo((view.ways.cashOnly?.endCents ?? NaN) / 100 / AMOUNT, 6);
        expect(dca.values.at(-1)).toBeCloseTo((view.ways.dollarCostAverage?.endCents ?? NaN) / (view.ways.dollarCostAverage?.contributedCents ?? NaN), 5);
        expect(dca.values.at(-1)).toBeCloseTo((dcaByHand(PEAK, END).at(-1)?.value ?? NaN) / AMOUNT, 5);
        // …and a charted session carries that session's value, not a neighbour's.
        const k = 97;
        expect(lump.values[k]).toBeCloseTo(vShape(DATES.indexOf(view.chart.dates[k])) / vShape(60), 6);
        expect(view.rateGap).toBeNull();
    });

    it('drops a way the rates cannot price and names the first day without one', () => {
        const rates = RATES.filter((r) => r.date < '2025-06-02' || r.date > '2025-06-20');
        const view = buildTimeInMarket({spy: SPY, rates, resolved, amount: AMOUNT, table: []});
        expect(view.ways.cashOnly).toBeNull();
        expect(view.ways.lumpSum).not.toBeNull();
        expect(view.chart.lines.map((l) => l.key)).not.toContain('cashOnly');
        // The monthly way keeps a weekend deposit's interest as cash through the gap: however
        // little it holds, a day with cash and no rate is unpriced, never a zero.
        expect(monthlyDeposits(PEAK, END, AMOUNT).some((d) => d.date < '2025-06-02' && !isWeekday(d.date))).toBe(true);
        expect(view.ways.dollarCostAverage).toBeNull();
        expect(view.chart.lines.map((l) => l.key)).toEqual(['lumpSum']);
        // The last point before the gap is Fri May 30; usableRate carries it seven days, through Jun 6.
        expect(view.rateGap).toBe('2025-06-07');
    });

    it('says so when the stored history does not reach the window', () => {
        const view = buildTimeInMarket({spy: {closes: INDEX.slice(0, 1), dividends: []}, rates: RATES, resolved: resolveStart({requested: DATES[0], inception: null, today: '2026-01-02'}), amount: AMOUNT, table: []});
        expect(view.status).toBe('no-history');
        expect(view.chart.lines).toEqual([]);
    });
});
