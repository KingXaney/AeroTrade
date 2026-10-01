// The reason decoder, held to the strings the engine really emits: every rule is run on
// its generic context and on the contexts that force each of its branches (the same
// fixtures rules.test.ts uses), the resulting days go through runStrategyDay (planOrders
// and the engine's own exits and skips), and planOrders is driven into every skip. Each
// string must decode completely, with and without the page's definition, into clauses
// that quote the reason verbatim and gloss it in narration that passes the 'advice' tier
// of lib/learn/banned.ts. The grammar may not carry a template nothing emits.

import {describe, expect, it} from 'vitest';
import {findBanned} from '@/lib/learn/banned';
import {isGlossaryKey} from '@/lib/learn/glossary';
import {decodeReason, MAX_REASON_CHARS, REASON_GRAMMAR, type ReasonClause} from '@/lib/learn/reasons';
import {REASON_GLOSS} from '@/lib/learn/copy/reasons';
import {STRATEGIES} from '@/lib/strategies/catalog';
import {DEFAULT_DRIFT_BAND} from '@/lib/strategies/config';
import {runStrategyDay} from '@/lib/strategies/engine';
import {planOrders} from '@/lib/strategies/rebalance';
import {STRATEGY_RULES} from '@/lib/strategies/rules';
import type {Holding, StrategyDefinition, StrategyId, Target} from '@/lib/strategies/types';
import {branchContexts, definition, genericContext} from '@/lib/strategies/__tests__/fixtures';

type Emitted = {source: string; text: string};

// Every string a strategy's day can put in front of a reader: target reasons, board notes
// and data issues from the rule; order reasons, skip reasons and the engine's own data
// issue from runStrategyDay.
const emittedBy = (def: StrategyDefinition): Emitted[] => {
    const decide = STRATEGY_RULES[def.id];
    const out: Emitted[] = [];
    for (const ctx of [genericContext(def), ...branchContexts(def)]) {
        const decision = decide(def, ctx);
        for (const target of decision.targets) out.push({source: 'target', text: target.reason});
        for (const row of decision.board) if (row.note) out.push({source: 'note', text: row.note});
        for (const issue of decision.dataIssues) out.push({source: 'data issue', text: issue});
        const day = runStrategyDay(def, ctx, decide);
        for (const order of day.orders) out.push({source: 'order', text: order.reason});
        for (const skip of day.skippedOrders) out.push({source: 'skip', text: skip.reason});
        for (const issue of day.decision.dataIssues) out.push({source: 'day issue', text: issue});
    }
    return out;
};

// planOrders' skip reasons, forced one by one (as rebalance.test.ts does).
const holding = (symbol: string, quantity: number, lastClose: number | null = 100): Holding =>
    ({symbol, quantity, avgCost: 100, lastClose});
const plan = (targets: Target[], extra: Partial<Parameters<typeof planOrders>[0]> = {}) => planOrders({
    equity: 100_000, cash: 100_000, holdings: [], targets,
    prices: new Map([['AAA', 100], ['BBB', 50_000], ['CCC', 100]]), stale: new Set(), driftBand: DEFAULT_DRIFT_BAND, ...extra,
});
const PLANNER_SKIPS: Emitted[] = [
    plan([{symbol: 'AAA', weight: 0.1, reason: 'x'}, {symbol: 'AAA', weight: 0.2, reason: 'y'}]),
    plan([{symbol: 'BBB', weight: 0.1, reason: 'x'}]),
    plan([{symbol: 'AAA', weight: 0, reason: 'x'}], {holdings: [holding('AAA', 5)], stale: new Set(['AAA'])}),
    plan([{symbol: 'AAA', weight: 0, reason: 'x'}], {holdings: [holding('AAA', 5, null)]}),
    plan([{symbol: 'DDD', weight: 0.1, reason: 'x'}], {stale: new Set(['DDD'])}),
    plan([{symbol: 'DDD', weight: 0.1, reason: 'x'}]),
    plan([{symbol: 'AAA', weight: 0.5, reason: 'x'}], {cash: 500}),
].flatMap((result) => result.skipped.map((skip) => ({source: 'planner skip', text: skip.reason})));

