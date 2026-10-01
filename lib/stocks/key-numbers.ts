// The stock page's "Key numbers": five figures the market-data feed reports for a company,
// each as the value a tile prints and one sentence saying what that value divides. Pure and
// client-safe.
//
// Only the metric names listed in METRIC_NAMES become rows; whatever else the feed sends is
// ignored. A figure that is missing, not a finite number, or outside what it can be (a market
// cap at or below zero, a range whose bottom is above its top) hides its row — it never becomes
// a zero. Every figure a sentence repeats is formatted once and used in both places, so the
// sentence and the value beside it cannot disagree. Copy lives in lib/learn/copy/key-numbers.ts.

import {KEY_NUMBERS_COPY as COPY} from '@/lib/learn/copy/key-numbers';
import type {GlossaryKey} from '@/lib/learn/glossary';

type KeyNumberKey = Extract<GlossaryKey, 'market-cap' | 'pe-ratio' | 'dividend-yield' | 'beta' | 'fifty-two-week-range'>;

export type KeyNumber = {key: KeyNumberKey; value: string; sentence: string};

type KeyNumbersInput = {
    // Finnhub's profile reports market cap in millions of dollars.
    marketCapMillions?: number | null;
    metric?: Readonly<Record<string, unknown>> | null;
};

export const KEY_NUMBER_KEYS: readonly KeyNumberKey[] = ['market-cap', 'pe-ratio', 'dividend-yield', 'beta', 'fifty-two-week-range'];

// The feed's names for each figure, first finite one wins. The TTM P/E first, the basic one as
// the watchlist's fallback; the trailing dividend yield only — the "indicated" yield is a
// forward figure, not the glossary's last twelve months.
const METRIC_NAMES = {
    marketCap: ['marketCapitalization'],
    pe: ['peTTM', 'peBasicExclExtraTTM'],
    dividendYield: ['currentDividendYieldTTM'],
    beta: ['beta'],
    low: ['52WeekLow'],
    high: ['52WeekHigh'],
} as const;

const finite = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) ? value : null;

const read = (metric: KeyNumbersInput['metric'], names: readonly string[]): number | null => {
    if (!metric) return null;
    for (const name of names) {
        const value = finite(metric[name]);
        if (value !== null) return value;
    }
    return null;
};

const twoDecimals = (value: number): string =>
    value.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});

const dollars = (value: number): string => `$${twoDecimals(value)}`;

const UNITS = [
    {size: 1e12, short: 'T', word: 'trillion'},
    {size: 1e9, short: 'B', word: 'billion'},
    {size: 1e6, short: 'M', word: 'million'},
] as const;

// "$4.52T" beside "$4.52 trillion", from one rounding. A figure that rounds up to 1,000 of a
// unit is written in the next unit up ("$1.00T", never "$1000.00B").
const capParts = (usd: number): {value: string; words: string} => {
    for (let i = UNITS.length - 1; i >= 0; i -= 1) {
        const unit = UNITS[i];
        const bigger = UNITS[i - 1];
        const scaled = Math.round((usd / unit.size) * 100) / 100;
        if (scaled < 1) break;
        if (scaled >= 1000 && bigger) continue;
        const printed = twoDecimals(scaled);
        return {value: `$${printed}${unit.short}`, words: `$${printed} ${unit.word}`};
    }
    const printed = dollars(usd);
    return {value: printed, words: printed};
};

const marketCapRow = (input: KeyNumbersInput): KeyNumber | null => {
    const millions = finite(input.marketCapMillions) ?? read(input.metric, METRIC_NAMES.marketCap);
    if (millions === null || millions <= 0) return null;
    const {value, words} = capParts(millions * 1e6);
    return {key: 'market-cap', value, sentence: COPY.marketCap(words)};
};

const peRow = (input: KeyNumbersInput): KeyNumber | null => {
    const pe = read(input.metric, METRIC_NAMES.pe);
    if (pe === null) return null;
    if (pe <= 0) return {key: 'pe-ratio', value: 'none', sentence: COPY.peNone};
    const printed = twoDecimals(pe);
    return {key: 'pe-ratio', value: printed, sentence: COPY.pe(printed)};
};

// The feed states the yield in percent (0.44 means 0.44%), so $100 of stock at that yield is
// the same digits in dollars.
const dividendRow = (input: KeyNumbersInput): KeyNumber | null => {
    const percent = read(input.metric, METRIC_NAMES.dividendYield);
    if (percent === null || percent < 0) return null;
    if (percent === 0) return {key: 'dividend-yield', value: '0%', sentence: COPY.dividendNone};
    const printed = percent.toFixed(2);
    if (Number(printed) === 0) return {key: 'dividend-yield', value: 'under 0.01%', sentence: COPY.dividendTiny};
    return {key: 'dividend-yield', value: `${printed}%`, sentence: COPY.dividend(printed)};
};

const betaRow = (input: KeyNumbersInput): KeyNumber | null => {
    const beta = read(input.metric, METRIC_NAMES.beta);
    if (beta === null) return null;
    const magnitude = Math.abs(beta).toFixed(2);
    if (Number(magnitude) === 0) return {key: 'beta', value: '0.00', sentence: COPY.betaZero};
    return beta > 0
        ? {key: 'beta', value: magnitude, sentence: COPY.beta(magnitude)}
        : {key: 'beta', value: `−${magnitude}`, sentence: COPY.betaInverse(magnitude)};
};

const rangeRow = (input: KeyNumbersInput): KeyNumber | null => {
    const low = read(input.metric, METRIC_NAMES.low);
    const high = read(input.metric, METRIC_NAMES.high);
    if (low === null || high === null || low <= 0 || high < low) return null;
    const bottom = dollars(low);
    const top = dollars(high);
    const value = `${bottom} – ${top}`;
    // From the printed prices, so a reader dividing the two figures gets the same percentage.
    const bottomCents = Math.round(low * 100);
    const topCents = Math.round(high * 100);
    if (topCents === bottomCents) return {key: 'fifty-two-week-range', value, sentence: COPY.rangeFlat(bottom)};
    const above = Math.round((topCents / bottomCents - 1) * 100);
    return {key: 'fifty-two-week-range', value, sentence: COPY.range(bottom, top, above === 0 ? 'less than 1%' : `${above}%`)};
};

export const readKeyNumbers = (input: KeyNumbersInput): KeyNumber[] =>
    [marketCapRow(input), peRow(input), dividendRow(input), betaRow(input), rangeRow(input)]
        .filter((row): row is KeyNumber => row !== null);
