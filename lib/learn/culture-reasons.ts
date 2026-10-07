// The culture pickers' half of the reason decoder (lib/learn/reasons.ts has the strategies' and
// the Navigator's): an ordered list of anchored templates, one per string shape
// lib/culture/scoring.ts and the allocator write for a picker, each glossed from
// lib/culture/config.ts so a moved constant moves the prose. Pure and client-importable; it
// never builds a RegExp from its input and a string it does not know comes back as `unknown`.

import {
    APP_RANK_FLOOR,
    ATTENTION_BASELINE_DAYS,
    ATTENTION_RECENT_DAYS,
    ATTENTION_TOP_BRANDS,
    CULTURE_MOMENTUM_MIX,
    CULTURE_PROFILES,
    CULTURE_RAILS,
    CULTURE_TOP_QUINTILE_FRACTION,
    CULTURE_VOLATILITY_HAIRCUT,
    LIVE_PROFILES,
    MIN_PRICE_BARS,
    PERSISTENCE_CAP_WEEKS,
    PRESS_WINDOW_DAYS,
    PROFILE_IDS,
    TREND_DAYS,
    type CultureTerm,
} from '@/lib/culture/config';
import {HALF_LIFE_SLOW_DAYS} from '@/lib/brain/config';
import {CULTURE_GLOSS, PROFILE_COPY, TERM_LABELS} from '@/lib/learn/copy/culture';
import {shareText} from '@/lib/learn/copy/reasons';
import {
    anchored,
    decodeGuarded,
    decodeWith,
    SIGNED_PCT,
    unsigned,
    type DecodedReason,
    type ReasonClause,
    type ReasonTemplate,
} from '@/lib/learn/reasons';

const weightText = (weight: number): string => weight.toFixed(2);

// "0.20 in Spike, 0 in Quiet": a term's weight in each live picker's score.
const weightsOf = (term: CultureTerm): string =>
    LIVE_PROFILES.map((id) => `${CULTURE_PROFILES[id].weights[term] === 0 ? '0' : weightText(CULTURE_PROFILES[id].weights[term])} in ${CULTURE_PROFILES[id].label}`).join(', ');

// "price momentum 0.40, attention surprise 0.20, …": a profile's non-zero weights.
const profileWeights = (id: (typeof PROFILE_IDS)[number]): string =>
    (Object.entries(CULTURE_PROFILES[id].weights) as [CultureTerm, number][])
        .filter(([, weight]) => weight > 0)
        .sort((a, b) => b[1] - a[1])
        .map(([term, weight]) => `${TERM_LABELS[term]} ${weightText(weight)}`)
        .join(', ');

type Horizon = keyof typeof CULTURE_MOMENTUM_MIX;
const sessionsOf = (horizon: Horizon): number => Number(horizon.slice(1));
const monthsOf = (sessions: number): number => Math.round(sessions / 21);
const horizonsByWeight = (): Horizon[] =>
    (Object.keys(CULTURE_MOMENTUM_MIX) as Horizon[]).sort((a, b) => CULTURE_MOMENTUM_MIX[b] - CULTURE_MOMENTUM_MIX[a]);
const mixText = (): string => horizonsByWeight()
    .map((horizon, i) => `${monthsOf(sessionsOf(horizon))}-month${i === 0 ? ' change' : ''} ${weightText(CULTURE_MOMENTUM_MIX[horizon])}`)
    .join(', ');
const shortestHorizon = (): number => Math.min(...(Object.keys(CULTURE_MOMENTUM_MIX) as Horizon[]).map(sessionsOf));

const RANK = '\\(rank (\\d+)/(\\d+)\\)';
const PTS = '[+-]\\d+\\.\\d pts';

const EXIT_CLAUSE = (): ReasonClause => ({text: 'exit', gloss: CULTURE_GLOSS.exit(CULTURE_RAILS.minHoldingTradingDays)});

// A ranked term: the measurement, then its rank.
const ranked = (text: string, gloss: string, term: ReasonClause['term'], label: string, rank: string, total: string, weightTerm: CultureTerm): ReasonClause[] => [
    {text, gloss, ...(term ? {term} : {})},
    {text: `(rank ${rank}/${total})`, gloss: CULTURE_GLOSS.rank(label, rank, total, weightsOf(weightTerm)), rail: 'CULTURE_PROFILES'},
];

