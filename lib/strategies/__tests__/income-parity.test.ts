// A strategy's backtest and its live record must earn identically. The simulator credits
// income inside its trading loop; the nightly job replays a live account from its trades.
// Hold the two against each other over the simulator's own fills: same rows, to the cent.

import {describe, expect, it} from "vitest";
import type {Bar} from "@/lib/prices/signals";
import {addCalendarDays, eachCalendarDay} from "@/lib/prices/calendar-days";
import {strategyBySlug} from "@/lib/strategies/catalog";
import {simulateStrategy} from "@/lib/strategies/simulate";
import {applyOverrides} from "@/lib/strategies/whatif";
import {SYNTHETIC_LAUNCH, syntheticMarket} from "@/lib/strategies/__tests__/synthetic-universe";
import {createIncomeClock, dividendsByExDate, makeRateLookup, replayIncome, type RatePoint} from "@/lib/income/accrual";

const weekdays = (count: number, from: string): string[] => {
    const dates: string[] = [];
    for (let day = from; dates.length < count; day = addCalendarDays(day, 1)) {
        const wd = new Date(`${day}T00:00:00Z`).getUTCDay();
        if (wd !== 0 && wd !== 6) dates.push(day);
    }
    return dates;
};

const LAUNCH = '2030-01-01';
const WARMUP = 5;
// Starts mid-quarter so the 40 result days reach the next quarter start (07-01), where the
// quarterly 60/40 rebalance can sell — a trade the parity check must also survive.
const dates = weekdays(60, '2026-04-20');
const startIndex = dates.length - 1 - 40;   // resultBars 40

// A rate that steps partway through, so a lookup off by one day would show.
const rates: RatePoint[] = eachCalendarDay(addCalendarDays(dates[0], -10), dates[dates.length - 1])
    .map((date) => ({date, discountPct: date < dates[30] ? 4.0 : 4.6}));

const withDividends = (series: Bar[], paid: Record<string, number>): Bar[] =>
    series.map((bar) => (paid[bar.date] !== undefined ? {...bar, dividend: paid[bar.date]} : {...bar, dividend: 0}));

const priced = (base: number, step: number): Bar[] =>
    dates.map((date, i) => ({date, close: base + i * step, open: base + i * step - 0.25, high: base + i * step + 1, low: base + i * step - 1}));

const liveReplayOf = (result: ReturnType<typeof simulateStrategy>, bars: Map<string, Bar[]>, rateSeries: readonly RatePoint[] = rates) => {
    const dividends = [...bars].flatMap(([symbol, series]) =>
        series.filter((b) => (b.dividend ?? 0) > 0).map((b) => ({symbol, exDate: b.date, perShare: b.dividend as number})));
    return replayIncome({
        from: result.from,
        // The simulator has closed every day before its last trade date.
        to: addCalendarDays(result.to, -1),
        startCash: 100_000,
        startHoldings: new Map(),
        trades: result.trades.map((t) => ({date: t.date, symbol: t.symbol, side: t.side, quantity: t.quantity, total: t.total})),
        clock: createIncomeClock({rateOn: makeRateLookup(rateSeries), dividends: dividendsByExDate(dividends)}),
    });
};

const expectSameRows = (simulated: readonly {date: string; kind: string; symbol: string; amount: number}[], live: readonly {date: string; kind: string; symbol: string; amount: number}[]) => {
    expect(simulated.map((r) => `${r.date} ${r.kind} ${r.symbol}`)).toEqual(live.map((r) => `${r.date} ${r.kind} ${r.symbol}`));
    simulated.forEach((row, i) => expect(row.amount).toBeCloseTo(live[i].amount, 9));
};

describe("income parity — simulator vs the live replay", () => {
    const fillDate = dates[startIndex + 1];                              // buy-and-hold buys here
    const friday = dates.slice(startIndex + 5).find((d) => new Date(`${d}T00:00:00Z`).getUTCDay() === 5)!;
    const monday = dates.slice(startIndex + 15).find((d) => new Date(`${d}T00:00:00Z`).getUTCDay() === 1)!;

    it("buy and hold: a buy on the ex-date is not paid; Friday and Monday ex-dates are, identically", () => {
        const spy = withDividends(priced(500, 0.5), {[fillDate]: 1.5, [friday]: 1.75, [monday]: 1.8});
        const bars = new Map<string, Bar[]>([['SPY', spy]]);
        const result = simulateStrategy(strategyBySlug('buy-and-hold-spy')!, bars, {startingBalance: 100_000, launchDate: LAUNCH, resultBars: 40, warmupBars: WARMUP, rates});

        expect(result.trades).toHaveLength(1);
        expect(result.trades[0].date).toBe(fillDate);
        const paid = result.income.filter((r) => r.kind === 'dividend');
        expect(paid.map((r) => r.exDate)).toEqual([friday, monday]);
        expect(paid.every((r) => r.quantity === result.trades[0].quantity)).toBe(true);

        expectSameRows(result.income, liveReplayOf(result, bars).rows);
    });

    it("interest reaches the equity curve: the last point exceeds price return alone", () => {
        const spy = priced(500, 0.5).map((bar) => ({...bar, dividend: 0}));
        const bars = new Map<string, Bar[]>([['SPY', spy]]);
        const withIncome = simulateStrategy(strategyBySlug('buy-and-hold-spy')!, bars, {startingBalance: 100_000, launchDate: LAUNCH, resultBars: 40, warmupBars: WARMUP, rates});
        const without = simulateStrategy(strategyBySlug('buy-and-hold-spy')!, bars, {startingBalance: 100_000, launchDate: LAUNCH, resultBars: 40, warmupBars: WARMUP});

        expect(without.income).toEqual([]);
        expect(withIncome.points.at(-1)!.value).toBeGreaterThan(without.points.at(-1)!.value);
        // The idle ~1% cash floor and the leftover from whole shares earn the T-bill rate.
        const credited = withIncome.income.filter((r) => r.date < withIncome.to).reduce((s, r) => s + r.amount, 0);
        expect(withIncome.points.at(-1)!.value - without.points.at(-1)!.value).toBeCloseTo(credited, 6);
    });

    it("sixty-forty: a rebalance SELLS on SPY's ex-date and BUYS bonds on theirs — still identical", () => {
        const def = strategyBySlug('sixty-forty')!;
        const monthStarts = dates.filter((d, i) => i > startIndex && dates[i - 1].slice(0, 7) !== d.slice(0, 7));
        // SPY rallies hard enough that the next monthly rebalance must sell some of it; both
        // funds go ex on the rebalance days, so fills land on ex-dates in both directions.
        const spy = withDividends(priced(500, 6), Object.fromEntries(monthStarts.map((d) => [d, 1.75])));
        const agg = withDividends(priced(98, -0.05), Object.fromEntries(monthStarts.map((d) => [d, 0.3])));
        const bars = new Map<string, Bar[]>([['SPY', spy], ['AGG', agg]]);
        const result = simulateStrategy(def, bars, {startingBalance: 100_000, launchDate: LAUNCH, resultBars: 40, warmupBars: WARMUP, rates});

        const spySell = result.trades.find((t) => t.symbol === 'SPY' && t.side === 'sell');
        expect(spySell?.date).toBe('2026-07-01');
        // Sold on its ex-date and still paid: entitlement is the holding at the previous close.
        expect(result.income.some((r) => r.symbol === 'SPY' && r.exDate === spySell!.date)).toBe(true);
        expect(result.income.some((r) => r.kind === 'dividend' && r.symbol === 'AGG')).toBe(true);
        expectSameRows(result.income, liveReplayOf(result, bars).rows);
    });
});

