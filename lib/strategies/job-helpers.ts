// Pure helpers the daily strategies job is built from, kept out of the Inngest function
// body so vitest can pin them.

import {STALE_SKIP_FRACTION} from "@/lib/strategies/config";

export const chunkUniverse = (symbols: readonly string[], size: number): string[][] => {
    const chunks: string[][] = [];
    for (let i = 0; i < symbols.length; i += Math.max(1, size)) {
        chunks.push(symbols.slice(i, i + Math.max(1, size)));
    }
    return chunks;
};

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

export type RunSummaryInput = {
    ran: number;
    total: number;
    preview: boolean;
    filled: number;
    planned: number;
    staleSymbols: number;
    backtestsRebuilt: number;
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
        `yahoo ${s.providers.yahoo} / stooq ${s.providers.stooq}`,
    ];
    if (s.failedSymbols.length > 0) parts.push(`failed: ${s.failedSymbols.join(', ')}`);
    return parts.join(', ');
};

// Inngest step ids must be [a-zA-Z0-9_-]; the sentinel owner and slugs carry ':' and '-'.
export const stepId = (raw: string): string => raw.replace(/[^a-zA-Z0-9_-]/g, '_');
