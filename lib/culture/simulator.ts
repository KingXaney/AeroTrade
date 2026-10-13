// The culture pickers' simulated record: the SAME decideWeek the weekly job calls, once a week
// over stored daily bars and stored Wikipedia pageviews, with next-open fills, in three variants
// — the price-only control, Spike and Quiet — that share every week's features and differ only
// by the weights each profile puts on them. Pure. The calendar is SPY's bar dates before the
// launch date, so live and simulated never overlap, and nothing decided on a Monday can see that
// Monday's close.
//
// Attention is replayed, not read: each brand's pageview surprises go through the same decay
// maths the daily fold uses (lib/brain/decay, one source, weighted as the fold weighs it), so the
// simulation has slow attention and theses as the live brain would have had them from pageviews
// alone. It has no App Store ranks, posts, news mentions or report dates; the weights renormalise
// over the feeds present (lib/culture/scoring.effectiveWeights), as a live run's do.
//
// Cash earns interest and holdings receive dividends through the SAME income clock the nightly
// job replays live accounts with, stepped in the same order as the strategies' simulator —
// open(d), d's fills, close(d) — every calendar day.

import {ENTITY_EPSILON} from "@/lib/brain/config";
import {decayEntity, foldMentions, sentimentAvg, shouldDeleteEntity, updateThesis, type EntityState} from "@/lib/brain/decay";
import {
    CULTURE_RAILS,
    LIVE_LOOKBACK_CALENDAR_DAYS,
    SERIES_LOOKBACK_DAYS,
    SIM_RESULT_WEEKS,
    SIM_WARMUP_BARS,
    SOURCE_FOLD_WEIGHTS,
    WIKI_BASELINE_DAYS,
    WIKI_RECENT_DAYS,
    WIKI_RELEVANCE,
    type CultureFeed,
    type ProfileId,
} from "@/lib/culture/config";
import {decideWeek, firstWeekTrades} from "@/lib/culture/engine";
import {wikipediaAnomaly} from "@/lib/culture/features";
import {toScoringInputs, type BrandSeriesInput} from "@/lib/culture/inputs";
import type {CultureScoringInput} from "@/lib/culture/scoring";
import type {AttentionPoint, CultureBrand, CultureEntitySummary} from "@/lib/culture/types";
import type {CultureTicker} from "@/lib/culture/universe";
import {addCalendarDays, eachCalendarDay, getEasternWeekKey} from "@/lib/dates";
import {createIncomeClock, dividendsByExDate, makeRateLookup} from "@/lib/income/accrual";
import type {HeldPosition} from "@/lib/navigator/allocator";
import {BENCHMARK_SYMBOL} from "@/lib/prices/config";
import type {Bar} from "@/lib/prices/signals";
import {totalReturnIndex} from "@/lib/prices/total-return";
import type {RatePoint} from "@/lib/prices/types";
import {summarizeSeries} from "@/lib/strategies/metrics";
import {incomeWalker} from "@/lib/strategies/simulate";
import type {SeriesPoint, SimTrade, SimulationResult} from "@/lib/strategies/types";
import {applyFill, type SimAccount} from "@/lib/trading/fill";

// The live run's rule, kept here in its own words so this module stays free of the order path's
// database imports: a buy the plan funded with a sell that did not fill is dropped.
const FUNDING_SELL_FAILED = 'funding sell failed';

export type CultureSimulationInput = {
    // The listed owners to simulate (lib/culture/universe.cultureTickers, BACKTEST_LISTINGS only).
    tickers: readonly CultureTicker[];
    // Daily bars for every ticker and the benchmark, ascending.
    bars: ReadonlyMap<string, readonly Bar[]>;
    // Each catalog brand's daily Wikipedia pageviews, ascending, by brand id.
    attention: ReadonlyMap<string, readonly AttentionPoint[]>;
    // The catalog: private brands count in the category-share denominator, and a brand joins
    // its owner only from `owner.since`.
    brands: readonly CultureBrand[];
    profiles: readonly ProfileId[];
    launchDate: string;
    startingBalance: number;
    // The 13-week T-bill series; without it, price return only.
    rates?: readonly RatePoint[];
    resultWeeks?: number;
    warmupBars?: number;
};

export type CultureVariantResult = SimulationResult & {
    profile: ProfileId;
    // Weekly decisions in the window, and the dollars traded as a share of mean equity.
    weeks: number;
    turnoverPct: number;
};

export type CultureSimulation = {
    from: string;
    to: string;
    // Every feed any week had.
    feeds: CultureFeed[];
    benchmark: SeriesPoint[];
    variants: CultureVariantResult[];
};

