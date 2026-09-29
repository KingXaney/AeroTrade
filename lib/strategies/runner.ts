// What one Inngest step does for one strategy: load the decision input, run the ONE
// shared decision path, persist the plan; or rebuild the simulated record. Server
// module; the job in lib/inngest/functions.ts sequences these into steps.

import {buildContext, runStrategyDay} from "@/lib/strategies/engine";
import {STRATEGY_RULES} from "@/lib/strategies/rules";
import {simulateStrategy} from "@/lib/strategies/simulate";
import {effectiveVersion} from "@/lib/strategies/catalog";
import {CASH_FLOOR, STRATEGY_STARTING_BALANCE} from "@/lib/strategies/config";
import {universeIsTooStale} from "@/lib/strategies/job-helpers";
import {loadDecisionInput, loadSimulationBars, saveBacktest, savePlannedRun, type StrategyStateView} from "@/lib/strategies/store";
import type {PlannedOrder, StrategyDefinition} from "@/lib/strategies/types";
import {BENCHMARK_SYMBOL, UNIVERSES} from "@/lib/strategies/universe";
import {getRatePoints, symbolsLackingDividendCoverage} from "@/lib/prices/store";
import {addCalendarDays} from "@/lib/prices/calendar-days";
import {RATE_MAX_STALENESS_DAYS} from "@/lib/trading/income";

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
export const backtestDataReady = async (def: StrategyDefinition, launchDate: string): Promise<{ready: boolean; reason?: string}> => {
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
    return {ready: true};
};

export const simulateForStrategy = async (def: StrategyDefinition, launchDate: string): Promise<{points: number; trades: number}> => {
    const [bars, rates] = await Promise.all([loadSimulationBars(def, BENCHMARK_SYMBOL), getRatePoints()]);
    // Income on, exactly as the live account earns it (lib/trading/income.ts).
    const result = simulateStrategy(def, bars, {startingBalance: STRATEGY_STARTING_BALANCE, launchDate, rates});
    await saveBacktest(def.id, effectiveVersion(def), result);
    return {points: result.points.length, trades: result.trades.length};
};
