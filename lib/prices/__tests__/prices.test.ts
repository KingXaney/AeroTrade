// Pure-function coverage for the Stooq CSV client, fetch-window planning and the price signals.
// fetchStooqDaily is exercised against a stubbed global fetch — no network.

import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {decideFetchWindow, fetchStooqDaily, parseStooqCsv} from "@/lib/prices/stooq";
import {computeSignals, type Bar} from "@/lib/prices/signals";
import {
    BACKFILL_CALENDAR_DAYS,
    BACKFILL_TRIGGER_GAP_DAYS,
    STRATEGY_BACKFILL_CALENDAR_DAYS,
    TOPUP_CALENDAR_DAYS,
} from "@/lib/prices/config";

const HAPPY_CSV = [
    "Date,Open,High,Low,Close,Volume",
    "2026-07-27,101.0,103.5,100.2,102.75,1500000",
    "2026-07-28,102.8,104.0,101.9,103.10,1620500",
    "2026-07-29,103.2,105.1,102.7,104.50,900000",
].join("\n");

// Dates are irrelevant to the math, so a synthetic index keeps fixtures small.
const seriesOf = (closes: number[]): Bar[] =>
    closes.map((close, i) => ({date: `2026-01-${i}`, close}));

const growthSeries = (count: number, growth: number): Bar[] =>
    seriesOf(Array.from({length: count}, (_, i) => 100 * Math.pow(growth, i)));

describe("parseStooqCsv", () => {
    it("parses a well-formed CSV into OHLC/close/volume bars", () => {
        const bars = parseStooqCsv(HAPPY_CSV);

        expect(bars).toEqual([
            {date: "2026-07-27", close: 102.75, open: 101, high: 103.5, low: 100.2, volume: 1500000},
            {date: "2026-07-28", close: 103.1, open: 102.8, high: 104, low: 101.9, volume: 1620500},
            {date: "2026-07-29", close: 104.5, open: 103.2, high: 105.1, low: 102.7, volume: 900000},
        ]);
    });

    it("tolerates missing volume by omitting the field", () => {
        const csv = "Date,Open,High,Low,Close,Volume\n2026-07-29,103.2,105.1,102.7,104.50";
        const bars = parseStooqCsv(csv);

        expect(bars).toEqual([{date: "2026-07-29", close: 104.5, open: 103.2, high: 105.1, low: 102.7}]);
        expect(bars[0].volume).toBeUndefined();
    });

    it("omits open/high/low that are blank, zero, negative or non-numeric", () => {
        const csv = [
            "Date,Open,High,Low,Close,Volume",
            "2026-07-27,,0,-1,102.75,1500000",
            "2026-07-28,abc,104.0,101.9,103.10,1620500",
        ].join("\n");

        expect(parseStooqCsv(csv)).toEqual([
            {date: "2026-07-27", close: 102.75, volume: 1500000},
            {date: "2026-07-28", close: 103.1, high: 104, low: 101.9, volume: 1620500},
        ]);
    });

    it("skips blank lines and malformed rows but keeps the good ones", () => {
        const csv = [
            "Date,Open,High,Low,Close,Volume",
            "",
            "2026-07-27,101.0,103.5,100.2,102.75,1500000",
            "not-a-date,1,2,3,4,5",
            "2026-07-28,102.8,104.0,101.9,abc,1620500", // close not numeric
            "2026-07-29,103.2,105.1,102.7,-4.5,900000", // close not positive
            "2026-07-30,103.2,105.1,102.7,0,900000", // zero close
            "2026-07-31,103.2", // too few fields
            "   ",
            "2026-08-03,104.0,106.0,103.5,105.25,800000",
        ].join("\n");

        expect(parseStooqCsv(csv)).toEqual([
            {date: "2026-07-27", close: 102.75, open: 101, high: 103.5, low: 100.2, volume: 1500000},
            {date: "2026-08-03", close: 105.25, open: 104, high: 106, low: 103.5, volume: 800000},
        ]);
    });

    it("returns [] for 'No data' bodies", () => {
        expect(parseStooqCsv("No data")).toEqual([]);
    });

    it("returns [] for HTML error pages", () => {
        const html = "<html><body><h1>503 Service Unavailable</h1></body></html>";
        expect(parseStooqCsv(html)).toEqual([]);
        expect(parseStooqCsv("<!DOCTYPE html><html></html>")).toEqual([]);
    });

    it("returns [] for an empty body", () => {
        expect(parseStooqCsv("")).toEqual([]);
        expect(parseStooqCsv("   \n  ")).toEqual([]);
    });
});

