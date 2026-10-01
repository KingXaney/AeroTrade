// Yahoo Finance daily chart client — the primary EOD provider. Parsing is pure
// so vitest can cover it without any network; the payload is treated as
// untrusted and any non-conforming shape yields [] rather than a throw.

import {type Bar} from "@/lib/prices/signals";
import {getEasternDateString} from "@/lib/dates";

export type YahooRange = "1mo" | "2y" | "5y";

type YahooQuote = {
    open?: unknown[];
    high?: unknown[];
    low?: unknown[];
    close?: unknown[];
    volume?: unknown[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

const finiteAt = (list: unknown[] | undefined, index: number): number | undefined => {
    const value = list?.[index];
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
};

// Providers emit 0 for a bad price; a zero low would pin a Donchian channel and a zero
// close would poison every average, so prices must be positive. Volume may be zero.
const positiveAt = (list: unknown[] | undefined, index: number): number | undefined => {
    const value = finiteAt(list, index);
    return value !== undefined && value > 0 ? value : undefined;
};

// Yahoo's timestamps are the session open in epoch seconds (09:30 ET), so the
// ET calendar date is the bar's trading date whether the clock is on EDT or EST.
const barDateOf = (timestampSeconds: number): string =>
    getEasternDateString(new Date(timestampSeconds * 1000));

// The `events` query param is deliberately absent — adding it drew a 429; the
// plain chart already carries split-adjusted OHLCV plus `adjclose`.
export const yahooChartUrl = (symbol: string, range: YahooRange): string =>
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol.toUpperCase())}?range=${range}&interval=1d`;

export const parseYahooChart = (json: unknown, {excludeFrom}: {excludeFrom: string}): Bar[] => {
    if (!isRecord(json) || !isRecord(json.chart) || !Array.isArray(json.chart.result)) {
        return [];
    }
    const result: unknown = json.chart.result[0];
    if (!isRecord(result) || !Array.isArray(result.timestamp) || !isRecord(result.indicators)) {
        return [];
    }
    const {indicators, timestamp: timestamps} = result;
    const quote: unknown = Array.isArray(indicators.quote) ? indicators.quote[0] : undefined;
    if (!isRecord(quote) || !Array.isArray(quote.close)) {
        return [];
    }
    const adjcloseHolder: unknown = Array.isArray(indicators.adjclose) ? indicators.adjclose[0] : undefined;
    const adjcloses = isRecord(adjcloseHolder) && Array.isArray(adjcloseHolder.adjclose)
        ? adjcloseHolder.adjclose
        : undefined;
    const series = quote as YahooQuote;

    // Keyed by date so a repeated session (Yahoo occasionally emits one) keeps
    // the later row, which is the corrected one.
    const byDate = new Map<string, Bar>();
    timestamps.forEach((timestamp, index) => {
        if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) {
            return;
        }
        // A null (or zero) close is a row Yahoo has not settled — skip it rather than store a hole.
        const close = positiveAt(series.close, index);
        if (close === undefined) {
            return;
        }
        const date = barDateOf(timestamp);
        // During the session the last row is today's in-progress bar; it would
        // otherwise be stored as a settled close and never corrected.
        if (date >= excludeFrom) {
            return;
        }
        const bar: Bar = {date, close};
        const open = positiveAt(series.open, index);
        const high = positiveAt(series.high, index);
        const low = positiveAt(series.low, index);
        const volume = finiteAt(series.volume, index);
        const adjClose = positiveAt(adjcloses, index);
        if (open !== undefined) bar.open = open;
        if (high !== undefined) bar.high = high;
        if (low !== undefined) bar.low = low;
        if (volume !== undefined) bar.volume = volume;
        if (adjClose !== undefined) bar.adjClose = adjClose;
        byDate.set(date, bar);
    });

    return inferDividends(Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date)));
};

// Below this fraction of the price an adjclose step is float noise, not a dividend. Measured
// across twelve symbols over five years: noise peaks at 8.8e-7 of price (BIL) and the
// smallest real dividend is 4.7e-5 (NVDA's $0.004 in 2024), so 1e-5 sits an order of
// magnitude clear of both.
export const DIVIDEND_NOISE_FLOOR = 1e-5;

// Yahoo builds adjclose by discounting every earlier price at each ex-date, so the step in
// adjClose/close between two consecutive bars recovers that day's dividend exactly:
//   dividend[t] = close[t-1] × (1 − (adj[t-1]/close[t-1]) / (adj[t]/close[t]))
// Validated against Yahoo's own dividend feed: 278 dividends, none missed, none spurious.
//
// Only valid INSIDE one payload — Yahoo rebases every historical adjclose on each new
// distribution, so stored rows from different fetches must never be compared this way.
// That is why this runs at parse time and the result is stored as a plain amount. It also
// avoids the chart's `events` param, which drew a 429 (see yahooChartUrl).
//
// A bar is left WITHOUT a dividend (unknown) when it is the first of the payload or either
// side lacks an adjclose — never 0, or a later payload would overwrite a real value with it.
export const inferDividends = (bars: Bar[]): Bar[] => {
    for (let i = 1; i < bars.length; i += 1) {
        const prev = bars[i - 1];
        const cur = bars[i];
        if (prev.adjClose === undefined || cur.adjClose === undefined) continue;
        const ratio = (prev.adjClose / prev.close) / (cur.adjClose / cur.close);
        const amount = prev.close * (1 - ratio);
        cur.dividend = amount > DIVIDEND_NOISE_FLOOR * prev.close ? amount : 0;
    }
    return bars;
};

// The dates this payload can vouch for: the unbroken run of bars carrying a dividend value,
// ending at the last bar. Null when the payload vouches for nothing.
export const dividendCoverage = (bars: readonly Bar[]): {from: string; through: string} | null => {
    let from: string | null = null;
    for (let i = bars.length - 1; i >= 0 && bars[i].dividend !== undefined; i -= 1) from = bars[i].date;
    return from === null ? null : {from, through: bars[bars.length - 1].date};
};

export const fetchYahooDaily = async (
    symbol: string,
    {range}: {range: YahooRange},
): Promise<Bar[]> => {
    const url = yahooChartUrl(symbol, range);
    try {
        const response = await fetch(url, {
            cache: "no-store",
            headers: {"User-Agent": "Mozilla/5.0"},
        });
        if (!response.ok) {
            console.error(`Yahoo fetch failed for ${symbol}: HTTP ${response.status}`);
            return [];
        }
        const json: unknown = await response.json();
        return parseYahooChart(json, {excludeFrom: getEasternDateString()});
    } catch (error) {
        console.error(`Yahoo fetch threw for ${symbol}`, error);
        return [];
    }
};
