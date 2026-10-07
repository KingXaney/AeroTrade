// Copy for the culture brain: the plain-English reading of every clause its pickers write
// (lib/learn/culture-reasons.ts CULTURE_GRAMMAR), the names of its terms and profiles, and the
// sentences the /culture page shows. A gloss narrates what the picker's arithmetic did with
// the numbers it was given — "so the picker sold the whole position" — and never whether that
// was right: the test holds each one to the 'advice' tier of lib/learn/banned.ts and to the
// mechanism-only rule (nothing says a picker works, fails or beats anything). Pure: formatted
// values in, sentences out; the grammar interpolates lib/culture/config.ts.

import type {CultureTerm, ProfileId} from '@/lib/culture/config';
import type {CultureSource} from '@/lib/culture/types';

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

// ---- the /culture page ---------------------------------------------------------------------
// Every sentence below is rendered as written and held to the 'copy' tier. A lead paragraph
// that heads a panel's one "What these mean" says only what the definitions beneath it do not
// (lib/learn/__tests__/panel-method.test.ts).

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

// What each source is called where a reader meets it (the legend, the system view).
export const SOURCE_LABELS: Record<CultureSource, string> = {
    wikipedia: 'Wikipedia',
    appstore: 'App Store',
    youtube: 'YouTube',
    reddit: 'Reddit',
    news: 'News',
    social: 'Social',
};

// The terms the brand board's one disclosure lists: only the labels it shows.
export const BRAND_BOARD_TERMS = ['attention', 'brand-sentiment', 'brand-thesis', 'brand-owner'] as const;
export const RISING_TERMS = ['attention'] as const;
export const PICKS_TERMS = ['picker-profile', 'brand-owner'] as const;
export const COMPARISON_TERMS = ['picker-profile', 'total-return'] as const;

export const CULTURE_COPY = {
    pageSubtitle: 'What younger consumers look up, install and post about, mapped onto the companies that own the brands — read by two pickers that trade on it inside hard rails',
    // The page's three views.
    views: {brands: 'Brands', picks: 'Pickers', system: 'System'},
    boardHeading: 'Brand board',
    boardSummary: 'How to read the board',
    // Leads the board's one "What these mean": what the definitions beneath it do not say.
    boardLead: 'Attention is not demand: a brand people are talking about is not a brand people are buying, and a listed owner sells far more than one brand. Each row is a catalog brand with the attention it has gathered; the owner beside it is the company a picker can trade.',
    boardEmpty: 'No brand has attention yet. The daily run folds pageview surprises, chart climbs and labelled posts into brand entities, and the board fills from the first run.',
    columns: {attention: 'slow attention', sentiment: 'sentiment'},
    thesisMark: (threshold: number): string => `● thesis: this brand's attention has stayed high for weeks (its slow weight reached ${threshold})`,
    privateMark: '○ private: tracked for context, never traded',
    unpricedMark: (weekKey: string): string => `* no live quote in the week of ${weekKey}: the owner is scored but cannot be held`,
    risingHeading: 'Rising this week',
    risingLead: 'The brands with the most attention on the fast layer, which halves every few days.',
    risingEmpty: 'Nothing has moved on the fast layer yet.',
    evidenceHeading: 'Evidence',
    evidenceFor: (brand: string, days: number): string => `Evidence for ${brand} · the last ${days} days`,
    evidenceEmpty: 'No recent post, video or article mentions this brand.',
    evidenceCaveat: 'A model reads each item and labels it; the labels are its reading of the text, not a measurement of the brand.',
    labelsSummary: 'What these labels mean',
    alsoMentions: 'also mentions',
    communityNote: 'community post',
    suggestionsHeading: 'Suggested brands',
    suggestionsLead: 'Names the model met that are not in the catalog. A person adds one in code; the brain never adds a brand itself.',
    suggestionsEmpty: 'The model has met no name the catalog lacks.',
    suggestionRow: (count: number, firstSeen: string): string => `${plural(count, 'mention', 'mentions')} · first seen ${firstSeen}`,
} as const;

