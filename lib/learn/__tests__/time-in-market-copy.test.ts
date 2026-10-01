// Copy for "Time in the market". Every sentence is rendered on a grid of inputs and held to the
// 'copy' tier of lib/learn/banned.ts. The tiles are parsed back from what they print: worth at
// the end minus the amount the window line states is the printed change to the cent, and the
// printed percentage is that change over that amount — on hand-picked cents and on the ways the
// pure module computes. The amount is stated once, in the window line.

import {describe, expect, it} from 'vitest';
import {findBanned} from '@/lib/learn/banned';
import {eachCalendarDay} from '@/lib/prices/calendar-days';
import {makeRateLookup} from '@/lib/income/accrual';
import {
    cashOnly,
    dollarCostAverage,
    lumpSum,
    MAX_LOOKBACK_DAYS,
    MIN_WINDOW_DAYS,
    summarizeWay,
    WAY_KEYS,
    type StartSource,
    type WaySummary,
} from '@/lib/strategies/learn/time-in-market';
import {changePctText, moneyFromCents, signedCents, TIM_COPY, wayTiles} from '@/lib/learn/copy/time-in-market';

const clean = (text: string | null) => {
    if (text === null) return;
    expect(text, text).not.toMatch(/undefined|NaN|null|\[object|Infinity/);
    expect(findBanned(text, 'copy'), text).toEqual([]);
};

const dollars = (text: string): number => {
    const match = /^([+−]?)\$([\d,]+\.\d{2})$/.exec(text);
    if (!match) throw new Error(`not money: ${text}`);
    const cents = Math.round(Number(match[2].replace(/,/g, '')) * 100);
    return match[1] === '−' ? -cents : cents;
};

const summary = (contributedCents: number, endCents: number, patch: Partial<WaySummary> = {}): WaySummary => ({
    contributedCents, endCents, changeCents: endCents - contributedCents, deposits: 12, sessions: 250, underwaterSessions: 0, longest: null, ...patch,
});

// The amount the window line states, in cents: "$10,000 each way · …" or "$12,345.67 each way · …".
const windowAmount = (line: string): number => {
    const match = /^\$([\d,]+(?:\.\d{2})?) each way · /.exec(line);
    if (!match) throw new Error(`no amount: ${line}`);
    return Math.round(Number(match[1].replace(/,/g, '')) * 100);
};

// What a reader can check with a pencil: the printed numbers, parsed back, against the amount
// the window line printed.
const expectTilesAddUp = (tiles: ReturnType<typeof wayTiles>, putIn: number) => {
    const end = dollars(tiles.end.value);
    const change = dollars(tiles.change.value);
    expect(end - putIn, `${tiles.end.value} − ${putIn}¢ vs ${tiles.change.value}`).toBe(change);
    const pct = /^([+−]?)(\d+\.\d{2})% of the dollars put in$/.exec(tiles.change.hint ?? '');
    expect(pct, tiles.change.hint).not.toBeNull();
    const printed = (pct?.[1] === '−' ? -1 : 1) * Number(pct?.[2]);
    expect(printed).toBe(Math.round(change / putIn * 10_000) / 100 || 0);
};

describe('money and percentages', () => {
    it('prints cents as dollars, signs changes with a true minus and zero plainly', () => {
        expect(moneyFromCents(1_234_567)).toBe('$12,345.67');
        expect(signedCents(234_567)).toBe('+$2,345.67');
        expect(signedCents(-12_000)).toBe('−$120.00');
        expect(signedCents(0)).toBe('$0.00');
        expect(changePctText(234_567, 1_000_000)).toBe('+23.46%');
        expect(changePctText(-1, 1_000_000)).toBe('0.00%');
        expect(changePctText(-500_000, 1_000_000)).toBe('−50.00%');
    });
});

describe('wayTiles', () => {
    it('adds up to the cent on a grid of gains and losses', () => {
        for (const contributed of [1_000_000, 999_999, 1]) {
            for (const end of [0, 1, 999_999, 1_000_000, 1_234_567, 3_000_001]) {
                const tiles = wayTiles(summary(contributed, end));
                expectTilesAddUp(tiles, windowAmount(TIM_COPY.window(contributed / 100, '2025-03-31', '2026-03-31', 251)));
                expect(tiles.end.hint, 'the amount is not repeated under each way').toBeUndefined();
                for (const tile of Object.values(tiles)) {
                    clean(tile.value);
                    clean(tile.hint ?? null);
                }
            }
        }
    });

    it('adds up on what the three ways actually compute, deposits split into cents included', () => {
        const dates = eachCalendarDay('2025-01-06', '2025-12-31').filter((d) => ![0, 6].includes(new Date(`${d}T12:00:00Z`).getUTCDay()));
        // Quarterly dividends too, so the identity holds with dividend cash earning interest.
        const spy = {
            closes: dates.map((date, i) => ({date, value: 100 + Math.sin(i / 9) * 20 + i * 0.07})),
            dividends: ['2025-03-21', '2025-06-20', '2025-09-19', '2025-12-19'].map((exDate) => ({symbol: 'SPY', exDate, perShare: 0.43})),
        };
        const rateOn = makeRateLookup(dates.map((date) => ({date, discountPct: 4.07})));
        for (const start of ['2025-01-06', '2025-02-03', '2025-05-02', '2025-08-29']) {
            for (const amount of [10_000, 12_345.67, 999.99]) {
                const window = {start, end: dates[dates.length - 1]};
                for (const series of [lumpSum(spy, window, amount, rateOn), dollarCostAverage(spy, window, amount, rateOn), cashOnly(spy, window, amount, rateOn)]) {
                    const way = summarizeWay(series);
                    expect(way).not.toBeNull();
                    const stated = windowAmount(TIM_COPY.window(amount, window.start, window.end, way?.sessions ?? 0));
                    expect(stated).toBe(Math.round(amount * 100));
                    // Every way ends having taken in exactly the amount the window line states.
                    expect(way?.contributedCents).toBe(stated);
                    expectTilesAddUp(wayTiles(way), stated);
                }
            }
        }
    });

    it('counts the days below what was put in, and dates the longest stretch or says there was none', () => {
        const longest = {from: '2025-03-03', to: '2025-04-17', sessions: 34, ongoing: false, deepestPct: -12.3};
        const tiles = wayTiles(summary(1_000_000, 1_100_000, {underwaterSessions: 41, longest}));
        expect(tiles.underwater).toEqual({value: '41 of 250 days', hint: 'longest Mar 3, 2025 → Apr 17, 2025, 34 trading days'});
        expect(wayTiles(summary(1_000_000, 900_000, {underwaterSessions: 5, longest: {...longest, sessions: 5, ongoing: true}})).underwater.hint)
            .toBe('since Mar 3, 2025, 5 trading days so far');
        expect(wayTiles(summary(1_000_000, 1_100_000)).underwater).toEqual({value: '0 of 250 days', hint: 'not one trading day'});
    });

    it('prints a dash and no hint for a way the rates could not price', () => {
        expect(wayTiles(null)).toEqual({end: {value: '—'}, change: {value: '—'}, underwater: {value: '—'}});
    });
});

describe('TIM_COPY', () => {
    it('describes on every input and never advises', () => {
        const dates = ['2025-03-31', '2024-12-31', '2026-06-30'];
        for (const text of [TIM_COPY.heading, TIM_COPY.startLabel, TIM_COPY.submit, TIM_COPY.endLabel, TIM_COPY.changeLabel, TIM_COPY.underwaterLabel,
            TIM_COPY.chartCaption, TIM_COPY.noHistory, TIM_COPY.whyLabel, TIM_COPY.tableStart, TIM_COPY.caveat, ...TIM_COPY.why, ...Object.values(TIM_COPY.wayLabel)]) {
            clean(text);
        }
        for (const a of dates) {
            for (const b of dates) {
                clean(TIM_COPY.range(a, b));
                clean(TIM_COPY.window(10_000, a, b, 1));
                clean(TIM_COPY.window(10_000, a, b, 251));
                clean(TIM_COPY.outOfRange('1990-01-01', a));
                clean(TIM_COPY.chartAria(a, b));
                for (const rows of [1, 3, 8]) clean(TIM_COPY.tableCaption(b, rows));
                for (const source of ['requested', 'inception', 'fallback'] as StartSource[]) {
                    clean(TIM_COPY.source(source, a, b));
                    clean(TIM_COPY.source(source, a, null));
                }
            }
            clean(TIM_COPY.rateGap(a));
            clean(TIM_COPY.tableDate(a));
            for (const way of WAY_KEYS) for (const deposits of [1, 3, 14]) clean(TIM_COPY.wayDetail(way, a, deposits));
        }
        for (const pct of [null, -12.34, 0, 0.04, 23.456]) clean(TIM_COPY.tablePct(pct));
    });

    it('says why a window starts where it does, naming the bound that moved it', () => {
        // inceptionAt is re-anchored by a reset, so it dates the account's current record, not its opening.
        expect(TIM_COPY.source('inception', '2025-03-31', '2025-03-31')).toBe("Starts the day your paper account's current record began.");
        // A young account: the ceiling (MIN_WINDOW_DAYS before today) moved the start earlier.
        expect(TIM_COPY.source('inception', '2026-06-30', '2026-09-20'))
            .toBe(`Your paper account's current record began on Sep 20, 2026; a window here spans at least ${MIN_WINDOW_DAYS} days, so it starts on Jun 30, 2026.`);
        // An old account: the floor (MAX_LOOKBACK_DAYS before today) moved the start later.
        expect(TIM_COPY.source('inception', '2022-06-24', '2021-01-04'))
            .toBe(`Your paper account's current record began on Jan 4, 2021; a window here starts at most ${MAX_LOOKBACK_DAYS.toLocaleString('en-US')} days back, so it starts on Jun 24, 2022.`);
        expect(TIM_COPY.source('inception', '2022-06-24', '2021-01-04')).not.toMatch(/at least/);
        expect(TIM_COPY.source('requested', '2025-03-31', '2025-01-02')).toBeNull();
        expect(TIM_COPY.source('fallback', '2025-03-31', null)).toBe('No paper account yet, so the window starts a year back.');
    });

    it('states the amount once, in the window line, and each way by how it enters SPY', () => {
        const printed = [
            TIM_COPY.window(10_000, '2025-03-31', '2026-03-31', 251),
            ...WAY_KEYS.map((way) => TIM_COPY.wayDetail(way, '2025-03-31', 13)),
            ...WAY_KEYS.flatMap(() => Object.values(wayTiles(summary(1_000_000, 1_234_567))).flatMap((tile) => [tile.value, tile.hint ?? ''])),
            TIM_COPY.tableCaption('2026-03-31', 8),
        ].join('\n');
        expect(printed.match(/\$10,000(?:\.00)?(?![\d,.])/g), printed).toHaveLength(1);
        expect(TIM_COPY.wayDetail('lumpSum', '2025-03-31', 13)).toBe('Into SPY on Mar 31, 2025');
        expect(TIM_COPY.wayDetail('dollarCostAverage', '2025-03-31', 13)).toBe('13 monthly deposits into SPY');
        expect(TIM_COPY.wayDetail('dollarCostAverage', '2025-03-31', 1)).toBe('1 monthly deposit into SPY');
        expect(TIM_COPY.wayDetail('cashOnly', '2025-03-31', 13)).toBe('Kept as cash, earning interest');
        // A non-whole amount is stated to the cent, so the tiles still add up against it.
        expect(TIM_COPY.window(12_345.67, '2025-03-31', '2026-03-31', 251)).toBe('$12,345.67 each way · Mar 31, 2025 → Mar 31, 2026 · 251 trading days');
    });

    it('captions the table with the rows it has, not the rows it asked for', () => {
        expect(TIM_COPY.tableCaption('2026-03-31', 8)).toBe('The same amount and the same end date, Mar 31, 2026, from 8 earlier starts a quarter apart:');
        expect(TIM_COPY.tableCaption('2026-03-31', 5)).toContain('from 5 earlier starts');
        expect(TIM_COPY.tableCaption('2026-03-31', 1)).toBe('The same amount and the same end date, Mar 31, 2026, from 1 earlier start:');
        expect(TIM_COPY.tableCaption('2025-12-31', 3)).toBe('The same amount and the same end date, Dec 31, 2025, from 3 earlier starts a quarter apart:');
    });

    it('prints each table cell as the change to one decimal, signed, or a dash for a way it could not price', () => {
        expect(TIM_COPY.tablePct(23.456)).toBe('+23.5%');
        expect(TIM_COPY.tablePct(-12.34)).toBe('−12.3%');
        expect(TIM_COPY.tablePct(0.04)).toBe('0.0%');
        expect(TIM_COPY.tablePct(null)).toBe('—');
    });

    it('states the caveat with the spread the clock charges', () => {
        expect(TIM_COPY.caveat).toMatch(/less 0\.25%/);
        expect(TIM_COPY.chartCaption).toBe('Growth of each dollar contributed');
    });
});
