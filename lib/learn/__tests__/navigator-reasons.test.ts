// The Navigator's half of the reason decoder, held to the strings the Navigator really writes:
// scoreUniverse run on a universe that forces every branch of its reasons, and diffToOrders
// driven into every order it can place. Each string must decode completely into clauses that
// quote it verbatim and gloss it in narration that passes the 'advice' tier and says nothing
// about the Navigator working, failing or beating anything. The grammar may not carry a
// template nothing emits. One string is fed as a literal: the kept-position fallback
// (allocator.ts HOLDING_REASON, written by service.ts, which reads the database).

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
// volatility haircut, ineligibility and a symbol the brain does not cover.
const UNIVERSE: ScoringInput[] = [
    input('AAA', {newsWeightSlow: 12.3, sentimentSlow: 0.3, signals: {r63: 0.05, r126: 0.12, r252: 0.3, vol63: 0.9, ma200dist: 0.05},
        sectorTilt: 0.8, sectorLabel: 'Technology', hasActiveThesis: true, thesisLabel: 'AAA'}),
    input('BBB', {signals: {r63: null, r126: null, r252: 0.2, vol63: 0.3, ma200dist: 0.02},
        sectorTilt: -0.5, sectorLabel: 'Consumer Discretionary', hasActiveThesis: true}),
    input('CCC', {newsWeightSlow: 0.4, signals: {r63: -0.04, r126: null, r252: null, vol63: 0.25, ma200dist: -0.1},
        hasActiveThesis: true, thesisLabel: 'sector:technology'}),
    input('DDD', {newsWeightSlow: 0, signals: {r63: null, r126: null, r252: null, vol63: null, ma200dist: null},
        hasActiveThesis: true, thesisLabel: 'theme:ai-capex', articleCount: 1, sourceCount: 1, barsCount: 40}),
    // No brain entity, as service.ts passes SPY and SMH: news neutral, outside the news rank.
    input('SPY', {newsWeightSlow: null, alwaysEligible: true}),
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
const NEUTRAL_NEWS_REASON = scoreUniverse(UNIVERSE).find((scored) => scored.symbol === 'SPY')?.reasons[0] ?? '';
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

describe('decodeNavigatorReason round trip', () => {
    it('forces every branch the fixtures are meant to reach', () => {
        expect(SCORE_REASONS).toEqual(expect.arrayContaining([
            '6-month momentum +12.0%', '12-month momentum +20.0%', '3-month momentum -4.0%', 'insufficient price history for momentum',
            'thesis AAA', 'thesis active', 'thesis sector:technology', 'thesis theme:ai-capex',
            'Technology sector standing 0.8', 'Consumer Discretionary sector standing -0.5',
            'below 200d MA — capped', 'high volatility haircut', 'ineligible (1 articles, 1 sources, 40 bars)',
            'no brain coverage — news neutral',
        ]));
        expect(SCORE_REASONS.some((reason) => /^slow news weight 12\.3 \(rank 1\/4\)$/.test(reason))).toBe(true);
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

    it('reads the neutral-news reason scoreUniverse writes as its own clause', () => {
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

    it('says the Navigator bought on every buy it placed and sold on every sell', () => {
        // The fixture's orders carry their side: a resize reads as the trade it was, each way.
        expect(ORDERS.filter((order) => order.reason.startsWith('rebalance')).map((order) => order.side).sort()).toEqual(['buy', 'sell']);
        for (const order of ORDERS) {
            const {clauses} = decodeNavigatorReason(order.reason);
            // The clause that names the trade: the drift for a resize, the lead clause otherwise.
            const action = order.reason.startsWith('rebalance') ? clauses[1] : clauses[0];
            const [did, didNot] = order.side === 'buy' ? [/\bbought\b/, /\bsold\b/] : [/\bsold\b/, /\bbought\b/];
            expect(action?.gloss, order.reason).toMatch(did);
            expect(action?.gloss, order.reason).not.toMatch(didNot);
        }
    });

    it('reads the ineligible counts in the order the reason gives them, and the sector part at its own weight', () => {
        expect(glossOf('ineligible (3 articles, 2 sources, 40 bars)')).toContain('this one had 3, 2 and 40.');
        expect(glossOf('ineligible (1 articles, 1 sources, 40 bars)')).toContain('needs 3 articles from 2 sources in 21 days and 126 daily bars');
        // Sector standing is weighted 0.10 in SCORE_WEIGHTS; news sentiment's 0.15 is another part.
        expect(glossOf('Technology sector standing 0.8')).toContain('the standing has a weight of 0.10 in the score');
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
        vi.doUnmock('@/lib/navigator/scoring');
        vi.doUnmock('@/lib/brain/config');
        vi.resetModules();
    });

    it('prints every figure from its constant: each one moved to a sentinel moves the gloss', async () => {
        vi.resetModules();
        vi.doMock('@/lib/navigator/config', async (importOriginal) => ({
            ...(await importOriginal<typeof import('@/lib/navigator/config')>()),
            MAX_POSITIONS: 9,
            MAX_POSITION_WEIGHT: 0.17,
            MIN_CASH_WEIGHT: 0.13,
            MIN_HOLDING_TRADING_DAYS: 17,
            REBALANCE_BAND: 0.07,
            ENTRY_SCORE_THRESHOLD: 0.19,
            EXIT_SCORE_THRESHOLD: -0.05,
            HARD_STOP_DRAWDOWN: 0.23,
            MIN_ARTICLES_FOR_ELIGIBILITY: 4,
            MIN_DISTINCT_SOURCES: 5,
            ELIGIBILITY_LOOKBACK_DAYS: 16,
            MIN_PRICE_BARS: 111,
            SCORE_WEIGHTS: {newsSlow: 0.21, sentimentSlow: 0.14, momentumLong: 0.31, thesis: 0.22, sectorSlow: 0.12},
            MOMENTUM_MIX: {r126: 0.41, r252: 0.33, r63: 0.26},
            VOLATILITY_HAIRCUT: 0.7,
        }));
        vi.doMock('@/lib/navigator/scoring', async (importOriginal) => ({
            ...(await importOriginal<typeof import('@/lib/navigator/scoring')>()),
            TOP_QUINTILE_FRACTION: 0.15,
        }));
        vi.doMock('@/lib/brain/config', async (importOriginal) => ({
            ...(await importOriginal<typeof import('@/lib/brain/config')>()),
            HALF_LIFE_SLOW_DAYS: 90,
        }));
        const mocked = await import('@/lib/learn/reasons');
        const glossOf = (reason: string): string => mocked.decodeNavigatorReason(reason).clauses.map((clause) => clause.gloss).join(' ');
        const expected: [string, string[]][] = [
            ['slow news weight 12.3 (rank 2/25)', ['halves every 90 days', 'has a weight of 0.21 in the score']],
            [NEUTRAL_NEWS_REASON, ['(weight 0.21)']],
            ['6-month momentum +12.0%', ['Momentum has a weight of 0.31', '6-month change 0.41, 12-month 0.33, 3-month 0.26']],
            ['thesis active', ['added 0.22 to the score']],
            ['Technology sector standing 0.8', ['the standing has a weight of 0.12 in the score']],
            ['high volatility haircut', ['among the highest 15% of the symbols', 'multiplied by 0.7']],
            ['ineligible (1 articles, 1 sources, 40 bars)', ['needs 4 articles from 5 sources in 16 days and 111 daily bars']],
            ['exit: score -0.20 below exit threshold 0', ['the 17-trading-day minimum hold', 'under the exit line of -0.05']],
            ['exit: hard stop -30% vs cost', ['past the hard stop at 23% below cost']],
            ['rebalance +10.0% drift toward 15.0% target', ['more than 7% of the account', 'only after 17 trading days', 'at most 17% in one name, with at least 13% kept in cash']],
            ['enter: score 0.42', ['above the entry line of 0.19; the 9 highest', 'only below -0.05']],
        ];
        for (const [reason, figures] of expected) {
            const text = glossOf(reason);
            for (const figure of figures) expect(text, reason).toContain(figure);
        }
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