const ALL: {def: StrategyDefinition; emitted: Emitted[]}[] = STRATEGIES.map((def) => ({def, emitted: emittedBy(def)}));

const expectClausesQuote = (text: string, clauses: readonly ReasonClause[]) => {
    for (const clause of clauses) {
        expect(clause.text.length, text).toBeGreaterThan(0);
        expect(text, clause.text).toContain(clause.text);
        expect(clause.gloss.endsWith('.'), clause.gloss).toBe(true);
        expect(findBanned(clause.gloss, 'advice'), clause.gloss).toEqual([]);
        if (clause.term !== undefined) expect(isGlossaryKey(clause.term), clause.term).toBe(true);
    }
};

// ---------------------------------------------------------------------------

describe('decodeReason round trip', () => {
    it.each(ALL.map(({def, emitted}) => [def.id, def, emitted] as const))('decodes everything %s emits', (_, def, emitted) => {
        expect(emitted.length).toBeGreaterThan(0);
        for (const {source, text} of emitted) {
            const withDef = decodeReason(text, {def});
            expect(withDef.unknown, `${source}: ${text}`).toEqual([]);
            expect(withDef.clauses.length, `${source}: ${text}`).toBeGreaterThan(0);
            expectClausesQuote(text, withDef.clauses);
            // The tutor decodes a reason with no page around it.
            const bare = decodeReason(text);
            expect(bare.unknown, `${source} (no def): ${text}`).toEqual([]);
            expectClausesQuote(text, bare.clauses);
        }
    });

    it('covers every skip planOrders can emit', () => {
        expect(new Set(PLANNER_SKIPS.map((skip) => skip.text))).toEqual(new Set([
            'duplicate target', 'below one share', 'stale', 'unpriced', 'stale target', 'unpriced target', 'cash floor',
        ]));
        for (const {text} of PLANNER_SKIPS) {
            const decoded = decodeReason(text);
            expect(decoded.unknown, text).toEqual([]);
            expectClausesQuote(text, decoded.clauses);
        }
    });

    it('reaches the engine: a stray holding is sold and a stale universe skips the day', () => {
        const texts = ALL.flatMap(({emitted}) => emitted.map((e) => e.text));
        expect(texts).toContain('left the strategy universe');
        expect(texts).toContain('left the universe');
        expect(texts.some((text) => /^\d+\/\d+ symbols stale: /.test(text))).toBe(true);
    });

    it('carries no template that nothing emits', () => {
        const texts = [...ALL.flatMap(({emitted}) => emitted.map((e) => e.text)), ...PLANNER_SKIPS.map((e) => e.text)];
        for (const template of REASON_GRAMMAR) {
            expect(texts.some((text) => template.pattern.test(text)), template.id).toBe(true);
        }
        expect(new Set(REASON_GRAMMAR.map((template) => template.id)).size).toBe(REASON_GRAMMAR.length);
    });
});

