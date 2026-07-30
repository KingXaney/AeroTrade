// Stooq daily EOD client. CSV parsing and fetch-window planning are pure so
// vitest can cover them without any network or database.

import {
    BACKFILL_CALENDAR_DAYS,
    BACKFILL_TRIGGER_GAP_DAYS,
    TOPUP_CALENDAR_DAYS,
} from "@/lib/prices/config";

export type StooqBar = {date: string; close: number; volume?: number};

// CSV layout is 'Date,Open,High,Low,Close,Volume' — we only keep date/close/volume.
const CLOSE_FIELD_INDEX = 4;
const VOLUME_FIELD_INDEX = 5;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const parseStooqCsv = (csv: string): StooqBar[] => {
    const body = csv.trim();
    // Stooq answers unknown symbols with a literal 'No data' body and outages
    // with an HTML error page — neither contains CSV rows.
    if (body.length === 0 || body.startsWith("<") || /^no data/i.test(body)) {
        return [];
    }

    const bars: StooqBar[] = [];
    for (const rawLine of body.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (line.length === 0) {
            continue;
        }
        const fields = line.split(",");
        // The header row ('Date,Open,...') and malformed rows both fail the
        // date-shape check, so one guard skips them all.
        if (fields.length <= CLOSE_FIELD_INDEX || !ISO_DATE_PATTERN.test(fields[0])) {
            continue;
        }
        const close = Number(fields[CLOSE_FIELD_INDEX]);
        if (!Number.isFinite(close) || close <= 0) {
            continue;
        }
        const bar: StooqBar = {date: fields[0], close};
        const volumeField = fields[VOLUME_FIELD_INDEX];
        if (volumeField !== undefined && volumeField !== "") {
            const volume = Number(volumeField);
            // A garbled volume is not worth discarding the whole bar for.
            if (Number.isFinite(volume)) {
                bar.volume = volume;
            }
        }
        bars.push(bar);
    }
    return bars;
};

// All date math runs on UTC midnights so results never depend on host TZ.
const parseUtcDate = (dateStr: string): Date => new Date(`${dateStr}T00:00:00Z`);

const minusCalendarDays = (date: Date, days: number): Date =>
    new Date(date.getTime() - days * MS_PER_DAY);

// Stooq's d1/d2 query params want compact YYYYMMDD.
const toStooqDate = (date: Date): string => date.toISOString().slice(0, 10).replace(/-/g, "");

export const decideFetchWindow = (
    latestBarDate: string | null,
    today: string,
): {mode: "backfill" | "topup"; fromDate: string; toDate: string} => {
    const todayUtc = parseUtcDate(today);
    // No history at all is treated as an infinite gap → backfill.
    const gapDays = latestBarDate === null
        ? Number.POSITIVE_INFINITY
        : Math.round((todayUtc.getTime() - parseUtcDate(latestBarDate).getTime()) / MS_PER_DAY);
    // A gap of exactly BACKFILL_TRIGGER_GAP_DAYS is still fresh enough to top up.
    const mode: "backfill" | "topup" = gapDays > BACKFILL_TRIGGER_GAP_DAYS ? "backfill" : "topup";
    const windowDays = mode === "backfill" ? BACKFILL_CALENDAR_DAYS : TOPUP_CALENDAR_DAYS;
    return {
        mode,
        fromDate: toStooqDate(minusCalendarDays(todayUtc, windowDays)),
        toDate: toStooqDate(todayUtc),
    };
};

export const fetchStooqDaily = async (
    symbol: string,
    fromDate: string,
    toDate: string,
): Promise<StooqBar[]> => {
    const url = `https://stooq.com/q/d/l/?s=${symbol.toLowerCase()}.us&i=d&d1=${fromDate}&d2=${toDate}`;
    try {
        const response = await fetch(url, {
            cache: "no-store",
            headers: {"User-Agent": "AeroTrade/1.0"},
        });
        if (!response.ok) {
            console.error(`Stooq fetch failed for ${symbol}: HTTP ${response.status}`);
            return [];
        }
        return parseStooqCsv(await response.text());
    } catch (error) {
        console.error(`Stooq fetch threw for ${symbol}`, error);
        return [];
    }
};