// The what-if lab runs the same simulator on an overridden definition. The setting changes
// which trades happen, never how income is credited: the parity must hold for those too.
describe("income parity — what-if settings", () => {
    it("sixty-forty at 80% SPY: the quarterly sell on an ex-date is still paid identically", () => {
        const def = applyOverrides(strategyBySlug('sixty-forty')!, {spyWeight: 0.8});
        const monthStarts = dates.filter((d, i) => i > startIndex && dates[i - 1].slice(0, 7) !== d.slice(0, 7));
        const spy = withDividends(priced(500, 6), Object.fromEntries(monthStarts.map((d) => [d, 1.75])));
        const agg = withDividends(priced(98, -0.05), Object.fromEntries(monthStarts.map((d) => [d, 0.3])));
        const bars = new Map<string, Bar[]>([['SPY', spy], ['AGG', agg]]);
        const result = simulateStrategy(def, bars, {startingBalance: 100_000, launchDate: LAUNCH, resultBars: 40, warmupBars: WARMUP, rates});

        const firstSpyBuy = result.trades.find((t) => t.symbol === 'SPY' && t.side === 'buy');
        expect(firstSpyBuy!.total / 100_000).toBeGreaterThan(0.75);
        expect(result.trades.some((t) => t.symbol === 'SPY' && t.side === 'sell' && t.date === '2026-07-01')).toBe(true);
        expectSameRows(result.income, liveReplayOf(result, bars).rows);
    });

    it("low volatility holding 3 names on a 21-day window: many symbols, many ex-dates, identical", () => {
        const market = syntheticMarket(160);
        const def = applyOverrides(strategyBySlug('low-volatility')!, {top: 3, volWindow: 21});
        const result = simulateStrategy(def, market.bars, {startingBalance: 100_000, launchDate: SYNTHETIC_LAUNCH, resultBars: 120, warmupBars: 30, rates: market.rates});

        // Three slots, rotated monthly: sells happen and more than three names are ever held.
        expect(new Set(result.trades.map((t) => t.symbol)).size).toBeGreaterThan(3);
        expect(result.trades.some((t) => t.side === 'sell')).toBe(true);
        expect(result.income.filter((r) => r.kind === 'dividend').length).toBeGreaterThan(2);
        expectSameRows(result.income, liveReplayOf(result, market.bars, market.rates).rows);

        // The settings took effect: never more than three names held at a close, where the
        // catalog's ten slots hold more; and the 21-day window picks other names than the 63-day one.
        const mostHeld = (trades: readonly {date: string; symbol: string; side: string; quantity: number}[]) => {
            const held = new Map<string, number>();
            let most = 0;
            for (const date of [...new Set(trades.map((t) => t.date))].sort()) {
                for (const t of trades.filter((x) => x.date === date)) held.set(t.symbol, (held.get(t.symbol) ?? 0) + (t.side === 'buy' ? t.quantity : -t.quantity));
                most = Math.max(most, [...held.values()].filter((q) => q > 1e-9).length);
            }
            return most;
        };
        const run = (overrides: Parameters<typeof applyOverrides>[1]) => simulateStrategy(applyOverrides(strategyBySlug('low-volatility')!, overrides), market.bars,
            {startingBalance: 100_000, launchDate: SYNTHETIC_LAUNCH, resultBars: 120, warmupBars: 30, rates: market.rates});
        expect(mostHeld(result.trades)).toBe(3);
        expect(mostHeld(run({}).trades)).toBeGreaterThan(3);
        expect(run({top: 3}).trades.map((t) => `${t.date} ${t.side} ${t.symbol}`)).not.toEqual(result.trades.map((t) => `${t.date} ${t.side} ${t.symbol}`));
    });
});
