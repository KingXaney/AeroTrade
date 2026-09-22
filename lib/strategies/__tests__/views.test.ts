import {describe, expect, it} from "vitest";
import {
    describeLastRun,
    everyLiveRecordYoung,
    excessReturnPct,
    formatSignalValue,
    liveAgeDays,
    pickPerfMode,
    rankLeaderboard,
    selectWidgetRows,
    toPerfSeries,
    type LiveRecord,
    type StrategyRunView,
} from "@/lib/strategies/views";

const live = (totalReturnPct: number, extra: Partial<LiveRecord> = {}): LiveRecord => ({
    totalValue: 100_000, totalReturnPct, benchmarkReturnPct: null, maxDrawdownPct: null, winRatePct: null,
    holdings: 0, unpriced: 0, snapshotDays: 1, inceptionAt: 0, ...extra,
});

const run = (over: Partial<StrategyRunView> = {}): StrategyRunView => ({
    date: '2026-09-21', asOf: '2026-09-18', mode: 'live', status: 'done', staleCount: 0, universeSize: 40,
    rebalanceTriggered: true, board: [], orders: [], skippedOrders: [], dataIssues: [], equity: 100_000, summary: '', ...over,
});

const order = (symbol: string, side: 'buy' | 'sell', executed = true) => ({
    symbol, side, quantity: 1, kind: 'enter' as const, reason: 'r', executed, price: null, message: null,
});

describe("rankLeaderboard", () => {
    it("orders started rows by live return and keeps not-started rows last in input order", () => {
        const rows = [
            {id: 'a', live: live(1)},
            {id: 'b', live: null},
            {id: 'c', live: live(5)},
            {id: 'd', live: null},
            {id: 'e', live: live(-2)},
        ];
        expect(rankLeaderboard(rows).map((r) => r.id)).toEqual(['c', 'a', 'e', 'b', 'd']);
    });
});

describe("selectWidgetRows", () => {
    it("puts followed rows first and caps the list", () => {
        const ranked = [
            {id: 1, followed: false}, {id: 2, followed: true}, {id: 3, followed: false}, {id: 4, followed: true},
        ];
        expect(selectWidgetRows(ranked, 3).map((r) => r.id)).toEqual([2, 4, 1]);
        expect(selectWidgetRows(ranked, 0)).toEqual([]);
    });
});

describe("excessReturnPct", () => {
    it("is the live return minus SPY's, or null without a benchmark", () => {
        expect(excessReturnPct({totalReturnPct: 5, benchmarkReturnPct: 2})).toBe(3);
        expect(excessReturnPct({totalReturnPct: 5, benchmarkReturnPct: null})).toBeNull();
    });
});

describe("live age", () => {
    const day = 24 * 60 * 60 * 1000;

    it("counts whole days and flags an all-young board", () => {
        expect(liveAgeDays(0, 3 * day + 1000)).toBe(3);
        expect(everyLiveRecordYoung([{live: live(0, {inceptionAt: 0})}], 10 * day)).toBe(true);
        expect(everyLiveRecordYoung([{live: live(0, {inceptionAt: 0})}, {live: live(0, {inceptionAt: 0})}], 31 * day)).toBe(false);
        expect(everyLiveRecordYoung([{live: null}], 0)).toBe(false);
    });
});

describe("describeLastRun", () => {
    it("describes every run shape in one line", () => {
        expect(describeLastRun(null)).toBe('No run yet');
        expect(describeLastRun(run({status: 'skipped', mode: 'skipped'}))).toBe('Skipped 2026-09-21');
        expect(describeLastRun(run({mode: 'preview', orders: [order('AAPL', 'buy', false)]}))).toBe('Preview 2026-09-21: 1 order(s) planned');
        expect(describeLastRun(run({status: 'planned', orders: [order('AAPL', 'buy', false)]}))).toBe('2026-09-21: 1 order(s) planned');
        expect(describeLastRun(run({orders: []}))).toBe('Held on 2026-09-21');
        expect(describeLastRun(run({orders: [], rebalanceTriggered: false}))).toBe('Watched on 2026-09-21');
        expect(describeLastRun(run({orders: [order('AAPL', 'buy'), order('MSFT', 'sell'), order('X', 'buy'), order('Y', 'buy')]})))
            .toBe('2026-09-21: +AAPL −MSFT +X +1 more');
    });
});

describe("formatSignalValue", () => {
    it("formats each column kind and never throws on nulls", () => {
        expect(formatSignalValue(null, 'pct')).toBe('—');
        expect(formatSignalValue(undefined, 'price')).toBe('—');
        expect(formatSignalValue(0.1234, 'pct')).toBe('+12.3%');
        expect(formatSignalValue(-0.05, 'pct')).toBe('-5.0%');
        expect(formatSignalValue(12.345, 'price')).toBe('$12.35');
        expect(formatSignalValue(3, 'rank')).toBe('#3');
        expect(formatSignalValue(true, 'bool')).toBe('yes');
        expect(formatSignalValue(false, 'bool')).toBe('no');
        expect(formatSignalValue(41.26, 'number')).toBe('41.3');
        expect(formatSignalValue(412.6, 'number')).toBe('413');
        expect(formatSignalValue('AGG', 'text')).toBe('AGG');
    });
});

describe("pickPerfMode", () => {
    it("opens on live once it can draw a line", () => {
        expect(pickPerfMode(1, 500)).toBe('simulated');
        expect(pickPerfMode(2, 500)).toBe('live');
        expect(pickPerfMode(0, 1)).toBe('live');
    });
});

describe("toPerfSeries", () => {
    it("normalises both curves to their first point and aligns by date", () => {
        const series = toPerfSeries(
            [{date: 'd1', value: 100}, {date: 'd2', value: 110}, {date: 'd3', value: 99}],
            [{date: 'd1', value: 50}, {date: 'd3', value: 55}],
        );
        expect(series.map((p) => p.date)).toEqual(['d1', 'd2', 'd3']);
        expect(series.map((p) => p.accountPct.toFixed(6))).toEqual(['0.000000', '10.000000', '-1.000000']);
        expect(series.map((p) => (p.benchmarkPct === null ? null : p.benchmarkPct.toFixed(6)))).toEqual(['0.000000', null, '10.000000']);
        expect(toPerfSeries([], [])).toEqual([]);
    });
});

describe("rounded percent formatting", () => {
    it("never shows a signed zero and colours by the rounded value", async () => {
        const {formatDrawdown, formatPct, roundPct, signedForColor} = await import("@/lib/strategies/views");
        expect(formatPct(-0.003)).toBe('0.00%');
        expect(formatPct(0.004)).toBe('0.00%');
        expect(formatPct(0.005)).toBe('+0.01%');
        expect(formatPct(-12.346)).toBe('-12.35%');
        expect(formatPct(null)).toBe('—');
        expect(formatDrawdown(0.003)).toBe('0.00%');
        expect(formatDrawdown(2.5)).toBe('−2.50%');
        expect(formatDrawdown(null)).toBe('—');
        expect(roundPct(1.23456, 1)).toBe(1.2);
        expect(signedForColor(-0.003)).toBeUndefined();
        expect(signedForColor(0.5)).toBe(0.5);
        expect(signedForColor(null)).toBeUndefined();
    });
});