export const CULTURE_GRAMMAR: readonly ReasonTemplate[] = [
    // ---- scoreCultureUniverse --------------------------------------------------------
    {
        id: 'culture-picker',
        pattern: anchored(`picker (${PROFILE_IDS.map((id) => CULTURE_PROFILES[id].label).join('|')})`),
        decode: (m) => {
            const id = PROFILE_IDS.find((candidate) => CULTURE_PROFILES[candidate].label === m[1]);
            if (!id) return null;
            return [{text: m[0], gloss: CULTURE_GLOSS.picker(m[1], PROFILE_COPY[id], profileWeights(id)), term: 'picker-profile', rail: 'CULTURE_PROFILES'}];
        },
    },
    {
        id: 'culture-surprise-rank',
        pattern: anchored(`attention (${SIGNED_PCT}) vs baseline ${RANK}`),
        decode: (m) => ranked(`attention ${m[1]} vs baseline`, CULTURE_GLOSS.surprise(m[1], ATTENTION_RECENT_DAYS, ATTENTION_BASELINE_DAYS), 'attention-anomaly', TERM_LABELS.attentionAnomaly, m[2], m[3], 'attentionAnomaly'),
    },
    {
        id: 'culture-surprise-neutral',
        pattern: anchored('attention unmeasured — neutral'),
        decode: (m) => [{text: m[0], gloss: CULTURE_GLOSS.neutral(TERM_LABELS.attentionAnomaly, weightsOf('attentionAnomaly')), term: 'attention-anomaly', rail: 'CULTURE_PROFILES'}],
    },
    {
        id: 'culture-trend-rank',
        pattern: anchored(`attention trend (${SIGNED_PCT}) ${RANK}`),
        decode: (m) => ranked(`attention trend ${m[1]}`, CULTURE_GLOSS.trend(m[1], TREND_DAYS), 'attention-trend', TERM_LABELS.attentionTrend, m[2], m[3], 'attentionTrend'),
    },
    {
        id: 'culture-trend-neutral',
        pattern: anchored('attention trend unmeasured — neutral'),
        decode: (m) => [{text: m[0], gloss: CULTURE_GLOSS.neutral(TERM_LABELS.attentionTrend, weightsOf('attentionTrend')), term: 'attention-trend', rail: 'CULTURE_PROFILES'}],
    },
    {
        id: 'culture-persistence-rank',
        pattern: anchored(`attention held (\\d+) weeks ${RANK}`),
        decode: (m) => ranked(`attention held ${m[1]} weeks`, CULTURE_GLOSS.persistence(m[1], PERSISTENCE_CAP_WEEKS), 'attention-persistence', TERM_LABELS.attentionPersistence, m[2], m[3], 'attentionPersistence'),
    },
    {
        id: 'culture-persistence-neutral',
        pattern: anchored('attention persistence unmeasured — neutral'),
        decode: (m) => [{text: m[0], gloss: CULTURE_GLOSS.neutral(TERM_LABELS.attentionPersistence, weightsOf('attentionPersistence')), term: 'attention-persistence', rail: 'CULTURE_PROFILES'}],
    },
    {
        id: 'culture-quiet-rank',
        pattern: anchored(`quiet attention (${SIGNED_PCT}) ${RANK}`),
        decode: (m) => ranked(`quiet attention ${m[1]}`, CULTURE_GLOSS.quiet(m[1], PRESS_WINDOW_DAYS), 'quiet-attention', TERM_LABELS.quietAttention, m[2], m[3], 'quietAttention'),
    },
    {
        id: 'culture-quiet-neutral',
        pattern: anchored('quiet attention unmeasured — neutral'),
        decode: (m) => [{text: m[0], gloss: CULTURE_GLOSS.neutral(TERM_LABELS.quietAttention, weightsOf('quietAttention')), term: 'quiet-attention', rail: 'CULTURE_PROFILES'}],
    },
    {
        id: 'culture-share-rank',
        pattern: anchored(`category share (${PTS}) ${RANK}`),
        decode: (m) => ranked(`category share ${m[1]}`, CULTURE_GLOSS.share(m[1], ATTENTION_RECENT_DAYS, ATTENTION_BASELINE_DAYS), 'category-share', TERM_LABELS.categoryShare, m[2], m[3], 'categoryShare'),
    },
    {
        id: 'culture-share-neutral',
        pattern: anchored('category share unmeasured — neutral'),
        decode: (m) => [{text: m[0], gloss: CULTURE_GLOSS.neutral(TERM_LABELS.categoryShare, weightsOf('categoryShare')), term: 'category-share', rail: 'CULTURE_PROFILES'}],
    },
    {
        id: 'culture-since-report-rank',
        pattern: anchored(`since last report (${SIGNED_PCT}) ${RANK}`),
        decode: (m) => ranked(`since last report ${m[1]}`, CULTURE_GLOSS.sinceReport(m[1]), 'attention-since-report', TERM_LABELS.attentionSinceReport, m[2], m[3], 'attentionSinceReport'),
    },
    {
        id: 'culture-no-report',
        pattern: anchored('no report date — neutral'),
        decode: (m) => [{text: m[0], gloss: CULTURE_GLOSS.noReport(weightsOf('attentionSinceReport')), term: 'attention-since-report', rail: 'CULTURE_PROFILES'}],
    },
    {
        id: 'culture-slow-rank',
        pattern: anchored(`slow attention (\\d+\\.\\d) ${RANK}`),
        decode: (m) => ranked(`slow attention ${m[1]}`, CULTURE_GLOSS.slowAttention(m[1], HALF_LIFE_SLOW_DAYS, ATTENTION_TOP_BRANDS), 'attention', TERM_LABELS.attentionSlow, m[2], m[3], 'attentionSlow'),
    },
    {
        id: 'culture-no-coverage',
        pattern: anchored('no attention coverage — neutral'),
        decode: (m) => [{text: m[0], gloss: CULTURE_GLOSS.noCoverage(weightsOf('attentionSlow')), term: 'attention', rail: 'CULTURE_PROFILES'}],
    },
    {
        id: 'culture-sentiment',
        pattern: anchored('brand sentiment ([+-]\\d+\\.\\d)'),
        decode: (m) => [{text: m[0], gloss: CULTURE_GLOSS.sentiment(m[1], weightsOf('sentimentSlow')), term: 'brand-sentiment', rail: 'CULTURE_PROFILES'}],
    },
    {
        id: 'culture-app-rank',
        pattern: anchored('app rank #(\\d+)'),
        decode: (m) => [{text: m[0], gloss: CULTURE_GLOSS.appRank(m[1], APP_RANK_FLOOR, weightsOf('appRank')), term: 'app-rank', rail: 'CULTURE_PROFILES'}],
    },
    {
        id: 'culture-momentum',
        pattern: anchored(`(\\d+)-month momentum (${SIGNED_PCT})`),
        decode: (m) => {
            const horizon = horizonsByWeight().find((h) => String(monthsOf(sessionsOf(h))) === m[1]);
            if (!horizon) return null;
            const sessions = sessionsOf(horizon);
            return [{
                text: m[0],
                gloss: CULTURE_GLOSS.momentum(m[2], sessions, monthsOf(sessions), weightsOf('momentumLong'), mixText()),
                rail: 'CULTURE_MOMENTUM_MIX',
            }];
        },
    },
    {
        id: 'culture-momentum-missing',
        pattern: anchored('insufficient price history for momentum'),
        decode: (m) => [{text: m[0], gloss: CULTURE_GLOSS.momentumMissing(shortestHorizon() + 1), rail: 'CULTURE_MOMENTUM_MIX'}],
    },
    {
        // A brand name as the catalog spells one (letters, digits, spaces, & ' . : + -), never a
        // regex metacharacter, so a pattern passed as text cannot read as a thesis.
        id: 'culture-thesis',
        pattern: anchored('attention thesis ([^()\\[\\]{}\\\\|*?^$]{1,40})'),
        decode: (m) => [{text: m[0], gloss: CULTURE_GLOSS.thesis(m[1], weightsOf('thesis')), term: 'brand-thesis', rail: 'CULTURE_PROFILES'}],
    },
    {
        id: 'culture-trend-cap',
        pattern: anchored('below 200d MA — capped'),
        decode: (m) => [{text: m[0], gloss: CULTURE_GLOSS.trendCap(), term: 'sma200'}],
    },
    {
        id: 'culture-vol-haircut',
        pattern: anchored('high volatility haircut'),
        decode: (m) => [{text: m[0], gloss: CULTURE_GLOSS.volHaircut(shareText(CULTURE_TOP_QUINTILE_FRACTION), String(CULTURE_VOLATILITY_HAIRCUT)), term: 'vol63', rail: 'CULTURE_VOLATILITY_HAIRCUT'}],
    },
    {
        id: 'culture-ineligible',
        pattern: anchored('ineligible \\((\\d+) bars, (quoted|no quote), (attention covered|no attention series)\\)'),
        decode: (m) => [{text: m[0], gloss: CULTURE_GLOSS.ineligible(MIN_PRICE_BARS, m[1], m[2], m[3]), rail: 'MIN_PRICE_BARS'}],
    },

    // ---- diffToOrders under CULTURE_RAILS -----------------------------------------------
    {
        id: 'culture-exit-score',
        pattern: anchored('exit: (score (-?\\d+\\.\\d{2}) below exit threshold -?\\d+(?:\\.\\d+)?)'),
        decode: (m) => [EXIT_CLAUSE(), {text: m[1], gloss: CULTURE_GLOSS.exitScore(m[2], String(CULTURE_RAILS.exitScoreThreshold)), rail: 'CULTURE_RAILS'}],
    },
    {
        id: 'culture-exit-thesis',
        pattern: anchored('exit: thesis broken'),
        decode: () => [EXIT_CLAUSE(), {text: 'thesis broken', gloss: CULTURE_GLOSS.thesisBroken(), term: 'brand-thesis'}],
    },
    {
        id: 'culture-hard-stop',
        pattern: anchored('exit: (hard stop -?(\\d+)% vs cost)'),
        decode: (m) => [EXIT_CLAUSE(), {text: m[1], gloss: CULTURE_GLOSS.hardStop(`${m[2]}%`, shareText(CULTURE_RAILS.hardStopDrawdown)), rail: 'CULTURE_RAILS'}],
    },
    {
        id: 'culture-rebalance',
        pattern: anchored('rebalance ([+-]\\d+\\.\\d)% drift toward (\\d+\\.\\d)% target'),
        decode: (m) => {
            const [, drift, target] = m;
            const magnitude = `${unsigned(drift)}%`;
            return [
                {text: 'rebalance', gloss: CULTURE_GLOSS.rebalanceBand(shareText(CULTURE_RAILS.rebalanceBand), CULTURE_RAILS.minHoldingTradingDays), rail: 'CULTURE_RAILS'},
                {text: `${drift}% drift`, gloss: drift.startsWith('-') ? CULTURE_GLOSS.rebalanceOver(magnitude) : CULTURE_GLOSS.rebalanceUnder(magnitude)},
                {text: `toward ${target}% target`, gloss: CULTURE_GLOSS.target(`${target}%`, shareText(CULTURE_RAILS.maxPositionWeight), shareText(CULTURE_RAILS.minCashWeight)), term: 'position-cap', rail: 'CULTURE_RAILS'},
            ];
        },
    },
    {
        id: 'culture-enter',
        pattern: anchored('enter: (score (-?\\d+\\.\\d{2}))'),
        decode: (m) => [
            {text: 'enter', gloss: CULTURE_GLOSS.enter()},
            {text: m[1], gloss: CULTURE_GLOSS.enterScore(m[2], String(CULTURE_RAILS.entryScoreThreshold), CULTURE_RAILS.maxPositions, String(CULTURE_RAILS.exitScoreThreshold)), rail: 'CULTURE_RAILS'},
        ],
    },
    {
        id: 'culture-holding',
        pattern: anchored('holding — no exit trigger'),
        decode: (m) => [{text: m[0], gloss: CULTURE_GLOSS.holding()}],
    },
];

// A reason a culture picker wrote (a CultureDecision item's `reasons`).
export const decodeCultureReason = (reason: string): DecodedReason =>
    decodeGuarded(reason, (text) => decodeWith(CULTURE_GRAMMAR, text, undefined));

// Every clause of every reason a decision lists, in order; a reason the grammar does not
// know adds nothing (the raw reason is printed beside the gloss either way).
export const glossCultureReasons = (reasons: readonly string[]): ReasonClause[] =>
    reasons.flatMap((reason) => decodeCultureReason(reason).clauses);
