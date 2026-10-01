// Shared test fixtures for the strategy rules: a context builder whose bars are dated on
// consecutive calendar days ending at asOf (the rules never look at the calendar, only
// the cadence helper does), the series shapes the rule tests force their branches with,
// the generic context every rule's property tests run against, and the per-rule contexts
// that drive each rule down every branch. Imported by rules.test.ts and by lib/learn's
// reason-decoder and board-narration round trips, so all three exercise what the rules
// really emit. Not a test file itself (vitest picks up *.test.ts).

import type {Bar} from '@/lib/prices/signals';
import {strategyBySlug} from '@/lib/strategies/catalog';
import {CASH_FLOOR, LOOKBACK_BARS} from '@/lib/strategies/config';
import {STRATEGY_RULES} from '@/lib/strategies/rules';
import type {Decision, Holding, StrategyContext, StrategyDefinition, StrategyId} from '@/lib/strategies/types';
import {LARGE_CAPS, SECTOR_ETFS, UNIVERSES} from '@/lib/strategies/universe';

export const ASOF = '2026-09-21';
export const TRADE = '2026-09-22';
const DAY_MS = 24 * 60 * 60 * 1000;
export const N = LOOKBACK_BARS;
export const FULL_WEIGHT = 1 - CASH_FLOOR;

export const definition = (id: StrategyId): StrategyDefinition => {
    const def = strategyBySlug(id);
    if (!def) throw new Error(`no definition for ${id}`);
    return def;
};

const dateAt = (asOf: string, offset: number): string =>
    new Date(Date.parse(`${asOf}T00:00:00Z`) + offset * DAY_MS).toISOString().slice(0, 10);

export type Series = number[] | {closes: number[]; highs?: number[]; lows?: number[]; adjCloses?: number[]};

const toBars = (series: Series, asOf: string): Bar[] => {
    const spec = Array.isArray(series) ? {closes: series} : series;
    const last = spec.closes.length - 1;
    return spec.closes.map((close, i) => ({
        date: dateAt(asOf, i - last),
        close,
        ...(spec.highs ? {high: spec.highs[i]} : {}),
        ...(spec.lows ? {low: spec.lows[i]} : {}),
        ...(spec.adjCloses ? {adjClose: spec.adjCloses[i]} : {}),
    }));
};

export type ContextOptions = {
    def: StrategyDefinition;
    series: Record<string, Series>;
    asOf?: string;
    tradeDate?: string;
    // Symbols whose history stops one bar short of asOf.
    stale?: readonly string[];
    holdings?: readonly {symbol: string; quantity: number; avgCost?: number}[];
    cash?: number;
    lastRebalanceDate?: string | null;
};

export const makeContext = (opts: ContextOptions): StrategyContext => {
    const asOf = opts.asOf ?? ASOF;
    const tradeDate = opts.tradeDate ?? TRADE;
    const staleInput = new Set(opts.stale ?? []);
    const bars = new Map<string, Bar[]>();
    for (const [symbol, series] of Object.entries(opts.series)) {
        const full = toBars(series, asOf);
        bars.set(symbol, staleInput.has(symbol) ? full.slice(0, -1) : full);
    }
    const universe = UNIVERSES[opts.def.universe];
    const fresh = (symbol: string): boolean => {
        const series = bars.get(symbol);
        return series?.[series.length - 1]?.date === asOf;
    };
    const eligible = new Set(universe.filter(fresh));
    const stale = new Set(universe.filter((symbol) => !eligible.has(symbol)));
    const holdings: Holding[] = (opts.holdings ?? []).map((holding) => {
        const series = bars.get(holding.symbol);
        const last = series?.[series.length - 1];
        return {
            symbol: holding.symbol,
            quantity: holding.quantity,
            avgCost: holding.avgCost ?? 100,
            lastClose: last && last.date === asOf ? last.close : null,
        };
    });
    const cash = opts.cash ?? 100_000;
    const equity = holdings.reduce((sum, holding) => sum + holding.quantity * (holding.lastClose ?? holding.avgCost), cash);
    return {
        asOf,
        tradeDate,
        bars,
        eligible,
        stale,
        holdings,
        cash,
        equity,
        lastRebalanceDate: opts.lastRebalanceDate ?? null,
        isFirstRun: holdings.length === 0,
    };
};

export const flat = (n: number, value: number): number[] => Array.from({length: n}, () => value);
export const ramp = (n: number, from: number, to: number): number[] =>
    Array.from({length: n}, (_, i) => from + ((to - from) * i) / (n - 1));
// Flat prefix, then a straight line over the last 253 bars: the 252-bar trailing
// return is exactly to / from - 1.
export const trend = (from: number, to: number, n = N): number[] => [...flat(n - 253, from), ...ramp(253, from, to)];

export const seriesFor = (symbols: readonly string[], make: (symbol: string, index: number) => Series): Record<string, Series> =>
    Object.fromEntries(symbols.map((symbol, index) => [symbol, make(symbol, index)]));

