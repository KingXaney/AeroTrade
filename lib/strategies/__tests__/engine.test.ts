import {describe, expect, it, vi} from 'vitest';
import {addCalendarDays} from '@/lib/dates';
import type {Bar} from '@/lib/prices/signals';
import {LOOKBACK_BARS, STALE_SKIP_FRACTION} from '@/lib/strategies/config';
import {buildContext, runStrategyDay} from '@/lib/strategies/engine';
import type {Decide, Decision, StrategyContext, StrategyDefinition} from '@/lib/strategies/types';
import {UNIVERSES, type UniverseKey} from '@/lib/strategies/universe';

const AS_OF = '2026-09-21';
const TRADE_DATE = '2026-09-22';

// n ascending daily bars ending on endDate, closing at `close` (+1 per bar so a slice
// boundary is visible in the values).
const series = (n: number, endDate: string, close = 100): Bar[] =>
    Array.from({length: n}, (_, i) => ({date: addCalendarDays(endDate, i - (n - 1)), close: close + i}));

const defFor = (universe: UniverseKey, overrides: Partial<StrategyDefinition> = {}): StrategyDefinition => ({
    id: 'buy-and-hold-spy',
    name: 'Stub',
    family: 'Baseline',
    cadence: 'daily',
    universe,
    slots: 1,
    version: '1',
    params: {},
    driftBand: 0.02,
    explainer: {summary: '', how: [], why: [], fails: [], watching: '', beginnerLine: '', cashReason: '', caveats: []},
    signalColumns: [],
    ...overrides,
});

const freshFor = (symbols: readonly string[], n = 30, close = 100): Map<string, Bar[]> =>
    new Map(symbols.map((symbol) => [symbol, series(n, AS_OF, close)]));

const build = (def: StrategyDefinition, barsBySymbol: ReadonlyMap<string, readonly Bar[]>, overrides: Partial<{
    positions: {symbol: string; quantity: number; avgCost: number}[];
    cash: number;
    lastRebalanceDate: string | null;
    isFirstRun: boolean;
}> = {}): StrategyContext => buildContext(def, {
    barsBySymbol,
    asOf: AS_OF,
    tradeDate: TRADE_DATE,
    positions: [],
    cash: 100_000,
    lastRebalanceDate: null,
    isFirstRun: true,
    ...overrides,
});

const decisionOf = (targets: Decision['targets'], extra: Partial<Decision> = {}): Decision => ({
    rebalanceTriggered: true,
    targets,
    board: [],
    dataIssues: [],
    ...extra,
});

const stubDecide = (decision: Decision): Decide => vi.fn(() => decision);

describe('buildContext', () => {
    it('keeps only bars on or before asOf and at most LOOKBACK_BARS of them', () => {
        // 300 bars ending four days AFTER asOf: 296 are ≤ asOf, sliced to the last 260.
        const bars = new Map([['SPY', series(300, addCalendarDays(AS_OF, 4))]]);
        const ctx = build(defFor('spy'), bars);
        const spy = ctx.bars.get('SPY') ?? [];
        expect(LOOKBACK_BARS).toBe(260);
        expect(spy).toHaveLength(260);
        expect(spy[spy.length - 1].date).toBe(AS_OF);
        expect(spy[0].date).toBe(addCalendarDays(AS_OF, -259));
        expect(spy.every((bar) => bar.date <= AS_OF)).toBe(true);
        expect(ctx.asOf).toBe(AS_OF);
        expect(ctx.tradeDate).toBe(TRADE_DATE);
        expect(ctx.lastRebalanceDate).toBeNull();
        expect(ctx.isFirstRun).toBe(true);
    });

    it('classifies universe symbols as eligible or stale, counting a missing series as stale', () => {
        const bars = new Map<string, Bar[]>([
            ['SPY', series(30, AS_OF)],
            ['EFA', series(30, addCalendarDays(AS_OF, -1))], // latest bar a day old
            ['BIL', series(30, AS_OF)],
            // AGG has no bars at all
        ]);
        const ctx = build(defFor('gem'), bars);
        expect(Array.from(ctx.eligible).sort()).toEqual(['BIL', 'SPY']);
        expect(Array.from(ctx.stale).sort()).toEqual(['AGG', 'EFA']);
        expect(ctx.bars.get('AGG')).toEqual([]);
        expect(UNIVERSES.gem).toHaveLength(4);
    });

    it('includes held symbols outside the universe in bars but not in eligible or stale', () => {
        const bars = new Map<string, Bar[]>([['SPY', series(30, AS_OF)], ['GLD', series(30, AS_OF, 200)]]);
        const ctx = build(defFor('spy'), bars, {positions: [{symbol: 'GLD', quantity: 10, avgCost: 150}]});
        expect(ctx.bars.has('GLD')).toBe(true);
        expect(ctx.eligible.has('GLD')).toBe(false);
        expect(ctx.stale.has('GLD')).toBe(false);
    });

    it('prices a holding at its close on asOf, null when its bar is stale, and marks equity accordingly', () => {
        const bars = new Map<string, Bar[]>([
            ['SPY', series(30, AS_OF, 100)],                 // last close 129
            ['EFA', series(30, addCalendarDays(AS_OF, -1), 50)],   // stale → null
        ]);
        const ctx = build(defFor('gem'), bars, {
            cash: 1_000,
            positions: [
                {symbol: 'SPY', quantity: 10, avgCost: 80},
                {symbol: 'EFA', quantity: 4, avgCost: 60},
                {symbol: 'AGG', quantity: 0, avgCost: 1}, // empty rows are dropped
            ],
        });
        expect(ctx.holdings).toEqual([
            {symbol: 'SPY', quantity: 10, avgCost: 80, lastClose: 129},
            {symbol: 'EFA', quantity: 4, avgCost: 60, lastClose: null},
        ]);
        // 1 000 + 10 × 129 + 4 × 60 (cost basis for the unpriced leg).
        expect(ctx.equity).toBe(1_000 + 1_290 + 240);
        expect(ctx.cash).toBe(1_000);
    });
});