export const CULTURE_PICKS_COPY = {
    lead: 'Two pickers read the same brain with different weights: Spike follows attention that has just jumped; Quiet follows attention that has lasted, that the press has not covered, that built since the last report, and that is taking share inside its category. Both records are printed; neither is a verdict.',
    profileLead: (label: string, follows: string): string => `${label}: ${follows}`,
    accountLine: (name: string, since: string | null): string => (since ? `${name} · live since ${since}` : `${name} · opens on the first weekly run`),
    comparisonHeading: 'Side by side',
    comparisonLead: "Each account's return since its launch, and SPY's total return over the same days. The strip ranks nothing: the records are printed, not judged.",
    sinceLaunch: (date: string): string => `since ${date}`,
    notStarted: 'not started',
    backtestPending: 'Backtest not computed yet — the simulated variants appear once the weekly job has built one.',
    simulatedLine: (from: string, to: string, weeks: number): string =>
        `${from} → ${to} · ${plural(weeks, 'weekly decision', 'weekly decisions')} · next-open fills · no fees or slippage · interest and dividends included`,
    simulatedFills: (fills: number): string => plural(fills, 'fill', 'fills'),
    simulatedSpyHint: 'total return, same window',
    decisionsHeading: 'Latest decision',
    decisionsEmpty: "No decision yet. The picker decides on Mondays at 10:45 ET, once the week's quotes are checked.",
    decisionLine: (date: string, quoted: number, tickers: number): string => `${date} · ${quoted} of ${tickers} owners quoted`,
    feedsLine: (feeds: readonly string[]): string => `feeds: ${feeds.join(', ')}`,
    previewBadge: 'Preview — nothing traded',
    skippedBadge: 'Skipped — nothing decided',
    broughtBy: 'brands',
    glossSummary: 'What the picker saw',
    footer: 'The picks are a record of what each picker did, not a list to follow.',
    holdingsHeading: 'Holdings',
    holdingsEmpty: 'Nothing held: every score this week sat under the entry line, or no owner was quoted.',
    holdingsNotStarted: 'Nothing held yet — the account opens on the first weekly run.',
    tradesHeading: 'Trade log',
    tradesEmpty: 'No fill yet.',
    fillSummary: 'What the picker saw',
} as const;

export const CULTURE_RECORD_COPY = {
    heading: 'Performance vs SPY',
    tabs: {live: 'Live', simulated: 'Simulated'},
    liveLine: (since: string, snapshotDays: number, ret: string, spy: string): string =>
        `Live since ${since} · ${plural(snapshotDays, 'daily snapshot', 'daily snapshots')} at 16:10 ET · return ${ret} vs SPY ${spy}`,
    liveStarts: (since: string): string => `The live record starts on ${since}.`,
    curvePending: 'A curve appears after the second daily snapshot.',
    notStarted: 'Not started — no live record yet.',
    simulatedBadge: 'Simulated — attention and price only, not live',
    simulatedLine: (from: string, to: string, closeFills: number): string =>
        `${from} → ${to} · weekly decisions · next-open fills · no fees or slippage · interest and dividends included${closeFills > 0 ? ` · ${plural(closeFills, 'fill', 'fills')} used the close` : ''}`,
    feedsNote: 'The simulation reads stored pageviews and prices only; the live brain also reads App Store ranks, YouTube, Reddit, news mentions and report dates.',
    survivorship: 'The catalog was chosen in 2026, so a backtest over earlier years holds only brands that are still around, which flatters it.',
    tooShort: 'Not enough stored history to simulate this picker yet.',
    pending: 'Backtest not computed yet.',
} as const;

