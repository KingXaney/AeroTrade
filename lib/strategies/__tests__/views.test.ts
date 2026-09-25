import {describe, expect, it} from "vitest";
import {
    columnHasSpark,
    describeLastRun,
    downsample,
    everyLiveRecordYoung,
    excessReturnPct,
    formatSignalValue,
    liveAgeDays,
    MIN_SPARK_POINTS,
    pickPerfMode,
    rankLeaderboard,
    selectWidgetRows,
    sparkDomain,
    SPARK_POINTS,
    toPerfSeries,
    toSparkPct,
    unpricedNote,
    visibleSignalColumns,
    type LiveRecord,
    type StrategyRunView,
} from "@/lib/strategies/views";

const live = (totalReturnPct: number, extra: Partial<LiveRecord> = {}): LiveRecord => ({
    totalValue: 100_000, totalReturnPct, benchmarkReturnPct: null, maxDrawdownPct: null, winRatePct: null,
    holdings: 0, unpriced: 0, snapshotDays: 1, inceptionAt: 0, spark: [], ...extra,
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

describe("downsample", () => {
    it("returns nothing for an empty input or a non-positive target", () => {
        expect(downsample([], 10)).toEqual([]);
        expect(downsample([1, 2, 3], 0)).toEqual([]);
        expect(downsample([1, 2, 3], -5)).toEqual([]);
    });

    it("copies the input when it is already short enough", () => {
        // The QA seed has ~12 snapshots against SPARK_POINTS 40, so this path is live.
        const input = [1, 2, 3];
        const out = downsample(input, 40);
        expect(out).toEqual([1, 2, 3]);
        expect(out).not.toBe(input);
    });

    it("keeps only the last point when asked for one", () => {
        expect(downsample([1, 2, 3, 9], 1)).toEqual([9]);
    });

    it("always preserves both endpoints", () => {
        const input = Array.from({length: 756}, (_, i) => i);
        const out = downsample(input, SPARK_POINTS);
        expect(out).toHaveLength(SPARK_POINTS);
        expect(out[0]).toBe(0);
        expect(out[out.length - 1]).toBe(755);
    });

    it("walks forward without repeating or reordering", () => {
        const out = downsample(Array.from({length: 500}, (_, i) => i), SPARK_POINTS);
        for (let i = 1; i < out.length; i += 1) expect(out[i]).toBeGreaterThan(out[i - 1]);
    });
});

describe("toSparkPct", () => {
    it("starts at zero and reports growth from the first value", () => {
        expect(toSparkPct([100, 150, 200])).toEqual([0, 50, 100]);
    });

    it("returns zeros rather than Infinity on a zero or negative base", () => {
        expect(toSparkPct([0, 50])).toEqual([0, 0]);
        expect(toSparkPct([-10, 50])).toEqual([0, 0]);
    });

    it("is empty for an empty series", () => {
        expect(toSparkPct([])).toEqual([]);
    });

    it("ends exactly on the printed total return", () => {
        // The contract that stops the picture and the number from disagreeing: because
        // downsample keeps the endpoints, the last spark point IS totalReturnPct.
        const points = Array.from({length: 756}, (_, i) => 100_000 * (1 + i / 1000));
        const spark = toSparkPct(downsample(points, SPARK_POINTS));
        const totalReturnPct = (points[points.length - 1] / points[0] - 1) * 100;
        expect(spark[spark.length - 1]).toBeCloseTo(totalReturnPct, 10);
    });
});

describe("sparkDomain", () => {
    it("is null when there is nothing to draw", () => {
        expect(sparkDomain([])).toBeNull();
        expect(sparkDomain([[], []])).toBeNull();
    });

    it("spans every series it is given", () => {
        expect(sparkDomain([[0, 5], [0, -3], [0, 12]])).toEqual({min: -3, max: 12});
    });

    it("always keeps zero in frame", () => {
        expect(sparkDomain([[5, 9]])).toEqual({min: 0, max: 9});
        expect(sparkDomain([[-9, -5]])).toEqual({min: -9, max: 0});
    });
});

describe("columnHasSpark", () => {
    const enough = Array.from({length: MIN_SPARK_POINTS}, () => 0);
    const tooFew = Array.from({length: MIN_SPARK_POINTS - 1}, () => 0);

    it("is false when any drawable row is too short", () => {
        expect(columnHasSpark([{s: enough}, {s: tooFew}], (r) => r.s)).toBe(false);
    });

    it("is true when every drawable row is long enough", () => {
        expect(columnHasSpark([{s: enough}, {s: enough}], (r) => r.s)).toBe(true);
    });

    it("ignores rows that have not started", () => {
        expect(columnHasSpark([{s: enough}, {s: null}], (r) => r.s)).toBe(true);
    });

    it("is false when nothing has started", () => {
        expect(columnHasSpark([{s: null}, {s: null}], (r) => r.s)).toBe(false);
    });
});

describe("unpricedNote", () => {
    it("says nothing when every holding is priced", () => {
        expect(unpricedNote([{live: live(1, {holdings: 2, unpriced: 0})}])).toBeNull();
    });

    it("uses one panel note when nothing at all is priced", () => {
        // The QA harness runs without a quote key, so this is its normal state.
        const note = unpricedNote([
            {live: live(1, {holdings: 2, unpriced: 2})},
            {live: live(2, {holdings: 1, unpriced: 1})},
        ]);
        expect(note).toEqual({mode: 'panel', text: expect.stringContaining('unpriced')});
    });

    it("uses a row marker when only some rows are affected", () => {
        const note = unpricedNote([
            {live: live(1, {holdings: 2, unpriced: 2})},
            {live: live(2, {holdings: 2, unpriced: 0})},
        ]);
        expect(note).toEqual({mode: 'marker', legend: expect.stringContaining('unpriced')});
    });

    it("ignores rows that have not started", () => {
        expect(unpricedNote([{live: null}, {live: live(1, {holdings: 1, unpriced: 1})}]))
            .toEqual({mode: 'panel', text: expect.stringContaining('unpriced')});
    });
});

describe("visibleSignalColumns", () => {
    const columns = [
        {key: 'close', label: 'Last close', format: 'price' as const},
        {key: 'ret', label: '12m return', format: 'pct' as const},
        {key: 'beats', label: 'Beats T-bills', format: 'bool' as const},
    ];
    const row = (values: Record<string, number | string | boolean | null>) =>
        ({symbol: 'XLK', state: 'held' as const, values});

    it("drops a column no row has a value for", () => {
        const out = visibleSignalColumns(columns, [row({close: 210.5, ret: null, beats: null})]);
        expect(out.map((c) => c.key)).toEqual(['close']);
    });

    it("keeps a column as soon as one row has a value", () => {
        const out = visibleSignalColumns(columns, [row({close: null, ret: null, beats: null}), row({ret: 0.12})]);
        expect(out.map((c) => c.key)).toEqual(['ret']);
    });

    it("treats false and zero as values, not absence", () => {
        const out = visibleSignalColumns(columns, [row({close: 0, ret: null, beats: false})]);
        expect(out.map((c) => c.key)).toEqual(['close', 'beats']);
    });

    it("keeps every column when the board is empty", () => {
        expect(visibleSignalColumns(columns, [])).toHaveLength(3);
    });
});