describe('runStrategyDay — stale-data skip', () => {
    it('skips a GEM-sized universe when one of four symbols is stale, without calling decide', () => {
        const bars = freshFor(UNIVERSES.gem);
        bars.set('EFA', series(30, addCalendarDays(AS_OF, -1)));
        const decide = stubDecide(decisionOf([{symbol: 'SPY', weight: 0.99, reason: 'x'}]));
        const result = runStrategyDay(defFor('gem'), build(defFor('gem'), bars), decide);
        expect(decide).not.toHaveBeenCalled();
        expect(result.skipped).toEqual({reason: 'stale-data', detail: '1/4 symbols stale: EFA'});
        expect(result.orders).toEqual([]);
        expect(result.skippedOrders).toEqual([]);
        expect(result.decision.rebalanceTriggered).toBe(false);
        expect(result.decision.targets).toEqual([]);
        expect(result.decision.board).toEqual([]);
        expect(result.decision.dataIssues).toHaveLength(1);
        expect(result.decision.dataIssues[0]).toContain('EFA');
    });

    it('is strict: 4 of 40 large caps is exactly the fraction and still runs, 5 skips', () => {
        expect(STALE_SKIP_FRACTION).toBe(0.10);
        expect(UNIVERSES.largecaps).toHaveLength(40);
        const staleFour = UNIVERSES.largecaps.slice(0, 4);
        const bars = freshFor(UNIVERSES.largecaps);
        for (const symbol of staleFour) bars.delete(symbol);
        const decide = stubDecide(decisionOf([]));
        const ran = runStrategyDay(defFor('largecaps'), build(defFor('largecaps'), bars), decide);
        expect(decide).toHaveBeenCalledTimes(1);
        expect(ran.skipped).toBeUndefined();

        bars.delete(UNIVERSES.largecaps[4]);
        const skipped = runStrategyDay(defFor('largecaps'), build(defFor('largecaps'), bars), decide);
        expect(decide).toHaveBeenCalledTimes(1);
        expect(skipped.skipped?.reason).toBe('stale-data');
        expect(skipped.skipped?.detail.startsWith('5/40 symbols stale: ')).toBe(true);
        expect(skipped.skipped?.detail).toContain([...staleFour, UNIVERSES.largecaps[4]].sort().join(', '));
    });
});

