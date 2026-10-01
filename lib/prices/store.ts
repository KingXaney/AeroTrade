// DB side of price history: Yahoo-first (Stooq fallback) backfill/top-up into
// PriceBar + bounded bar reads for signal computation. Plain server module
// (used by the Inngest jobs).

import {connectToDatabase} from "@/database/mongoose";
import PriceBar, {type PriceBarSource} from "@/database/models/price-bar.model";
import PriceSeriesMeta from "@/database/models/price-series-meta.model";
import {decideFetchWindow, fetchStooqDaily, type FetchWindow} from "@/lib/prices/stooq";
import {dividendCoverage, fetchYahooDaily, type YahooRange} from "@/lib/prices/yahoo";
import {mergeCoverage, type CoverageRange} from "@/lib/prices/coverage";
import {type Bar} from "@/lib/prices/signals";
import {BAR_PROJECTION, toBar, toSetFields, type LeanPriceBar} from "@/lib/prices/bar-fields";
import type {DividendPoint, RatePoint} from "@/lib/prices/types";
import {
    BACKFILL_CALENDAR_DAYS,
    MAX_TRACKED_SYMBOLS,
    RATE_SYMBOL,
    STOOQ_DELAY_MS,
    YAHOO_DELAY_MS,
} from "@/lib/prices/config";
import {previousTradingDay} from "@/lib/prices/market-hours";
import {addCalendarDays, getEasternDateString} from "@/lib/dates";

type EnsureBarsOptions = {
    limit?: number;
    backfillCalendarDays?: number;
    // Strategies that fill at the open or read Donchian channels cannot run on
    // Stooq-era close-only rows, so their symbols are re-backfilled when any
    // row in the required window lacks a high.
    requireOhlc?: boolean;
    topupRange?: YahooRange;
    forceBackfill?: boolean;
};

type EnsureBarsResult = {
    updated: number;
    failed: string[];
    providers: Record<PriceBarSource, number>;
    // Symbols whose stored history already ended at the previous session — no call made.
    fresh: number;
};

type StoredBarEdge = {date: string; close: number} | null;
type FetchMode = FetchWindow["mode"];
type FetchOutcome = {bars: Bar[]; source: PriceBarSource} | null;

// Beyond this, a fetched close on a stored date is a split re-adjustment, not
// a provider rounding difference — the whole history must be replaced.
const OVERLAP_MISMATCH_TOLERANCE = 0.005;
// A full backfill always asks Yahoo for its longest daily range; the calendar
// window only bounds what Stooq is asked for and what "deep enough" means.
const YAHOO_BACKFILL_RANGE: YahooRange = "5y";

// The spacing between provider calls (YAHOO_DELAY_MS, STOOQ_DELAY_MS).
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type StoredCoverage = {dividendsFrom?: string; dividendsThrough?: string} | null;

const toRange = (doc: StoredCoverage): CoverageRange | null =>
    doc?.dividendsFrom && doc.dividendsThrough ? {from: doc.dividendsFrom, through: doc.dividendsThrough} : null;

// After a Yahoo write: extend the trusted range with what this payload vouched for, and end
// any failing streak. Stooq never reaches here — it carries no adjclose, so no dividends.
const recordCoverage = async (symbol: string, bars: Bar[]): Promise<void> => {
    const stored = await PriceSeriesMeta.findOne({symbol}).lean<StoredCoverage>();
    const merged = mergeCoverage(toRange(stored), dividendCoverage(bars));
    await PriceSeriesMeta.updateOne(
        {symbol},
        {
            $set: {updatedAt: new Date(), ...(merged ? {dividendsFrom: merged.from, dividendsThrough: merged.through} : {})},
            $unset: {failingSince: 1},
        },
        {upsert: true},
    );
};

// A fetch that produced no Yahoo payload starts (or continues) a failing streak, dated by its
// first day, so a symbol Yahoo stops serving can eventually be released rather than block.
// Two plain updates rather than one pipeline update: Mongoose 9 rejects pipelines unless
// opted in, and "set only if absent" needs no pipeline when split this way.
const recordFailure = async (symbol: string, today: string): Promise<void> => {
    await PriceSeriesMeta.updateOne({symbol}, {$set: {updatedAt: new Date()}, $setOnInsert: {failingSince: today}}, {upsert: true});
    await PriceSeriesMeta.updateOne({symbol, failingSince: {$exists: false}}, {$set: {failingSince: today}});
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
    const requiredFrom = addCalendarDays(today, -backfillCalendarDays);
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
            // A yield is not a price: it cannot split, and a 0.5% move on 4% is 2 basis points.
            if (outcome !== null && window.mode === "topup" && latest !== null && symbol !== RATE_SYMBOL) {
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
                await recordFailure(symbol, today);
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
            if (source === "yahoo") await recordCoverage(symbol, bars);
            else await recordFailure(symbol, today);
            providers[source] += 1;
            updated++;
        } catch (error) {
            console.error(`Price bars failed for ${symbol}:`, error);
            failed.push(symbol);
        }
    }
    return {updated, failed, providers, fresh};
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

