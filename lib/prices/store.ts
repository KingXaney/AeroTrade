// DB side of price history: Yahoo-first (Stooq fallback) backfill/top-up into
// PriceBar + bounded bar reads for signal computation. Plain server module
// (used by the Inngest jobs).

import {connectToDatabase} from "@/database/mongoose";
import PriceBar, {type PriceBarSource} from "@/database/models/price-bar.model";
import {decideFetchWindow, fetchStooqDaily, type FetchWindow} from "@/lib/prices/stooq";
import {fetchYahooDaily, type YahooRange} from "@/lib/prices/yahoo";
import {type Bar} from "@/lib/prices/signals";
import {
    BACKFILL_CALENDAR_DAYS,
    MAX_TRACKED_SYMBOLS,
    STOOQ_DELAY_MS,
    YAHOO_DELAY_MS,
} from "@/lib/prices/config";
import {delay, getEasternDateString} from "@/lib/utils";
import {previousTradingDay} from "@/lib/prices/market-hours";

export type EnsureBarsOptions = {
    limit?: number;
    backfillCalendarDays?: number;
    // Strategies that fill at the open or read Donchian channels cannot run on
    // Stooq-era close-only rows, so their symbols are re-backfilled when any
    // row in the required window lacks a high.
    requireOhlc?: boolean;
    topupRange?: YahooRange;
    forceBackfill?: boolean;
};

export type EnsureBarsResult = {
    updated: number;
    failed: string[];
    providers: Record<PriceBarSource, number>;
    // Symbols whose stored history already ended at the previous session — no call made.
    fresh: number;
};

type StoredBarEdge = {date: string; close: number} | null;
type FetchMode = FetchWindow["mode"];
type FetchOutcome = {bars: Bar[]; source: PriceBarSource} | null;

const MS_PER_DAY = 24 * 60 * 60 * 1000;
// Beyond this, a fetched close on a stored date is a split re-adjustment, not
// a provider rounding difference — the whole history must be replaced.
const OVERLAP_MISMATCH_TOLERANCE = 0.005;
// A full backfill always asks Yahoo for its longest daily range; the calendar
// window only bounds what Stooq is asked for and what "deep enough" means.
const YAHOO_BACKFILL_RANGE: YahooRange = "5y";

const minusCalendarDays = (isoDate: string, days: number): string =>
    new Date(new Date(`${isoDate}T00:00:00Z`).getTime() - days * MS_PER_DAY).toISOString().slice(0, 10);

// Only the fields the provider actually supplied are written, so a Stooq
// fallback never blanks the OHLC a previous Yahoo pass stored.
const toSetFields = (bar: Bar, source: PriceBarSource): Record<string, number | string> => {
    const fields: Record<string, number | string> = {close: bar.close, source};
    if (bar.open !== undefined) fields.open = bar.open;
    if (bar.high !== undefined) fields.high = bar.high;
    if (bar.low !== undefined) fields.low = bar.low;
    if (bar.volume !== undefined) fields.volume = bar.volume;
    if (bar.adjClose !== undefined) fields.adjClose = bar.adjClose;
    return fields;
};

const closesDiffer = (fetched: number, stored: number): boolean =>
    Math.abs(fetched - stored) / stored > OVERLAP_MISMATCH_TOLERANCE;

// Yahoo first (OHLCV + adjclose), Stooq only when Yahoo returns nothing. Each
// provider call is followed by its own polite spacing.
const fetchFromProviders = async (
    symbol: string,
    window: FetchWindow,
    today: string,
    topupRange: YahooRange,
): Promise<FetchOutcome> => {
    const yahooBars = await fetchYahooDaily(symbol, {
        range: window.mode === "backfill" ? YAHOO_BACKFILL_RANGE : topupRange,
    });
    await delay(YAHOO_DELAY_MS);
    if (yahooBars.length > 0) {
        return {bars: yahooBars, source: "yahoo"};
    }

    const stooqBars = (await fetchStooqDaily(symbol, window.fromDate, window.toDate))
        // Stooq can include today's session after the close; bars end at the
        // previous close everywhere else, so keep that invariant here too.
        .filter((bar) => bar.date < today);
    await delay(STOOQ_DELAY_MS);
    return stooqBars.length > 0 ? {bars: stooqBars, source: "stooq"} : null;
};