describe('runStrategyDay — deciding and planning', () => {
    it('passes the definition and context to decide and plans its targets at the asOf close', () => {
        const def = defFor('spy');
        const ctx = build(def, freshFor(['SPY'], 30, 100)); // SPY closes at 129
        const decision = decisionOf([{symbol: 'SPY', weight: 0.99, reason: 'first run'}], {
            board: [{symbol: 'SPY', state: 'enter', values: {close: 129}}],
        });
        const decide = stubDecide(decision);
        const result = runStrategyDay(def, ctx, decide);
        expect(decide).toHaveBeenCalledWith(def, ctx);
        // 0.99 × 100 000 / (129 × 1.01) = 759.9 → 759.
        expect(result.orders).toEqual([{symbol: 'SPY', side: 'buy', quantity: 759, kind: 'enter', reason: 'first run'}]);
        expect(result.skippedOrders).toEqual([]);
        expect(result.skipped).toBeUndefined();
        expect(result.decision.board).toEqual(decision.board);
        expect(result.decision.rebalanceTriggered).toBe(true);
    });

    it('appends a weight-0 exit for a holding that left the universe and sells it at its own close', () => {
        const def = defFor('spy');
        const bars = new Map<string, Bar[]>([['SPY', series(30, AS_OF)], ['GLD', series(30, AS_OF, 200)]]);
        const ctx = build(def, bars, {cash: 1_000, positions: [{symbol: 'GLD', quantity: 10, avgCost: 150}]});
        const result = runStrategyDay(def, ctx, stubDecide(decisionOf([])));
        expect(result.decision.targets).toEqual([{symbol: 'GLD', weight: 0, reason: 'left the strategy universe'}]);
        expect(result.orders).toEqual([{symbol: 'GLD', side: 'sell', quantity: 10, kind: 'exit', reason: 'left the strategy universe'}]);
    });

    it('does not append the exit when the rule already targeted the outsider', () => {
        const def = defFor('spy');
        const bars = new Map<string, Bar[]>([['SPY', series(30, AS_OF)], ['GLD', series(30, AS_OF, 200)]]);
        const ctx = build(def, bars, {cash: 1_000, positions: [{symbol: 'GLD', quantity: 10, avgCost: 150}]});
        const own = [{symbol: 'GLD', weight: 0, reason: 'exit: my own reason'}];
        const result = runStrategyDay(def, ctx, stubDecide(decisionOf(own)));
        expect(result.decision.targets).toEqual(own);
        expect(result.orders[0].reason).toBe('exit: my own reason');
    });

    it('never sells a left-universe holding whose own bar is stale', () => {
        const def = defFor('spy');
        const bars = new Map<string, Bar[]>([['SPY', series(30, AS_OF)], ['GLD', series(30, addCalendarDays(AS_OF, -1), 200)]]);
        const ctx = build(def, bars, {cash: 1_000, positions: [{symbol: 'GLD', quantity: 10, avgCost: 150}]});
        const result = runStrategyDay(def, ctx, stubDecide(decisionOf([])));
        expect(result.orders).toEqual([]);
        expect(result.skippedOrders).toEqual([{symbol: 'GLD', reason: 'unpriced'}]);
    });

    it('strips any order for a stale symbol even when the context is inconsistent', () => {
        // A hand-built context that lists AAPL as stale while still carrying a fresh bar
        // for it (1/40 is under the skip fraction): whichever line of defence catches
        // it, no AAPL order may come out.
        const def = defFor('largecaps');
        const fresh = build(def, freshFor(UNIVERSES.largecaps), {
            cash: 50_000, positions: [{symbol: 'AAPL', quantity: 100, avgCost: 100}],
        });
        const eligible = new Set(fresh.eligible);
        eligible.delete('AAPL');
        const ctx: StrategyContext = {...fresh, stale: new Set(['AAPL']), eligible};
        const result = runStrategyDay(def, ctx, stubDecide(decisionOf([
            {symbol: 'AAPL', weight: 0, reason: 'exit'},
            {symbol: 'MSFT', weight: 0.5, reason: 'enter'},
        ])));
        expect(result.orders.map((order) => order.symbol)).toEqual(['MSFT']);
        expect(result.skippedOrders.some((skip) => skip.symbol === 'AAPL' && skip.reason.includes('stale'))).toBe(true);
    });

    it('passes the definition drift band through to the planner', () => {
        const wide = defFor('spy', {driftBand: 0.5});
        const ctx = build(wide, freshFor(['SPY'], 30, 100), {cash: 50_000, positions: [{symbol: 'SPY', quantity: 100, avgCost: 100}]});
        // Equity 62 900; target 0.99 → drift 62 271 − 12 900 = 49 371 = 78 % > 50 % band → adds.
        const adds = runStrategyDay(wide, ctx, stubDecide(decisionOf([{symbol: 'SPY', weight: 0.99, reason: 'x'}])));
        expect(adds.orders[0]?.kind).toBe('add');
        // Target 0.3 → drift 18 870 − 12 900 = 5 970 = 9.5 % < 50 % → held still.
        const still = runStrategyDay(wide, ctx, stubDecide(decisionOf([{symbol: 'SPY', weight: 0.3, reason: 'x'}])));
        expect(still.orders).toEqual([]);
    });
});
