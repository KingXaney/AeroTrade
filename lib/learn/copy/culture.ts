// Copy for the culture brain: the plain-English reading of every clause its pickers write
// (lib/learn/culture-reasons.ts CULTURE_GRAMMAR), the names of its terms and profiles, and the
// sentences the /culture page shows. A gloss narrates what the picker's arithmetic did with
// the numbers it was given — "so the picker sold the whole position" — and never whether that
// was right: the test holds each one to the 'advice' tier of lib/learn/banned.ts and to the
// mechanism-only rule (nothing says a picker works, fails or beats anything). Pure: formatted
// values in, sentences out; the grammar interpolates lib/culture/config.ts.

import type {CultureTerm, ProfileId} from '@/lib/culture/config';

// What each term is called where a reader meets it.
export const TERM_LABELS: Record<CultureTerm, string> = {
    momentumLong: 'price momentum',
    attentionAnomaly: 'attention surprise',
    attentionTrend: 'attention trend',
    attentionPersistence: 'attention persistence',
    quietAttention: 'quiet attention',
    categoryShare: 'category share',
    attentionSinceReport: 'attention since the last report',
    attentionSlow: 'slow attention',
    thesis: 'brand thesis',
    sentimentSlow: 'brand sentiment',
    appRank: 'app rank',
};

// What each picker follows, in one clause.
export const PROFILE_COPY: Record<ProfileId, string> = {
    spike: 'it follows attention that has just jumped: the surprise and the trend of the last weeks.',
    quiet: 'it follows attention that has lasted, that the press has not caught up with, that built since the last report, and that is taking share inside its category.',
    price: 'it reads price momentum alone, the backtest’s baseline.',
};

export const CULTURE_GLOSS = {
    // ---- the scorer ----------------------------------------------------------------------
    picker: (label: string, follows: string, weights: string): string =>
        `The ${label} picker scored it: ${follows} Its weights are ${weights}.`,
    surprise: (pct: string, recentDays: number, baselineDays: number): string =>
        `Its brands' pageviews over the last ${recentDays} days stood ${pct} against their own median over the ${baselineDays} days before, each brand weighed by its share of the owner.`,
    rank: (term: string, rank: string, total: string, weights: string): string =>
        `That ${term} ranked #${rank} of ${total} among the owners measured this week, #1 the highest; the rank, spread from −1 to +1, has a weight of ${weights}.`,
    neutral: (term: string, weights: string): string =>
        `No brand of this owner had enough stored data to measure its ${term}, so that part of the score (weight ${weights}) was set to 0, the middle of its range, instead of being ranked last.`,
    trend: (pct: string, days: number): string =>
        `The line fitted through its brands' log pageviews over the last ${days} days changed ${pct} end to end.`,
    persistence: (weeks: string, cap: number): string =>
        `Its brands' weekly pageviews had stayed above their old normal for ${weeks} consecutive weeks, counted back from the latest; the count stops at ${cap}.`,
    quiet: (pct: string, windowDays: number): string =>
        `Its attention surprise scaled by how little of the catalog's news its brands drew over the last ${windowDays} days: ${pct} of surprise the press had not caught up with.`,
    share: (pts: string, recentDays: number, baselineDays: number): string =>
        `Its brands' share of their categories' pageviews moved ${pts} over the last ${recentDays} days against the ${baselineDays} days before, private rivals counted in the category.`,
    sinceReport: (pct: string): string =>
        `Since the owner's last earnings report its brands' pageviews stood ${pct} against the six months before that report: attention the report could not have carried.`,
    noReport: (weights: string): string =>
        `No earnings date was on file for this owner, so that part of the score (weight ${weights}) was set to 0.`,
    slowAttention: (weight: string, halfLifeDays: number, topBrands: number): string =>
        `The owner's slow attention was ${weight}: its ${topBrands} heaviest brands' decayed weights added up, each halving every ${halfLifeDays} days without a new surprise, chart climb or post.`,
    noCoverage: (weights: string): string =>
        `None of the owner's brands has an entity yet (no surprise, chart climb or labelled post has reached it), so that part of the score (weight ${weights}) was set to 0.`,
    sentiment: (value: string, weights: string): string =>
        `The model's reading of how young consumers feel toward the owner's brands, weighed by attention, was ${value} on a scale from −1 to +1; it has a weight of ${weights}.`,
    appRank: (rank: string, floor: number, weights: string): string =>
        `One of the owner's apps sat at #${rank} on the US App Store's free or paid chart in the last week; the rank reads 1 at the top and 0 at #${floor} and beyond, with a weight of ${weights}.`,
    momentum: (pct: string, sessions: number, months: number, weights: string, mix: string): string =>
        `Its closing price changed ${pct} over the last ${sessions} sessions, about ${months} months. Momentum has a weight of ${weights}: ${mix}, each ranked across the owners scored; the reason quotes the most heavily weighted horizon the owner has.`,
    momentumMissing: (closes: number): string =>
        `Fewer than ${closes} daily closes were stored, too few for even the shortest horizon, so momentum added nothing to the score.`,
    thesis: (brand: string, weights: string): string =>
        `${brand}'s attention has stayed above the thesis line for weeks, which added the thesis weight (${weights}) to the owner's score.`,
    trendCap: (): string =>
        'The last close was below its 200-day average, so a positive score was capped at zero; an already negative score stayed as it was.',
    volHaircut: (share: string, factor: string): string =>
        `Its 63-day volatility was among the highest ${share} of the owners scored, so its positive score was multiplied by ${factor}.`,
    ineligible: (minBars: number, bars: string, quoted: string, covered: string): string =>
        `An owner needs ${minBars} daily bars, a live quote this week and one brand with a measured attention series before a picker holds it; this one had ${bars} bars, ${quoted}, ${covered}.`,

    // ---- the allocator -------------------------------------------------------------------
    exit: (minHoldDays: number): string =>
        `An exit trigger fired, so the picker sold the whole position; an exit does not wait for the ${minHoldDays}-trading-day minimum hold.`,
    exitScore: (score: string, threshold: string): string => `Its score was ${score}, under the exit line of ${threshold}.`,
    thesisBroken: (): string => 'The thesis behind the position had ended.',
    hardStop: (drop: string, stop: string): string =>
        `The price stood ${drop} under the average cost, past the hard stop at ${stop} below cost.`,
    rebalanceBand: (band: string, minHoldDays: number): string =>
        `A picker trades a holding only when it sits more than ${band} of the account from its target, and trims one only after ${minHoldDays} trading days.`,
    rebalanceUnder: (drift: string): string => `It sat ${drift} of the account under its target, so the picker bought shares to close the gap.`,
    rebalanceOver: (drift: string): string => `It sat ${drift} of the account over its target, so the picker sold shares to close the gap.`,
    target: (target: string, cap: string, cash: string): string =>
        `The target was ${target} of the account: its score's share of the week's picks, at most ${cap} in one name, with at least ${cash} kept in cash.`,
    enter: (): string => 'A symbol the account did not hold was among the week’s targets, so the picker bought toward its target weight.',
    enterScore: (score: string, entry: string, positions: number, exit: string): string =>
        `Its score of ${score} was above the entry line of ${entry}; the ${positions} highest such scores become the week's targets, and a held position is sold on score only below ${exit}.`,
    holding: (): string => 'No exit trigger fired and no trade was planned, so the picker kept the position as it was.',
} as const;
