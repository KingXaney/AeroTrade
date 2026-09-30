import {describe, expect, it} from "vitest";
import {
    ORDER_BURST,
    assessFreshness,
    chunkUniverse,
    runSummary,
    stepId,
    throttleDue,
    universeIsTooStale,
    variantsDue,
} from "@/lib/strategies/job-helpers";
import {STRATEGIES} from "@/lib/strategies/catalog";

describe("chunkUniverse", () => {
    it("splits into bounded chunks and never drops a symbol", () => {
        const symbols = Array.from({length: 59}, (_, i) => `S${i}`);
        const chunks = chunkUniverse(symbols, 12);
        expect(chunks.map((c) => c.length)).toEqual([12, 12, 12, 12, 11]);
        expect(chunks.flat()).toEqual(symbols);
        expect(chunkUniverse([], 12)).toEqual([]);
        expect(chunkUniverse(['A'], 0)).toEqual([['A']]);
    });
});

describe("assessFreshness", () => {
    const latest = new Map([['SPY', '2026-09-18'], ['AAPL', '2026-09-17'], ['AGG', '2026-09-18']]);

    it("flags symbols without a bar for asOf and checks the benchmark", () => {
        const f = assessFreshness(latest, ['SPY', 'AAPL', 'AGG', 'MSFT'], 'SPY', '2026-09-18');
        expect(f.benchmarkFresh).toBe(true);
        expect(f.benchmarkLatest).toBe('2026-09-18');
        expect(f.staleSymbols).toEqual(['AAPL', 'MSFT']);
        expect(f.staleFraction).toBe(0.5);
    });

    it("reports a stale benchmark", () => {
        const f = assessFreshness(latest, ['SPY'], 'SPY', '2026-09-21');
        expect(f.benchmarkFresh).toBe(false);
        expect(f.staleSymbols).toEqual(['SPY']);
    });

    it("handles an empty universe", () => {
        expect(assessFreshness(new Map(), [], 'SPY', '2026-09-18').staleFraction).toBe(0);
    });
});

describe("universeIsTooStale", () => {
    it("is strict: one of four skips, four of forty does not", () => {
        expect(universeIsTooStale(1, 4)).toBe(true);
        expect(universeIsTooStale(4, 40)).toBe(false);
        expect(universeIsTooStale(5, 40)).toBe(true);
        expect(universeIsTooStale(0, 0)).toBe(false);
    });
});

describe("throttleDue", () => {
    it("pauses after every burst of fills", () => {
        expect(throttleDue(0)).toBe(false);
        expect(throttleDue(ORDER_BURST - 1)).toBe(false);
        expect(throttleDue(ORDER_BURST)).toBe(true);
        expect(throttleDue(ORDER_BURST * 2)).toBe(true);
    });
});

describe("runSummary", () => {
    it("reads as one line and only mentions failures when there are any", () => {
        const base = {ran: 8, total: 8, preview: false, filled: 12, planned: 13, staleSymbols: 1, backtestsRebuilt: 0,
            providers: {yahoo: 59, stooq: 0}, failedSymbols: [], asOf: '2026-09-18'};
        expect(runSummary(base)).toBe('8/8 strategies ran, 12/13 order(s) filled, bars as of 2026-09-18, 1 stale symbol(s), 0 backtest(s) rebuilt, yahoo 59 / stooq 0');
        expect(runSummary({...base, preview: true, failedSymbols: ['PFE']})).toContain('(preview — nothing filled)');
        expect(runSummary({...base, failedSymbols: ['PFE']})).toMatch(/failed: PFE$/);
    });

    it("names the what-if grids computed, and only when there were some", () => {
        const base = {ran: 8, total: 8, preview: false, filled: 0, planned: 0, staleSymbols: 0, backtestsRebuilt: 1,
            providers: {yahoo: 0, stooq: 0}, failedSymbols: [], asOf: '2026-09-18'};
        expect(runSummary({...base, whatIfGrids: 7})).toContain('1 backtest(s) rebuilt, 7 what-if grid(s) computed, yahoo');
        expect(runSummary({...base, whatIfGrids: 0})).not.toContain('what-if');
    });
});

describe("stepId", () => {
    it("sanitises the sentinel and is a no-op on every catalog id", () => {
        expect(stepId('system:strategies')).toBe('system_strategies');
        for (const def of STRATEGIES) expect(stepId(def.id)).toBe(def.id);
    });
});

// The nightly what-if grid is recomputed only when it would differ: the stored backtest was
// rebuilt under another version since the variants were computed, or the grid itself changed.
describe("variantsDue", () => {
    const grid = ['fast=20', 'fast=100', 'slow=100', 'slow=250'];
    const current = {version: '3.1', variantsVersion: '3.1', variantIds: [...grid]};

    it("is a no-op when the variants match the stored backtest and the grid", () => {
        expect(variantsDue(current, '3.1', grid)).toBe(false);
    });

    it("recomputes when the stored backtest's version changed since the variants were computed", () => {
        expect(variantsDue({...current, variantsVersion: '2.1'}, '3.1', grid)).toBe(true);
    });

    it("computes a backtest's first variants (none stored yet)", () => {
        expect(variantsDue({version: '3.1', variantsVersion: null, variantIds: null}, '3.1', grid)).toBe(true);
    });

    it("recomputes when the stored ids differ from the grid's — a changed value, a missing one, a new order", () => {
        expect(variantsDue({...current, variantIds: ['fast=20', 'fast=100', 'slow=100', 'slow=240']}, '3.1', grid)).toBe(true);
        expect(variantsDue({...current, variantIds: grid.slice(0, 3)}, '3.1', grid)).toBe(true);
        expect(variantsDue({...current, variantIds: [...grid].reverse()}, '3.1', grid)).toBe(true);
    });

    it("waits while the stored backtest is missing or not yet rebuilt for this version", () => {
        expect(variantsDue(undefined, '3.1', grid)).toBe(false);
        // A backtest waiting for its rebuild: the variants would run on another engine than it.
        expect(variantsDue({version: '2.1', variantsVersion: '2.1', variantIds: ['fast=30']}, '3.1', grid)).toBe(false);
    });

    it("recomputes a current grid on a resimulate, which rebuilt the backtest on the same version", () => {
        expect(variantsDue(current, '3.1', grid, true)).toBe(true);
        expect(variantsDue({version: '2.1', variantsVersion: '2.1', variantIds: grid}, '3.1', grid, true)).toBe(false);
        expect(variantsDue(current, '3.1', [], true)).toBe(false);
    });

    it("never computes for a strategy with no knobs", () => {
        expect(variantsDue({version: '3.1', variantsVersion: null, variantIds: null}, '3.1', [])).toBe(false);
    });
});
