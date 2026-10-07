// The stored backtest's reads and its build (NOT a 'use server' module): the stamp the weekly
// job decides a rebuild on, the readiness guard (never a build on partial dividend or rate
// data), the build itself — bars, pageviews and the T-bill series loaded once, the three
// variants simulated by the pure lib/culture/simulator.ts, saved whole — and the page's view.
// Writes only CultureBacktest, never an account.

import CultureBacktest from "@/database/models/culture-backtest.model";
import {connectToDatabase} from "@/database/mongoose";
import {CULTURE_BRANDS} from "@/lib/culture/catalog";
import {
    CULTURE_BACKFILL_CALENDAR_DAYS,
    CULTURE_BACKTEST_KEY,
    CULTURE_ENGINE_VERSION,
    CULTURE_STARTING_BALANCE,
    PROFILE_IDS,
    SERIES_LOOKBACK_DAYS,
} from "@/lib/culture/config";
import {toBacktestView, type CultureBacktestStamp, type CultureBacktestView, type StoredCultureBacktest} from "@/lib/culture/backtest";
import {simulateCulture} from "@/lib/culture/simulator";
import {getAttentionSeries} from "@/lib/culture/store";
import {catalogHash, cultureTickers} from "@/lib/culture/universe";
import {addCalendarDays} from "@/lib/dates";
import {RATE_MAX_STALENESS_DAYS} from "@/lib/income/accrual";
import {BENCHMARK_SYMBOL, RATE_SYMBOL} from "@/lib/prices/config";
import {ensureBars, getBarsForSymbols, getRatePoints, symbolsLackingDividendCoverage} from "@/lib/prices/store";

type LeanStamp = {version: string; catalogHash: string; computedAt: Date};

export const getCultureBacktestStamp = async (): Promise<CultureBacktestStamp | null> => {
    await connectToDatabase();
    const doc = await CultureBacktest.findOne({key: CULTURE_BACKTEST_KEY}, {version: 1, catalogHash: 1, computedAt: 1}).lean<LeanStamp | null>();
    return doc ? {version: doc.version, catalogHash: doc.catalogHash, computedAt: new Date(doc.computedAt).getTime()} : null;
};

// The window a build pays income over: the backfill's depth before launch, through the day before.
export const backtestWindow = (launchDate: string): {from: string; through: string} => ({
    from: addCalendarDays(launchDate, -CULTURE_BACKFILL_CALENDAR_DAYS),
    through: addCalendarDays(launchDate, -1),
});

// Symbols whose dividends are not yet vouched for across the window — refetched deep by the
// bars step while a rebuild is pending, so the guard below can pass.
export const lackingDividendCoverage = async (symbols: readonly string[], launchDate: string): Promise<string[]> => {
    const {from, through} = backtestWindow(launchDate);
    return symbolsLackingDividendCoverage([...symbols, BENCHMARK_SYMBOL], from, through);
};

// The T-bill series deep enough for the window (ensureBars backfills a series that is too shallow).
export const ensureCultureRateBars = async (): Promise<{updated: number; failed: string[]}> => {
    const result = await ensureBars([RATE_SYMBOL], {limit: 1, backfillCalendarDays: CULTURE_BACKFILL_CALENDAR_DAYS, backfillRange: '10y'});
    return {updated: result.updated, failed: result.failed};
};

// A build is stamped with the version and never rebuilt until it moves, so it must not be saved
// on partial data: every simulated symbol's dividends covered across the window, and a T-bill
// rate for every day of it. Otherwise wait — the job retries next week.
export const cultureBacktestReady = async (symbols: readonly string[], launchDate: string): Promise<{ready: boolean; reason?: string}> => {
    const lacking = await lackingDividendCoverage(symbols, launchDate);
    if (lacking.length > 0) {
        return {ready: false, reason: `dividends not yet covered for ${lacking.slice(0, 4).join(', ')}${lacking.length > 4 ? ` +${lacking.length - 4}` : ''}`};
    }
    const {from, through} = backtestWindow(launchDate);
    const rates = await getRatePoints();
    const first = rates[0]?.date;
    const last = rates[rates.length - 1]?.date;
    if (first === undefined || last === undefined || first > from || last < addCalendarDays(through, -RATE_MAX_STALENESS_DAYS)) {
        return {ready: false, reason: 'T-bill rate history does not span the backtest window'};
    }
    return {ready: true};
};

