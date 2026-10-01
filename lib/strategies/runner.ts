// What one Inngest step does for one strategy: load the decision input, run the ONE
// shared decision path, persist the plan; or rebuild the simulated record, or its what-if
// grid. Server module; the job in lib/jobs/functions.ts sequences these into steps.

import {buildContext, runStrategyDay} from "@/lib/strategies/engine";
import {STRATEGY_RULES} from "@/lib/strategies/rules";
import {simulateStrategy} from "@/lib/strategies/simulate";
import {effectiveVersion} from "@/lib/strategies/catalog";
import {CASH_FLOOR, STRATEGY_STARTING_BALANCE} from "@/lib/strategies/config";
import {universeIsTooStale} from "@/lib/strategies/job-helpers";
import {loadDecisionInput, loadSimulationBars, saveBacktest, savePlannedRun, saveVariants, type StrategyStateView} from "@/lib/strategies/store";
import type {PlannedOrder, StrategyDefinition} from "@/lib/strategies/types";
import {BENCHMARK_SYMBOL, UNIVERSES} from "@/lib/strategies/universe";
import {applyOverrides, gridFor, toWhatIfView, type StoredWhatIfVariant} from "@/lib/strategies/whatif";
import {getRatePoints, symbolsLackingDividendCoverage} from "@/lib/prices/store";
import {addCalendarDays} from "@/lib/prices/calendar-days";
import {RATE_MAX_STALENESS_DAYS, type RatePoint} from "@/lib/income/accrual";

// Small enough to cross an Inngest step boundary: never the bars.
export type StrategyDayPlan = {
    accountMissing: boolean;
    skipped: string | null;
    orders: PlannedOrder[];
    minCashAfter: number;
    equity: number;
    rebalanceTriggered: boolean;
    staleCount: number;
    universeSize: number;
};

export const decideForStrategy = async (
    def: StrategyDefinition,
    state: StrategyStateView,
    {asOf, today, mode}: {asOf: string; today: string; mode: 'live' | 'preview'},
): Promise<StrategyDayPlan> => {
    const input = await loadDecisionInput(def, state, asOf, today);
    const universeSize = UNIVERSES[def.universe].length;
    if (!input) {
        return {accountMissing: true, skipped: 'account missing', orders: [], minCashAfter: 0, equity: 0, rebalanceTriggered: false, staleCount: 0, universeSize};
    }
    const ctx = buildContext(def, {
        barsBySymbol: input.barsBySymbol,
        asOf,
        tradeDate: today,
        positions: input.positions,
        cash: input.cash,
        lastRebalanceDate: state.lastRebalanceDate,
        isFirstRun: input.isFirstRun,
    });
    const day = runStrategyDay(def, ctx, STRATEGY_RULES[def.id]);
    await savePlannedRun({
        strategyId: def.id,
        date: today,
        asOf,
        mode,
        universeSize,
        staleCount: ctx.stale.size,
        equity: ctx.equity,
        day,
    });
    return {
        accountMissing: false,
        skipped: day.skipped ? day.skipped.detail : null,
        orders: [...day.orders],
        minCashAfter: CASH_FLOOR * ctx.equity,
        equity: ctx.equity,
        rebalanceTriggered: day.decision.rebalanceTriggered,
        staleCount: ctx.stale.size,
        universeSize,
    };
};

export const isUniverseTooStale = (plan: StrategyDayPlan): boolean => universeIsTooStale(plan.staleCount, plan.universeSize);

// How far before launch the backtest's income window reaches: its 756 result sessions are
// about three calendar years, with room to spare.
export const SIM_INCOME_CALENDAR_DAYS = 1_120;

// A rebuilt backtest is stamped with the engine version and never rebuilt again, so it must
// not be saved on partial data: every universe symbol's dividends covered across the result
// window, and a T-bill rate for every day of it. Otherwise wait — the job retries next run.
// The T-bill points it read come back with a ready answer, so the what-if step simulates on
// the very points it checked instead of reading the series twice more.
type Readiness = {ready: true; rates: RatePoint[]} | {ready: false; reason: string};

const readBacktestReadiness = async (def: StrategyDefinition, launchDate: string): Promise<Readiness> => {
    const from = addCalendarDays(launchDate, -SIM_INCOME_CALENDAR_DAYS);
    const through = addCalendarDays(launchDate, -1);
    const lacking = await symbolsLackingDividendCoverage([...UNIVERSES[def.universe], BENCHMARK_SYMBOL], from, through);
    if (lacking.length > 0) return {ready: false, reason: `dividends not yet covered for ${lacking.slice(0, 4).join(', ')}${lacking.length > 4 ? ` +${lacking.length - 4}` : ''}`};
    const rates = await getRatePoints();
    const first = rates[0]?.date;
    const last = rates[rates.length - 1]?.date;
    if (first === undefined || last === undefined || first > from || last < addCalendarDays(through, -RATE_MAX_STALENESS_DAYS)) {
        return {ready: false, reason: 'T-bill rate history does not span the backtest window'};
    }
    return {ready: true, rates};
};

// The job's own step: the answer alone, small enough to cross a step boundary (never the rates).
export const backtestDataReady = async (def: StrategyDefinition, launchDate: string): Promise<{ready: boolean; reason?: string}> => {
    const readiness = await readBacktestReadiness(def, launchDate);
    return readiness.ready ? {ready: true} : {ready: false, reason: readiness.reason};
};

export const simulateForStrategy = async (def: StrategyDefinition, launchDate: string): Promise<{points: number; trades: number}> => {
    const [bars, rates] = await Promise.all([loadSimulationBars(def, BENCHMARK_SYMBOL), getRatePoints()]);
    // Income on, exactly as the live account earns it (lib/income/accrual.ts).
    const result = simulateStrategy(def, bars, {startingBalance: STRATEGY_STARTING_BALANCE, launchDate, rates});
    await saveBacktest(def.id, effectiveVersion(def), result);
    return {points: result.points.length, trades: result.trades.length};
};

// The what-if grid for one strategy, in one step: the same readiness guard as the backtest
// (never on partial dividend or rate data), the bars loaded once and the guard's own T-bill
// points reused, then each variant of gridFor(def) through the unchanged engine with the stored
// backtest's own inputs — same bars, launch date, starting balance and rates — so a variant
// differs by its setting alone. `computedAt` is the build of the backtest they are drawn beside
// (variantStamps); saveVariants attaches them to that build only. Writes only
// StrategyBacktest.variants, never saveBacktest, never an account.
export const simulateVariantsForStrategy = async (
    def: StrategyDefinition,
    launchDate: string,
    computedAt: number | null,
): Promise<{computed: number; waiting?: string}> => {
    const grid = gridFor(def);
    if (grid.length === 0 || computedAt === null) return {computed: 0};
    const readiness = await readBacktestReadiness(def, launchDate);
    if (!readiness.ready) return {computed: 0, waiting: readiness.reason};
    const {rates} = readiness;
    const bars = await loadSimulationBars(def, BENCHMARK_SYMBOL);
    const variants: StoredWhatIfVariant[] = grid.map((variant) => ({
        id: variant.id,
        knob: variant.knob,
        value: variant.value,
        ...toWhatIfView(simulateStrategy(applyOverrides(def, variant.overrides), bars, {startingBalance: STRATEGY_STARTING_BALANCE, launchDate, rates})),
    }));
    const saved = await saveVariants(def.id, effectiveVersion(def), computedAt, variants);
    return {computed: saved ? variants.length : 0};
};
