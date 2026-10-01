// The simulated track record: the SAME runStrategyDay the live job calls, walked over
// stored daily bars with next-open fills. Pure. The calendar is the benchmark's bar
// dates (the NYSE table only starts in 2025), the window ends before the launch date so
// live and simulated never overlap, and nothing on day t can see bar t+1.
//
// Cash earns interest and holdings receive dividends through the SAME income clock the
// nightly job replays live accounts with, stepped in the same order — open(d), d's fills,
// close(d) — every calendar day, skipped days and weekends included. That order is what
// makes a strategy's backtest and its live record earn identically (see the parity test).

import type {Bar} from "@/lib/prices/signals";
import {addCalendarDays, eachCalendarDay} from "@/lib/dates";
import {totalReturnIndex} from "@/lib/prices/total-return";
import {createIncomeClock, dividendsByExDate, makeRateLookup, type IncomeClock, type IncomeRow, type RatePoint} from "@/lib/income/accrual";
import {CASH_FLOOR, SIM_RESULT_BARS, WARMUP_BARS} from "@/lib/strategies/config";
import {buildContext, runStrategyDay} from "@/lib/strategies/engine";
import {applyFill, type SimAccount} from "@/lib/trading/fill";
import {summarizeSeries} from "@/lib/strategies/metrics";
import {STRATEGY_RULES} from "@/lib/strategies/rules";
import type {SeriesPoint, SimTrade, SimulationResult, StrategyDefinition} from "@/lib/strategies/types";
import {BENCHMARK_SYMBOL} from "@/lib/strategies/universe";

export type SimulationOptions = {
    startingBalance: number;
    launchDate: string;
    resultBars?: number;
    warmupBars?: number;
    // The 13-week T-bill series. When given, cash earns interest and holdings are paid their
    // dividends (from the bars' stored `dividend` field); without it, price return only.
    rates?: readonly RatePoint[];
};

// Steps the income clock one calendar day at a time, alongside the trading loop.
const incomeWalker = (clock: IncomeClock | null) => {
    let due = 0;
    const rows: IncomeRow[] = [];
    return {
        rows,
        // Start of day: yesterday's income becomes cash; ex-dates fix on the holdings now.
        open: (date: string, account: SimAccount): SimAccount => {
            if (clock === null) return account;
            const credited = due === 0 ? account : {...account, cash: account.cash + due};
            due = 0;
            clock.open(date, new Map(credited.positions.map((p) => [p.symbol, p.quantity])));
            return credited;
        },
        // End of day: interest on the day's closing cash, and any dividend paid today.
        close: (date: string, account: SimAccount): void => {
            if (clock === null) return;
            const closed = clock.close(date, account.cash);
            rows.push(...closed);
            due = closed.reduce((sum, row) => sum + row.amount, 0);
        },
    };
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
        income: [],
    };
};

export const simulateStrategy = (
    def: StrategyDefinition,
    barsBySymbol: ReadonlyMap<string, readonly Bar[]>,
    {startingBalance, launchDate, resultBars = SIM_RESULT_BARS, warmupBars = WARMUP_BARS, rates}: SimulationOptions,
): SimulationResult => {
    const benchmarkBars = (barsBySymbol.get(BENCHMARK_SYMBOL) ?? []).filter((bar) => bar.date < launchDate);
    const calendar = benchmarkBars.map((bar) => bar.date);
    // SPY's total return — the same index every live "vs SPY" reads (identical to the closes
    // when the bars carry no dividends).
    const benchmarkIndex = indexBars(totalReturnIndex(benchmarkBars).map((p) => ({date: p.date, close: p.value})));
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

    const dividendPoints = rates === undefined ? [] : [...barsBySymbol].flatMap(([symbol, bars]) =>
        bars.filter((bar) => typeof bar.dividend === 'number' && bar.dividend > 0).map((bar) => ({symbol, exDate: bar.date, perShare: bar.dividend as number})));
    const income = incomeWalker(rates === undefined ? null : createIncomeClock({rateOn: makeRateLookup(rates), dividends: dividendsByExDate(dividendPoints)}));

    let account: SimAccount = {cash: startingBalance, positions: []};
    // The account exists from the first result day, like a live account from its inception.
    account = income.open(calendar[startIndex], account);
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
        // Close asOf, walk any weekend or holiday, and open the trade date — so the decision
        // below sees every credit dated before it, exactly as a live 09:35 run does.
        income.close(asOf, account);
        for (const day of eachCalendarDay(addCalendarDays(asOf, 1), addCalendarDays(tradeDate, -1))) {
            account = income.open(day, account);
            income.close(day, account);
        }
        account = income.open(tradeDate, account);
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
            // Mirrors completeRun: the period is consumed only when every planned fill landed.
            let dayRejected = false;
            for (const order of day.orders) {
                const fillBar = indexes.get(order.symbol)?.byDate.get(tradeDate);
                if (!fillBar) {
                    rejections.push({date: tradeDate, symbol: order.symbol, side: order.side, reason: 'no bar on fill date'});
                    dayRejected = true;
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
                    dayRejected = true;
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
            if (day.decision.rebalanceTriggered && !dayRejected) lastRebalanceDate = tradeDate;
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
        income: income.rows,
    };
};