// Each symbol's bars from its own date through `to`, ascending, in one query: an $or of
// per-symbol ranges on the {symbol, date} index, for a read whose symbols start on different
// days ("since thesis": each ticker from its own thesis date). Overlapping ranges for one
// symbol come back once, from the earliest of them.
export const getBarsFrom = async (requests: readonly {symbol: string; from: string}[], to?: string): Promise<Map<string, Bar[]>> => {
    const earliest = new Map<string, string>();
    for (const {symbol, from} of requests) {
        const key = symbol.toUpperCase();
        if (!key) continue;
        const current = earliest.get(key);
        if (current === undefined || from < current) earliest.set(key, from);
    }
    const map = new Map<string, Bar[]>();
    if (earliest.size === 0) return map;
    await connectToDatabase();
    const ranges = [...earliest].map(([symbol, from]) => ({symbol, date: {$gte: from, ...(to !== undefined ? {$lte: to} : {})}}));
    const docs = await PriceBar.find({$or: ranges}, BAR_PROJECTION).sort({date: 1}).lean<LeanPriceBar[]>();
    for (const doc of docs) {
        const list = map.get(doc.symbol) ?? [];
        list.push(toBar(doc));
        map.set(doc.symbol, list);
    }
    return map;
};

// ---------------------------------------------------------------------------
// Readiness for income: which symbols' dividends can be trusted over a window
// ---------------------------------------------------------------------------

// What each symbol's series record says: the dividend range a Yahoo payload vouched for, and
// the first day of a failing streak. A symbol with no record is absent.
type SeriesMeta = {dividendsFrom?: string; dividendsThrough?: string; failingSince?: string};

export const getSeriesMeta = async (symbols: readonly string[]): Promise<Map<string, SeriesMeta>> => {
    await connectToDatabase();
    const metas = await PriceSeriesMeta.find({symbol: {$in: [...symbols]}})
        .lean<({symbol: string} & SeriesMeta)[]>();
    return new Map(metas.map(({symbol, dividendsFrom, dividendsThrough, failingSince}) => [symbol, {dividendsFrom, dividendsThrough, failingSince}]));
};

// Symbols whose stored dividends cannot be vouched for over [from, through] — they need a
// deep refetch before anything that pays dividends (a backtest rebuild) may rely on them.
export const symbolsLackingDividendCoverage = async (symbols: string[], from: string, through: string): Promise<string[]> => {
    const unique = Array.from(new Set(symbols.map((s) => s.toUpperCase()))).filter(Boolean);
    const metas = await getSeriesMeta(unique);
    const covered = (meta: SeriesMeta | undefined): boolean =>
        meta?.dividendsFrom !== undefined && meta.dividendsThrough !== undefined && meta.dividendsFrom <= from && meta.dividendsThrough >= through;
    return unique.filter((symbol) => !covered(metas.get(symbol)));
};

// Dividends per share on their ex-dates, ascending, for the given symbols and inclusive dates.
// Narrow on purpose — three fields of the few bars that paid, answered from the partial index —
// so a request path (the Income panel's "Missed by a day") can afford it. The income job reads
// a batch's whole history: no bounds.
export const getDividendPoints = async (symbols: string[], {from, to}: {from?: string; to?: string} = {}): Promise<DividendPoint[]> => {
    const unique = Array.from(new Set(symbols.map((s) => s.toUpperCase()))).filter(Boolean);
    if (unique.length === 0 || (from !== undefined && to !== undefined && from > to)) return [];
    await connectToDatabase();
    const date: Record<string, string> = {};
    if (from !== undefined) date.$gte = from;
    if (to !== undefined) date.$lte = to;
    const bars = await PriceBar.find(
        {symbol: {$in: unique}, dividend: {$gt: 0}, ...(Object.keys(date).length > 0 ? {date} : {})},
        {_id: 0, symbol: 1, date: 1, dividend: 1},
    ).sort({date: 1}).lean<{symbol: string; date: string; dividend: number}[]>();
    return bars.map((bar) => ({symbol: bar.symbol, exDate: bar.date, perShare: bar.dividend}));
};

