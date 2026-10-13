// The earnings calendar: when each listed owner last reported, so the Quiet picker can measure
// the attention that built since — what the market could not have learned from the report.
// One Finnhub request for the whole window (no per-symbol calls), filtered to the catalog's
// tickers. Whether the free tier serves the calendar is checked by the first weekly run: an
// empty or refused answer leaves every date null, and the term reads as neutral.

import {addCalendarDays} from "@/lib/dates";

const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';
// How far back a report counts as "the last": a quarter and some.
export const EARNINGS_LOOKBACK_DAYS = 120;
export const EARNINGS_LOOKAHEAD_DAYS = 45;

export type ReportDates = {lastReportDate: string | null; nextReportDate: string | null};

export const earningsCalendarUrl = (key: string, from: string, to: string): string =>
    `${FINNHUB_BASE_URL}/calendar/earnings?from=${from}&to=${to}&token=${encodeURIComponent(key)}`;

type CalendarRow = {symbol: string; date: string};

// The calendar's rows with a symbol and a day; anything else is skipped.
export const parseEarningsCalendar = (json: unknown): CalendarRow[] => {
    const rows = (json as {earningsCalendar?: unknown[]} | null)?.earningsCalendar;
    if (!Array.isArray(rows)) return [];
    const out: CalendarRow[] = [];
    for (const row of rows) {
        const item = row as {symbol?: unknown; date?: unknown} | null;
        if (!item || typeof item.symbol !== 'string' || typeof item.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(item.date)) continue;
        out.push({symbol: item.symbol.toUpperCase(), date: item.date});
    }
    return out;
};

// Each symbol's last report on or before `today` and next after it, from the calendar's rows.
export const reportDatesFor = (rows: readonly CalendarRow[], symbols: readonly string[], today: string): Map<string, ReportDates> => {
    const wanted = new Set(symbols.map((s) => s.toUpperCase()));
    const out = new Map<string, ReportDates>();
    for (const symbol of wanted) out.set(symbol, {lastReportDate: null, nextReportDate: null});
    for (const row of rows) {
        const dates = out.get(row.symbol);
        if (!dates) continue;
        if (row.date <= today) {
            if (dates.lastReportDate === null || row.date > dates.lastReportDate) dates.lastReportDate = row.date;
        } else if (dates.nextReportDate === null || row.date < dates.nextReportDate) {
            dates.nextReportDate = row.date;
        }
    }
    return out;
};

type FetchOptions = {fetchImpl?: typeof fetch; env?: Readonly<Record<string, string | undefined>>};

export type EarningsFetch = {dates: Map<string, ReportDates>; ok: boolean; skipped: boolean; rows: number};

export const fetchReportDates = async (
    symbols: readonly string[],
    today: string,
    {fetchImpl = fetch, env = process.env}: FetchOptions = {},
): Promise<EarningsFetch> => {
    const key = env.FINNHUB_API_KEY ?? env.NEXT_PUBLIC_FINNHUB_API_KEY ?? '';
    if (!key) return {dates: new Map(), ok: true, skipped: true, rows: 0};
    try {
        const response = await fetchImpl(
            earningsCalendarUrl(key, addCalendarDays(today, -EARNINGS_LOOKBACK_DAYS), addCalendarDays(today, EARNINGS_LOOKAHEAD_DAYS)),
            {cache: 'no-store'},
        );
        if (!response.ok) return {dates: new Map(), ok: false, skipped: false, rows: 0};
        const rows = parseEarningsCalendar(await response.json());
        return {dates: reportDatesFor(rows, symbols, today), ok: true, skipped: false, rows: rows.length};
    } catch (error) {
        console.error('Earnings calendar failed:', error);
        return {dates: new Map(), ok: false, skipped: false, rows: 0};
    }
};