export const CULTURE_SYSTEM_COPY = {
    heading: 'System',
    brands: 'Brands',
    brandsHint: (listed: number, privateBrands: number): string => `${listed} listed · ${privateBrands} private`,
    entities: 'With attention',
    entitiesHint: 'brand entities',
    theses: 'Theses',
    thesesHint: 'sustained attention',
    items: 'Items',
    itemsHint: (labelled: number): string => `${labelled} read by the model`,
    attention: 'Attention months',
    attentionHint: 'one document per brand, source and month',
    suggestions: 'Suggested',
    suggestionsHint: 'names the catalog lacks',
    freshnessHeading: 'Last day stored per source',
    never: 'never',
    driftAlarm: (brands: readonly string[], days: number): string =>
        `${plural(brands.length, 'brand has', 'brands have')} no Wikipedia views in the last ${days} days — a renamed article or a title the catalog misspells: ${brands.join(', ')}`,
    driftClear: (days: number): string => `Every brand has Wikipedia views inside the last ${days} days.`,
    earnings: (dated: number): string =>
        (dated > 0 ? `${plural(dated, 'owner', 'owners')} with a report date on file` : 'No report date on file yet — the since-report term reads as neutral'),
    earningsOff: 'No earnings calendar: the Finnhub key is not set, so the since-report term reads as neutral',
    universe: (weekKey: string, quoted: number, tickers: number): string => `Week of ${weekKey}: ${quoted} of ${tickers} owners quoted`,
    universeNone: 'No quote check yet this week',
    accountsHeading: "The pickers' accounts",
    accountLine: (label: string, launch: string, lastRun: string | null): string =>
        `${label} · live since ${launch}${lastRun ? ` · last decision ${lastRun}` : ''}`,
    accountsNone: 'The shared accounts open on the first weekly run.',
    neverRan: 'Some jobs have never run — check the Inngest connection',
} as const;

export const CULTURE_WIDGET_COPY = {
    picksTitle: 'Culture Brain',
    picksBuilding: 'Reading what younger consumers are into',
    picksLine: (parts: readonly {label: string; ret: string}[], since: string): string =>
        `${parts.map((part) => `${part.label} ${part.ret}`).join(' · ')} · since ${since}`,
    decisions: (count: number, date: string): string => `${plural(count, 'decision', 'decisions')} · ${date}`,
    schedule: 'Mondays 10:45 ET',
    attentionEmpty: 'No brand has attention yet.',
    attentionFooter: 'slow attention · the brand board has the rest',
} as const;

