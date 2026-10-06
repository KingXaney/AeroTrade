// Tiingo's end-of-day prices (https://www.tiingo.com/documentation/end-of-day): the landing
// terrain's first source for SPY once TIINGO_TOKEN is set (lib/landing/surface-store.ts). The price
// jobs do not use it — Yahoo and Stooq fill PriceBar — so this only ever reads.
//
// Parsing is pure and the payload untrusted, as with Yahoo: a non-conforming shape yields [] rather
// than a throw. The token travels in the Authorization header, never in a URL, so it is in no log
// line. The fetch is cached by Next for TIINGO_REVALIDATE_SECONDS — only a 200 is ever cached, so
// an outage is retried on the next request — and a deployment asks Tiingo about once an hour for
// the terrain, against a free tier of 50 requests an hour and 1,000 a day (checked 2026-10-06).

import {addCalendarDays} from "@/lib/dates";
import {easternParts, isTradingDay} from "@/lib/prices/market-hours";
import type {Bar} from "@/lib/prices/signals";

export const TIINGO_DEFAULT_API_URL = 'https://api.tiingo.com';
// Tiingo publishes a session's prices by about 5:30 pm ET; corrections may follow until 8 pm.
export const TIINGO_PUBLISH_MINUTES = 17 * 60 + 30;
export const TIINGO_REVALIDATE_SECONDS = 60 * 60;

const tokenOf = (): string | undefined => {
    const token = process.env.TIINGO_TOKEN?.trim();
    return token ? token : undefined;
};

export const tiingoConfigured = (): boolean => tokenOf() !== undefined;

// Overridable so the browser QA can stand a server in for Tiingo (scripts/qa/start-tiingo-stub.mjs).
const apiUrl = (): string => process.env.TIINGO_API_URL?.trim() || TIINGO_DEFAULT_API_URL;

export const tiingoPricesUrl = (symbol: string, {from, to}: {from: string; to?: string}, base: string = TIINGO_DEFAULT_API_URL): string => {
    const params = new URLSearchParams({startDate: from, resampleFreq: 'daily'});
    if (to !== undefined) params.set('endDate', to);
    return `${base.replace(/\/+$/, '')}/tiingo/daily/${encodeURIComponent(symbol.toLowerCase())}/prices?${params.toString()}`;
};

// The first session a payload must not include yet. Before Tiingo's publication hour on a trading
// day that is today — a row for it would be preliminary at best; from then on, tomorrow, so the
// day's close is in. (Yahoo's parser excludes today always: its chart carries the in-progress bar.)
export const tiingoCutoff = (now: Date = new Date()): string => {
    const {date, minutes} = easternParts(now);
    return isTradingDay(date) && minutes < TIINGO_PUBLISH_MINUTES ? date : addCalendarDays(date, 1);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const finite = (value: unknown): number | undefined =>
    typeof value === 'number' && Number.isFinite(value) ? value : undefined;

// A zero or negative price is a bad row, not a price (see Yahoo's parser).
const positive = (value: unknown): number | undefined => {
    const number = finite(value);
    return number !== undefined && number > 0 ? number : undefined;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;

// Each row's `date` is '2026-10-06T00:00:00.000Z': a date label at midnight UTC, so its first ten
// characters are the session — never a conversion through a zone, which would move it a day.
// `divCash` is the cash dividend per share with its ex-date on the row, 0 when none; the provider
// states it, so unlike Yahoo's first bar every row carries a known value. A repeated date keeps the
// later row.
export const parseTiingoDaily = (json: unknown, {excludeFrom}: {excludeFrom: string}): Bar[] => {
    if (!Array.isArray(json)) return [];
    const byDate = new Map<string, Bar>();
    for (const row of json) {
        if (!isRecord(row) || typeof row.date !== 'string') continue;
        const date = row.date.slice(0, 10);
        if (!DATE.test(date) || date >= excludeFrom) continue;
        const close = positive(row.close);
        if (close === undefined) continue;
        const bar: Bar = {date, close};
        const open = positive(row.open);
        const high = positive(row.high);
        const low = positive(row.low);
        const volume = finite(row.volume);
        const adjClose = positive(row.adjClose);
        if (open !== undefined) bar.open = open;
        if (high !== undefined) bar.high = high;
        if (low !== undefined) bar.low = low;
        if (volume !== undefined) bar.volume = volume;
        if (adjClose !== undefined) bar.adjClose = adjClose;
        const divCash = finite(row.divCash);
        bar.dividend = divCash !== undefined && divCash > 0 ? divCash : 0;
        byDate.set(date, bar);
    }
    return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
};

type FetchOptions = {revalidateSeconds?: number; now?: Date};

// Daily bars for `symbol` from `from` (through `to`, else the latest published), ascending; [] with
// no token, on any HTTP error or a thrown fetch, so a caller falls back rather than failing.
export const fetchTiingoDaily = async (
    symbol: string,
    {from, to}: {from: string; to?: string},
    {revalidateSeconds = TIINGO_REVALIDATE_SECONDS, now = new Date()}: FetchOptions = {},
): Promise<Bar[]> => {
    const token = tokenOf();
    if (token === undefined) return [];
    const url = tiingoPricesUrl(symbol, {from, to}, apiUrl());
    try {
        const response = await fetch(url, {
            cache: 'force-cache',
            next: {revalidate: revalidateSeconds},
            headers: {'Content-Type': 'application/json', Authorization: `Token ${token}`},
        });
        if (!response.ok) {
            console.error(`Tiingo fetch failed for ${symbol}: HTTP ${response.status}`);
            return [];
        }
        const json: unknown = await response.json();
        return parseTiingoDaily(json, {excludeFrom: tiingoCutoff(now)});
    } catch (error) {
        console.error(`Tiingo fetch threw for ${symbol}`, error);
        return [];
    }
};