describe("decideFetchWindow", () => {
    const TODAY = "2026-07-30";

    it("backfills when there is no history at all", () => {
        const window = decideFetchWindow(null, TODAY);

        expect(window.mode).toBe("backfill");
        // 730 calendar days before 2026-07-30 (no leap day in the span).
        expect(window.fromDate).toBe("20240730");
        expect(window.toDate).toBe("20260730");
    });

    it("tops up when the gap is exactly BACKFILL_TRIGGER_GAP_DAYS", () => {
        // 2026-07-20 is exactly 10 calendar days before today — still fresh.
        const window = decideFetchWindow("2026-07-20", TODAY);

        expect(BACKFILL_TRIGGER_GAP_DAYS).toBe(10);
        expect(window.mode).toBe("topup");
        expect(TOPUP_CALENDAR_DAYS).toBe(10);
        expect(window.fromDate).toBe("20260720");
        expect(window.toDate).toBe("20260730");
    });

    it("backfills once the gap exceeds the trigger by a single day", () => {
        const window = decideFetchWindow("2026-07-19", TODAY);

        expect(window.mode).toBe("backfill");
        expect(window.fromDate).toBe("20240730");
        expect(window.toDate).toBe("20260730");
    });

    it("tops up for a fresh latest bar", () => {
        const window = decideFetchWindow("2026-07-29", TODAY);

        expect(window.mode).toBe("topup");
        expect(window.fromDate).toBe("20260720");
        expect(window.toDate).toBe("20260730");
    });

    it("zero-pads YYYYMMDD across month and year boundaries", () => {
        const window = decideFetchWindow("2026-01-04", "2026-01-05");

        expect(window.mode).toBe("topup");
        expect(window.fromDate).toBe("20251226");
        expect(window.toDate).toBe("20260105");
    });

    describe("earliest-bar rule", () => {
        // 2026-07-30 − 1560 days = 2022-04-22; the 30-day tolerance moves the
        // required earliest bar to 2022-05-22.
        const STRATEGY_OPTS = {backfillCalendarDays: STRATEGY_BACKFILL_CALENDAR_DAYS};

        it("keeps the two-argument behaviour when no earliest date is given", () => {
            expect(decideFetchWindow("2026-07-29", TODAY)).toEqual(
                decideFetchWindow("2026-07-29", TODAY, {}),
            );
            expect(decideFetchWindow("2026-07-29", TODAY, {earliestBarDate: null}).mode).toBe("topup");
        });

        it("tops up when the earliest stored bar is deep enough for the default window", () => {
            // 730 − 30 = 700 days before today is 2024-08-29; a 2024-08-01 start is deeper.
            const window = decideFetchWindow("2026-07-29", TODAY, {earliestBarDate: "2024-08-01"});

            expect(window.mode).toBe("topup");
            expect(window.fromDate).toBe("20260720");
        });

        it("tops up when the earliest bar lands inside the 30-day tolerance", () => {
            const window = decideFetchWindow("2026-07-29", TODAY, {earliestBarDate: "2024-08-29"});

            expect(window.mode).toBe("topup");
        });

        it("backfills when the earliest stored bar is too recent for the default window", () => {
            const window = decideFetchWindow("2026-07-29", TODAY, {earliestBarDate: "2024-08-30"});

            expect(window.mode).toBe("backfill");
            expect(window.fromDate).toBe("20240730");
            expect(window.toDate).toBe("20260730");
        });

        it("backfills a fresh two-year history when a strategy-depth window is requested", () => {
            expect(STRATEGY_BACKFILL_CALENDAR_DAYS).toBe(1560);
            expect(BACKFILL_CALENDAR_DAYS).toBe(730);
            const window = decideFetchWindow("2026-07-29", TODAY, {...STRATEGY_OPTS, earliestBarDate: "2024-07-31"});

            expect(window.mode).toBe("backfill");
            expect(window.fromDate).toBe("20220422");
            expect(window.toDate).toBe("20260730");
        });

        it("tops up when the stored history already reaches the strategy depth", () => {
            const window = decideFetchWindow("2026-07-29", TODAY, {...STRATEGY_OPTS, earliestBarDate: "2022-05-22"});

            expect(window.mode).toBe("topup");
            expect(window.fromDate).toBe("20260720");
        });

        it("sizes a stale-gap backfill by the requested calendar days", () => {
            const window = decideFetchWindow("2026-07-01", TODAY, STRATEGY_OPTS);

            expect(window.mode).toBe("backfill");
            expect(window.fromDate).toBe("20220422");
        });

        it("still backfills with no history at all under a custom depth", () => {
            const window = decideFetchWindow(null, TODAY, STRATEGY_OPTS);

            expect(window.mode).toBe("backfill");
            expect(window.fromDate).toBe("20220422");
        });
    });
});

