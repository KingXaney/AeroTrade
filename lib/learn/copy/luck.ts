// Copy for "Luck or skill" on /portfolio: where the account's return landed among a thousand
// random five-stock portfolios held over the same days. A placement, never a contest: the
// sentence says "landed above N%", never that the account beat anything, and SPY and the
// median stand beside it as markers, unranked. The test holds every line to the 'copy' tier of
// lib/learn/banned.ts and parses the printed rank back against the counts it came from.

import type {LuckReady} from "@/lib/learn/random-portfolios";
import type {GlossaryKey} from "@/lib/learn/glossary";
import {pctOneDecimal, shortDate} from "@/lib/learn/copy/portfolio";

// The terms the panel's one "What these mean" lists, in order; 'percentile' only while the
// learner's return is placed. The method paragraph leading it says only what these do not.
export const LUCK_TERMS: readonly GlossaryKey[] = ['random-portfolios', 'percentile', 'median', 'benchmark', 'survivorship-bias'];

const COUNT = new Intl.NumberFormat('en-US');
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const numberWord = (n: number): string => WORDS[n] ?? String(n);
const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

// 'above 62% of 1,000', 'above all 1,000', 'above none of the 1,000', and a count where the
// share would round down to 0% ('above 7 of the 1,000').
export const landedShare = ({below, rankPct}: {below: number; rankPct: number}, count: number): string => {
    if (below >= count) return `above all ${COUNT.format(count)}`;
    if (below <= 0) return `above none of the ${COUNT.format(count)}`;
    if (rankPct < 1) return `above ${COUNT.format(below)} of the ${COUNT.format(count)}`;
    return `above ${rankPct}% of ${COUNT.format(count)}`;
};

type Sample = Pick<LuckReady, 'count' | 'size' | 'sessions'>;

const portfolios = ({size, sessions}: Sample): string =>
    `random ${numberWord(size)}-stock portfolios over the same ${plural(sessions, 'trading day', 'trading days')}`;

export const LUCK_COPY = {
    heading: 'Luck or skill',

    // Called with LUCK_MIN_SESSIONS, the threshold buildLuckView holds the window to.
    needsDaysTitle: (sessions: number): string => `Needs ${plural(sessions, 'trading day', 'trading days')}`,
    needsDaysDescription: (sessions: number): string =>
        `Random portfolios are held over the same days as this account, and it has ${plural(sessions, 'trading day', 'trading days')} so far.`,
    noPricesTitle: 'Prices for these days are not stored yet',
    noPricesDescription: 'The random portfolios need the large caps\' closing prices on the first and the last day of the window; the nightly price job stores them.',

    // The headline: "Your return landed above 62% of 1,000 random five-stock portfolios over the
    // same 34 trading days".
    landed: (view: Sample & {yours: NonNullable<LuckReady['yours']>}): string =>
        `Your return landed ${landedShare(view.yours, view.count)} ${portfolios(view)}`,
    // With the learner's marker withheld, the same sample without a placement.
    sampleOnly: (view: Sample): string => `${COUNT.format(view.count)} ${portfolios(view)}`,
    noSnapshot: 'Your return shows once a daily snapshot of this account is stored for the last of these days.',
    // An account with no fill the learner placed (the AI Navigator's, or one not traded yet).
    notYours: 'No fill in this account was placed by you, so its return is not placed among them.',

    marker: {you: 'You', spy: 'SPY', median: 'Median'},
    markerValue: (label: string, pct: number): string => `${label} ${pctOneDecimal(pct)}`,
    window: ({start, end}: Pick<LuckReady, 'start' | 'end'>): string => {
        const crossesYear = start.slice(0, 4) !== end.slice(0, 4);
        return `bought at the ${shortDate(start, crossesYear)} close · valued at the ${shortDate(end, crossesYear)} close`;
    },
    // One bar's native tooltip: its range and how many portfolios fell in it.
    binTitle: (from: number, to: number, count: number): string =>
        `${pctOneDecimal(from)} to ${pctOneDecimal(to)}: ${plural(count, 'portfolio', 'portfolios')}`,
    chartLabel: (view: Pick<LuckReady, 'count' | 'histogram'>): string =>
        `Histogram of ${COUNT.format(view.count)} random portfolio returns, from ${pctOneDecimal(view.histogram.min)} to ${pctOneDecimal(view.histogram.max)}`,

    // Leads the panel's one "What these mean" with what the definitions beneath it do not say:
    // this window's pool, the equal dollars and the leftover cash, how income is credited (stated
    // here and nowhere else) and what "your return" is. The sample's draw and its survivorship
    // caveat are the random-portfolios and survivorship-bias entries' to state.
    method: ({size, pool}: Pick<LuckReady, 'size' | 'pool'>): string =>
        `Each portfolio's ${numberWord(size)} names, bought in equal dollar amounts, come from the ${pool} large caps with a close stored on both days; whole shares leave a remainder, which stays as cash. Each dividend is paid as cash on its pay date to the shares held the evening before its ex-date, and cash earns the T-bill rate, as in a paper account. SPY is held the same way. Your return is this account's stored daily snapshot on the last day, never a live value.`,
};
