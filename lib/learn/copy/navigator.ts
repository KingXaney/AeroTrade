// Copy for the AI Navigator's reasons (lib/learn/reasons.ts NAVIGATOR_GRAMMAR): the
// plain-English reading of every clause scoreUniverse, diffToOrders and the weekly job write.
// A gloss narrates what the Navigator's arithmetic did with the numbers it was given — "so the
// Navigator sold the whole position" — and never whether that was right: the test holds each
// one to the 'advice' tier of lib/learn/banned.ts and to the mechanism-only rule (nothing says
// the Navigator works, fails or beats anything). Pure: formatted values in, sentences out; the
// grammar interpolates lib/navigator/config.ts and lib/brain/config.ts.

export const NAVIGATOR_COPY = {
    // The one disclosure per decision on /brain's Weekly Decisions.
    glossSummary: 'What the Navigator saw',
} as const;

type EligibilityNeed = {articles: number; sources: number; days: number; bars: number};

export const NAVIGATOR_GLOSS = {
    // ---- scoreUniverse -------------------------------------------------------------------
    newsWeight: (weight: string, halfLifeDays: number): string =>
        `The brain's slow news weight for this name was ${weight}: each article about it adds to the total, and without new coverage the total halves every ${halfLifeDays} days.`,
    newsRank: (rank: string, total: string, weight: string): string =>
        `That weight ranked #${rank} of ${total} among the symbols scored this week, where #1 is the heaviest; the rank, spread from −1 to +1, has a weight of ${weight} in the score.`,
    newsNeutral: (weight: string): string =>
        `The brain has no entity for this symbol, so the news part of the score (weight ${weight}) was set to 0, the middle of its −1 to +1 range, instead of being ranked last.`,
    momentum: (pct: string, sessions: number, months: number, weight: string, mix: string): string =>
        `Its closing price changed ${pct} over the last ${sessions} sessions, about ${months} months. Momentum has a weight of ${weight} in the score: ${mix}, each ranked across the symbols scored; the reason quotes the most heavily weighted horizon the symbol has.`,
    momentumMissing: (closes: number): string =>
        `Fewer than ${closes} daily closes were stored, too few for even the shortest horizon, so momentum added nothing to the score.`,
    thesis: (subject: string | null, weight: string): string => (subject === null
        ? `An active thesis added ${weight} to the score.`
        : `An active thesis on ${subject} — the symbol's own, or one the brain links it to — added ${weight} to the score.`),
    sectorStanding: (sector: string, standing: string, weight: string): string =>
        `${sector}'s standing among the sectors, ranked by slow news weight from −1 (lightest) to +1 (heaviest), was ${standing}; the standing has a weight of ${weight} in the score.`,
    trendCap: (): string =>
        'The last close was below its 200-day average, so a positive score was capped at zero; an already negative score stayed as it was.',
    volHaircut: (share: string, factor: string): string =>
        `Its 63-day volatility was among the highest ${share} of the symbols scored, so its positive score was multiplied by ${factor}.`,
    ineligible: (need: EligibilityNeed, articles: string, sources: string, bars: string): string =>
        `Apart from the always-eligible funds, a symbol needs ${need.articles} articles from ${need.sources} sources in ${need.days} days and ${need.bars} daily bars before the Navigator holds it; this one had ${articles}, ${sources} and ${bars}.`,

    // ---- diffToOrders --------------------------------------------------------------------
    exit: (minHoldDays: number): string =>
        `An exit trigger fired, so the Navigator sold the whole position; an exit does not wait for the ${minHoldDays}-trading-day minimum hold.`,
    exitScore: (score: string, threshold: string): string => `Its score was ${score}, under the exit line of ${threshold}.`,
    thesisBroken: (): string => 'The thesis behind the position had ended.',
    hardStop: (drop: string, stop: string): string =>
        `The price stood ${drop} under the average cost, past the hard stop at ${stop} below cost.`,
    rebalanceBand: (band: string, minHoldDays: number): string =>
        `The Navigator trades a holding only when it sits more than ${band} of the account from its target, and trims one only after ${minHoldDays} trading days.`,
    rebalanceUnder: (drift: string): string => `It sat ${drift} of the account under its target, so the Navigator bought shares to close the gap.`,
    rebalanceOver: (drift: string): string => `It sat ${drift} of the account over its target, so the Navigator sold shares to close the gap.`,
    target: (target: string, cap: string, cash: string): string =>
        `The target was ${target} of the account: its score's share of the week's picks, at most ${cap} in one name, with at least ${cash} kept in cash.`,
    enter: (): string => 'A symbol the account did not hold was among the week\'s targets, so the Navigator bought toward its target weight.',
    enterScore: (score: string, entry: string, positions: number, exit: string): string =>
        `Its score of ${score} was above the entry line of ${entry}; the ${positions} highest such scores become the week's targets, and a held position is sold on score only below ${exit}.`,
    holding: (): string => 'No exit trigger fired and no trade was planned, so the Navigator kept the position as it was.',
} as const;

// 'sector:technology' → 'the technology sector', 'theme:ai-capex' → 'the "ai capex" theme', a
// ticker as itself: the entity key scoreUniverse writes after "thesis".
export const thesisSubject = (key: string): string => {
    if (key.startsWith('sector:')) return `the ${key.slice('sector:'.length).replace(/-/g, ' ')} sector`;
    if (key.startsWith('theme:')) return `the "${key.slice('theme:'.length).replace(/-/g, ' ')}" theme`;
    return key;
};
