// The Navigator's half of the reason decoder, held to the strings the Navigator really writes:
// scoreUniverse run on a universe that forces every branch of its reasons, and diffToOrders
// driven into every order it can place. Each string must decode completely into clauses that
// quote it verbatim and gloss it in narration that passes the 'advice' tier and says nothing
// about the Navigator working, failing or beating anything. The grammar may not carry a
// template nothing emits. Two strings are fed as literals: the kept-position fallback
// (allocator.ts HOLDING_REASON, written by service.ts, which reads the database) and the
// neutral-news reason of the unmerged fix/navigator-neutral-news branch (PR #26).

import {afterEach, describe, expect, it, vi} from 'vitest';
import {findBanned} from '@/lib/learn/banned';
import {isGlossaryKey} from '@/lib/learn/glossary';
import {
    decodeNavigatorReason,
    decodeReason,
    glossNavigatorReasons,
    MAX_REASON_CHARS,
    NAVIGATOR_GRAMMAR,
    type ReasonClause,
} from '@/lib/learn/reasons';
import {diffToOrders, HOLDING_REASON, type HeldPosition} from '@/lib/navigator/allocator';
import {scoreUniverse, type ScoringInput} from '@/lib/navigator/scoring';

const NEUTRAL_NEWS_REASON = 'no brain coverage — news neutral';
const MECHANISM_ONLY = /\b(works?|worked|working|fails?|failed|beat(s|en|ing)?|outperform\w*|underperform\w*|lags?|lagged)\b/i;

const input = (symbol: string, patch: Partial<ScoringInput> = {}): ScoringInput => ({
    symbol,
    newsWeightSlow: 3,
    sentimentSlow: 0.1,
    signals: {r63: 0.02, r126: 0.05, r252: 0.1, vol63: 0.2, ma200dist: 0.05},
    sectorTilt: 0,
    hasActiveThesis: false,
    articleCount: 10,
    sourceCount: 4,
    barsCount: 300,
    alwaysEligible: false,
    ...patch,
});

// Every branch of scoreUniverse's reasons: each momentum horizon and none, a thesis by name,
// by sector and theme key and unnamed, both signs of sector standing, the 200-day cap, the
// volatility haircut and ineligibility.
const UNIVERSE: ScoringInput[] = [
    input('AAA', {newsWeightSlow: 12.3, sentimentSlow: 0.3, signals: {r63: 0.05, r126: 0.12, r252: 0.3, vol63: 0.9, ma200dist: 0.05},
        sectorTilt: 0.8, sectorLabel: 'Technology', hasActiveThesis: true, thesisLabel: 'AAA'}),
    input('BBB', {signals: {r63: null, r126: null, r252: 0.2, vol63: 0.3, ma200dist: 0.02},
        sectorTilt: -0.5, sectorLabel: 'Consumer Discretionary', hasActiveThesis: true}),
    input('CCC', {newsWeightSlow: 0.4, signals: {r63: -0.04, r126: null, r252: null, vol63: 0.25, ma200dist: -0.1},
        hasActiveThesis: true, thesisLabel: 'sector:technology'}),
    input('DDD', {newsWeightSlow: 0, signals: {r63: null, r126: null, r252: null, vol63: null, ma200dist: null},
        hasActiveThesis: true, thesisLabel: 'theme:ai-capex', articleCount: 1, sourceCount: 1, barsCount: 40}),
    input('SPY', {newsWeightSlow: 0, alwaysEligible: true}),
];

const position = (symbol: string, patch: Partial<HeldPosition> = {}): HeldPosition => ({
    symbol, quantity: 50, avgCost: 100, price: 100, heldTradingDays: 30, thesisBroken: false, score: 0.3, ...patch,
});

