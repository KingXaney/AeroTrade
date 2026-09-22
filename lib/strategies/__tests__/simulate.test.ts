import {describe, expect, it} from "vitest";
import type {Bar} from "@/lib/prices/signals";
import {strategyBySlug} from "@/lib/strategies/catalog";
import {CASH_FLOOR, PRICE_BUFFER, WARMUP_BARS} from "@/lib/strategies/config";
import {simulateStrategy} from "@/lib/strategies/simulate";
import {LARGE_CAPS, SECTOR_ETFS} from "@/lib/strategies/universe";

// A synthetic trading calendar: weekdays only, starting well before the launch date.
const calendar = (count: number, from = '2022-01-03'): string[] => {
    const dates: string[] = [];
    const cursor = new Date(`${from}T00:00:00Z`);
    while (dates.length < count) {
        const wd = cursor.getUTCDay();
        if (wd !== 0 && wd !== 6) dates.push(cursor.toISOString().slice(0, 10));
        cursor.setTime(cursor.getTime() + 24 * 60 * 60 * 1000);
    }
    return dates;
};

const seriesFrom = (dates: string[], closeAt: (i: number) => number, openAt?: (i: number) => number | undefined): Bar[] =>
    dates.map((date, i) => {
        const close = closeAt(i);
        const open = openAt ? openAt(i) : close * 0.999;
        return {date, close, ...(open === undefined ? {} : {open}), high: Math.max(close, open ?? close) * 1.002, low: Math.min(close, open ?? close) * 0.998};
    });

const DAYS = WARMUP_BARS + 40;
const dates = calendar(DAYS);
const LAUNCH = '2030-01-01';
const buyAndHold = strategyBySlug('buy-and-hold-spy')!;

describe("simulateStrategy — buy and hold", () => {
    const spy = seriesFrom(dates, (i) => 400 + i, (i) => 400 + i + 0.5);
    const bars = new Map<string, Bar[]>([['SPY', spy]]);
    const result = simulateStrategy(buyAndHold, bars, {startingBalance: 100_000, launchDate: LAUNCH, resultBars: 30});

    it("buys once at the next open and holds; equity follows the close", () => {
        expect(result.trades).toHaveLength(1);
        const trade = result.trades[0];
        expect(trade.side).toBe('buy');
        expect(trade.symbol).toBe('SPY');
        expect(trade.fill).toBe('open');
        // Decided on the first result bar's close, filled at the next bar's open.
        const firstAsOfIndex = dates.indexOf(result.from);
        const fillIndex = firstAsOfIndex + 1;
        expect(trade.date).toBe(dates[fillIndex]);
        expect(trade.price).toBe(spy[fillIndex].open);
        const sizingClose = spy[firstAsOfIndex].close;
        expect(trade.quantity).toBe(Math.floor((0.99 * 100_000) / (sizingClose * (1 + PRICE_BUFFER))));
        // Every later point is cash + shares × that day's close.
        const cash = 100_000 - trade.quantity * trade.price;
        for (const point of result.points.slice(1)) {
            const bar = spy.find((b) => b.date === point.date)!;
            expect(point.value).toBeCloseTo(cash + trade.quantity * bar.close, 6);
        }
        expect(result.points[0]).toEqual({date: result.from, value: 100_000});
        expect(result.points.length).toBe(31);
        expect(result.to).toBe(dates[dates.length - 1]);
    });

    it("aligns the SPY benchmark by date and fills the stats", () => {
        expect(result.benchmark.map((b) => b.date)).toEqual(result.points.map((p) => p.date));
        expect(result.stats.totalReturnPct).not.toBeNull();
        expect(result.stats.benchmarkReturnPct).not.toBeNull();
        expect(result.stats.tradeCount).toBe(1);
        expect(result.closeFills).toBe(0);
        expect(result.rejections).toEqual([]);
        expect(result.fillRule).toBe('next-open');
    });

    it("falls back to the close when a bar has no open, and counts it", () => {
        const noOpen = seriesFrom(dates, (i) => 400 + i, () => undefined);
        const r = simulateStrategy(buyAndHold, new Map([['SPY', noOpen]]), {startingBalance: 100_000, launchDate: LAUNCH, resultBars: 10});
        expect(r.trades[0].fill).toBe('close');
        expect(r.closeFills).toBe(1);
    });

    it("ends before the launch date and ignores later bars", () => {
        const launch = dates[dates.length - 5];
        const r = simulateStrategy(buyAndHold, bars, {startingBalance: 100_000, launchDate: launch, resultBars: 10});
        expect(r.to < launch).toBe(true);
        expect(r.to).toBe(dates[dates.length - 6]);
    });

    it("returns a single point with null stats when history is too short", () => {
        const short = seriesFrom(dates.slice(0, WARMUP_BARS), (i) => 400 + i);
        const r = simulateStrategy(buyAndHold, new Map([['SPY', short]]), {startingBalance: 100_000, launchDate: LAUNCH});
        expect(r.points).toHaveLength(1);
        expect(r.trades).toEqual([]);
        expect(r.stats.totalReturnPct).toBeNull();
    });

    it("rejects an order whose symbol has no bar on the fill date", () => {
        const sixtyForty = strategyBySlug('sixty-forty')!;
        const firstFillIndex = dates.length - 1 - 30 + 1; // resultBars 30 → first decision at n−31, fill at n−30
        const agg = seriesFrom(dates, (i) => 100 + i * 0.01).filter((_, i) => i !== firstFillIndex);
        const r = simulateStrategy(sixtyForty, new Map([['SPY', spy], ['AGG', agg]]), {startingBalance: 100_000, launchDate: LAUNCH, resultBars: 30});
        expect(r.rejections.some((x) => x.symbol === 'AGG' && x.reason === 'no bar on fill date')).toBe(true);
        expect(r.trades.some((t) => t.symbol === 'SPY')).toBe(true);
    });
});

