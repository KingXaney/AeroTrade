import {inngest} from "@/lib/jobs/client";
import {recordJobRun} from "@/lib/jobs/job-runs";
import {JOBS, triggersOf} from "@/lib/jobs/registry";
import {addCalendarDays, getEasternDateString} from "@/lib/dates";
import {ensureBars, symbolsLackingDividendCoverage} from "@/lib/prices/store";
import {executeOrder} from "@/lib/trading/orders";
import {getHeldSymbolsByUserId} from "@/lib/trading/accounts";
import {STRATEGIES, effectiveVersion} from "@/lib/strategies/catalog";
import {STRATEGY_OWNER_ID} from "@/lib/strategies/config";
import {previousTradingDay} from "@/lib/strategies/calendar";
import {assessFreshness, runSummary, throttleDue, variantsDue} from "@/lib/strategies/job-helpers";
import {chunk, stepId} from "@/lib/jobs/steps";
import {SIM_INCOME_CALENDAR_DAYS, backtestDataReady, decideForStrategy, isUniverseTooStale, simulateForStrategy, simulateVariantsForStrategy} from "@/lib/strategies/runner";
import {gridFor} from "@/lib/strategies/whatif";
import {backtestVersions, claimRun, completeRun, ensureStrategyAccounts, getLatestBarDates, markStrategyError, recordSkippedRuns, releaseRun, variantStamps, type OrderOutcome} from "@/lib/strategies/store";
import {ALL_STRATEGY_SYMBOLS, CORE_ETFS, LARGE_CAPS, SECTOR_ETFS} from "@/lib/strategies/universe";
import {PRICE_CHUNK_SIZE, RATE_SYMBOL, STRATEGY_BACKFILL_CALENDAR_DAYS, BENCHMARK_SYMBOL} from "@/lib/prices/config";
import {NYSE_HOLIDAYS, isTradingDay, marketStatus} from "@/lib/prices/market-hours";

// Quant strategies: every trading morning, decide each catalog strategy's orders from
// the previous close and fill them through the same path users trade on. The engine
// (lib/strategies) is the only place a decision is made; this function sequences
// accounts → bars → freshness → per-strategy decide/fill → backtests → stamp.
const ORDER_THROTTLE_DELAY = '60s';
const QUOTE_RETRY_DELAY = '15s';
// The first chunk is the core ETFs: total-return legs whose adjusted closes are re-based
// on every distribution, so their top-up window is deep.
const TOTAL_RETURN_TOPUP_RANGE = '2y';

type StrategiesEventData = {dryRun?: boolean; resimulate?: boolean; force?: boolean};