// ---- dated slices, by binary search: the series are years long and read hundreds of times ----

const lowerBound = (dates: readonly string[], date: string): number => {
    let lo = 0;
    let hi = dates.length;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (dates[mid] < date) lo = mid + 1;
        else hi = mid;
    }
    return lo;
};

// The items dated inside [from, to], from a series whose dates are given beside it, ascending.
export const sliceBetween = <T extends {date: string}>(items: readonly T[], dates: readonly string[], from: string, to: string): T[] =>
    items.slice(lowerBound(dates, from), lowerBound(dates, addCalendarDays(to, 1)));

type DatedIndex<T extends {date: string}> = {items: readonly T[]; dates: string[]; byDate: Map<string, T>};

const indexDated = <T extends {date: string}>(items: readonly T[]): DatedIndex<T> => ({
    items,
    dates: items.map((item) => item.date),
    byDate: new Map(items.map((item) => [item.date, item])),
});

// The last item on or before `date` (a symbol without a bar that day keeps yesterday's value).
const onOrBefore = <T extends {date: string}>(index: DatedIndex<T>, date: string): T | null => {
    const exact = index.byDate.get(date);
    if (exact) return exact;
    const at = lowerBound(index.dates, date) - 1;
    return at >= 0 ? index.items[at] : null;
};

const finitePositive = (value: number | undefined): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;

// ---- attention, replayed through the fold's own maths ----

const dayMs = (day: string): number => Date.parse(`${day}T12:00:00Z`);
// The surprise of a day reads a week against the three months before it.
const ANOMALY_WINDOW_DAYS = WIKI_RECENT_DAYS + WIKI_BASELINE_DAYS;

const freshState = (day: string): EntityState => ({
    weightFast: 0, sentimentSumFast: 0, weightSlow: 0, sentimentSumSlow: 0, decayedTo: day, links: [], thesisSince: null, peakSlowWeight: 0,
});

export type ReplayedAttention = {
    // The brand's entity as the daily job would have stored it on the morning of `day`: every
    // surprise through the day before folded the morning after it, decayed to `day`. Days must
    // be asked for in order. Null before the first surprise, and again once the entity would
    // have been pruned.
    stateAt: (day: string) => CultureEntitySummary | null;
};

export const attentionReplayer = (brand: CultureBrand, series: readonly AttentionPoint[]): ReplayedAttention => {
    const dates = series.map((point) => point.date);
    let state: EntityState | null = null;
    let lastSeenMs = 0;
    // The next morning to fold: a day's surprise is read the morning after, as the daily job does.
    let cursor = series.length > 0 ? addCalendarDays(series[0].date, 1) : null;
    const lastMorning = series.length > 0 ? addCalendarDays(series[series.length - 1].date, 1) : null;

    const advance = (through: string): void => {
        if (cursor === null || lastMorning === null) return;
        const stop = through < lastMorning ? through : lastMorning;
        for (; cursor <= stop; cursor = addCalendarDays(cursor, 1)) {
            const anomalyDay = addCalendarDays(cursor, -1);
            const windowed = sliceBetween(series, dates, addCalendarDays(anomalyDay, -(ANOMALY_WINDOW_DAYS - 1)), anomalyDay);
            const anomaly = wikipediaAnomaly(windowed, anomalyDay);
            if (!anomaly || anomaly.importance <= 0) continue;
            const decayed = decayEntity(state ?? freshState(cursor), cursor);
            const folded = foldMentions(decayed, [{sentiment: 0, importance: anomaly.importance * SOURCE_FOLD_WEIGHTS.wikipedia, relevance: WIKI_RELEVANCE}]);
            state = updateThesis(folded, dayMs(cursor));
            lastSeenMs = dayMs(cursor);
        }
    };

    return {
        stateAt: (day) => {
            advance(day);
            if (state === null) return null;
            const decayed = updateThesis(decayEntity(state, day), dayMs(day));
            const negligible = decayed.weightFast < ENTITY_EPSILON && decayed.weightSlow < ENTITY_EPSILON;
            if (negligible && shouldDeleteEntity(decayed, lastSeenMs, dayMs(day))) {
                state = null;
                return null;
            }
            state = decayed;
            return {
                key: brand.id,
                displayName: brand.name,
                category: brand.category,
                ticker: brand.owner?.ticker ?? null,
                listing: brand.owner?.listing ?? null,
                weightFast: decayed.weightFast,
                weightSlow: decayed.weightSlow,
                sentimentFast: sentimentAvg(decayed.sentimentSumFast, decayed.weightFast),
                sentimentSlow: sentimentAvg(decayed.sentimentSumSlow, decayed.weightSlow),
                thesisSince: decayed.thesisSince,
                lastSeenAt: lastSeenMs,
            };
        },
    };
};

