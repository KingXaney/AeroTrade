// Shared test fixtures for the strategy rules: a context builder whose bars are dated on
// consecutive calendar days ending at asOf (the rules never look at the calendar, only
// the cadence helper does), the series shapes the rule tests force their branches with,
// and the generic context every rule's property tests run against. Imported by
// rules.test.ts and by lib/learn's reason-decoder round trip, so both exercise the
// strings the rules really emit. Not a test file itself (vitest picks up *.test.ts).

import type {Bar} from '@/lib/prices/signals';
import {strategyBySlug} from '@/lib/strategies/catalog';
import {CASH_FLOOR, LOOKBACK_BARS} from '@/lib/strategies/config';
import type {Decision, Holding, StrategyContext, StrategyDefinition, StrategyId} from '@/lib/strategies/types';
import {UNIVERSES} from '@/lib/strategies/universe';

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