describe('decodeReason clauses', () => {
    const rsi2 = definition('rsi2-mean-reversion');
    const RSI_ENTER = 'enter: RSI(2) 3.4 < 10 with close 123.45 above SMA200 110.00';

    it('splits an RSI-2 entry into its action, its reading and its trend filter', () => {
        const {clauses, unknown} = decodeReason(RSI_ENTER, {def: rsi2});
        expect(unknown).toEqual([]);
        expect(clauses.map((clause) => clause.text)).toEqual(['enter', 'RSI(2) 3.4 < 10', 'close 123.45 above SMA200 110.00']);
        expect(clauses.map((clause) => clause.term)).toEqual([undefined, 'rsi2', 'above-sma200']);
        expect(clauses[1].gloss).toContain('10');
        expect(clauses[1].gloss).toContain('3.4');
        expect(clauses[2].gloss).toContain('200-day average (110.00)');
    });

    it('reads a golden cross in both directions', () => {
        const enter = decodeReason('enter: SMA50 42.10 > SMA200 40.00 (+5.3%)').clauses;
        expect(enter.map((clause) => clause.term)).toEqual([undefined, 'trend-on', 'spread']);
        expect(enter[1].gloss).toMatch(/50-day average \(42\.10\) was above the 200-day average \(40\.00\)/);
        expect(enter[2].gloss).toContain('5.3% above');
        const exit = decodeReason('exit: SMA50 80.00 ≤ SMA200 81.00').clauses;
        expect(exit).toHaveLength(2);
        expect(exit[1].gloss).toMatch(/at or below/);
        expect(decodeReason('hold: SMA50 99.00 > SMA200 100.00 (-1.0%)').clauses[2].gloss).toContain('1.0% below');
    });

    it('reads a rebalance drift by its sign', () => {
        const under = decodeReason('rebalance +3.8% drift toward 59.4% target').clauses;
        expect(under.map((clause) => clause.text)).toEqual(['rebalance', '+3.8% drift', 'toward 59.4% target']);
        expect(under[0].rail).toBe('DEFAULT_DRIFT_BAND');
        expect(under[1].gloss).toMatch(/3\.8% of the account under its target, so the rule bought/);
        expect(decodeReason('rebalance -4.6% drift toward 39.6% target').clauses[1].gloss).toMatch(/over its target, so the rule sold/);
    });

    it('reads dual momentum\'s pick, including the step into bonds', () => {
        const home = decodeReason('monthly: SPY 12m +18.2% > T-bill +4.9% and ≥ EFA +12.1% → SPY').clauses;
        expect(home.map((clause) => clause.text)).toEqual(['monthly', 'SPY 12m +18.2% > T-bill +4.9%', 'and ≥ EFA +12.1%', '→ SPY']);
        const bonds = decodeReason('monthly: SPY 12m +1.0% ≤ T-bill +4.0% → AGG (absolute momentum off)').clauses;
        expect(bonds.map((clause) => clause.text)).toEqual(['monthly', 'SPY 12m +1.0% ≤ T-bill +4.0%', '→ AGG (absolute momentum off)']);
        expect(bonds[1].gloss).toMatch(/absolute momentum was off/);
    });

    it('names the rail a skip turned on', () => {
        expect(decodeReason('cash floor').clauses[0]).toMatchObject({rail: 'CASH_FLOOR'});
        expect(decodeReason('cash floor').clauses[0].gloss).toContain('1%');
        expect(decodeReason('4/40 symbols stale: AAPL, MSFT, NVDA, V').clauses[0]).toMatchObject({rail: 'STALE_SKIP_FRACTION'});
    });

    it('decodes a held-but-kept issue through the note inside it', () => {
        const {clauses} = decodeReason('AAPL: held but needs 200 bars; kept', {def: rsi2});
        expect(clauses.map((clause) => clause.text)).toEqual(['AAPL: held', 'needs 200 bars']);
        expect(clauses[1].term).toBe('sma200');
        expect(decodeReason('AAPL: held but something new; kept').unknown).toEqual(['AAPL: held but something new; kept']);
    });
});

describe('decodeReason interpolates the definition', () => {
    const withParams = (id: StrategyId, patch: Partial<StrategyDefinition>): StrategyDefinition => {
        const def = definition(id);
        return {...def, ...patch, params: {...def.params, ...(patch.params ?? {})}};
    };
    const glossOf = (reason: string, def?: StrategyDefinition): string =>
        decodeReason(reason, def ? {def} : {}).clauses.map((clause) => clause.gloss).join(' ');

    it('follows readParam and the slot count, not constants of its own', () => {
        const reason = 'enter: RSI(2) 3.4 < 10 with close 123.45 above SMA200 110.00';
        expect(glossOf(reason)).toContain('one of its 5 equal slots; it sells on the first close above the 5-day average');
        const mutated = withParams('rsi2-mean-reversion', {slots: 3, params: {exitSma: 7}});
        expect(glossOf(reason, mutated)).toContain('one of its 3 equal slots; it sells on the first close above the 7-day average');
        const donchian = withParams('donchian-breakout', {params: {exitChannel: 30}});
        expect(glossOf('enter: close 105.50 broke the 55-day high 101.00 (+4.5%)', donchian)).toContain('under the 30-day low');
        const momentum = withParams('momentum-12-1', {params: {skip: 42}});
        expect(glossOf('monthly: ranked #1/40 by 12-1 return (+12.0%)', momentum)).toContain('252 sessions ago to 42 sessions ago');
        const sixty = withParams('sixty-forty', {params: {spyWeight: 0.7}});
        expect(glossOf('enter: SPY 0.0% → 69.3% target', sixty)).toContain('70% of the 99% the rule invests');
    });

    it('takes the drift band from the definition', () => {
        expect(glossOf('rebalance +3.8% drift toward 59.4% target')).toContain('more than 2% of the account');
        const wide = withParams('sixty-forty', {driftBand: 0.05});
        expect(glossOf('rebalance +3.8% drift toward 59.4% target', wide)).toContain('more than 5% of the account');
    });

    it('reads a reason by the rule that wrote it, whatever page it is shown on', () => {
        const reason = 'enter: RSI(2) 3.4 < 10 with close 123.45 above SMA200 110.00';
        expect(glossOf(reason, definition('golden-cross'))).toBe(glossOf(reason));
        expect(glossOf('signal, but no open slot', definition('donchian-breakout'))).toContain('all 8 slots');
        expect(glossOf('signal, but no open slot')).toContain('every slot');
    });

    it('never throws on a definition missing a parameter', () => {
        const broken = {...definition('rsi2-mean-reversion'), params: {}};
        const decoded = decodeReason('enter: RSI(2) 3.4 < 10 with close 123.45 above SMA200 110.00', {def: broken});
        expect(decoded.unknown).toEqual([]);
        expect(decoded.clauses[0].gloss).not.toMatch(/undefined|NaN|null/);
    });
});

