// The quant strategies' trading day, one step body at a time (NOT a 'use server' module).
// lib/jobs/functions/strategies.ts sequences these: accounts → bars → freshness → per-strategy
// decide/fill → backtests → what-if grids → stamp. The engine (lib/strategies/runner.ts and
// the rules) is the only place a decision is made; the pure helpers are job-helpers.ts.

import {addCalendarDays, getEasternDateString} from "@/lib/dates";
import {ensureBars, getLatestBarDates, symbolsLackingDividendCoverage} from "@/lib/prices/store";
import {BENCHMARK_SYMBOL, PRICE_CHUNK_SIZE, RATE_SYMBOL, STRATEGY_BACKFILL_CALENDAR_DAYS} from "@/lib/prices/config";
import {NYSE_HOLIDAYS, isTradingDay, marketStatus, previousTradingDay} from "@/lib/prices/market-hours";
import {getHeldSymbolsByUserId} from "@/lib/trading/accounts";
import {chunk} from "@/lib/jobs/steps";
import {STRATEGIES, effectiveVersion} from "@/lib/strategies/catalog";
import {STRATEGY_OWNER_ID} from "@/lib/strategies/config";
import {assessFreshness, variantsDue, type Freshness, type VariantStamp} from "@/lib/strategies/job-helpers";
import {SIM_INCOME_CALENDAR_DAYS, type StrategyDayPlan} from "@/lib/strategies/runner";
import {markStrategyError, releaseRun, type OrderOutcome, type StrategyStateView} from "@/lib/strategies/store";
import {ALL_STRATEGY_SYMBOLS, CORE_ETFS, LARGE_CAPS, SECTOR_ETFS} from "@/lib/strategies/universe";
import {gridFor} from "@/lib/strategies/whatif";
import type {StrategyDefinition} from "@/lib/strategies/types";

export type StrategiesEventData = {dryRun?: boolean; resimulate?: boolean; force?: boolean};

export type StrategiesDay = {
    today: string;
    // Why the whole day is skipped (a holiday's name, or 'weekend'); null on a session day or a forced run.
    closed: string | null;
    asOf: string;
    force: boolean;
    resimulate: boolean;
    dryRun: boolean;
    mode: 'live' | 'preview';
};

// The day the run decides for, anchored to the trigger instant `at`: Inngest re-runs the
// function body once per step, so a run that crosses 16:00 ET mid-way keeps its mode and date.
export const strategiesDay = (data: StrategiesEventData, at: Date): StrategiesDay => {
    const force = data.force === true;
    const resimulate = data.resimulate === true;
    const today = getEasternDateString(at);
    const closed = !force && !isTradingDay(today) ? (NYSE_HOLIDAYS[today] ?? 'weekend') : null;
    // Outside the session a run only previews: filling at an after-hours quote on
    // signals that are already a day old would not be the strategy's rule.
    const dryRun = data.dryRun === true || (!force && marketStatus(at).state !== 'open');
    return {today, closed, asOf: previousTradingDay(today), force, resimulate, dryRun, mode: dryRun ? 'preview' : 'live'};
};

// A holding that dropped out of the universe (a swapped ticker) still needs fresh bars,
// or the engine's left-universe exit could never price and never fill.
export const heldOutsideUniverse = async (): Promise<string[]> => {
    const universe = new Set(ALL_STRATEGY_SYMBOLS);
    return (await getHeldSymbolsByUserId(STRATEGY_OWNER_ID)).filter((s) => !universe.has(s));
};

// Whether any active rule's backtest is rebuilt this run (a version change or a resimulate).
// Known before the bars phase: a rebuild replays the whole stored history, so the
// total-return legs are re-fetched on one basis first.
export const rebuildPending = (states: readonly StrategyStateView[], versions: Record<string, string>, resimulate: boolean): boolean =>
    resimulate || STRATEGIES.some((def) =>
        states.some((s) => s.strategyId === def.id) && versions[def.id] !== effectiveVersion(def));

// The first chunk is the core ETFs: total-return legs whose adjusted closes are re-based
// on every distribution, so their top-up window is deep.
const TOTAL_RETURN_TOPUP_RANGE = '2y';

export type BarChunk = {symbols: string[]; topupRange: '2y' | '1mo'; forceBackfill: boolean};

export const strategyBarChunks = (heldOutside: readonly string[], {rebuildNeeded, resimulate}: {rebuildNeeded: boolean; resimulate: boolean}): BarChunk[] => [
    {symbols: [...CORE_ETFS], topupRange: TOTAL_RETURN_TOPUP_RANGE as '2y', forceBackfill: rebuildNeeded},
    ...chunk([...SECTOR_ETFS, ...LARGE_CAPS, ...heldOutside], PRICE_CHUNK_SIZE).map((symbols) => ({symbols, topupRange: '1mo' as const, forceBackfill: resimulate})),
];

