// The culture pickers' half of the reason decoder, held to the strings they really write:
// scoreCultureUniverse run on a universe that forces every branch of its reasons under both
// live profiles and both feed sets, and diffToOrders under the culture rails driven into every
// order it can place. Each string must decode completely into clauses that quote it verbatim
// and gloss it in narration that passes the 'advice' tier and says nothing about a picker
// working, failing or beating anything. The grammar may not carry a template nothing emits.

import {afterEach, describe, expect, it, vi} from 'vitest';
import {CULTURE_RAILS, type CultureFeed} from '@/lib/culture/config';
import {scoreCultureUniverse, type CultureScoringInput} from '@/lib/culture/scoring';
import {findBanned} from '@/lib/learn/banned';
import {CULTURE_GRAMMAR, decodeCultureReason, glossCultureReasons} from '@/lib/learn/culture-reasons';
import {isGlossaryKey} from '@/lib/learn/glossary';
import {MAX_REASON_CHARS, type ReasonClause} from '@/lib/learn/reasons';
import {diffToOrders, HOLDING_REASON, type HeldPosition} from '@/lib/navigator/allocator';

const MECHANISM_ONLY = /\b(works?|worked|working|fails?|failed|beat(s|en|ing)?|outperform\w*|underperform\w*|lags?|lagged)\b/i;
const ALL_FEEDS: CultureFeed[] = ['price', 'wikipedia', 'mentions', 'press', 'appstore', 'earnings'];

const input = (symbol: string, patch: Partial<CultureScoringInput> = {}): CultureScoringInput => ({
    symbol,
    brands: [{id: symbol.toLowerCase(), name: symbol}],
    attentionAnomaly: 0.2,
    attentionTrend: 0.1,
    attentionPersistence: 3,
    quietAttention: 0.1,
    categoryShare: 1,
    attentionSinceReport: 0.1,
    attentionSlow: 2,
    sentimentSlow: 0.2,
    appRank: 0.6,
    hasThesis: false,
    signals: {r63: 0.02, r126: 0.05, r252: 0.1, vol63: 0.2, ma200dist: 0.05},
    barsCount: 300,
    quoted: true,
    brandsCovered: 1,
    ...patch,
});

// Every branch: a measured and an unmeasured value of each term, each momentum horizon and
// none, a thesis, the 200-day cap, the haircut, each shape of ineligibility.
const UNIVERSE: CultureScoringInput[] = [
    input('AAA', {attentionAnomaly: Math.log(1.42), hasThesis: true, thesisLabel: 'Celsius', signals: {r63: 0.05, r126: 0.12, r252: 0.3, vol63: 0.9, ma200dist: 0.05}}),
    input('BBB', {signals: {r63: null, r126: null, r252: 0.2, vol63: 0.3, ma200dist: 0.02}}),
    input('CCC', {signals: {r63: -0.04, r126: null, r252: null, vol63: 0.25, ma200dist: -0.1}}),
    input('DDD', {attentionAnomaly: null, attentionTrend: null, attentionPersistence: null, quietAttention: null, categoryShare: null, attentionSinceReport: null, attentionSlow: null, appRank: null,
        signals: {r63: null, r126: null, r252: null, vol63: null, ma200dist: null}, barsCount: 40, brandsCovered: 0}),
    input('EEE', {quoted: false}),
];

const position = (symbol: string, patch: Partial<HeldPosition> = {}): HeldPosition => ({
    symbol, quantity: 50, avgCost: 100, price: 100, heldTradingDays: 30, thesisBroken: false, score: 0.3, ...patch,
});

const ORDERS = diffToOrders({
    totalValue: 100_000,
    cash: 20_000,
    maxTrades: 10,
    rails: CULTURE_RAILS,
    positions: [
        position('XS', {quantity: 100, score: -0.2}),
        position('XT', {thesisBroken: true}),
        position('XH', {price: 65}),
        position('RU', {score: 0.4}),
        position('RO', {quantity: 200}),
        position('EN', {quantity: 0, avgCost: 0, price: 50, heldTradingDays: null}),
    ],
    targets: [
        {symbol: 'RU', weight: 0.15, score: 0.4, reasons: []},
        {symbol: 'RO', weight: 0.1, score: 0.3, reasons: []},
        {symbol: 'EN', weight: 0.1, score: 0.42, reasons: []},
    ],
});