// Sequential + politely spaced; per-symbol failure isolation — a dead symbol
// degrades its own signals to null, never the run.
export const ensureBars = async (
    symbols: string[],
    {
        limit = MAX_TRACKED_SYMBOLS,
        backfillCalendarDays = BACKFILL_CALENDAR_DAYS,
        requireOhlc = false,
        topupRange = "1mo",
        forceBackfill = false,
    }: EnsureBarsOptions = {},
): Promise<EnsureBarsResult> => {
    await connectToDatabase();
    const unique = Array.from(new Set(symbols.map((s) => s.toUpperCase()))).filter(Boolean).slice(0, limit);
    const today = getEasternDateString();
    const requiredFrom = minusCalendarDays(today, backfillCalendarDays);
    let updated = 0;
    let fresh = 0;
    const failed: string[] = [];
    const providers: Record<PriceBarSource, number> = {yahoo: 0, stooq: 0};
    const previousSession = previousTradingDay(today);

    for (const symbol of unique) {
        try {
            const latest = await PriceBar.findOne({symbol}).sort({date: -1}).lean<StoredBarEdge>();
            const earliest = await PriceBar.findOne({symbol}).sort({date: 1}).lean<StoredBarEdge>();
            const planned = decideFetchWindow(latest?.date ?? null, today, {
                earliestBarDate: earliest?.date ?? null,
                backfillCalendarDays,
            });
            const missingOhlc = requireOhlc && planned.mode === "topup"
                ? await PriceBar.exists({symbol, date: {$gte: requiredFrom}, high: {$exists: false}}) !== null
                : false;
            // Already current through the previous session and nothing to repair: a step
            // retry or the late-morning rerun must not re-spend a provider call per symbol.
            if (planned.mode === "topup" && !forceBackfill && !missingOhlc && latest !== null && latest.date >= previousSession) {
                fresh += 1;
                continue;
            }
            // A forced backfill keeps the planned window's dates only when it
            // already was one; otherwise the deep window is planned afresh.
            const windowFor = (mode: FetchMode): FetchWindow =>
                mode === planned.mode ? planned : decideFetchWindow(null, today, {backfillCalendarDays});
            let window = windowFor(forceBackfill || missingOhlc ? "backfill" : planned.mode);

            let outcome = await fetchFromProviders(symbol, window, today, topupRange);
            if (outcome !== null && window.mode === "topup" && latest !== null) {
                // The fetched bar for the stored latest date must agree with what
                // we hold; a split re-adjusts every older close, so one mismatch
                // means the whole stored history is on a different basis.
                const overlap = outcome.bars.find((bar) => bar.date === latest.date);
                if (overlap !== undefined && closesDiffer(overlap.close, latest.close)) {
                    console.warn(`Price bars re-adjusted for ${symbol} on ${latest.date}; backfilling`);
                    window = windowFor("backfill");
                    outcome = await fetchFromProviders(symbol, window, today, topupRange);
                }
            }
            if (outcome === null) {
                failed.push(symbol);
                continue;
            }

            const {bars, source} = outcome;
            await PriceBar.bulkWrite(bars.map((bar) => ({
                updateOne: {
                    filter: {symbol, date: bar.date},
                    update: {$set: toSetFields(bar, source)},
                    upsert: true,
                },
            })), {ordered: false});
            providers[source] += 1;
            updated++;
        } catch (error) {
            console.error(`Price bars failed for ${symbol}:`, error);
            failed.push(symbol);
        }
    }
    return {updated, failed, providers, fresh};
};

type LeanPriceBar = {
    symbol: string;
    date: string;
    close: number;
    open?: number | null;
    high?: number | null;
    low?: number | null;
    volume?: number | null;
    adjClose?: number | null;
};

const BAR_PROJECTION = {_id: 0, symbol: 1, date: 1, close: 1, open: 1, high: 1, low: 1, volume: 1, adjClose: 1} as const;

const toBar = (doc: LeanPriceBar): Bar => {
    const bar: Bar = {date: doc.date, close: doc.close};
    if (typeof doc.open === "number") bar.open = doc.open;
    if (typeof doc.high === "number") bar.high = doc.high;
    if (typeof doc.low === "number") bar.low = doc.low;
    if (typeof doc.volume === "number") bar.volume = doc.volume;
    if (typeof doc.adjClose === "number") bar.adjClose = doc.adjClose;
    return bar;
};

// Ascending bars per symbol, ready for computeSignals. Inclusive date bounds:
// after the deep backfill a bare read is ~74k documents, so callers pass `from`.
export const getBarsForSymbols = async (
    symbols: string[],
    {from, to}: {from?: string; to?: string} = {},
): Promise<Map<string, Bar[]>> => {
    await connectToDatabase();
    const unique = Array.from(new Set(symbols.map((s) => s.toUpperCase()))).filter(Boolean);
    const map = new Map<string, Bar[]>();
    if (unique.length === 0) return map;

    const dateFilter: Record<string, string> = {};
    if (from !== undefined) dateFilter.$gte = from;
    if (to !== undefined) dateFilter.$lte = to;
    const filter = {
        symbol: {$in: unique},
        ...(Object.keys(dateFilter).length > 0 ? {date: dateFilter} : {}),
    };

    const docs = await PriceBar.find(filter, BAR_PROJECTION).sort({date: 1}).lean<LeanPriceBar[]>();
    for (const doc of docs) {
        const list = map.get(doc.symbol) ?? [];
        list.push(toBar(doc));
        map.set(doc.symbol, list);
    }
    return map;
};
