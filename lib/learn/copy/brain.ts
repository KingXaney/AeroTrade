// Copy for /brain: the legend under System Status (composed by lib/learn/brain-legend.ts from
// the brain's and the Navigator's constants), the leaderboard's thesis dot, the evidence
// list's label disclosure and the "since thesis" line on Active Theses. Mechanism only: every
// sentence says what the brain counts and what the Navigator's arithmetic does, never that
// either works, fails or beats anything — its record against SPY is on the leaderboard. The
// test renders every line and holds it to the 'copy' tier of lib/learn/banned.ts.

import {pctOneDecimal, shortDate} from '@/lib/learn/copy/portfolio';

export type ScoreParts = {news: string; sentiment: string; momentum: string; thesis: string; sector: string};

export const BRAIN_LEGEND_COPY = {
    summary: 'How the brain weighs the news and the Navigator scores it',

    readingHeading: 'Reading the news',
    reading: (articlesPerDay: number): string =>
        `Each day the extractor reads up to ${articlesPerDay} new articles. It labels each one with the kind of event it covers and an importance from 0 to 1, and scores every name it mentions for relevance (0 to 1) and tone (−1 to +1).`,
    adding: (): string =>
        'An article adds importance × relevance to each name\'s weight, and its tone joins the name\'s sentiment average with that same share.',

    fadingHeading: 'How weight fades',
    layers: (fastDays: number, slowDays: number): string =>
        `Two layers fade at different speeds: the fast layer halves every ${fastDays} days, this week's attention; the slow layer halves every ${slowDays} days. The leaderboard, the graph and the Navigator read the slow layer.`,
    decayExample: (start: number, first: {days: number; weight: string}, second: {days: number; weight: string}): string =>
        `With no new articles, a slow weight of ${start} is ${first.weight} after ${first.days} days and ${second.weight} after ${second.days}.`,

    thesisHeading: 'When a name becomes a thesis',
    thesis: (threshold: number, exitShare: string): string =>
        `A thesis starts when a slow weight reaches ${threshold}, and ends when the weight falls below ${exitShare} of the highest it has reached since.`,

    scoreHeading: 'How the Navigator scores a symbol',
    score: (parts: ScoreParts): string =>
        `Once a week every symbol gets a score from five parts, each on a −1 to +1 scale (the thesis part is 0 or 1), weighted: news rank ${parts.news}, news sentiment ${parts.sentiment}, momentum ${parts.momentum}, thesis ${parts.thesis}, sector standing ${parts.sector}.`,
    momentum: (mix: string): string => `Momentum mixes ${mix} price changes, each ranked across the symbols scored.`,
    caps: (volShare: string, haircut: string): string =>
        `A close below the 200-day average caps a positive score at zero, and the most volatile ${volShare} of symbols have a positive score multiplied by ${haircut}.`,

    railsHeading: "The Navigator's rails",
    entry: (positions: number, entry: string, cap: string, cash: string): string =>
        `It holds the ${positions} highest scores above ${entry}, sized by score, at most ${cap} of the account in one name, with at least ${cash} kept in cash.`,
    exit: (exit: string, stop: string, minHold: number): string =>
        `A holding is sold when its score drops below ${exit} or its price is ${stop} under the average cost; otherwise a trim waits until it has been held ${minHold} trading days.`,
    pace: (band: string, trades: number): string =>
        `It trades a holding only when it sits more than ${band} of the account from its target, and places at most ${trades} trades a week.`,
    eligibility: (funds: number, articles: number, sources: number, days: number, bars: number): string =>
        `Apart from ${funds} always-eligible funds, a symbol needs ${articles} articles from ${sources} sources in ${days} days and ${bars} daily bars before it can be held.`,
} as const;

export const BRAIN_COPY = {
    // The evidence panel's one disclosure: the glossary entries of the badges it shows.
    labelsSummary: 'What these labels mean',
    // Under the narrative leaderboard, when a row carries the dot.
    thesisDot: (threshold: number): string =>
        `● thesis: the news about this name has stayed strong for weeks (its slow weight reached ${threshold})`,
    sinceThesisLabel: 'since thesis',
    // "NVDA +4.1% · SPY +6.0%": both total returns over the same sessions, side by side.
    sinceThesisFigures: (symbol: string, symbolPct: number, spyPct: number): string =>
        `${symbol} ${pctOneDecimal(symbolPct)} · SPY ${pctOneDecimal(spyPct)}`,
    sinceThesisWindow: (from: string, to: string): string =>
        `From the close of ${shortDate(from, true)} to the close of ${shortDate(to, true)}.`,
} as const;