export const runStrategiesDaily = inngest.createFunction(
    {
        id: JOBS.strategies.id,
        // Its 10:30 cron is the retry for provider lag (lib/jobs/registry.ts).
        triggers: triggersOf(JOBS.strategies),
        concurrency: [{limit: 1}],
    },
    async ({step, event}) => {
        const data = (event.data ?? {}) as StrategiesEventData;
        const force = data.force === true;
        const resimulate = data.resimulate === true;
        // Inngest re-runs this body once per step, so the session decision is anchored to
        // the trigger instant: a run that crosses 16:00 ET mid-way keeps its mode and date.
        const at = new Date(typeof event.ts === 'number' ? event.ts : Date.now());
        const today = getEasternDateString(at);

        if (!force && !isTradingDay(today)) {
            const why = NYSE_HOLIDAYS[today] ?? 'weekend';
            const message = `Skipped — market closed (${why})`;
            await step.run('record-job-run', async () => recordJobRun(JOBS.strategies.id, message));
            return {success: true, message};
        }
        const asOf = previousTradingDay(today);
        // Outside the session a run only previews: filling at an after-hours quote on
        // signals that are already a day old would not be the strategy's rule.
        const dryRun = data.dryRun === true || (!force && marketStatus(at).state !== 'open');
        const mode: 'live' | 'preview' = dryRun ? 'preview' : 'live';

        const states = await step.run('ensure-accounts', async () => ensureStrategyAccounts(today));

        // A holding that dropped out of the universe (a swapped ticker) still needs fresh bars,
        // or the engine's left-universe exit could never price and never fill.
        const heldOutside = await step.run('held-outside-universe', async () => {
            const universe = new Set(ALL_STRATEGY_SYMBOLS);
            return (await getHeldSymbolsByUserId(STRATEGY_OWNER_ID)).filter((s) => !universe.has(s));
        });
        // Known before the bars phase: a rule whose version changed rebuilds its backtest from
        // the whole stored history, so the total-return legs are re-fetched on one basis first.
        const versions = await step.run('check-backtests', async () => backtestVersions());
        const rebuildNeeded = resimulate || STRATEGIES.some((def) =>
            states.some((s) => s.strategyId === def.id) && versions[def.id] !== effectiveVersion(def));

        const chunks = [
            {symbols: [...CORE_ETFS], topupRange: TOTAL_RETURN_TOPUP_RANGE as '2y', forceBackfill: rebuildNeeded},
            ...chunk([...SECTOR_ETFS, ...LARGE_CAPS, ...heldOutside], PRICE_CHUNK_SIZE).map((symbols) => ({symbols, topupRange: '1mo' as const, forceBackfill: resimulate})),
        ];
        // A rebuild pays dividends across the whole backtest window, so any symbol whose
        // dividends are not yet covered that far back is refetched deep — only those, not all
        // 51 every morning, and only while a rebuild is pending.
        const launches = states.map((s) => s.launchDate).sort();
        const coverageFrom = launches.length > 0 ? addCalendarDays(launches[0], -SIM_INCOME_CALENDAR_DAYS) : today;
        const coverageThrough = launches.length > 0 ? addCalendarDays(launches[launches.length - 1], -1) : today;
        const providers = {yahoo: 0, stooq: 0};
        const failedSymbols: string[] = [];
        for (let i = 0; i < chunks.length; i += 1) {
            const chunk = chunks[i];
            const result = await step.run(`ensure-bars-${i}`, async () => {
                const deep = chunk.forceBackfill
                    ? chunk.symbols
                    : (rebuildNeeded ? await symbolsLackingDividendCoverage(chunk.symbols, coverageFrom, coverageThrough) : []);
                const shallow = chunk.symbols.filter((symbol) => !deep.includes(symbol));
                const options = {backfillCalendarDays: STRATEGY_BACKFILL_CALENDAR_DAYS, requireOhlc: true, topupRange: chunk.topupRange};
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
            });
            providers.yahoo += result.providers.yahoo;
            providers.stooq += result.providers.stooq;
            failedSymbols.push(...result.failed);
        }
        // The T-bill rate the backtests credit interest at (the income job keeps it fresh too).
        await step.run('ensure-rate', async () => {
            const r = await ensureBars([RATE_SYMBOL], {limit: 1, backfillCalendarDays: STRATEGY_BACKFILL_CALENDAR_DAYS});
            return {updated: r.updated, failed: r.failed};
        });

        const trackedSymbols = [...ALL_STRATEGY_SYMBOLS, ...heldOutside];
        const freshness = await step.run('check-freshness', async () => {
            const latest = await getLatestBarDates(trackedSymbols);
            return assessFreshness(latest, trackedSymbols, BENCHMARK_SYMBOL, asOf);
        });

        let ran = 0;
        let planned = 0;
        let filled = 0;
        let ordersSoFar = 0;

        if (!freshness.benchmarkFresh) {
            const detail = `benchmark stale (latest ${BENCHMARK_SYMBOL} bar ${freshness.benchmarkLatest ?? 'none'}, needed ${asOf})`;
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
                        await step.run(`error-${sid}`, async () => {
                            await markStrategyError(def.id, plan.skipped ?? 'too many stale symbols');
                            if (!dryRun) await releaseRun(def.id, today);
                        });
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
                            outcomes.push({symbol: order.symbol, side: order.side, executed: false, message: 'Skipped: a funding sell failed this run'});
                            continue;
                        }
                        if (throttleDue(ordersSoFar)) {
                            await step.sleep(`order-throttle-${ordersSoFar}`, ORDER_THROTTLE_DELAY);
                        }
                        const request = {
                            accountId: state.accountId,
                            symbol: order.symbol,
                            side: order.side,
                            quantity: order.quantity,
                            source: 'strategy' as const,
                            reason: order.reason,
                            // One fill per strategy, day, side and symbol: a replayed step finds it.
                            idempotencyKey: `${def.id}:${today}:${order.side}:${order.symbol}`,
                            ...(order.side === 'buy' ? {minCashAfter: plan.minCashAfter} : {}),
                        };
                        const orderStep = stepId(`execute-${sid}-${order.side}-${order.symbol}`);
                        let result = await step.run(orderStep, async () => executeOrder(STRATEGY_OWNER_ID, request));
                        if (!result.success && /live price/i.test(result.message ?? "")) {
                            // A quote miss is usually the rate limit; one spaced retry.
                            await step.sleep(`${orderStep}-wait`, QUOTE_RETRY_DELAY);
                            result = await step.run(`${orderStep}-retry`, async () => executeOrder(STRATEGY_OWNER_ID, request));
                        }
                        ordersSoFar += 1;
                        if (result.success) filled += 1;
                        if (order.side === 'sell' && !result.success) sellFailed = true;
                        outcomes.push({
                            symbol: order.symbol,
                            side: order.side,
                            executed: result.success,
                            ...(typeof result.price === 'number' ? {price: result.price} : {}),
                            ...(result.success ? {} : {message: result.message}),
                        });
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
            if (!resimulate && versions[def.id] === effectiveVersion(def)) continue;
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

        // The what-if grid (lib/strategies/whatif.ts), beside the backtest each strategy has NOW —
        // so read after the rebuilds above. One step per strategy, and only when its backtest was
        // rebuilt since the grid was computed or the grid changed: not every night. The step
        // keeps the backtest's readiness guard and writes StrategyBacktest.variants alone.
        let whatIfGrids = 0;
        const stamps = await step.run('check-variants', async () => variantStamps());
        for (const def of STRATEGIES) {
            const state = states.find((s) => s.strategyId === def.id);
            if (!state || !variantsDue(stamps[def.id], effectiveVersion(def), gridFor(def).map((v) => v.id), resimulate)) continue;
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