// A rebuild pays dividends across the whole backtest window, so any symbol whose
// dividends are not yet covered that far back is refetched deep — only those, not all
// 51 every morning, and only while a rebuild is pending.
export const dividendCoverageWindow = (states: readonly StrategyStateView[], today: string): {from: string; through: string} => {
    const launches = states.map((s) => s.launchDate).sort();
    return {
        from: launches.length > 0 ? addCalendarDays(launches[0], -SIM_INCOME_CALENDAR_DAYS) : today,
        through: launches.length > 0 ? addCalendarDays(launches[launches.length - 1], -1) : today,
    };
};

export type BarsOutcome = {providers: {yahoo: number; stooq: number}; failed: string[]};

export const ensureStrategyBars = async (
    barChunk: BarChunk,
    {rebuildNeeded, coverage}: {rebuildNeeded: boolean; coverage: {from: string; through: string}},
): Promise<BarsOutcome> => {
    const deep = barChunk.forceBackfill
        ? barChunk.symbols
        : (rebuildNeeded ? await symbolsLackingDividendCoverage(barChunk.symbols, coverage.from, coverage.through) : []);
    const shallow = barChunk.symbols.filter((symbol) => !deep.includes(symbol));
    const options = {backfillCalendarDays: STRATEGY_BACKFILL_CALENDAR_DAYS, requireOhlc: true, topupRange: barChunk.topupRange};
    // One after the other, never in parallel: ensureBars spaces its Yahoo calls, and two
    // concurrent passes would double the request rate that the spacing exists to cap.
    const runs = [
        deep.length > 0 ? await ensureBars(deep, {...options, limit: deep.length, forceBackfill: true}) : null,
        shallow.length > 0 ? await ensureBars(shallow, {...options, limit: shallow.length, forceBackfill: false}) : null,
    ];
    return {
        providers: {
            yahoo: runs.reduce((n, r) => n + (r?.providers.yahoo ?? 0), 0),
            stooq: runs.reduce((n, r) => n + (r?.providers.stooq ?? 0), 0),
        },
        failed: runs.flatMap((r) => r?.failed ?? []),
    };
};

// The T-bill rate the backtests credit interest at (the income job keeps it fresh too).
export const ensureRateBars = async (): Promise<{updated: number; failed: string[]}> => {
    const r = await ensureBars([RATE_SYMBOL], {limit: 1, backfillCalendarDays: STRATEGY_BACKFILL_CALENDAR_DAYS});
    return {updated: r.updated, failed: r.failed};
};

export const checkFreshness = async (trackedSymbols: string[], asOf: string): Promise<Freshness> => {
    const latest = await getLatestBarDates(trackedSymbols);
    return assessFreshness(latest, trackedSymbols, BENCHMARK_SYMBOL, asOf);
};

export const staleBenchmarkDetail = (freshness: Freshness, asOf: string): string =>
    `benchmark stale (latest ${BENCHMARK_SYMBOL} bar ${freshness.benchmarkLatest ?? 'none'}, needed ${asOf})`;

// A strategy that decided nothing today: its error is recorded, and a live run gives the day
// back so the 10:30 rerun can decide once the bars arrive.
export const skipStrategyDay = async (strategyId: string, reason: string, {today, dryRun}: {today: string; dryRun: boolean}): Promise<void> => {
    await markStrategyError(strategyId, reason);
    if (!dryRun) await releaseRun(strategyId, today);
};

type DayOrder = StrategyDayPlan['orders'][number];

// The fill request for one of the day's orders, through the same path users trade on.
export const strategyOrderRequest = (def: StrategyDefinition, state: StrategyStateView, order: DayOrder, plan: StrategyDayPlan, today: string) => ({
    accountId: state.accountId,
    symbol: order.symbol,
    side: order.side,
    quantity: order.quantity,
    source: 'strategy' as const,
    reason: order.reason,
    // One fill per strategy, day, side and symbol: a replayed step finds it.
    idempotencyKey: `${def.id}:${today}:${order.side}:${order.symbol}`,
    ...(order.side === 'buy' ? {minCashAfter: plan.minCashAfter} : {}),
});

// A quote miss is usually the rate limit, worth one spaced retry.
export const quoteMissed = (result: {success: boolean; message?: string}): boolean =>
    !result.success && /live price/i.test(result.message ?? "");

export const orderOutcome = (order: DayOrder, result: {success: boolean; message?: string; price?: number}): OrderOutcome => ({
    symbol: order.symbol,
    side: order.side,
    executed: result.success,
    ...(typeof result.price === 'number' ? {price: result.price} : {}),
    ...(result.success ? {} : {message: result.message}),
});

// Simulated records rebuild only when the rule version changed, or on a resimulate.
export const backtestDue = (def: StrategyDefinition, versions: Record<string, string>, resimulate: boolean): boolean =>
    resimulate || versions[def.id] !== effectiveVersion(def);

// The what-if grid (lib/strategies/whatif.ts) is recomputed only beside a backtest rebuilt
// since the grid was computed, or when the grid itself changed: not every night.
export const whatIfDue = (def: StrategyDefinition, stamp: VariantStamp | undefined, resimulate: boolean): boolean =>
    variantsDue(stamp, effectiveVersion(def), gridFor(def).map((v) => v.id), resimulate);
