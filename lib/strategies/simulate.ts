// The simulated track record: the SAME runStrategyDay the live job calls, walked over
// stored daily bars with next-open fills. Pure. The calendar is the benchmark's bar
// dates (the NYSE table only starts in 2025), the window ends before the launch date so
// live and simulated never overlap, and nothing on day t can see bar t+1.

import type {Bar} from "@/lib/prices/signals";
import {CASH_FLOOR, SIM_RESULT_BARS, WARMUP_BARS} from "@/lib/strategies/config";
import {applyFill, buildContext, runStrategyDay, type SimAccount} from "@/lib/strategies/engine";
import {summarizeSeries} from "@/lib/strategies/metrics";
import {STRATEGY_RULES} from "@/lib/strategies/rules";
import type {SeriesPoint, SimTrade, SimulationResult, StrategyDefinition} from "@/lib/strategies/types";
import {BENCHMARK_SYMBOL} from "@/lib/strategies/universe";

export type SimulationOptions = {
    startingBalance: number;
    launchDate: string;
    resultBars?: number;
    warmupBars?: number;
};

const finitePositive = (value: number | undefined): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;

// date → bar per symbol, plus the ascending date list, built once.
const indexBars = (bars: readonly Bar[]): {byDate: Map<string, Bar>; dates: string[]} => {
    const byDate = new Map<string, Bar>();
    for (const bar of bars) byDate.set(bar.date, bar);
    return {byDate, dates: bars.map((bar) => bar.date)};
};

// The last close on or before `date` (a symbol without a bar that day keeps yesterday's value).
const closeOnOrBefore = (index: {byDate: Map<string, Bar>; dates: string[]}, date: string): number | null => {
    const exact = index.byDate.get(date);
    if (exact) return exact.close;
    let lo = 0;
    let hi = index.dates.length - 1;
    let best = -1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (index.dates[mid] <= date) {
            best = mid;
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }
    return best >= 0 ? index.byDate.get(index.dates[best])?.close ?? null : null;
};

const emptyResult = (date: string, startingBalance: number, benchmarkClose: number | null): SimulationResult => {
    const points: SeriesPoint[] = [{date, value: startingBalance}];
    const benchmark: SeriesPoint[] = benchmarkClose === null ? [] : [{date, value: benchmarkClose}];
    return {
        from: date,
        to: date,
        fillRule: 'next-open',
        closeFills: 0,
        skippedDays: 0,
        points,
        benchmark,
        trades: [],
        rejections: [],
        stats: summarizeSeries(points, [], benchmark),
    };
};

export const simulateStrategy = (
    def: StrategyDefinition,
    barsBySymbol: ReadonlyMap<string, readonly Bar[]>,
    {startingBalance, launchDate, resultBars = SIM_RESULT_BARS, warmupBars = WARMUP_BARS}: SimulationOptions,
): SimulationResult => {
    const benchmarkBars = (barsBySymbol.get(BENCHMARK_SYMBOL) ?? []).filter((bar) => bar.date < launchDate);
    const calendar = benchmarkBars.map((bar) => bar.date);
    const benchmarkIndex = indexBars(benchmarkBars);
    const decide = STRATEGY_RULES[def.id];

    // Not enough history to warm the indicators up and still have a day to trade.
    if (calendar.length < warmupBars + 2) {
        const date = calendar.length > 0 ? calendar[calendar.length - 1] : launchDate;
        return emptyResult(date, startingBalance, closeOnOrBefore(benchmarkIndex, date));
    }

    const n = calendar.length;
    const startIndex = Math.max(warmupBars, n - 1 - resultBars);
    const indexes = new Map<string, {byDate: Map<string, Bar>; dates: string[]}>();
    for (const [symbol, bars] of barsBySymbol) indexes.set(symbol, indexBars(bars));

    let account: SimAccount = {cash: startingBalance, positions: []};
    let lastRebalanceDate: string | null = null;
    let isFirstRun = true;
    let closeFills = 0;
    let skippedDays = 0;
    const trades: SimTrade[] = [];
    const rejections: SimulationResult['rejections'][number][] = [];
    const points: SeriesPoint[] = [{date: calendar[startIndex], value: startingBalance}];
    const benchmark: SeriesPoint[] = [];
    const firstBench = closeOnOrBefore(benchmarkIndex, calendar[startIndex]);
    if (firstBench !== null) benchmark.push({date: calendar[startIndex], value: firstBench});

    for (let i = startIndex; i < n - 1; i += 1) {
        const asOf = calendar[i];
        const tradeDate = calendar[i + 1];
        const ctx = buildContext(def, {
            barsBySymbol,
            asOf,
            tradeDate,
            positions: account.positions,
            cash: account.cash,
            lastRebalanceDate,
            isFirstRun,
        });
        const day = runStrategyDay(def, ctx, decide);

        if (day.skipped) {
            skippedDays += 1;
        } else {
            for (const order of day.orders) {
                const fillBar = indexes.get(order.symbol)?.byDate.get(tradeDate);
                if (!fillBar) {
                    rejections.push({date: tradeDate, symbol: order.symbol, side: order.side, reason: 'no bar on fill date'});
                    continue;
                }
                let fill: SimTrade['fill'] = 'open';
                let price: number;
                if (finitePositive(fillBar.open)) {
                    price = fillBar.open;
                } else {
                    price = fillBar.close;
                    fill = 'close';
                    closeFills += 1;
                }
                const result = applyFill(account, order, price, order.side === 'buy' ? CASH_FLOOR * ctx.equity : undefined);
                if (!result.ok) {
                    rejections.push({date: tradeDate, symbol: order.symbol, side: order.side, reason: result.reason});
                    continue;
                }
                account = result.account;
                isFirstRun = false;
                trades.push({
                    date: tradeDate,
                    symbol: order.symbol,
                    side: order.side,
                    quantity: order.quantity,
                    price,
                    total: result.total,
                    ...(result.realizedPnl !== undefined ? {realizedPnl: result.realizedPnl} : {}),
                    reason: order.reason,
                    fill,
                });
            }
            if (day.decision.rebalanceTriggered) lastRebalanceDate = tradeDate;
        }

        // Mark to market at the trade date's close.
        let value = account.cash;
        for (const position of account.positions) {
            const index = indexes.get(position.symbol);
            const close = index ? closeOnOrBefore(index, tradeDate) : null;
            value += position.quantity * (close ?? position.avgCost);
        }
        points.push({date: tradeDate, value});
        const bench = closeOnOrBefore(benchmarkIndex, tradeDate);
        if (bench !== null) benchmark.push({date: tradeDate, value: bench});
    }

    return {
        from: points[0].date,
        to: points[points.length - 1].date,
        fillRule: 'next-open',
        closeFills,
        skippedDays,
        points,
        benchmark,
        trades,
        rejections,
        stats: summarizeSeries(points, trades, benchmark),
    };
};