export const targetFor = (decision: Decision, symbol: string) => decision.targets.find((target) => target.symbol === symbol);
export const rowFor = (decision: Decision, symbol: string) => decision.board.find((row) => row.symbol === symbol);
export const symbolsInState = (decision: Decision, state: string): string[] =>
    decision.board.filter((row) => row.state === state).map((row) => row.symbol);

export const containsNaN = (value: unknown): boolean => {
    if (typeof value === 'number') return Number.isNaN(value);
    if (typeof value === 'string') return value.includes('NaN');
    if (Array.isArray(value)) return value.some(containsNaN);
    if (value && typeof value === 'object') return Object.values(value).some(containsNaN);
    return false;
};

// ---------------------------------------------------------------------------
// The series shapes that force each rule down its branches.

// 60/40: SPY 632 × 100 = 63,200 and AGG 700 × 50 = 35,000 on 100,000 of equity.
export const SIXTY_FORTY_DRIFTED = {
    series: {SPY: flat(N, 100), AGG: flat(N, 50)},
    holdings: [{symbol: 'SPY', quantity: 632}, {symbol: 'AGG', quantity: 700}],
    cash: 1_800,
};

// Golden cross: flat 100 → drift down to 85 → climb to 130 → slide to 70: the first
// evaluable day (bar 259) is still inside the decline, then one cross each way.
export const GOLDEN_CROSS_XLK = [...flat(200, 100), ...ramp(100, 100, 85), ...ramp(200, 85, 130), ...ramp(150, 130, 70)];

// Dual momentum: each leg's 252-bar price and total return, set independently.
export const dualLegs = (returns: Record<string, {price: number; total: number}>): Record<string, Series> =>
    Object.fromEntries(Object.entries(returns).map(([symbol, r]) => [symbol, {
        closes: trend(100, 100 * (1 + r.price)),
        adjCloses: trend(100, 100 * (1 + r.total)),
    }]));

// RSI-2: two consecutive drops of `depth` on top of the uptrend; RSI(2) falls with depth.
export const RSI_RISING = ramp(N, 100, 125.9);
export const rsiDipped = (depth: number): number[] => {
    const closes = [...RSI_RISING];
    closes[N - 2] = RSI_RISING[N - 3] - depth;
    closes[N - 1] = RSI_RISING[N - 3] - 2 * depth;
    return closes;
};

// Donchian: flat 100 with a 101 / 99 channel; only the last close varies.
export const donchianChannel = (lastClose: number): Series => {
    const closes = [...flat(N - 1, 100), lastClose];
    return {closes, highs: closes.map((c) => c + 1), lows: closes.map((c) => c - 1)};
};

// Low volatility: alternating ± amplitude around 100; volatility grows with the amplitude.
export const lowVolWobble = (amplitude: number): number[] => Array.from({length: N}, (_, i) => 100 + (i % 2 === 0 ? amplitude : -amplitude));

// ---------------------------------------------------------------------------
// The context every rule's property tests share: rising OHLC series for the whole
// universe, the first symbol stale, the last one held, and a held stray outside it.

export const genericContext = (def: StrategyDefinition): StrategyContext => {
    const universe = UNIVERSES[def.universe];
    const withOhlc = (index: number): Series => {
        const closes = trend(100, 100 + 5 * (index + 1));
        return {closes, highs: closes.map((c) => c * 1.01), lows: closes.map((c) => c * 0.99), adjCloses: closes};
    };
    return makeContext({
        def,
        series: {...seriesFor(universe, (_, index) => withOhlc(index)), ZZZ: withOhlc(3)},
        stale: [universe[0]],
        holdings: [{symbol: universe[universe.length - 1], quantity: 10}, {symbol: 'ZZZ', quantity: 5}],
    });
};

// ---------------------------------------------------------------------------
// The contexts that force each rule down its branches.

