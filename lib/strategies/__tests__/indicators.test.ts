import {describe, expect, it} from "vitest";
import type {Bar} from "@/lib/prices/signals";
import {
    closesOf,
    laggedReturn,
    rank,
    realizedVol,
    rollingHigh,
    rollingLow,
    sma,
    trailingReturn,
    wilderRsi,
} from "@/lib/strategies/indicators";
import {RSI_LOOKBACK} from "@/lib/strategies/config";

const bars = (closes: number[], extra?: (i: number) => Partial<Bar>): Bar[] =>
    closes.map((close, i) => ({date: `d${i}`, close, ...(extra ? extra(i) : {})}));

describe("closesOf", () => {
    it("reads closes, and adjusted closes with a per-bar fallback", () => {
        const series = [{date: 'a', close: 10, adjClose: 9}, {date: 'b', close: 11}];
        expect(closesOf(series)).toEqual([10, 11]);
        expect(closesOf(series, 'adjClose')).toEqual([9, 11]);
    });
});

describe("sma", () => {
    it("averages the last n values and is null under the window", () => {
        expect(sma([1, 2, 3, 4], 2)).toBe(3.5);
        expect(sma([1, 2, 3, 4], 4)).toBe(2.5);
        expect(sma([1, 2, 3], 4)).toBeNull();
        expect(sma([1], 0)).toBeNull();
    });
});

describe("wilderRsi", () => {
    const rising = Array.from({length: RSI_LOOKBACK + 1}, (_, i) => 100 + i);
    const flat = Array.from({length: RSI_LOOKBACK + 1}, () => 100);

    it("is 100 on a monotonic rise, 50 on a flat series, and null under the lookback", () => {
        expect(wilderRsi(rising, 2)).toBe(100);
        expect(wilderRsi(flat, 2)).toBe(50);
        expect(wilderRsi(rising.slice(0, RSI_LOOKBACK), 2)).toBeNull();
    });

    it("reads oversold after consecutive drops", () => {
        const series = [...rising.slice(0, RSI_LOOKBACK - 2), 200, 190, 180];
        const rsi = wilderRsi(series, 2);
        expect(rsi).not.toBeNull();
        expect(rsi as number).toBeLessThan(10);
    });

    it("does not depend on history older than the lookback", () => {
        const noise = Array.from({length: 50}, (_, i) => 500 - i * 7);
        expect(wilderRsi([...noise, ...rising], 2)).toBe(wilderRsi(rising, 2));
    });

    it("matches a hand-computed Wilder sequence", () => {
        // lookback 3, period 2: diffs +1, -1, +3 → seed avgGain .5 avgLoss .5, then
        // avgGain = (.5*1 + 3)/2 = 1.75, avgLoss = (.5*1 + 0)/2 = .25 → RS 7 → RSI 87.5
        expect(wilderRsi([10, 11, 10, 13], 2, 3)).toBeCloseTo(87.5, 10);
    });
});

describe("returns", () => {
    const series = [100, 110, 120, 130, 140];

    it("trailingReturn ends at the latest bar", () => {
        expect(trailingReturn(series, 4)).toBeCloseTo(0.4, 12);
        expect(trailingReturn(series, 1)).toBeCloseTo(140 / 130 - 1, 12);
        expect(trailingReturn(series, 5)).toBeNull();
    });

    it("laggedReturn skips the most recent bars", () => {
        // from 4 bars ago (100) to 1 bar ago (130)
        expect(laggedReturn(series, 4, 1)).toBeCloseTo(0.3, 12);
        expect(laggedReturn(series, 1, 1)).toBeNull();
        expect(laggedReturn([0, 1, 2], 2, 0)).toBeNull();
    });
});

describe("realizedVol", () => {
    it("is zero on a constant series and null under the window", () => {
        expect(realizedVol([5, 5, 5, 5], 3)).toBe(0);
        expect(realizedVol([5, 5, 5], 3)).toBeNull();
    });

    it("matches population stdev × sqrt(252)", () => {
        const values = [100, 110, 99, 120];
        const logs = [Math.log(1.1), Math.log(0.9), Math.log(120 / 99)];
        const mean = logs.reduce((s, r) => s + r, 0) / 3;
        const variance = logs.reduce((s, r) => s + (r - mean) ** 2, 0) / 3;
        expect(realizedVol(values, 3)).toBeCloseTo(Math.sqrt(variance) * Math.sqrt(252), 12);
    });
});

describe("rolling channels", () => {
    const series = bars([10, 11, 12, 13, 14], (i) => ({high: 20 + i, low: 5 - i}));

    it("use the n bars before the current one", () => {
        // prior 2 bars of the last: indexes 2 and 3 → highs 22, 23; lows 3, 2
        expect(rollingHigh(series, 2)).toBe(23);
        expect(rollingLow(series, 2)).toBe(2);
        expect(rollingHigh(series, 4)).toBe(23);
        expect(rollingHigh(series, 5)).toBeNull();
    });

    it("are null when any bar in the window lacks the field", () => {
        const gappy = bars([10, 11, 12], (i) => (i === 0 ? {} : {high: 20, low: 5}));
        expect(rollingHigh(gappy, 2)).toBeNull();
        expect(rollingLow(gappy, 1)).toBe(5);
    });
});

describe("rank", () => {
    const items = [
        {symbol: 'B', score: 2},
        {symbol: 'A', score: 2},
        {symbol: 'C', score: 5},
    ];

    it("sorts by key and breaks ties alphabetically", () => {
        expect(rank(items, (i) => i.score, 'desc').map((i) => i.symbol)).toEqual(['C', 'A', 'B']);
        expect(rank(items, (i) => i.score, 'asc').map((i) => i.symbol)).toEqual(['A', 'B', 'C']);
    });

    it("does not mutate its input", () => {
        rank(items, (i) => i.score, 'asc');
        expect(items.map((i) => i.symbol)).toEqual(['B', 'A', 'C']);
    });
});