// ---- one week's inputs, shared by every variant ----

type PreparedBrand = {brand: CultureBrand; series: readonly AttentionPoint[]; dates: string[]; replay: ReplayedAttention | null};

export type PreparedSimulation = {
    calendar: string[];
    barIndex: Map<string, DatedIndex<Bar>>;
    benchmarkIndex: DatedIndex<SeriesPoint>;
    // The scoring inputs for a decision taken on the morning of `tradeDate`, reading the series
    // through `asOf` (the session before) and the attention entities as that morning would have
    // stored them. `held` are the symbols a book holds, scored for their exit whatever the catalog says.
    inputsFor: (asOf: string, tradeDate: string, held: readonly string[]) => {inputs: CultureScoringInput[]; feeds: CultureFeed[]; quoted: Set<string>};
};

export const prepareCultureSimulation = ({tickers, bars, attention, brands, launchDate}: Pick<CultureSimulationInput, 'tickers' | 'bars' | 'attention' | 'brands' | 'launchDate'>): PreparedSimulation => {
    const benchmarkBars = (bars.get(BENCHMARK_SYMBOL) ?? []).filter((bar) => bar.date < launchDate);
    const calendar = benchmarkBars.map((bar) => bar.date);
    const benchmarkIndex = indexDated(totalReturnIndex(benchmarkBars));
    const barIndex = new Map<string, DatedIndex<Bar>>();
    for (const [symbol, series] of bars) barIndex.set(symbol, indexDated(series.filter((bar) => bar.date < launchDate)));

    const prepared: PreparedBrand[] = brands.map((brand) => {
        const series = attention.get(brand.id) ?? [];
        return {brand, series, dates: series.map((point) => point.date), replay: series.length > 0 ? attentionReplayer(brand, series) : null};
    });
    const sinceById = new Map(brands.flatMap((brand) => (brand.owner?.since ? [[brand.id, brand.owner.since] as const] : [])));
    const tickerBySymbol = new Map(tickers.map((ticker) => [ticker.symbol, ticker]));

    const inputsFor: PreparedSimulation['inputsFor'] = (asOf, tradeDate, held) => {
        const brandInputs = new Map<string, BrandSeriesInput>();
        for (const {brand, series, dates, replay} of prepared) {
            brandInputs.set(brand.id, {
                brand,
                wikipedia: sliceBetween(series, dates, addCalendarDays(asOf, -SERIES_LOOKBACK_DAYS), asOf),
                appstore: [],
                news: [],
                entity: replay ? replay.stateAt(tradeDate) : null,
                reportDate: null,
            });
        }
        // A brand belongs to its owner only from the day it changed hands.
        const owned: CultureTicker[] = tickers
            .map((ticker) => ({...ticker, brands: ticker.brands.filter((b) => (sinceById.get(b.id) ?? '') <= asOf)}))
            .filter((ticker) => ticker.brands.length > 0);
        const listed = new Set(owned.map((ticker) => ticker.symbol));
        // A held name the window's catalog does not list is scored on price alone, for its exit.
        const extra: CultureTicker[] = held.filter((symbol) => !listed.has(symbol)).map((symbol) => tickerBySymbol.get(symbol) ?? {symbol, listing: 'us', company: symbol, brands: []});
        const universe = [...owned, ...extra.map((t) => ({...t, brands: []}))];
        const windowFrom = addCalendarDays(asOf, -LIVE_LOOKBACK_CALENDAR_DAYS);
        const windowed = new Map<string, Bar[]>();
        const quoted = new Set<string>();
        for (const ticker of universe) {
            const index = barIndex.get(ticker.symbol);
            if (!index) continue;
            windowed.set(ticker.symbol, sliceBetween(index.items, index.dates, windowFrom, asOf));
            // Quoted in the simulation means traded that day: a bar dated exactly asOf.
            if (index.byDate.has(asOf)) quoted.add(ticker.symbol);
        }
        const {inputs, feeds} = toScoringInputs({tickers: universe, quoted, bars: windowed, brands: brandInputs, asOf});
        return {inputs, feeds, quoted};
    };

    return {calendar, barIndex, benchmarkIndex, inputsFor};
};

// ---- the simulation ----

