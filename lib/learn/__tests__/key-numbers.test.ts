// readKeyNumbers: the stock page's key figures, each as a value and a sentence that says what
// the number divides (or multiplies). Only the metric names it knows become rows — anything
// else the feed sends is ignored — and a missing or non-finite figure hides its row rather
// than printing a zero. Sentences measure, never judge: they are held to the 'copy' tier of
// lib/learn/banned.ts plus a list of the evaluative words a stock page is most tempted by, and
// every figure a sentence repeats is parsed back and checked against the value beside it.

import {describe, expect, it} from 'vitest';
import {findBanned} from '@/lib/learn/banned';
import {isGlossaryKey} from '@/lib/learn/glossary';
import {KEY_NUMBER_KEYS, readKeyNumbers, type KeyNumber} from '@/lib/learn/key-numbers';
import {KEY_NUMBERS_COPY} from '@/lib/learn/copy/key-numbers';

const EVALUATIVE = /\b(cheap(er)?|expensive|high(er)?|low(er)?|attractive|bargain|pricey|rich|stretched|fair(ly)?|reasonable|undervalued|overvalued|risky|safe|good|bad|strong|weak|premium|discount|healthy|lofty|elevated|modest)\b/i;

const clean = (text: string) => {
    expect(text, text).not.toMatch(/undefined|NaN|null|\[object|Infinity/);
    expect(findBanned(text, 'copy'), text).toEqual([]);
    expect(text, text).not.toMatch(EVALUATIVE);
};

const NVDA = {
    marketCapMillions: 4_521_870.3,
    metric: {
        peTTM: 45.2,
        peBasicExclExtraTTM: 46.9,
        currentDividendYieldTTM: 0.0237,
        beta: 1.7214,
        '52WeekLow': 86.62,
        '52WeekHigh': 195.95,
        '10DayAverageTradingVolume': 180.5,
        roeTTM: 105.2,
    },
};

const byKey = (rows: KeyNumber[]) => Object.fromEntries(rows.map((row) => [row.key, row]));
const money = (text: string): number => Number(text.replace(/[$,]/g, ''));

describe('readKeyNumbers', () => {
    it('shows nothing when the feed sent nothing (the keyless harness)', () => {
        expect(readKeyNumbers({})).toEqual([]);
        expect(readKeyNumbers({marketCapMillions: undefined, metric: undefined})).toEqual([]);
        expect(readKeyNumbers({marketCapMillions: null, metric: null})).toEqual([]);
    });

    it('never turns a metric name it does not know into a row', () => {
        expect(readKeyNumbers({metric: {foo: 1, peExclExtraAnnual: 12, psTTM: 30, '52WeekHighDate': 5}})).toEqual([]);
    });

    it('reads the five figures in a fixed order, each keyed to its glossary entry', () => {
        const rows = readKeyNumbers(NVDA);
        expect(rows.map((row) => row.key)).toEqual(['market-cap', 'pe-ratio', 'dividend-yield', 'beta', 'fifty-two-week-range']);
        expect(KEY_NUMBER_KEYS).toEqual(rows.map((row) => row.key));
        for (const row of rows) {
            expect(isGlossaryKey(row.key)).toBe(true);
            clean(row.value);
            clean(row.sentence);
        }
        const k = byKey(rows);
        expect(k['market-cap'].value).toBe('$4.52T');
        expect(k['market-cap'].sentence).toBe('The share price times every share outstanding: about $4.52 trillion for the whole company.');
        expect(k['pe-ratio'].value).toBe('45.20');
        expect(k['pe-ratio'].sentence).toBe('The share price divided by the last twelve months of earnings per share: $45.20 of price for each $1 of those earnings.');
        expect(k['dividend-yield'].value).toBe('0.02%');
        expect(k['dividend-yield'].sentence).toBe('The last twelve months of dividends per share divided by the share price: 0.02%, or $0.02 for each $100 of stock.');
        expect(k.beta.value).toBe('1.72');
        expect(k.beta.sentence).toBe('The stock\'s moves measured against the market\'s over past years: about 1.72% for each 1% the market moved, in either direction.');
        expect(k['fifty-two-week-range'].value).toBe('$86.62 – $195.95');
        expect(k['fifty-two-week-range'].sentence).toBe('Over the past 52 weeks the stock traded between $86.62 and $195.95; the top of that range is 126% above the bottom.');
    });

    it('prints the same figure in the value and in the sentence', () => {
        const grid = [
            {pe: 45.2, yield: 0.0237, cap: 4_521_870.3, low: 86.62, high: 195.95},
            {pe: 8.456, yield: 3.456, cap: 2_345.6, low: 10, high: 10.5},
            {pe: 1234.567, yield: 12.3, cap: 880.2, low: 0.5, high: 3.999},
            {pe: 0.4, yield: 0.5, cap: 999_995, low: 150.004, high: 150.006},
        ];
        for (const g of grid) {
            const k = byKey(readKeyNumbers({marketCapMillions: g.cap, metric: {peTTM: g.pe, currentDividendYieldTTM: g.yield, '52WeekLow': g.low, '52WeekHigh': g.high}}));
            for (const row of Object.values(k)) clean(row.sentence);
            // "$45.20 of price for each $1": the multiple, as dollars per dollar.
            expect(k['pe-ratio'].sentence).toContain(`$${k['pe-ratio'].value} of price for each $1`);
            // "0.44%, or $0.44 for each $100": $100 × the printed percentage, to the cent.
            const pct = /: ([\d.]+)%, or \$([\d.]+) for each \$100/.exec(k['dividend-yield'].sentence);
            expect(pct, k['dividend-yield'].sentence).toBeTruthy();
            if (pct) {
                expect(`${pct[1]}%`).toBe(k['dividend-yield'].value);
                expect(Math.round(100 * Number(pct[1]))).toBe(Math.round(100 * Number(pct[2])));
            }
            // "$4.52T" beside "$4.52 trillion".
            const cap = /^\$([\d.,]+)([TBM]?)$/.exec(k['market-cap'].value);
            const words = /about \$([\d.,]+)( trillion| billion| million)? for/.exec(k['market-cap'].sentence);
            expect(cap && words, `${k['market-cap'].value} | ${k['market-cap'].sentence}`).toBeTruthy();
            if (cap && words) {
                expect(words[1]).toBe(cap[1]);
                expect(({T: ' trillion', B: ' billion', M: ' million', '': undefined})[cap[2]]).toBe(words[2]);
                expect(Number(cap[1].replace(/,/g, ''))).toBeLessThan(1000);
            }
            // The range's percentage is recomputed from the two printed prices.
            const range = /between (\$[\d,.]+) and (\$[\d,.]+); the top of that range is (\d+|less than 1)% above the bottom/.exec(k['fifty-two-week-range'].sentence);
            if (range) {
                expect(k['fifty-two-week-range'].value).toBe(`${range[1]} – ${range[2]}`);
                const computed = (money(range[2]) / money(range[1]) - 1) * 100;
                if (range[3] === 'less than 1') expect(computed > 0 && Math.round(computed) === 0).toBe(true);
                else expect(Number(range[3])).toBe(Math.round(computed));
            } else {
                expect(k['fifty-two-week-range'].sentence).toMatch(/traded at \$[\d,.]+ throughout\.$/);
            }
        }
    });

    it('moves a market cap to the next unit when it rounds up to a thousand', () => {
        expect(byKey(readKeyNumbers({marketCapMillions: 999_999}))['market-cap'].value).toBe('$1.00T');
        expect(byKey(readKeyNumbers({marketCapMillions: 999.996}))['market-cap'].value).toBe('$1.00B');
        expect(byKey(readKeyNumbers({marketCapMillions: 0.25}))['market-cap'].sentence).toBe('The share price times every share outstanding: about $250,000.00 for the whole company.');
    });

    it('falls back to the feed\'s own market cap, and hides a cap that is not above zero', () => {
        expect(byKey(readKeyNumbers({metric: {marketCapitalization: 2_345.6}}))['market-cap'].value).toBe('$2.35B');
        expect(readKeyNumbers({marketCapMillions: 0})).toEqual([]);
        expect(readKeyNumbers({marketCapMillions: -5})).toEqual([]);
    });

    it('says why there is no P/E when earnings were zero or below, and falls back to the basic P/E', () => {
        const loss = byKey(readKeyNumbers({metric: {peTTM: -12.4}}))['pe-ratio'];
        expect(loss.value).toBe('none');
        expect(loss.sentence).toBe(KEY_NUMBERS_COPY.peNone);
        clean(loss.sentence);
        expect(byKey(readKeyNumbers({metric: {peTTM: 0}}))['pe-ratio'].value).toBe('none');
        expect(byKey(readKeyNumbers({metric: {peBasicExclExtraTTM: 21.05}}))['pe-ratio'].value).toBe('21.05');
        expect(byKey(readKeyNumbers({metric: {peTTM: 1234.567}}))['pe-ratio'].value).toBe('1,234.57');
    });

    it('says when no dividend was paid, and when the yield is under a hundredth of a percent', () => {
        const none = byKey(readKeyNumbers({metric: {currentDividendYieldTTM: 0}}))['dividend-yield'];
        expect(none.value).toBe('0%');
        expect(none.sentence).toBe(KEY_NUMBERS_COPY.dividendNone);
        const tiny = byKey(readKeyNumbers({metric: {currentDividendYieldTTM: 0.004}}))['dividend-yield'];
        expect(tiny.value).toBe('under 0.01%');
        clean(tiny.sentence);
        expect(tiny.sentence).toContain('less than a cent for each $100 of stock');
        expect(readKeyNumbers({metric: {currentDividendYieldTTM: -1}})).toEqual([]);
        // The indicated (forward) yield is a different figure from the glossary's twelve months.
        expect(readKeyNumbers({metric: {dividendYieldIndicatedAnnual: 0.5}})).toEqual([]);
    });

    it('reads a negative or a zero beta in words', () => {
        const negative = byKey(readKeyNumbers({metric: {beta: -0.304}})).beta;
        expect(negative.value).toBe('−0.30');
        expect(negative.sentence).toBe('The stock\'s moves measured against the market\'s over past years: about 0.30% in the opposite direction for each 1% the market moved.');
        const zero = byKey(readKeyNumbers({metric: {beta: 0.001}})).beta;
        expect(zero.value).toBe('0.00');
        expect(zero.sentence).toBe(KEY_NUMBERS_COPY.betaZero);
        for (const row of [negative, zero]) clean(row.sentence);
    });

    it('hides a range that is incomplete or upside down, and reads a flat one', () => {
        expect(readKeyNumbers({metric: {'52WeekLow': 10}})).toEqual([]);
        expect(readKeyNumbers({metric: {'52WeekLow': 20, '52WeekHigh': 10}})).toEqual([]);
        expect(readKeyNumbers({metric: {'52WeekLow': 0, '52WeekHigh': 10}})).toEqual([]);
        const flat = byKey(readKeyNumbers({metric: {'52WeekLow': 12.001, '52WeekHigh': 12.004}}))['fifty-two-week-range'];
        expect(flat.value).toBe('$12.00 – $12.00');
        expect(flat.sentence).toBe('Over the past 52 weeks the stock traded at $12.00 throughout.');
    });

    it('hides a row whose figure is not a finite number', () => {
        for (const bad of [NaN, Infinity, -Infinity, null, '12', undefined, true]) {
            const metric = {peTTM: bad, currentDividendYieldTTM: bad, beta: bad, '52WeekLow': bad, '52WeekHigh': 100} as unknown as Record<string, number>;
            expect(readKeyNumbers({marketCapMillions: bad as unknown as number, metric})).toEqual([]);
        }
    });

    it('keeps the panel copy to measurements', () => {
        for (const text of [KEY_NUMBERS_COPY.heading, KEY_NUMBERS_COPY.emptyTitle('NVDA'), KEY_NUMBERS_COPY.emptyDescription, KEY_NUMBERS_COPY.source, KEY_NUMBERS_COPY.peNone, KEY_NUMBERS_COPY.dividendNone, KEY_NUMBERS_COPY.betaZero]) {
            clean(text);
        }
    });
});
