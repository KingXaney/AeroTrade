import {inngest} from "@/lib/jobs/client";
import {recordJobRun} from "@/lib/jobs/job-runs";
import {JOBS, triggersOf} from "@/lib/jobs/registry";
import {stepId} from "@/lib/jobs/steps";
import {executeOrder} from "@/lib/trading/orders";
import {STRATEGIES} from "@/lib/strategies/catalog";
import {STRATEGY_OWNER_ID} from "@/lib/strategies/config";
import {runSummary, throttleDue} from "@/lib/strategies/job-helpers";
import {backtestDataReady, decideForStrategy, isUniverseTooStale, simulateForStrategy, simulateVariantsForStrategy} from "@/lib/strategies/runner";
import {backtestVersions, claimRun, completeRun, ensureStrategyAccounts, markStrategyError, recordSkippedRuns, variantStamps, type OrderOutcome} from "@/lib/strategies/store";
import {ALL_STRATEGY_SYMBOLS} from "@/lib/strategies/universe";
import {
    FUNDING_SELL_FAILED,
    backtestDue,
    checkFreshness,
    dividendCoverageWindow,
    ensureRateBars,
    ensureStrategyBars,
    heldOutsideUniverse,
    orderOutcome,
    quoteMissed,
    rebuildPending,
    skipStrategyDay,
    staleBenchmarkDetail,
    strategiesDay,
    strategyBarChunks,
    strategyOrderRequest,
    whatIfDue,
    type StrategiesEventData,
} from "@/lib/strategies/job";

// Quant strategies: every trading morning, decide each catalog strategy's orders from
// the previous close and fill them through the same path users trade on. The engine
// (lib/strategies) is the only place a decision is made; this function sequences
// accounts → bars → freshness → per-strategy decide/fill → backtests → stamp, with the
// step bodies in lib/strategies/job.ts.
const ORDER_THROTTLE_DELAY = '60s';
const QUOTE_RETRY_DELAY = '15s';