describe("computeSignals", () => {
    const GROWTH = 1.01;

    it("computes exact momentum returns on a constant-growth series", () => {
        // close[i] = 100 * g^i, so every N-day return is exactly g^N - 1.
        const signals = computeSignals(growthSeries(253, GROWTH));

        expect(signals.r63).toBeCloseTo(Math.pow(GROWTH, 63) - 1, 12);
        expect(signals.r126).toBeCloseTo(Math.pow(GROWTH, 126) - 1, 12);
        expect(signals.r252).toBeCloseTo(Math.pow(GROWTH, 252) - 1, 12);
    });

    it("reports zero vol for a constant-growth series (identical log returns)", () => {
        const signals = computeSignals(growthSeries(253, GROWTH));

        expect(signals.vol63).not.toBeNull();
        expect(signals.vol63).toBeCloseTo(0, 12);
    });

    it("reports exactly zero vol for a flat series", () => {
        const signals = computeSignals(seriesOf(Array.from({length: 64}, () => 100)));

        expect(signals.vol63).toBe(0);
    });

    it("matches the closed-form MA200 distance for a geometric series", () => {
        const signals = computeSignals(growthSeries(253, GROWTH));
        // SMA of the last 200 closes of a geometric series has a closed form:
        // last / SMA - 1 = 200 * (1 - 1/g) / (1 - g^-200) - 1.
        const expected = (200 * (1 - 1 / GROWTH)) / (1 - Math.pow(GROWTH, -200)) - 1;

        expect(signals.ma200dist).toBeCloseTo(expected, 8);
    });

    it("computes the annualized population stdev of log returns on an alternating series", () => {
        // 64 closes alternating 100/110 → 63 log returns of ±ln(1.1):
        // 32 positive, 31 negative → mean a/63, variance a^2 * (1 - 1/63^2).
        const closes = Array.from({length: 64}, (_, i) => (i % 2 === 0 ? 100 : 110));
        const a = Math.log(1.1);
        const expected = a * Math.sqrt(1 - 1 / (63 * 63)) * Math.sqrt(252);

        const signals = computeSignals(seriesOf(closes));

        expect(signals.vol63).toBeCloseTo(expected, 10);
    });

    it("returns null below each history threshold and a value right at it", () => {
        const at63 = computeSignals(growthSeries(63, GROWTH));
        expect(at63.r63).toBeNull();
        expect(at63.vol63).toBeNull();

        const at64 = computeSignals(growthSeries(64, GROWTH));
        expect(at64.r63).toBeCloseTo(Math.pow(GROWTH, 63) - 1, 12);
        expect(at64.vol63).not.toBeNull();
        expect(at64.r126).toBeNull();

        const at126 = computeSignals(growthSeries(126, GROWTH));
        expect(at126.r126).toBeNull();
        const at127 = computeSignals(growthSeries(127, GROWTH));
        expect(at127.r126).toBeCloseTo(Math.pow(GROWTH, 126) - 1, 12);
        expect(at127.r252).toBeNull();

        const at199 = computeSignals(growthSeries(199, GROWTH));
        expect(at199.ma200dist).toBeNull();
        const at200 = computeSignals(growthSeries(200, GROWTH));
        expect(at200.ma200dist).not.toBeNull();

        const at252 = computeSignals(growthSeries(252, GROWTH));
        expect(at252.r252).toBeNull();
        const at253 = computeSignals(growthSeries(253, GROWTH));
        expect(at253.r252).toBeCloseTo(Math.pow(GROWTH, 252) - 1, 12);
    });

    it("returns all nulls for an empty series", () => {
        expect(computeSignals([])).toEqual({
            r63: null,
            r126: null,
            r252: null,
            vol63: null,
            ma200dist: null,
        });
    });
});

describe("fetchStooqDaily", () => {
    beforeEach(() => {
        // Failures log by design; keep test output clean.
        vi.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it("requests the lowercased .us symbol with d1/d2 and parses the CSV body", async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(HAPPY_CSV, {status: 200}));
        vi.stubGlobal("fetch", fetchMock);

        const bars = await fetchStooqDaily("AAPL", "20260720", "20260730");

        expect(fetchMock).toHaveBeenCalledWith(
            "https://stooq.com/q/d/l/?s=aapl.us&i=d&d1=20260720&d2=20260730",
            {cache: "no-store", headers: {"User-Agent": "AeroTrade/1.0"}},
        );
        expect(bars).toHaveLength(3);
        expect(bars[0]).toEqual({date: "2026-07-27", close: 102.75, open: 101, high: 103.5, low: 100.2, volume: 1500000});
    });

    it("returns [] on a non-ok response", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", {status: 503})));

        expect(await fetchStooqDaily("aapl", "20260720", "20260730")).toEqual([]);
    });

    it("returns [] when fetch throws", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

        expect(await fetchStooqDaily("aapl", "20260720", "20260730")).toEqual([]);
    });
});
