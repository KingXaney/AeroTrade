// Pure helpers the daily strategies job is built from, kept out of the Inngest function
// body so vitest can pin them. Its chunking and step-id sanitising are lib/jobs/steps.

import {STALE_SKIP_FRACTION} from "@/lib/strategies/config";

export type Freshness = {
    // The benchmark's latest bar equals asOf — without it there is no calendar to trust.
    benchmarkFresh: boolean;
    benchmarkLatest: string | null;
    staleSymbols: string[];
    staleFraction: number;
};

// Which symbols have no bar for asOf. The job only refuses to run at all when the
// benchmark itself is stale; each strategy applies STALE_SKIP_FRACTION to its own universe.
export const assessFreshness = (
    latestBySymbol: ReadonlyMap<string, string>,
    symbols: readonly string[],
    benchmark: string,
    asOf: string,
): Freshness => {
    const staleSymbols = symbols.filter((symbol) => {
        const latest = latestBySymbol.get(symbol);
        return latest === undefined || latest < asOf;
    });
    const benchmarkLatest = latestBySymbol.get(benchmark) ?? null;
    return {
        benchmarkFresh: benchmarkLatest === asOf,
        benchmarkLatest,
        staleSymbols,
        staleFraction: symbols.length === 0 ? 0 : staleSymbols.length / symbols.length,
    };
};

export const universeIsTooStale = (staleCount: number, universeSize: number): boolean =>
    universeSize > 0 && staleCount / universeSize > STALE_SKIP_FRACTION;

// Finnhub's free tier is ~60 calls/min and every fill is a quote plus a profile, so
// the job pauses after each burst of fills.
export const ORDER_BURST = 25;
export const throttleDue = (ordersSoFar: number): boolean => ordersSoFar > 0 && ordersSoFar % ORDER_BURST === 0;

type RunSummaryInput = {
    ran: number;
    total: number;
    preview: boolean;
    filled: number;
    planned: number;
    staleSymbols: number;
    backtestsRebuilt: number;
    // Rebuilds held back until dividends and the T-bill rate cover the window.
    backtestsWaiting?: number;
    // Strategies whose what-if grid was computed this run (lib/strategies/whatif.ts).
    whatIfGrids?: number;
    providers: {yahoo: number; stooq: number};
    failedSymbols: readonly string[];
    asOf: string;
};

export const runSummary = (s: RunSummaryInput): string => {
    const parts = [
        `${s.ran}/${s.total} strategies ran${s.preview ? ' (preview — nothing filled)' : ''}`,
        `${s.filled}/${s.planned} order(s) filled`,
        `bars as of ${s.asOf}`,
        `${s.staleSymbols} stale symbol(s)`,
        `${s.backtestsRebuilt} backtest(s) rebuilt`,
        ...(s.backtestsWaiting ? [`${s.backtestsWaiting} backtest(s) waiting for data`] : []),
        ...(s.whatIfGrids ? [`${s.whatIfGrids} what-if grid(s) computed`] : []),
        `yahoo ${s.providers.yahoo} / stooq ${s.providers.stooq}`,
    ];
    if (s.failedSymbols.length > 0) parts.push(`failed: ${s.failedSymbols.join(', ')}`);
    return parts.join(', ');
};

// What the nightly job knows about a strategy's stored what-if variants: the stored backtest's
// version and build (its computedAt, in ms), the version and build its variants were computed
// beside (null: none yet, or stored before builds were stamped) and their ids in order.
export type VariantStamp = {
    version: string;
    variantsVersion: string | null;
    variantIds: readonly string[] | null;
    computedAt: number | null;
    variantsFor: number | null;
};

// Whether tonight's run (re)computes a strategy's what-if grid. Only against a backtest already
// built for this version (the variants run on the same engine as the line they are drawn
// beside), and then only when that backtest was rebuilt since the variants were computed — by a
// version bump or by a resimulate on the same version, which is why the build and not only the
// version is compared — or the grid's ids moved; never every night. `force` is the job's
// resimulate, which rebuilds every backtest on the same version and so must redo the grids.
export const variantsDue = (stamp: VariantStamp | undefined, expectedVersion: string, gridIds: readonly string[], force = false): boolean => {
    if (gridIds.length === 0 || stamp === undefined || stamp.version !== expectedVersion) return false;
    if (force || stamp.variantsVersion !== stamp.version) return true;
    if (stamp.variantsFor === null || stamp.variantsFor !== stamp.computedAt) return true;
    const stored = stamp.variantIds ?? [];
    return stored.length !== gridIds.length || stored.some((id, i) => id !== gridIds[i]);
};