const SCORE_REASONS = [
    ...scoreCultureUniverse(UNIVERSE, {profile: 'spike', feeds: ALL_FEEDS}),
    ...scoreCultureUniverse(UNIVERSE, {profile: 'quiet', feeds: ALL_FEEDS}),
    ...scoreCultureUniverse(UNIVERSE, {profile: 'price', feeds: ['price', 'wikipedia']}),
].flatMap((scored) => scored.reasons);
const ORDER_REASONS = ORDERS.map((order) => order.reason);
const EMITTED = [...SCORE_REASONS, ...ORDER_REASONS, HOLDING_REASON];

const expectClausesQuote = (text: string, clauses: readonly ReasonClause[]) => {
    expect(clauses.length, text).toBeGreaterThan(0);
    for (const clause of clauses) {
        expect(clause.text.length, text).toBeGreaterThan(0);
        expect(text, clause.text).toContain(clause.text);
        expect(clause.gloss.endsWith('.'), clause.gloss).toBe(true);
        expect(findBanned(clause.gloss, 'advice'), clause.gloss).toEqual([]);
        expect(clause.gloss, clause.gloss).not.toMatch(MECHANISM_ONLY);
        expect(clause.gloss).not.toMatch(/undefined|NaN|null|\[object/);
        if (clause.term !== undefined) expect(isGlossaryKey(clause.term), clause.term).toBe(true);
    }
};

describe('decodeCultureReason round trip', () => {
    it('forces every branch the fixtures are meant to reach', () => {
        expect(SCORE_REASONS).toEqual(expect.arrayContaining([
            'picker Spike', 'picker Quiet', 'picker Price only',
            'attention +42.0% vs baseline (rank 1/4)', 'attention unmeasured — neutral',
            'attention trend unmeasured — neutral', 'attention persistence unmeasured — neutral', 'quiet attention unmeasured — neutral',
            'category share unmeasured — neutral', 'no report date — neutral', 'no attention coverage — neutral',
            'attention held 3 weeks (rank 1/4)', 'brand sentiment +0.2', 'app rank #8',
            '6-month momentum +12.0%', '12-month momentum +20.0%', '3-month momentum -4.0%', 'insufficient price history for momentum',
            'attention thesis Celsius', 'below 200d MA — capped', 'high volatility haircut',
            'ineligible (40 bars, quoted, no attention series)', 'ineligible (300 bars, no quote, attention covered)',
        ]));
        expect(SCORE_REASONS.some((r) => /^quiet attention \+\d+\.\d% \(rank \d+\/4\)$/.test(r))).toBe(true);
        expect(SCORE_REASONS.some((r) => /^category share \+1\.0 pts \(rank \d+\/4\)$/.test(r))).toBe(true);
        expect(SCORE_REASONS.some((r) => /^since last report \+\d+\.\d% \(rank \d+\/4\)$/.test(r))).toBe(true);
        expect(SCORE_REASONS.some((r) => /^slow attention 2\.0 \(rank \d+\/4\)$/.test(r))).toBe(true);
        expect(SCORE_REASONS.some((r) => /^attention trend \+\d+\.\d% \(rank \d+\/4\)$/.test(r))).toBe(true);
        expect(ORDER_REASONS).toEqual(expect.arrayContaining([
            'exit: score -0.20 below exit threshold 0', 'exit: thesis broken', 'exit: hard stop -35% vs cost',
            'rebalance +10.0% drift toward 15.0% target', 'rebalance -10.0% drift toward 10.0% target', 'enter: score 0.42',
        ]));
    });

    it('decodes everything the pickers emit', () => {
        for (const text of EMITTED) {
            const decoded = decodeCultureReason(text);
            expect(decoded.unknown, text).toEqual([]);
            expectClausesQuote(text, decoded.clauses);
        }
    });

    it('carries no template that nothing emits', () => {
        for (const template of CULTURE_GRAMMAR) {
            expect(EMITTED.some((text) => template.pattern.test(text)), template.id).toBe(true);
        }
        expect(new Set(CULTURE_GRAMMAR.map((template) => template.id)).size).toBe(CULTURE_GRAMMAR.length);
    });
});

describe('decodeCultureReason clauses', () => {
    const glossOf = (reason: string): string => decodeCultureReason(reason).clauses.map((clause) => clause.gloss).join(' ');

    it('names the picker and lists its weights', () => {
        const spike = glossOf('picker Spike');
        expect(spike).toContain('The Spike picker scored it');
        expect(spike).toContain('price momentum 0.40');
        expect(spike).toContain('attention surprise 0.20');
        expect(glossOf('picker Quiet')).toContain('attention persistence 0.15');
        expect(glossOf('picker Price only')).toContain('price momentum 1.00');
        expect(decodeCultureReason('picker Loud').unknown).toEqual(['picker Loud']);
    });

    it('splits a ranked term into the measurement and its rank, with each picker’s weight', () => {
        const {clauses} = decodeCultureReason('attention +42.0% vs baseline (rank 3/118)');
        expect(clauses.map((clause) => clause.text)).toEqual(['attention +42.0% vs baseline', '(rank 3/118)']);
        expect(clauses[0].term).toBe('attention-anomaly');
        expect(clauses[0].gloss).toContain('last 28 days stood +42.0%');
        expect(clauses[1].gloss).toContain('#3 of 118');
        expect(clauses[1].gloss).toContain('0.20 in Spike, 0 in Quiet');
        expect(glossOf('quiet attention +31.0% (rank 2/118)')).toContain('0 in Spike, 0.15 in Quiet');
        expect(glossOf('attention held 9 weeks (rank 4/118)')).toContain('for 9 consecutive weeks');
        expect(glossOf('category share +2.1 pts (rank 7/118)')).toContain('moved +2.1 pts');
        expect(glossOf('since last report +25.0% (rank 5/90)')).toContain('could not have carried');
        expect(glossOf('slow attention 3.2 (rank 5/40)')).toContain('halving every 60 days');
    });

    it('reads the neutral reasons with the weight each picker gives the term', () => {
        expect(glossOf('attention unmeasured — neutral')).toContain('weight 0.20 in Spike, 0 in Quiet');
        expect(glossOf('no report date — neutral')).toContain('weight 0 in Spike, 0.05 in Quiet');
        expect(glossOf('no attention coverage — neutral')).toContain('set to 0');
    });

    it('reads momentum by the horizon it quotes, the app rank, the thesis and the guards', () => {
        expect(glossOf('6-month momentum +12.0%')).toContain('+12.0% over the last 126 sessions, about 6 months');
        expect(glossOf('6-month momentum +12.0%')).toContain('6-month change 0.50, 12-month 0.30, 3-month 0.20');
        expect(glossOf('insufficient price history for momentum')).toContain('Fewer than 64 daily closes');
        expect(glossOf('app rank #12')).toContain('#12 on the US App Store');
        expect(glossOf('attention thesis Celsius')).toContain("Celsius's attention has stayed above the thesis line");
        expect(glossOf('high volatility haircut')).toContain('highest 20%');
        expect(glossOf('ineligible (40 bars, quoted, no attention series)')).toContain('needs 126 daily bars');
    });

    it('reads the order reasons with the culture rails', () => {
        const exit = decodeCultureReason('exit: score -0.20 below exit threshold 0').clauses;
        expect(exit.map((clause) => clause.text)).toEqual(['exit', 'score -0.20 below exit threshold 0']);
        expect(exit[0].gloss).toContain('21-trading-day minimum hold');
        expect(glossOf('exit: hard stop -35% vs cost')).toContain('past the hard stop at 30% below cost');
        const resize = decodeCultureReason('rebalance -10.0% drift toward 10.0% target').clauses;
        expect(resize[0].gloss).toContain('more than 5% of the account');
        expect(resize[1].gloss).toMatch(/over its target, so the picker sold/);
        expect(resize[2].gloss).toContain('at most 15% in one name, with at least 5% kept in cash');
        expect(glossOf('enter: score 0.42')).toContain('above the entry line of 0.15; the 10 highest');
    });

    it('says the picker bought on every buy it placed and sold on every sell', () => {
        for (const order of ORDERS) {
            const {clauses} = decodeCultureReason(order.reason);
            const action = order.reason.startsWith('rebalance') ? clauses[1] : clauses[0];
            const [did, didNot] = order.side === 'buy' ? [/\bbought\b/, /\bsold\b/] : [/\bsold\b/, /\bbought\b/];
            expect(action?.gloss, order.reason).toMatch(did);
            expect(action?.gloss, order.reason).not.toMatch(didNot);
        }
    });
});

describe('glossCultureReasons', () => {
    it('flattens the clauses of every reason it can read and skips the rest', () => {
        const clauses = glossCultureReasons(['enter: score 0.42', 'something new', 'high volatility haircut']);
        expect(clauses.map((clause) => clause.text)).toEqual(['enter', 'score 0.42', 'high volatility haircut']);
        expect(glossCultureReasons([])).toEqual([]);
    });
});

describe('the grammar follows the config', () => {
    afterEach(() => {
        vi.doUnmock('@/lib/culture/config');
        vi.resetModules();
    });

    it('prints every figure from its constant: each one moved to a sentinel moves the gloss', async () => {
        vi.resetModules();
        vi.doMock('@/lib/culture/config', async (importOriginal) => {
            const original = await importOriginal<typeof import('@/lib/culture/config')>();
            return {
                ...original,
                ATTENTION_RECENT_DAYS: 21,
                PERSISTENCE_CAP_WEEKS: 30,
                PRESS_WINDOW_DAYS: 35,
                APP_RANK_FLOOR: 300,
                MIN_PRICE_BARS: 111,
                CULTURE_VOLATILITY_HAIRCUT: 0.7,
                CULTURE_RAILS: {...original.CULTURE_RAILS, maxPositions: 9, maxPositionWeight: 0.17, minCashWeight: 0.13, minHoldingTradingDays: 17, rebalanceBand: 0.07, entryScoreThreshold: 0.19, hardStopDrawdown: 0.23},
                CULTURE_PROFILES: {
                    ...original.CULTURE_PROFILES,
                    spike: {...original.CULTURE_PROFILES.spike, weights: {...original.CULTURE_PROFILES.spike.weights, attentionAnomaly: 0.21}},
                },
            };
        });
        const mocked = await import('@/lib/learn/culture-reasons');
        const glossOf = (reason: string): string => mocked.decodeCultureReason(reason).clauses.map((clause) => clause.gloss).join(' ');
        const expected: [string, string[]][] = [
            ['attention +42.0% vs baseline (rank 3/118)', ['last 21 days stood', '0.21 in Spike']],
            ['attention held 9 weeks (rank 4/118)', ['the count stops at 30']],
            ['quiet attention +31.0% (rank 2/118)', ['over the last 35 days']],
            ['app rank #12', ['0 at #300']],
            ['high volatility haircut', ['multiplied by 0.7']],
            ['ineligible (40 bars, quoted, no attention series)', ['needs 111 daily bars']],
            ['exit: hard stop -35% vs cost', ['past the hard stop at 23% below cost']],
            ['rebalance +10.0% drift toward 15.0% target', ['more than 7% of the account', 'only after 17 trading days', 'at most 17% in one name, with at least 13% kept in cash']],
            ['enter: score 0.42', ['above the entry line of 0.19; the 9 highest']],
        ];
        for (const [reason, figures] of expected) {
            const text = glossOf(reason);
            for (const figure of figures) expect(text, reason).toContain(figure);
        }
    });
});

describe('decodeCultureReason on text it did not write', () => {
    it('turns a truncated reason into one unknown clause, never a throw', () => {
        for (const text of EMITTED) {
            for (const length of [1, Math.floor(text.length / 2), text.length - 1]) {
                const decoded = decodeCultureReason(text.slice(0, length));
                expect(decoded.unknown.length + (decoded.clauses.length > 0 ? 1 : 0)).toBe(1);
                if (decoded.unknown.length > 0) expect(decoded.clauses).toEqual([]);
            }
        }
    });

    it('never builds a pattern from its input, and refuses very long input', () => {
        for (const text of ['(a+)+$', '.*', '[', '\\', 'attention thesis (.*)', '$&$1', 'enter: score )']) {
            expect(decodeCultureReason(text)).toEqual({clauses: [], unknown: [text]});
        }
        const long = `attention thesis ${'x'.repeat(MAX_REASON_CHARS * 20)}`;
        expect(decodeCultureReason(long)).toEqual({clauses: [], unknown: [long]});
        expect(decodeCultureReason('   ')).toEqual({clauses: [], unknown: []});
    });
});