type VariantState = {
    profile: ProfileId;
    account: SimAccount;
    income: ReturnType<typeof incomeWalker>;
    lastBuyIndex: Map<string, number>;
    trades: SimTrade[];
    rejections: SimulationResult['rejections'][number][];
    points: SeriesPoint[];
    closeFills: number;
    weeks: number;
    traded: number;
};

const emptyVariant = (profile: ProfileId, date: string, startingBalance: number, benchmark: SeriesPoint[]): CultureVariantResult => {
    const points: SeriesPoint[] = [{date, value: startingBalance}];
    return {
        profile, weeks: 0, turnoverPct: 0,
        from: date, to: date, fillRule: 'next-open', closeFills: 0, skippedDays: 0,
        points, benchmark, trades: [], rejections: [], stats: summarizeSeries(points, [], benchmark), income: [],
    };
};

// Which sessions a picker decides on: the first session of each ET week.
export const isWeekStart = (calendar: readonly string[], index: number): boolean =>
    index > 0 && getEasternWeekKey(calendar[index]) !== getEasternWeekKey(calendar[index - 1]);

export const simulateCulture = (input: CultureSimulationInput): CultureSimulation => {
    const {profiles, startingBalance, rates, resultWeeks = SIM_RESULT_WEEKS, warmupBars = SIM_WARMUP_BARS} = input;
    const sim = prepareCultureSimulation(input);
    const {calendar, barIndex, benchmarkIndex} = sim;
    const n = calendar.length;

    // The decision sessions: week starts with a warm-up of bars before them, the last `resultWeeks`.
    const decisionIndexes: number[] = [];
    for (let i = warmupBars + 1; i < n; i += 1) if (isWeekStart(calendar, i)) decisionIndexes.push(i);
    const kept = decisionIndexes.slice(Math.max(0, decisionIndexes.length - resultWeeks));
    const decisions = new Set(kept);
    if (kept.length === 0) {
        const date = n > 0 ? calendar[n - 1] : input.launchDate;
        const bench = onOrBefore(benchmarkIndex, date);
        const benchmark: SeriesPoint[] = bench ? [{date, value: bench.value}] : [];
        return {from: date, to: date, feeds: [], benchmark, variants: profiles.map((profile) => emptyVariant(profile, date, startingBalance, benchmark))};
    }
    const startIndex = kept[0] - 1;

    const dividendPoints = rates === undefined ? [] : [...input.bars].flatMap(([symbol, bars]) =>
        bars.filter((bar) => typeof bar.dividend === 'number' && bar.dividend > 0).map((bar) => ({symbol, exDate: bar.date, perShare: bar.dividend as number})));
    const clockFor = () => (rates === undefined ? null : createIncomeClock({rateOn: makeRateLookup(rates), dividends: dividendsByExDate(dividendPoints)}));

    const variants: VariantState[] = profiles.map((profile) => {
        const income = incomeWalker(clockFor());
        // The account exists from the first result day, like a live account from its inception.
        const account = income.open(calendar[startIndex], {cash: startingBalance, positions: []});
        return {profile, account, income, lastBuyIndex: new Map(), trades: [], rejections: [], points: [{date: calendar[startIndex], value: startingBalance}], closeFills: 0, weeks: 0, traded: 0};
    });
    const benchmark: SeriesPoint[] = [];
    const firstBench = onOrBefore(benchmarkIndex, calendar[startIndex]);
    if (firstBench) benchmark.push({date: calendar[startIndex], value: firstBench.value});
    const feeds = new Set<CultureFeed>();

    const closeOn = (symbol: string, date: string): number | null => {
        const index = barIndex.get(symbol);
        return index ? (onOrBefore(index, date)?.close ?? null) : null;
    };
    const markToMarket = (account: SimAccount, date: string): number =>
        account.positions.reduce((value, position) => value + position.quantity * (closeOn(position.symbol, date) ?? position.avgCost), account.cash);

    for (let i = startIndex + 1; i < n; i += 1) {
        const asOf = calendar[i - 1];
        const tradeDate = calendar[i];
        // Close asOf, walk any weekend or holiday, and open the trade date — so a decision sees
        // every credit dated before it, exactly as the live Monday run does.
        for (const variant of variants) {
            variant.income.close(asOf, variant.account);
            for (const day of eachCalendarDay(addCalendarDays(asOf, 1), addCalendarDays(tradeDate, -1))) {
                variant.account = variant.income.open(day, variant.account);
                variant.income.close(day, variant.account);
            }
            variant.account = variant.income.open(tradeDate, variant.account);
        }

        if (decisions.has(i)) {
            // The week's features once, for every variant.
            const held = [...new Set(variants.flatMap((variant) => variant.account.positions.map((position) => position.symbol)))];
            const week = sim.inputsFor(asOf, tradeDate, held);
            for (const feed of week.feeds) feeds.add(feed);
            const universe = week.inputs.map((item) => item.symbol);
            const targetable = new Set(universe.filter((symbol) => week.quoted.has(symbol)));

            for (const variant of variants) {
                const heldSymbols = new Set(variant.account.positions.map((position) => position.symbol));
                const positions: HeldPosition[] = variant.account.positions.map((position) => ({
                    symbol: position.symbol,
                    quantity: position.quantity,
                    avgCost: position.avgCost,
                    price: closeOn(position.symbol, asOf),
                    heldTradingDays: variant.lastBuyIndex.has(position.symbol) ? i - (variant.lastBuyIndex.get(position.symbol) as number) : null,
                    thesisBroken: false,
                    score: null,
                }));
                // A quote carrier for every targetable symbol not held, so a buy can be sized.
                for (const symbol of targetable) {
                    if (heldSymbols.has(symbol)) continue;
                    positions.push({symbol, quantity: 0, avgCost: 0, price: closeOn(symbol, asOf), heldTradingDays: null, thesisBroken: false, score: null});
                }
                const totalValue = markToMarket(variant.account, asOf);
                const book = {totalValue, cash: variant.account.cash, positions};
                const decision = decideWeek({inputs: week.inputs, feeds: week.feeds, profile: variant.profile, book, targetable, maxTrades: firstWeekTrades(positions)});
                variant.weeks += 1;

                let sellFailed = false;
                for (const order of decision.orders) {
                    if (sellFailed && order.side === 'buy') {
                        variant.rejections.push({date: tradeDate, symbol: order.symbol, side: order.side, reason: FUNDING_SELL_FAILED});
                        continue;
                    }
                    const fillBar = barIndex.get(order.symbol)?.byDate.get(tradeDate);
                    if (!fillBar) {
                        variant.rejections.push({date: tradeDate, symbol: order.symbol, side: order.side, reason: 'no bar on fill date'});
                        if (order.side === 'sell') sellFailed = true;
                        continue;
                    }
                    let fill: SimTrade['fill'] = 'open';
                    let price: number;
                    if (finitePositive(fillBar.open)) {
                        price = fillBar.open;
                    } else {
                        price = fillBar.close;
                        fill = 'close';
                        variant.closeFills += 1;
                    }
                    const result = applyFill(variant.account, order, price, order.side === 'buy' ? CULTURE_RAILS.minCashWeight * totalValue : undefined);
                    if (!result.ok) {
                        variant.rejections.push({date: tradeDate, symbol: order.symbol, side: order.side, reason: result.reason});
                        if (order.side === 'sell') sellFailed = true;
                        continue;
                    }
                    variant.account = result.account;
                    if (order.side === 'buy') variant.lastBuyIndex.set(order.symbol, i);
                    variant.traded += result.total;
                    variant.trades.push({
                        date: tradeDate,
                        symbol: order.symbol,
                        side: order.side,
                        quantity: order.quantity,
                        price,
                        total: result.total,
                        ...(result.realizedPnl !== undefined ? {realizedPnl: result.realizedPnl} : {}),
                        reason: order.reason,
                        fill,
                    });
                }
            }
        }

        // Mark to market at the trade date's close.
        for (const variant of variants) variant.points.push({date: tradeDate, value: markToMarket(variant.account, tradeDate)});
        const bench = onOrBefore(benchmarkIndex, tradeDate);
        if (bench) benchmark.push({date: tradeDate, value: bench.value});
    }

    return {
        from: calendar[startIndex],
        to: calendar[n - 1],
        feeds: [...feeds],
        benchmark,
        variants: variants.map((variant) => {
            const meanEquity = variant.points.reduce((sum, point) => sum + point.value, 0) / variant.points.length;
            return {
                profile: variant.profile,
                weeks: variant.weeks,
                turnoverPct: meanEquity > 0 ? (variant.traded / meanEquity) * 100 : 0,
                from: variant.points[0].date,
                to: variant.points[variant.points.length - 1].date,
                fillRule: 'next-open',
                closeFills: variant.closeFills,
                skippedDays: 0,
                points: variant.points,
                benchmark,
                trades: variant.trades,
                rejections: variant.rejections,
                stats: summarizeSeries(variant.points, variant.trades, benchmark),
                income: variant.income.rows,
            };
        }),
    };
};