export const runStrategiesDaily = inngest.createFunction(
    {
        id: JOBS.strategies.id,
        // Its 10:30 cron is the retry for provider lag (lib/jobs/registry.ts).
        triggers: triggersOf(JOBS.strategies),
        concurrency: [{limit: 1}],
    },
    async ({step, event}) => {
        const data = (event.data ?? {}) as StrategiesEventData;
        // Inngest re-runs this body once per step, so the session decision is anchored to
        // the trigger instant: a run that crosses 16:00 ET mid-way keeps its mode and date.
        const day = strategiesDay(data, new Date(typeof event.ts === 'number' ? event.ts : Date.now()));
        const {today, asOf, resimulate, dryRun, mode} = day;

        if (day.closed !== null) {
            const message = `Skipped — market closed (${day.closed})`;
            await step.run('record-job-run', async () => recordJobRun(JOBS.strategies.id, message));
            return {success: true, message};
        }

        const states = await step.run('ensure-accounts', async () => ensureStrategyAccounts(today));

        const heldOutside = await step.run('held-outside-universe', heldOutsideUniverse);
        const versions = await step.run('check-backtests', async () => backtestVersions());
        const rebuildNeeded = rebuildPending(states, versions, resimulate);

        const chunks = strategyBarChunks(heldOutside, {rebuildNeeded, resimulate});
        const coverage = dividendCoverageWindow(states, today);
        const providers = {yahoo: 0, stooq: 0};
        const failedSymbols: string[] = [];
        for (let i = 0; i < chunks.length; i += 1) {
            const barChunk = chunks[i];
            const result = await step.run(`ensure-bars-${i}`, async () => ensureStrategyBars(barChunk, {rebuildNeeded, coverage}));
            providers.yahoo += result.providers.yahoo;
            providers.stooq += result.providers.stooq;
            failedSymbols.push(...result.failed);
        }
        await step.run('ensure-rate', ensureRateBars);

        const trackedSymbols = [...ALL_STRATEGY_SYMBOLS, ...heldOutside];
        const freshness = await step.run('check-freshness', async () => checkFreshness(trackedSymbols, asOf));

        let ran = 0;
        let planned = 0;
        let filled = 0;
        let ordersSoFar = 0;

        if (!freshness.benchmarkFresh) {
            const detail = staleBenchmarkDetail(freshness, asOf);
            await step.run('record-skipped', async () => recordSkippedRuns(states, today, asOf, detail));
        } else {
            for (const def of STRATEGIES) {
                const state = states.find((s) => s.strategyId === def.id);
                if (!state || state.status !== 'active') continue;
                const sid = stepId(def.id);
                try {
                    if (!dryRun) {
                        const claimed = await step.run(`claim-${sid}`, async () => claimRun(def.id, today));
                        if (!claimed) continue;
                    }
                    const plan = await step.run(`decide-${sid}`, async () => decideForStrategy(def, state, {asOf, today, mode}));
                    if (plan.accountMissing) {
                        await step.run(`error-${sid}`, async () => markStrategyError(def.id, 'strategy account missing'));
                        continue;
                    }
                    if (plan.skipped || isUniverseTooStale(plan)) {
                        // Give the day back so the 10:30 rerun can decide once the bars arrive.
                        await step.run(`error-${sid}`, async () => skipStrategyDay(def.id, plan.skipped ?? 'too many stale symbols', {today, dryRun}));
                        continue;
                    }
                    ran += 1;
                    planned += plan.orders.length;
                    if (dryRun) continue;

                    const outcomes: OrderOutcome[] = [];
                    let sellFailed = false;
                    for (const order of plan.orders) {
                        if (sellFailed && order.side === 'buy') {
                            // Buys were funded by sells that did not happen.
                            outcomes.push({symbol: order.symbol, side: order.side, executed: false, message: FUNDING_SELL_FAILED});
                            continue;
                        }
                        if (throttleDue(ordersSoFar)) {
                            await step.sleep(`order-throttle-${ordersSoFar}`, ORDER_THROTTLE_DELAY);
                        }
                        const request = strategyOrderRequest(def, state, order, plan, today);
                        const orderStep = stepId(`execute-${sid}-${order.side}-${order.symbol}`);
                        let result = await step.run(orderStep, async () => executeOrder(STRATEGY_OWNER_ID, request));
                        if (quoteMissed(result)) {
                            // A quote miss is usually the rate limit; one spaced retry.
                            await step.sleep(`${orderStep}-wait`, QUOTE_RETRY_DELAY);
                            result = await step.run(`${orderStep}-retry`, async () => executeOrder(STRATEGY_OWNER_ID, request));
                        }
                        ordersSoFar += 1;
                        if (result.success) filled += 1;
                        if (order.side === 'sell' && !result.success) sellFailed = true;
                        outcomes.push(orderOutcome(order, result));
                    }
                    await step.run(`save-run-${sid}`, async () => completeRun({
                        strategyId: def.id,
                        date: today,
                        outcomes,
                        rebalanceTriggered: plan.rebalanceTriggered,
                    }));
                } catch (error) {
                    console.error('Strategy failed:', def.id, error);
                    await step.run(`error-${sid}-crash`, async () => markStrategyError(def.id, `run failed: ${(error as Error).message ?? 'unknown'}`));
                }
            }
        }

        // Simulated records come after the live phase so a simulation failure can never
        // block trading; they only rebuild when the rule version changed.
        let backtestsRebuilt = 0;
        let backtestsWaiting = 0;
        for (const def of STRATEGIES) {
            const state = states.find((s) => s.strategyId === def.id);
            if (!state) continue;
            if (!backtestDue(def, versions, resimulate)) continue;
            try {
                // Saving stamps the version and ends the rebuild for good, so a backtest built on
                // partial dividend or rate data would be frozen wrong. Wait for the data instead.
                const readiness = await step.run(`simulate-ready-${stepId(def.id)}`, async () => backtestDataReady(def, state.launchDate));
                if (!readiness.ready) {
                    console.warn(`Backtest for ${def.id} waiting: ${readiness.reason}`);
                    backtestsWaiting += 1;
                    continue;
                }
                await step.run(`simulate-${stepId(def.id)}`, async () => simulateForStrategy(def, state.launchDate));
                backtestsRebuilt += 1;
            } catch (error) {
                console.error('Backtest failed:', def.id, error);
                await step.run(`simulate-${stepId(def.id)}-error`, async () => markStrategyError(def.id, `backtest failed: ${(error as Error).message ?? 'unknown'}`));
            }
        }

        // The what-if grid, beside the backtest each strategy has NOW — so read after the
        // rebuilds above. One step per strategy, and only when whatIfDue. The step keeps the
        // backtest's readiness guard and writes StrategyBacktest.variants alone.
        let whatIfGrids = 0;
        const stamps = await step.run('check-variants', async () => variantStamps());
        for (const def of STRATEGIES) {
            const state = states.find((s) => s.strategyId === def.id);
            if (!state || !whatIfDue(def, stamps[def.id], resimulate)) continue;
            try {
                const grid = await step.run(`variants-${stepId(def.id)}`, async () => simulateVariantsForStrategy(def, state.launchDate, stamps[def.id]?.computedAt ?? null));
                if (grid.waiting) console.warn(`What-if grid for ${def.id} waiting: ${grid.waiting}`);
                if (grid.computed > 0) whatIfGrids += 1;
            } catch (error) {
                // A missing grid only leaves the lab's "computed overnight" state up; it never
                // marks the strategy, whose trading and backtest are untouched.
                console.error('What-if grid failed:', def.id, error);
            }
        }

        const summary = runSummary({
            ran,
            total: STRATEGIES.length,
            preview: dryRun,
            filled,
            planned,
            staleSymbols: freshness.staleSymbols.length,
            backtestsRebuilt,
            backtestsWaiting,
            whatIfGrids,
            providers,
            failedSymbols,
            asOf,
        });
        await step.run('record-job-run', async () => recordJobRun(JOBS.strategies.id, summary));
        return {success: true, message: summary};
    },
);