// The /culture legend (lib/culture/legend.ts composes it from the constants). Mechanism only:
// every sentence says what the brain counts and what a picker's arithmetic does, never that
// either works, fails or beats anything.
export const CULTURE_LEGEND_COPY = {
    summary: 'How the culture brain builds attention and how its pickers score it',

    readingHeading: 'Reading the sources',
    reading: (itemsPerDay: number, fallback: string): string =>
        `Each day the brain stores every catalog brand's Wikipedia pageviews, the US App Store's free and paid charts, YouTube's most-popular chart and posts from youth subreddits when their keys are set, and a fixed set of news searches. A model reads up to ${itemsPerDay} new items, labels each with the kind of moment it describes and an importance from 0 to 1, and scores every catalog brand it names for relevance (0 to 1) and tone (−1 to +1); an item the model never read folds through its alias matches at an importance of ${fallback}.`,
    sources: (weights: string): string =>
        `Every fold is scaled by its source before the decay maths sees it: ${weights}. Behaviour leads the press, so news is evidence more than signal.`,

    attentionHeading: 'How attention is built and fades',
    surprises: (recentDays: number, baselineDays: number, climb: number): string =>
        `A brand's last ${recentDays} days of pageviews against its own median over the ${baselineDays} days before fold as a surprise — a tripling at full importance, nothing at or below the median — and an app's chart score against its median over the same span folds a climb of ${climb} places at full importance.`,
    layers: (fastDays: number, slowDays: number): string =>
        `Two layers fade at different speeds: the fast layer halves every ${fastDays} days, this week's attention; the slow layer halves every ${slowDays} days. The board and the pickers read the slow layer; the rising list reads the fast one.`,
    decayExample: (start: number, first: {days: number; weight: string}, second: {days: number; weight: string}): string =>
        `With nothing new, a slow weight of ${start} is ${first.weight} after ${first.days} days and ${second.weight} after ${second.days}.`,
    thesis: (threshold: number, exitShare: string): string =>
        `A brand thesis starts when a slow weight reaches ${threshold}, and ends when the weight falls below ${exitShare} of the highest it has reached since.`,

    featuresHeading: 'What the pickers measure',
    surprise: (recentDays: number, baselineDays: number): string =>
        `Attention surprise: the last ${recentDays} days' mean pageviews against the brand's median over the ${baselineDays} days before them.`,
    trend: (days: number): string =>
        `Attention trend: the change a line fitted through ${days} days of log pageviews covers end to end.`,
    persistence: (cap: number): string =>
        `Attention persistence: consecutive weeks the brand's weekly pageviews have stayed above their old normal, counted back from the latest week and stopping at ${cap}.`,
    quiet: (windowDays: number): string =>
        `Quiet attention: the surprise scaled by how little of the catalog's news the brand drew over the last ${windowDays} days.`,
    share: (recentDays: number, baselineDays: number): string =>
        `Category share: the brand's share of its category's pageviews over the last ${recentDays} days against the ${baselineDays} days before, private rivals counted in the category.`,
    sinceReport: (): string =>
        "Attention since report: the mean pageviews since the owner's last earnings date against the six months before it; neutral without a date.",
    appRank: (floor: number, days: number): string =>
        `App rank: 1 at number one on the US App Store's free or paid chart and 0 at #${floor} and beyond, from the latest chart day in the last ${days}.`,
    rollup: (cap: string, topBrands: number): string =>
        `An owner's brands are weighed by their attention baselines, no one brand past ${cap} of the owner; its slow attention is its ${topBrands} heaviest brands' decayed weights added up. Each term is then ranked across the owners measured that week, from −1 to +1, and an owner without the measurement sits at 0.`,

    profileHeading: (label: string): string => `The ${label} picker`,
    profile: (label: string, follows: string, weights: string): string => `The ${label} picker: ${follows} Its weights: ${weights}.`,

    priceHeading: 'Price and the guards',
    momentum: (mix: string): string => `Momentum mixes ${mix} price changes, each ranked across the owners scored.`,
    caps: (volShare: string, haircut: string): string =>
        `A close below the 200-day average caps a positive score at zero, and the most volatile ${volShare} of owners have a positive score multiplied by ${haircut}.`,
    eligibility: (bars: number): string =>
        `An owner needs ${bars} daily bars, a live quote this week and one brand with a measured attention series before a picker holds it.`,

    railsHeading: "The pickers' rails",
    universe: (max: number): string =>
        `The universe is the catalog's listed owners — US listings first, then NYSE and Nasdaq ADRs, then over-the-counter ones — cut at ${max}, each one's quote checked once a week; over-the-counter owners are verified live but never simulated.`,
    entry: (positions: number, entry: string, cap: string, cash: string): string =>
        `Each picker holds the ${positions} highest scores above ${entry}, sized by score, at most ${cap} of its account in one name, with at least ${cash} kept in cash.`,
    exit: (exit: string, stop: string, minHold: number): string =>
        `A holding is sold when its score drops below ${exit} or its price is ${stop} under the average cost; otherwise a trim waits until it has been held ${minHold} trading days.`,
    pace: (band: string, trades: number): string =>
        `A picker trades a holding only when it sits more than ${band} of its account from its target, and places at most ${trades} trades a week.`,
    accounts: (balance: string): string =>
        `Each picker trades its own shared paper account, opened with ${balance}, under the same rails, so the two records differ only by what each weighs.`,
} as const;