describe('decodeReason on text it did not write', () => {
    const everything = [...ALL.flatMap(({emitted}) => emitted.map((e) => e.text)), ...PLANNER_SKIPS.map((e) => e.text)];

    it('turns a truncated reason into one unknown clause, never a throw', () => {
        const cut = 'enter: RSI(2) 3.4 < 10 with close 123.45 above SMA2';
        expect(decodeReason(cut)).toEqual({clauses: [], unknown: [cut]});
        for (const text of everything) {
            for (const length of [1, Math.floor(text.length / 2), text.length - 1]) {
                const decoded = decodeReason(text.slice(0, length));
                expect(decoded.unknown.length + (decoded.clauses.length > 0 ? 1 : 0)).toBe(1);
                if (decoded.unknown.length > 0) expect(decoded.clauses).toEqual([]);
            }
        }
    });

    it('never builds a pattern from its input', () => {
        for (const input of ['(a+)+$', '.*', '[', '\\', 'enter: (.*)', '$&$1', 'exit: close ) > SMA5 (']) {
            expect(decodeReason(input)).toEqual({clauses: [], unknown: [input]});
        }
    });

    it('refuses very long input without scanning it', () => {
        const long = `enter: ${'x'.repeat(MAX_REASON_CHARS * 20)}`;
        expect(decodeReason(long)).toEqual({clauses: [], unknown: [long]});
    });

    it('says nothing about nothing', () => {
        expect(decodeReason('')).toEqual({clauses: [], unknown: []});
        expect(decodeReason('   ')).toEqual({clauses: [], unknown: []});
    });
});

describe('gloss copy', () => {
    // The branches a round trip reaches only with unusual inputs, rendered on a grid.
    it('narrates without advising on every branch', () => {
        const texts = [
            REASON_GLOSS.spread('0.0%', true), REASON_GLOSS.spread('7.5%', false),
            REASON_GLOSS.legTarget('59.4%', null), REASON_GLOSS.legTarget('59.4%', {share: '60%', invested: '99%', floor: '1%'}),
            REASON_GLOSS.noOpenSlot(null), REASON_GLOSS.noOpenSlot(5),
            REASON_GLOSS.needsBars('200', false), REASON_GLOSS.needsBars('56', true),
            REASON_GLOSS.rsiEnter(5, null), REASON_GLOSS.breakoutEnter(8, null),
            REASON_GLOSS.gemCheck(null), REASON_GLOSS.momentumReturn('+3.0%', null),
            REASON_GLOSS.rebalanceDeferred(true), REASON_GLOSS.rebalanceDeferred(false),
        ];
        for (const text of texts) {
            expect(findBanned(text, 'advice'), text).toEqual([]);
            expect(text).not.toMatch(/undefined|NaN|null/);
            expect(text.endsWith('.'), text).toBe(true);
        }
    });
});