// Every order diffToOrders writes: an exit on score, on a broken thesis and on the hard stop, a
// resize each way, and an entry (priced through a quantity-0 quote row).
const ORDERS = diffToOrders({
    totalValue: 100_000,
    cash: 20_000,
    maxTrades: 10,
    positions: [
        position('XS', {quantity: 100, score: -0.2}),
        position('XT', {thesisBroken: true}),
        position('XH', {price: 70}),
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

const SCORE_REASONS = scoreUniverse(UNIVERSE).flatMap((scored) => scored.reasons);
const ORDER_REASONS = ORDERS.map((order) => order.reason);
const EMITTED = [...SCORE_REASONS, ...ORDER_REASONS, HOLDING_REASON, NEUTRAL_NEWS_REASON];

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

describe('decodeNavigatorReason round trip', () => {
    it('forces every branch the fixtures are meant to reach', () => {
        expect(SCORE_REASONS).toEqual(expect.arrayContaining([
            '6-month momentum +12.0%', '12-month momentum +20.0%', '3-month momentum -4.0%', 'insufficient price history for momentum',
            'thesis AAA', 'thesis active', 'thesis sector:technology', 'thesis theme:ai-capex',
            'Technology sector standing 0.8', 'Consumer Discretionary sector standing -0.5',
            'below 200d MA — capped', 'high volatility haircut', 'ineligible (1 articles, 1 sources, 40 bars)',
        ]));
        expect(SCORE_REASONS.some((reason) => /^slow news weight 12\.3 \(rank 1\/5\)$/.test(reason))).toBe(true);
        expect(ORDER_REASONS).toEqual(expect.arrayContaining([
            'exit: score -0.20 below exit threshold 0', 'exit: thesis broken', 'exit: hard stop -30% vs cost',
            'rebalance +10.0% drift toward 15.0% target', 'rebalance -10.0% drift toward 10.0% target', 'enter: score 0.42',
        ]));
    });

    it('decodes everything the Navigator emits', () => {
        for (const text of EMITTED) {
            const decoded = decodeNavigatorReason(text);
            expect(decoded.unknown, text).toEqual([]);
            expectClausesQuote(text, decoded.clauses);
        }
    });

    it('carries no template that nothing emits', () => {
        for (const template of NAVIGATOR_GRAMMAR) {
            expect(EMITTED.some((text) => template.pattern.test(text)), template.id).toBe(true);
        }
        expect(new Set(NAVIGATOR_GRAMMAR.map((template) => template.id)).size).toBe(NAVIGATOR_GRAMMAR.length);
    });

    it('reads the unmerged neutral-news reason as its own clause', () => {
        const {clauses} = decodeNavigatorReason(NEUTRAL_NEWS_REASON);
        expect(clauses).toHaveLength(1);
        expect(clauses[0]).toMatchObject({text: NEUTRAL_NEWS_REASON, term: 'news-weight', rail: 'SCORE_WEIGHTS'});
        expect(clauses[0].gloss).toContain('0.20');
    });
});

describe('decodeNavigatorReason clauses', () => {
    const glossOf = (reason: string): string => decodeNavigatorReason(reason).clauses.map((clause) => clause.gloss).join(' ');

    it('splits the news reason into the weight and its rank, quoting the brain and Navigator constants', () => {
        const {clauses} = decodeNavigatorReason('slow news weight 12.3 (rank 2/25)');
        expect(clauses.map((clause) => clause.text)).toEqual(['slow news weight 12.3', '(rank 2/25)']);
        expect(clauses[0].term).toBe('news-weight');
        expect(clauses[0].gloss).toContain('halves every 60 days');
        expect(clauses[1].gloss).toContain('#2 of 25');
        expect(clauses[1].gloss).toContain('weight of 0.20');
    });

    it('reads momentum by the horizon it quotes, with the mix from the config', () => {
        const six = glossOf('6-month momentum +12.0%');
        expect(six).toContain('+12.0% over the last 126 sessions, about 6 months');
        expect(six).toContain('weight of 0.35');
        expect(six).toContain('6-month change 0.50, 12-month 0.30, 3-month 0.20');
        expect(glossOf('3-month momentum -4.0%')).toContain('-4.0% over the last 63 sessions');
        expect(glossOf('insufficient price history for momentum')).toContain('Fewer than 64 daily closes');
    });

    it('names a thesis by what it is attached to', () => {
        expect(glossOf('thesis NVDA')).toContain('An active thesis on NVDA');
        expect(glossOf('thesis sector:consumer-staples')).toContain('on the consumer staples sector');
        expect(glossOf('thesis theme:ai-capex')).toContain('on the "ai capex" theme');
        expect(glossOf('thesis active')).toBe('An active thesis added 0.20 to the score.');
    });

    it('reads the order reasons with their rails', () => {
        const exit = decodeNavigatorReason('exit: score -0.20 below exit threshold 0').clauses;
        expect(exit.map((clause) => clause.text)).toEqual(['exit', 'score -0.20 below exit threshold 0']);
        expect(exit[0].gloss).toContain('21-trading-day minimum hold');
        expect(exit[1].rail).toBe('EXIT_SCORE_THRESHOLD');
        expect(glossOf('exit: hard stop -30% vs cost')).toContain('30% under the average cost, past the hard stop at 25% below cost');
        const resize = decodeNavigatorReason('rebalance -10.0% drift toward 10.0% target').clauses;
        expect(resize.map((clause) => clause.text)).toEqual(['rebalance', '-10.0% drift', 'toward 10.0% target']);
        expect(resize[0]).toMatchObject({rail: 'REBALANCE_BAND'});
        expect(resize[0].gloss).toContain('more than 5% of the account');
        expect(resize[1].gloss).toMatch(/over its target, so the Navigator sold/);
        expect(resize[2].gloss).toContain('at most 20% in one name, with at least 10% kept in cash');
        expect(glossOf('enter: score 0.42')).toContain('above the entry line of 0.15; the 8 highest');
    });

    it('is not the strategies\' grammar: the same resize reads with each owner\'s band', () => {
        const reason = 'rebalance +3.8% drift toward 12.0% target';
        expect(decodeReason(reason).clauses[0].gloss).toContain('2% of the account');
        expect(decodeNavigatorReason(reason).clauses[0].gloss).toContain('5% of the account');
        expect(decodeReason('enter: score 0.42').unknown).toEqual(['enter: score 0.42']);
        expect(decodeNavigatorReason('enter: RSI(2) 3.4 < 10 with close 123.45 above SMA200 110.00').clauses).toEqual([]);
    });
});

describe('glossNavigatorReasons', () => {
    it('flattens the clauses of every reason it can read and skips the rest', () => {
        const clauses = glossNavigatorReasons(['enter: score 0.42', 'something new', 'high volatility haircut']);
        expect(clauses.map((clause) => clause.text)).toEqual(['enter', 'score 0.42', 'high volatility haircut']);
        expect(glossNavigatorReasons([])).toEqual([]);
    });
});

describe('the grammar follows the config', () => {
    afterEach(() => {
        vi.doUnmock('@/lib/navigator/config');
        vi.doUnmock('@/lib/brain/config');
        vi.resetModules();
    });

    it('moves with a changed Navigator rail and a changed half-life', async () => {
        vi.resetModules();
        vi.doMock('@/lib/navigator/config', async (importOriginal) => ({
            ...(await importOriginal<typeof import('@/lib/navigator/config')>()),
            REBALANCE_BAND: 0.08,
            ENTRY_SCORE_THRESHOLD: 0.25,
            SCORE_WEIGHTS: {newsSlow: 0.3, sentimentSlow: 0.1, momentumLong: 0.3, thesis: 0.2, sectorSlow: 0.1},
        }));
        vi.doMock('@/lib/brain/config', async (importOriginal) => ({
            ...(await importOriginal<typeof import('@/lib/brain/config')>()),
            HALF_LIFE_SLOW_DAYS: 90,
        }));
        const mocked = await import('@/lib/learn/reasons');
        const glossOf = (reason: string): string => mocked.decodeNavigatorReason(reason).clauses.map((clause) => clause.gloss).join(' ');
        expect(glossOf('rebalance +10.0% drift toward 15.0% target')).toContain('more than 8% of the account');
        expect(glossOf('enter: score 0.42')).toContain('entry line of 0.25');
        expect(glossOf('6-month momentum +12.0%')).toContain('weight of 0.30');
        expect(glossOf('slow news weight 12.3 (rank 2/25)')).toContain('halves every 90 days');
    });
});

describe('decodeNavigatorReason on text it did not write', () => {
    it('turns a truncated reason into one unknown clause, never a throw', () => {
        for (const text of EMITTED) {
            for (const length of [1, Math.floor(text.length / 2), text.length - 1]) {
                const decoded = decodeNavigatorReason(text.slice(0, length));
                expect(decoded.unknown.length + (decoded.clauses.length > 0 ? 1 : 0)).toBe(1);
                if (decoded.unknown.length > 0) expect(decoded.clauses).toEqual([]);
            }
        }
    });

    it('never builds a pattern from its input', () => {
        for (const input of ['(a+)+$', '.*', '[', '\\', 'thesis (.*)', '$&$1', 'enter: score )']) {
            expect(decodeNavigatorReason(input)).toEqual({clauses: [], unknown: [input]});
        }
    });

    it('refuses very long input without scanning it, and says nothing about nothing', () => {
        const long = `thesis ${'x'.repeat(MAX_REASON_CHARS * 20)}`;
        expect(decodeNavigatorReason(long)).toEqual({clauses: [], unknown: [long]});
        expect(decodeNavigatorReason('   ')).toEqual({clauses: [], unknown: []});
    });
});
