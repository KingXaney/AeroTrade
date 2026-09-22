// Pure-function coverage for the Yahoo chart client. fetchYahooDaily is
// exercised against a stubbed global fetch — no network.

import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {fetchYahooDaily, parseYahooChart, yahooChartUrl} from "@/lib/prices/yahoo";

// Session opens (09:30 ET) as epoch seconds: EDT is UTC-4, EST is UTC-5.
const EDT_2026_07_27 = Date.UTC(2026, 6, 27, 13, 30) / 1000;
const EDT_2026_07_28 = Date.UTC(2026, 6, 28, 13, 30) / 1000;
const EDT_2026_07_29 = Date.UTC(2026, 6, 29, 13, 30) / 1000;
const EST_2026_01_05 = Date.UTC(2026, 0, 5, 14, 30) / 1000;

const FAR_FUTURE = "2099-01-01";

type Series = {
    timestamp: number[];
    open?: (number | null)[];
    high?: (number | null)[];
    low?: (number | null)[];
    close: (number | null)[];
    volume?: (number | null)[];
    adjclose?: (number | null)[];
};

const chartOf = ({timestamp, open, high, low, close, volume, adjclose}: Series) => ({
    chart: {
        result: [{
            meta: {symbol: "SPY", currency: "USD"},
            timestamp,
            indicators: {
                quote: [{open, high, low, close, volume}],
                ...(adjclose !== undefined ? {adjclose: [{adjclose}]} : {}),
            },
        }],
        error: null,
    },
});

const HAPPY_CHART = chartOf({
    timestamp: [EDT_2026_07_27, EDT_2026_07_28, EDT_2026_07_29],
    open: [101, 102.8, 103.2],
    high: [103.5, 104, 105.1],
    low: [100.2, 101.9, 102.7],
    close: [102.75, 103.1, 104.5],
    volume: [1500000, 1620500, 900000],
    adjclose: [101.5, 101.85, 103.23],
});

describe("yahooChartUrl", () => {
    it("targets the v8 chart endpoint with range and a daily interval and no events param", () => {
        expect(yahooChartUrl("spy", "5y")).toBe(
            "https://query1.finance.yahoo.com/v8/finance/chart/SPY?range=5y&interval=1d",
        );
        expect(yahooChartUrl("AAPL", "1mo")).not.toContain("events");
    });
});

