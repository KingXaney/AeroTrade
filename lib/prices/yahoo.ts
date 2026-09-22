// Yahoo Finance daily chart client — the primary EOD provider. Parsing is pure
// so vitest can cover it without any network; the payload is treated as
// untrusted and any non-conforming shape yields [] rather than a throw.

import {type Bar} from "@/lib/prices/signals";
import {getEasternDateString} from "@/lib/utils";

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
        // A null close is a row Yahoo has not settled — skip it rather than store a hole.
        const close = finiteAt(series.close, index);
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
        const open = finiteAt(series.open, index);
        const high = finiteAt(series.high, index);
        const low = finiteAt(series.low, index);
        const volume = finiteAt(series.volume, index);
        const adjClose = finiteAt(adjcloses, index);
        if (open !== undefined) bar.open = open;
        if (high !== undefined) bar.high = high;
        if (low !== undefined) bar.low = low;
        if (volume !== undefined) bar.volume = volume;
        if (adjClose !== undefined) bar.adjClose = adjClose;
        byDate.set(date, bar);
    });

    return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
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