describe("simulateStrategy — no look-ahead and cadence", () => {
    const goldenCross = strategyBySlug('golden-cross')!;
    // Ten flat sectors and one that trends up then collapses; SPY provides the calendar.
    const sectorBars = (crashAt: number, crashTo: number) => {
        const map = new Map<string, Bar[]>();
        map.set('SPY', seriesFrom(dates, (i) => 400 + i * 0.1));
        for (const etf of SECTOR_ETFS) {
            if (etf === 'XLK') {
                map.set(etf, seriesFrom(dates, (i) => (i < crashAt ? 100 + i * 0.5 : crashTo)));
            } else {
                map.set(etf, seriesFrom(dates, () => 50));
            }
        }
        return map;
    };

    it("decisions on day t are identical whether or not bar t+1 is mutated", () => {
        const crashAt = WARMUP_BARS + 20;
        const base = simulateStrategy(goldenCross, sectorBars(crashAt, 10), {startingBalance: 100_000, launchDate: LAUNCH, resultBars: 35});
        const mutated = simulateStrategy(goldenCross, sectorBars(crashAt, 1), {startingBalance: 100_000, launchDate: LAUNCH, resultBars: 35});
        const before = (t: {date: string}) => t.date < dates[crashAt];
        expect(base.trades.filter(before)).toEqual(mutated.trades.filter(before));
        expect(base.points.filter(before)).toEqual(mutated.points.filter(before));
        // The collapse is only visible from the bar it happens on: the exit fills the day after.
        const exit = base.trades.find((t) => t.side === 'sell' && t.symbol === 'XLK');
        expect(exit).toBeDefined();
        expect(exit!.date > dates[crashAt]).toBe(true);
        expect(typeof exit!.realizedPnl).toBe('number');
    });

    it("a monthly rule trades only on the first bar of a new month", () => {
        const momentum = strategyBySlug('momentum-12-1')!;
        const map = new Map<string, Bar[]>();
        map.set('SPY', seriesFrom(dates, (i) => 400 + i * 0.1));
        LARGE_CAPS.forEach((symbol, k) => {
            // Distinct drifts so the ranking is stable and never tied.
            map.set(symbol, seriesFrom(dates, (i) => 100 * (1 + (k + 1) * 0.0005) ** i));
        });
        const r = simulateStrategy(momentum, map, {startingBalance: 100_000, launchDate: LAUNCH, resultBars: 60});
        expect(r.trades.length).toBeGreaterThan(0);
        const tradeDates = new Set(r.trades.map((t) => t.date));
        for (const date of tradeDates) {
            const i = dates.indexOf(date);
            const prev = dates[i - 1];
            // Either the very first fill (initial deployment) or a month boundary.
            const firstFill = r.trades[0].date;
            expect(date === firstFill || date.slice(0, 7) !== prev.slice(0, 7), `${prev} → ${date}`).toBe(true);
        }
        expect(r.stats.tradeCount).toBe(r.trades.length);
    });

    it("respects the cash floor on the initial deployment and retries every day", () => {
        const spy = seriesFrom(dates, (i) => 400 + i, (i) => (400 + i) * 1.03); // opens gap up 3%
        const r = simulateStrategy(buyAndHold, new Map([['SPY', spy]]), {startingBalance: 100_000, launchDate: LAUNCH, resultBars: 5});
        // Sized at close × 1.01 but filled 3% higher: the buy breaches the floor and is rejected;
        // the period is not consumed, so the rule re-plans on every following day.
        expect(r.trades).toHaveLength(0);
        expect(r.rejections).toHaveLength(r.points.length - 1);
        expect(r.rejections[0].reason).toMatch(/cash floor|insufficient cash/);
        expect(r.points.every((p) => p.value === 100_000)).toBe(true);
        expect(CASH_FLOOR).toBe(0.01);
    });

    it("a bounced launch-day fill lands on the next day and the rule is then done", () => {
        const firstFill = dates.length - 5; // resultBars 5 → decisions from n−6, first fill at n−5
        const spy = seriesFrom(dates, (i) => 400 + i, (i) => (i === firstFill ? (400 + i) * 1.03 : 400 + i));
        const r = simulateStrategy(buyAndHold, new Map([['SPY', spy]]), {startingBalance: 100_000, launchDate: LAUNCH, resultBars: 5});
        expect(r.rejections).toHaveLength(1);
        expect(r.trades).toHaveLength(1);
        expect(r.trades[0].date).toBe(dates[firstFill + 1]);
    });

    it("finishes the eight real strategies over a full synthetic universe quickly", () => {
        const long = calendar(WARMUP_BARS + 800);
        const map = new Map<string, Bar[]>();
        const all = new Set<string>(['SPY', 'EFA', 'AGG', 'BIL', ...SECTOR_ETFS, ...LARGE_CAPS]);
        let k = 0;
        for (const symbol of all) {
            k += 1;
            const drift = 1 + ((k % 7) - 3) * 0.0002;
            map.set(symbol, seriesFrom(long, (i) => 100 * drift ** i * (1 + 0.01 * Math.sin(i / 9 + k)), (i) => 100 * drift ** i));
        }
        const started = Date.now();
        for (const slug of ['buy-and-hold-spy', 'sixty-forty', 'golden-cross', 'dual-momentum', 'momentum-12-1', 'rsi2-mean-reversion', 'donchian-breakout', 'low-volatility']) {
            const r = simulateStrategy(strategyBySlug(slug)!, map, {startingBalance: 100_000, launchDate: LAUNCH});
            expect(r.points.length).toBeGreaterThan(700);
            expect(r.points.every((p) => Number.isFinite(p.value) && p.value > 0)).toBe(true);
        }
        // Generous: this guards against a quadratic regression, not a busy machine.
        expect(Date.now() - started).toBeLessThan(120_000);
    });
});
