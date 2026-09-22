import {describe, expect, it} from "vitest";
import {
    ORDER_BURST,
    assessFreshness,
    chunkUniverse,
    runSummary,
    stepId,
    throttleDue,
    universeIsTooStale,
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
});

describe("stepId", () => {
    it("sanitises the sentinel and is a no-op on every catalog id", () => {
        expect(stepId('system:strategies')).toBe('system_strategies');
        for (const def of STRATEGIES) expect(stepId(def.id)).toBe(def.id);
    });
});