// The build: every simulated symbol's bars and SPY's from the window's start, every brand's
// pageviews from a feature window before it, the T-bill series; the three variants at once,
// since they share each week's features; saved whole under the one key.
export const simulateCultureBacktest = async (symbols: readonly string[], launchDate: string): Promise<{weeks: number; variants: number; trades: number[]}> => {
    const {from, through} = backtestWindow(launchDate);
    const wanted = new Set(symbols.map((symbol) => symbol.toUpperCase()));
    const tickers = cultureTickers().filter((ticker) => wanted.has(ticker.symbol));
    const brandIds = CULTURE_BRANDS.map((brand) => brand.id);
    const [bars, series, rates] = await Promise.all([
        getBarsForSymbols([...tickers.map((ticker) => ticker.symbol), BENCHMARK_SYMBOL], {from, to: through}),
        getAttentionSeries(brandIds, {sources: ['wikipedia'], from: addCalendarDays(from, -SERIES_LOOKBACK_DAYS), to: through}),
        getRatePoints(),
    ]);
    const attention = new Map(brandIds.map((id) => [id, series.get(id)?.get('wikipedia') ?? []]));
    const result = simulateCulture({
        tickers,
        bars,
        attention,
        brands: CULTURE_BRANDS,
        profiles: [...PROFILE_IDS],
        launchDate,
        startingBalance: CULTURE_STARTING_BALANCE,
        rates,
    });
    await connectToDatabase();
    await CultureBacktest.updateOne(
        {key: CULTURE_BACKTEST_KEY},
        {
            $set: {
                version: CULTURE_ENGINE_VERSION,
                catalogHash: catalogHash(),
                feeds: result.feeds,
                from: result.from,
                to: result.to,
                fillRule: 'next-open',
                benchmark: result.benchmark,
                variants: result.variants.map((variant) => ({
                    profile: variant.profile,
                    weeks: variant.weeks,
                    turnoverPct: variant.turnoverPct,
                    closeFills: variant.closeFills,
                    points: variant.points,
                    trades: variant.trades,
                    stats: variant.stats,
                })),
                computedAt: new Date(),
            },
            $setOnInsert: {key: CULTURE_BACKTEST_KEY},
        },
        {upsert: true},
    );
    return {weeks: result.variants[0]?.weeks ?? 0, variants: result.variants.length, trades: result.variants.map((variant) => variant.trades.length)};
};

type LeanBacktest = {
    version: string;
    catalogHash: string;
    feeds?: string[];
    from: string;
    to: string;
    benchmark?: {date: string; value: number}[];
    variants?: {profile: string; weeks: number; turnoverPct: number; closeFills: number; points?: {date: string; value: number}[]; trades?: unknown[]; stats: StoredCultureBacktest['variants'][number]['stats']}[];
    computedAt: Date;
};

// The page's read: the points and stats, never the trades (projected away — a variant holds hundreds).
export const getCultureBacktest = async (): Promise<CultureBacktestView | null> => {
    await connectToDatabase();
    const doc = await CultureBacktest.findOne(
        {key: CULTURE_BACKTEST_KEY},
        {version: 1, catalogHash: 1, feeds: 1, from: 1, to: 1, benchmark: 1, computedAt: 1, 'variants.profile': 1, 'variants.weeks': 1, 'variants.turnoverPct': 1, 'variants.closeFills': 1, 'variants.points': 1, 'variants.stats': 1, 'variants.trades.date': 1},
    ).lean<LeanBacktest | null>();
    if (!doc) return null;
    return toBacktestView({
        version: doc.version,
        catalogHash: doc.catalogHash,
        feeds: doc.feeds ?? [],
        from: doc.from,
        to: doc.to,
        benchmark: doc.benchmark ?? [],
        variants: (doc.variants ?? []).map((variant) => ({
            profile: variant.profile,
            weeks: variant.weeks,
            turnoverPct: variant.turnoverPct,
            closeFills: variant.closeFills,
            tradeCount: variant.trades?.length ?? 0,
            points: variant.points ?? [],
            stats: variant.stats,
        })),
        computedAt: new Date(doc.computedAt).getTime(),
    });
};
