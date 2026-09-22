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

export const simulateForStrategy = async (def: StrategyDefinition, launchDate: string): Promise<{points: number; trades: number}> => {
    const bars = await loadSimulationBars(def, BENCHMARK_SYMBOL);
    const result = simulateStrategy(def, bars, {startingBalance: STRATEGY_STARTING_BALANCE, launchDate});
    await saveBacktest(def.id, effectiveVersion(def), result);
    return {points: result.points.length, trades: result.trades.length};
};