export const branchContexts = (def: StrategyDefinition): StrategyContext[] => {
    const id = def.id;
    const make = (opts: Omit<Parameters<typeof makeContext>[0], 'def'>) => makeContext({def, ...opts});
    switch (id) {
        case 'buy-and-hold-spy':
            return [
                make({series: {SPY: trend(100, 110)}}),
                make({series: {SPY: trend(100, 110)}, stale: ['SPY']}),
            ];
        case 'sixty-forty':
            return [
                make({...SIXTY_FORTY_DRIFTED, asOf: '2026-09-30', tradeDate: '2026-10-01', lastRebalanceDate: '2026-07-01'}),
                make({series: SIXTY_FORTY_DRIFTED.series}),
                make({...SIXTY_FORTY_DRIFTED, stale: ['AGG']}),
                make({...SIXTY_FORTY_DRIFTED, stale: ['SPY', 'AGG']}),
                // Equity below zero leaves a held leg's weight unmeasurable: the "unpriced" wording.
                make({...SIXTY_FORTY_DRIFTED, cash: -1_000_000}),
            ];
        case 'golden-cross': {
            const rest = SECTOR_ETFS.filter((symbol) => symbol !== 'XLK');
            const days: StrategyContext[] = [];
            let held = false;
            for (let day = N - 1; day < GOLDEN_CROSS_XLK.length; day += 10) {
                const ctx = make({
                    series: {XLK: GOLDEN_CROSS_XLK.slice(day - N + 1, day + 1), ...seriesFor(rest, () => flat(N, 100))},
                    holdings: held ? [{symbol: 'XLK', quantity: 10}] : [],
                });
                days.push(ctx);
                const row = STRATEGY_RULES[id](def, ctx).board.find((r) => r.symbol === 'XLK');
                if (row?.state === 'enter') held = true;
                if (row?.state === 'exit') held = false;
            }
            days.push(make({
                series: {XLK: flat(150, 100), ...seriesFor(rest, () => flat(N, 100))},
                holdings: [{symbol: 'XLK', quantity: 10}, {symbol: 'XLE', quantity: 10}],
            }));
            return days;
        }
        case 'dual-momentum':
            return [
                make({series: dualLegs({SPY: {price: 0.05, total: 0.01}, EFA: {price: 0, total: 0}, AGG: {price: 0, total: 0.02}, BIL: {price: 0, total: 0.04}})}),
                make({
                    series: dualLegs({SPY: {price: 0.15, total: 0.182}, EFA: {price: 0.1, total: 0.121}, AGG: {price: 0, total: 0.02}, BIL: {price: 0, total: 0.049}}),
                    holdings: [{symbol: 'AGG', quantity: 900}],
                }),
                make({
                    series: dualLegs({SPY: {price: 0.1, total: 0.1}, EFA: {price: 0.2, total: 0.2}, AGG: {price: 0, total: 0}, BIL: {price: 0, total: 0.03}}),
                    holdings: [{symbol: 'SPY', quantity: 900}],
                }),
                make({
                    series: dualLegs({SPY: {price: 0.05, total: 0.01}, EFA: {price: 0, total: 0}, AGG: {price: 0, total: 0.02}, BIL: {price: 0, total: 0.04}}),
                    stale: ['AGG'],
                    holdings: [{symbol: 'SPY', quantity: 900}],
                }),
                make({series: dualLegs({SPY: {price: 0.05, total: 0.03}, EFA: {price: 0, total: 0}, AGG: {price: 0, total: 0}})}),
                make({series: {...dualLegs({EFA: {price: 0, total: 0}, AGG: {price: 0, total: 0}, BIL: {price: 0, total: 0.01}}), SPY: flat(100, 100)}}),
            ];
        case 'momentum-12-1': {
            const series = seriesFor(LARGE_CAPS, (_, index) => trend(100, 100 + Math.min(index, 38)));
            return [
                make({series}),
                make({series, holdings: [{symbol: LARGE_CAPS[37], quantity: 10}, {symbol: LARGE_CAPS[0], quantity: 10}]}),
                make({series: {...series, [LARGE_CAPS[5]]: flat(100, 100)}, holdings: [{symbol: LARGE_CAPS[5], quantity: 10}]}),
            ];
        }
        case 'rsi2-mean-reversion': {
            const series = seriesFor(LARGE_CAPS, (_, index) => (index < 7 ? rsiDipped(0.5 + 0.25 * index) : RSI_RISING));
            return [
                make({series}),
                make({
                    series: {...series, [LARGE_CAPS[20]]: rsiDipped(1)},
                    stale: [LARGE_CAPS[30]],
                    holdings: [10, 11, 20, 30].map((index) => ({symbol: LARGE_CAPS[index], quantity: 10})),
                }),
                make({series: {...series, [LARGE_CAPS[8]]: flat(150, 100)}, stale: [LARGE_CAPS[6]], holdings: [{symbol: LARGE_CAPS[8], quantity: 10}]}),
            ];
        }
        case 'donchian-breakout': {
            const series = seriesFor(LARGE_CAPS, (_, index) => donchianChannel(index < 10 ? 101 + 0.5 * index : 100));
            return [
                make({
                    series: {...series, [LARGE_CAPS[20]]: donchianChannel(98.5), [LARGE_CAPS[21]]: donchianChannel(99)},
                    holdings: [{symbol: LARGE_CAPS[20], quantity: 10}, {symbol: LARGE_CAPS[21], quantity: 10}],
                }),
                make({series: {...series, [LARGE_CAPS[5]]: flat(N, 100)}, holdings: [{symbol: LARGE_CAPS[5], quantity: 10}]}),
            ];
        }
        case 'low-volatility': {
            const series = seriesFor(LARGE_CAPS, (_, index) => lowVolWobble(0.5 * Math.max(index, 1)));
            return [
                make({series}),
                make({series, holdings: [{symbol: LARGE_CAPS[39], quantity: 10}, {symbol: LARGE_CAPS[5], quantity: 10}]}),
                make({series: {...series, [LARGE_CAPS[3]]: flat(50, 100)}, holdings: [{symbol: LARGE_CAPS[3], quantity: 10}]}),
            ];
        }
    }
};