// A buy-at-`from`, sell-at-`to` hold needs only two closes per symbol and the dividends paid in
// between: the bars dated exactly `from` and `to` (the unique {symbol, date} index, at most two
// documents a symbol) and the dividend rows with ex-dates after `from` through `to` (the partial
// dividend index, via getDividendPoints). Never the bars in between. `from` and `to` are
// sessions; a symbol with no bar on either one is simply missing from `bars`.
export const getHoldWindowBars = async (
    symbols: string[],
    from: string,
    to: string,
): Promise<{bars: {symbol: string; date: string; close: number}[]; dividends: DividendPoint[]}> => {
    const unique = Array.from(new Set(symbols.map((s) => s.toUpperCase()))).filter(Boolean);
    if (unique.length === 0 || from > to) return {bars: [], dividends: []};
    await connectToDatabase();
    const [bars, dividends] = await Promise.all([
        PriceBar.find({symbol: {$in: unique}, date: {$in: [from, to]}}, {_id: 0, symbol: 1, date: 1, close: 1})
            .lean<{symbol: string; date: string; close: number}[]>(),
        getDividendPoints(unique, {from: addCalendarDays(from, 1), to}),
    ]);
    return {bars, dividends};
};

// The latest stored bar date for a symbol — the last session the price job has stored. One
// point read on the unique index.
export const getLatestBarDate = async (symbol: string): Promise<string | null> => {
    await connectToDatabase();
    const bar = await PriceBar.findOne({symbol: symbol.toUpperCase()}, {_id: 0, date: 1})
        .sort({date: -1})
        .lean<{date: string} | null>();
    return bar?.date ?? null;
};

// Each symbol's latest stored bar date, for the strategies job's freshness check. A symbol with
// no bars is absent.
export const getLatestBarDates = async (symbols: readonly string[]): Promise<Map<string, string>> => {
    await connectToDatabase();
    const rows = await PriceBar.aggregate<{_id: string; latest: string}>([
        {$match: {symbol: {$in: [...symbols]}}},
        {$group: {_id: '$symbol', latest: {$max: '$date'}}},
    ]);
    return new Map(rows.map((r) => [r._id, r.latest]));
};

// How many symbols have any stored bars (the /brain status strip).
export const countPricedSymbols = async (): Promise<number> => {
    await connectToDatabase();
    return (await PriceBar.distinct('symbol')).length;
};

// Each symbol's latest stored bar (date and close) from `since` through `onOrBefore`, in one
// aggregate on the unique {symbol, date} index — at most the bars inside that short range, never
// a history. A symbol with no bar in the range is absent. What a request-path read keys its day
// memo on (the data's own stamp), and how Luck or skill finds the last session its whole pool has.
export const getLatestBars = async (
    symbols: string[],
    {since, onOrBefore}: {since: string; onOrBefore: string},
): Promise<Map<string, {date: string; close: number}>> => {
    const unique = Array.from(new Set(symbols.map((s) => s.toUpperCase()))).filter(Boolean);
    if (unique.length === 0 || since > onOrBefore) return new Map();
    await connectToDatabase();
    const rows = await PriceBar.aggregate<{_id: string; date: string; close: number}>([
        {$match: {symbol: {$in: unique}, date: {$gte: since, $lte: onOrBefore}}},
        {$sort: {symbol: -1, date: -1}},
        {$group: {_id: '$symbol', date: {$first: '$date'}, close: {$first: '$close'}}},
    ]);
    return new Map(rows.map((row) => [row._id, {date: row.date, close: row.close}]));
};

// The stored T-bill series as rate points (a discount yield, annualised %). The jobs read it
// whole; a request path passes inclusive `from`/`to` so the read stays bounded.
export const getRatePoints = async ({from, to}: {from?: string; to?: string} = {}): Promise<RatePoint[]> => {
    await connectToDatabase();
    const date: Record<string, string> = {};
    if (from !== undefined) date.$gte = from;
    if (to !== undefined) date.$lte = to;
    const filter = {symbol: RATE_SYMBOL, ...(Object.keys(date).length > 0 ? {date} : {})};
    const bars = await PriceBar.find(filter, {_id: 0, date: 1, close: 1}).sort({date: 1}).lean<{date: string; close: number}[]>();
    return bars.map((bar) => ({date: bar.date, discountPct: bar.close}));
};

// The latest stored T-bill rate point, for the "earning X% APY" line.
export const getLatestRatePoint = async (): Promise<RatePoint | null> => {
    await connectToDatabase();
    const bar = await PriceBar.findOne({symbol: RATE_SYMBOL}, {_id: 0, date: 1, close: 1}).sort({date: -1}).lean<{date: string; close: number} | null>();
    return bar ? {date: bar.date, discountPct: bar.close} : null;
};