describe("parseYahooChart", () => {
    it("parses OHLCV plus adjclose into ascending bars", () => {
        expect(parseYahooChart(HAPPY_CHART, {excludeFrom: FAR_FUTURE})).toEqual([
            {date: "2026-07-27", close: 102.75, open: 101, high: 103.5, low: 100.2, volume: 1500000, adjClose: 101.5},
            {date: "2026-07-28", close: 103.1, open: 102.8, high: 104, low: 101.9, volume: 1620500, adjClose: 101.85},
            {date: "2026-07-29", close: 104.5, open: 103.2, high: 105.1, low: 102.7, volume: 900000, adjClose: 103.23},
        ]);
    });

    it("dates bars by the Eastern session date under both EDT and EST", () => {
        const bars = parseYahooChart(
            chartOf({timestamp: [EST_2026_01_05, EDT_2026_07_27], close: [100, 101]}),
            {excludeFrom: FAR_FUTURE},
        );

        expect(bars.map((bar) => bar.date)).toEqual(["2026-01-05", "2026-07-27"]);
    });

    it("skips rows with a null close and keeps the rest", () => {
        const bars = parseYahooChart(
            chartOf({
                timestamp: [EDT_2026_07_27, EDT_2026_07_28, EDT_2026_07_29],
                close: [102.75, null, 104.5],
                open: [101, 102.8, 103.2],
            }),
            {excludeFrom: FAR_FUTURE},
        );

        expect(bars).toEqual([
            {date: "2026-07-27", close: 102.75, open: 101},
            {date: "2026-07-29", close: 104.5, open: 103.2},
        ]);
    });

    it("omits open/high/low/volume/adjClose when they are null or non-finite", () => {
        const bars = parseYahooChart(
            chartOf({
                timestamp: [EDT_2026_07_27],
                open: [null],
                high: [Number.NaN],
                low: [100.2],
                close: [102.75],
                volume: [null],
                adjclose: [null],
            }),
            {excludeFrom: FAR_FUTURE},
        );

        expect(bars).toEqual([{date: "2026-07-27", close: 102.75, low: 100.2}]);
        expect(bars[0]).not.toHaveProperty("open");
        expect(bars[0]).not.toHaveProperty("adjClose");
    });

    it("tolerates a payload without the adjclose block", () => {
        const bars = parseYahooChart(
            chartOf({timestamp: [EDT_2026_07_27], close: [102.75]}),
            {excludeFrom: FAR_FUTURE},
        );

        expect(bars).toEqual([{date: "2026-07-27", close: 102.75}]);
    });

    it("collapses duplicate dates keeping the last row", () => {
        // Two timestamps on the same ET date (a corrected re-emit) → one bar, later values win.
        const bars = parseYahooChart(
            chartOf({
                timestamp: [EDT_2026_07_27, EDT_2026_07_27 + 60, EDT_2026_07_28],
                close: [102.75, 102.9, 103.1],
                volume: [1500000, 1510000, 1620500],
            }),
            {excludeFrom: FAR_FUTURE},
        );

        expect(bars).toEqual([
            {date: "2026-07-27", close: 102.9, volume: 1510000},
            {date: "2026-07-28", close: 103.1, volume: 1620500},
        ]);
    });

    it("drops every bar dated on or after excludeFrom (the in-progress session)", () => {
        const bars = parseYahooChart(HAPPY_CHART, {excludeFrom: "2026-07-29"});

        expect(bars.map((bar) => bar.date)).toEqual(["2026-07-27", "2026-07-28"]);
    });

    it("keeps everything when excludeFrom is after the last bar", () => {
        expect(parseYahooChart(HAPPY_CHART, {excludeFrom: "2026-07-30"})).toHaveLength(3);
    });

    it("returns [] for every non-conforming shape", () => {
        const garbage: unknown[] = [
            null,
            undefined,
            "not json",
            42,
            [],
            {},
            {chart: null},
            {chart: {result: null, error: {code: "Not Found"}}},
            {chart: {result: []}},
            {chart: {result: [{}]}},
            {chart: {result: [{timestamp: "nope", indicators: {}}]}},
            {chart: {result: [{timestamp: [1], indicators: {quote: []}}]}},
            {chart: {result: [{timestamp: [1], indicators: {quote: [{close: "x"}]}}]}},
        ];
        for (const json of garbage) {
            expect(parseYahooChart(json, {excludeFrom: FAR_FUTURE})).toEqual([]);
        }
    });

    it("ignores rows whose timestamp is not a finite number", () => {
        const bars = parseYahooChart(
            chartOf({timestamp: [Number.NaN, EDT_2026_07_27], close: [1, 102.75]}),
            {excludeFrom: FAR_FUTURE},
        );

        expect(bars).toEqual([{date: "2026-07-27", close: 102.75}]);
    });
});

describe("fetchYahooDaily", () => {
    beforeEach(() => {
        // Failures log by design; keep test output clean.
        vi.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it("requests the chart with a plain Mozilla UA, no caching, and parses the body", async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(JSON.stringify(HAPPY_CHART), {status: 200, headers: {"Content-Type": "application/json"}}),
        );
        vi.stubGlobal("fetch", fetchMock);

        const bars = await fetchYahooDaily("spy", {range: "1mo"});

        expect(fetchMock).toHaveBeenCalledWith(
            "https://query1.finance.yahoo.com/v8/finance/chart/SPY?range=1mo&interval=1d",
            {cache: "no-store", headers: {"User-Agent": "Mozilla/5.0"}},
        );
        // The fixture is dated 2026; the live excludeFrom is today's ET date, so
        // every 2026-07 bar survives whatever day the suite runs on.
        expect(bars).toHaveLength(3);
        expect(bars[0]).toMatchObject({date: "2026-07-27", close: 102.75, adjClose: 101.5});
    });

    it("returns [] on a non-ok response", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Too Many Requests", {status: 429})));

        expect(await fetchYahooDaily("SPY", {range: "5y"})).toEqual([]);
    });

    it("returns [] when the body is not JSON", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>challenge</html>", {status: 200})));

        expect(await fetchYahooDaily("SPY", {range: "5y"})).toEqual([]);
    });

    it("returns [] when fetch throws", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

        expect(await fetchYahooDaily("SPY", {range: "5y"})).toEqual([]);
    });
});
