// The weekly pickers' reads and writes (NOT a 'use server' module): the two shared accounts
// and their states, the week's quote check, the earnings dates, the scoring inputs, a picker's
// book, and the decisions. The Inngest job is the only writer; every account it touches is
// owned by CULTURE_OWNER_ID. The decisions themselves are pure (lib/culture/engine.ts).

import CultureDecision, {type CultureDecisionDoc} from "@/database/models/culture-decision.model";
import CultureEarnings from "@/database/models/culture-earnings.model";
import CultureState from "@/database/models/culture-state.model";
import CultureUniverse from "@/database/models/culture-universe.model";
import PaperAccount from "@/database/models/paper-account.model";
import PaperTrade from "@/database/models/paper-trade.model";
import {connectToDatabase} from "@/database/mongoose";
import {CULTURE_BRANDS} from "@/lib/culture/catalog";
import {
    CULTURE_BACKFILL_CALENDAR_DAYS,
    CULTURE_ENGINE_VERSION,
    CULTURE_OWNER_ID,
    CULTURE_PROFILES,
    CULTURE_STARTING_BALANCE,
    LIVE_LOOKBACK_CALENDAR_DAYS,
    SERIES_LOOKBACK_DAYS,
    type CultureFeed,
    type ProfileId,
} from "@/lib/culture/config";
import type {CultureDecisionItem} from "@/lib/culture/decisions";
import type {Book} from "@/lib/culture/engine";
import {toScoringInputs, type BrandSeriesInput} from "@/lib/culture/inputs";
import type {CultureScoringInput} from "@/lib/culture/scoring";
import {fetchReportDates, type ReportDates} from "@/lib/culture/sources/earnings";
import {getAttentionSeries, getCultureEntities} from "@/lib/culture/store";
import {catalogHash, type CultureTicker, type VerifiedSymbol} from "@/lib/culture/universe";
import {addCalendarDays} from "@/lib/dates";
import type {HeldPosition} from "@/lib/navigator/allocator";
import {getQuote} from "@/lib/prices/finnhub";
import {ensureBars, getBarsForSymbols} from "@/lib/prices/store";
import {getHeldSymbolsByUserId, getOwnedAccount} from "@/lib/trading/accounts";
import {seedDayZeroSnapshot} from "@/lib/trading/lifecycle";
import {computePortfolio} from "@/lib/trading/valuation";

// ---- the states and the accounts ----

export type CultureStateView = {
    profile: ProfileId;
    accountId: string;
    status: 'active' | 'paused';
    launchDate: string;
    lastRunWeek: string | null;
    lastRunDate: string | null;
    lastTradeDate: string | null;
    version: string;
    catalogHash: string;
    lastError: string | null;
};

type LeanState = {
    key: string; accountId: string; status: 'active' | 'paused'; launchDate: string;
    lastRunWeek?: string; lastRunDate?: string; lastTradeDate?: string; version?: string; catalogHash?: string; lastError?: string;
};

const toView = (doc: LeanState): CultureStateView => ({
    profile: doc.key as ProfileId,
    accountId: doc.accountId,
    status: doc.status,
    launchDate: doc.launchDate,
    lastRunWeek: doc.lastRunWeek ?? null,
    lastRunDate: doc.lastRunDate ?? null,
    lastTradeDate: doc.lastTradeDate ?? null,
    version: doc.version ?? '',
    catalogHash: doc.catalogHash ?? '',
    lastError: doc.lastError ?? null,
});

export const getCultureStates = async (): Promise<CultureStateView[]> => {
    await connectToDatabase();
    return (await CultureState.find({}).lean<LeanState[]>()).map(toView);
};

// One system-owned PaperAccount per live profile, created directly (the createPaperAccount
// action is session-bound), as the strategies' accounts are. Idempotent: the {userId, name}
// unique index makes a racing second create fail, and the find picks the winner's account up.
export const ensureCultureAccount = async (profile: ProfileId, today: string): Promise<CultureStateView> => {
    await connectToDatabase();
    const name = CULTURE_PROFILES[profile].accountName;
    if (!name) throw new Error(`profile ${profile} trades no account`);
    const state = await CultureState.findOne({key: profile}).lean<LeanState | null>();
    const alive = state ? await PaperAccount.exists({_id: state.accountId, userId: CULTURE_OWNER_ID}) : null;
    let accountId = state && alive ? state.accountId : null;
    if (!accountId) {
        const existing = await PaperAccount.findOne({userId: CULTURE_OWNER_ID, name});
        if (existing) {
            accountId = String(existing._id);
        } else {
            const created = await PaperAccount.create({
                userId: CULTURE_OWNER_ID,
                name,
                cash: CULTURE_STARTING_BALANCE,
                startingBalance: CULTURE_STARTING_BALANCE,
                inceptionAt: new Date(),
                positions: [],
            });
            await seedDayZeroSnapshot(created);
            accountId = String(created._id);
        }
    }
    const doc = await CultureState.findOneAndUpdate(
        {key: profile},
        {$set: {accountId}, $setOnInsert: {key: profile, status: 'active', launchDate: today, version: CULTURE_ENGINE_VERSION, catalogHash: catalogHash(CULTURE_BRANDS)}},
        {upsert: true, new: true},
    ).lean<LeanState>();
    if (!doc) throw new Error(`no state for ${profile}`);
    return toView(doc);
};

// Atomic per-week claim: a replay, the holiday retry and a hand re-fire later in the week all
// lose it and skip, so the weekly trade budget is spent once.
export const claimCultureWeek = async (profile: ProfileId, weekKey: string): Promise<boolean> => {
    await connectToDatabase();
    const doc = await CultureState.findOneAndUpdate(
        {key: profile, status: 'active', lastRunWeek: {$ne: weekKey}},
        {$set: {lastRunWeek: weekKey}},
    );
    return doc !== null;
};

export const cultureWeekClaimed = async (profile: ProfileId, weekKey: string): Promise<boolean> => {
    await connectToDatabase();
    return (await CultureState.exists({key: profile, lastRunWeek: weekKey})) !== null;
};

export const getHeldCultureSymbols = async (): Promise<string[]> => getHeldSymbolsByUserId(CULTURE_OWNER_ID);

// ---- the week's quote check ----

type LeanUniverse = {symbol: string; quoted: boolean; price: number | null; reason: VerifiedSymbol['reason']};

const toVerified = (doc: LeanUniverse): VerifiedSymbol => ({symbol: doc.symbol, quoted: doc.quoted, price: doc.price, reason: doc.reason});

// Finnhub is asked only for the symbols this week has no row for; the stored price doubles as
// the week's planning price, so a symbol is quoted once per week whatever replays or retries.
// `fetched` says whether Finnhub was asked at all, so the job pauses only after a chunk that was.
export const verifyUniverseChunk = async (symbols: readonly string[], weekKey: string): Promise<{rows: VerifiedSymbol[]; fetched: number}> => {
    await connectToDatabase();
    const known = new Map((await CultureUniverse.find({weekKey, symbol: {$in: symbols}}).lean<LeanUniverse[]>()).map((doc) => [doc.symbol, toVerified(doc)]));
    const fresh: VerifiedSymbol[] = [];
    for (const symbol of symbols) {
        if (known.has(symbol)) continue;
        try {
            const quote = await getQuote(symbol);
            const price = typeof quote.c === 'number' ? quote.c : null;
            fresh.push(price === null ? {symbol, quoted: false, price: null, reason: 'no quote'}
                : price > 0 ? {symbol, quoted: true, price, reason: 'ok'}
                : {symbol, quoted: false, price: null, reason: 'zero price'});
        } catch {
            fresh.push({symbol, quoted: false, price: null, reason: 'error'});
        }
    }
    if (fresh.length > 0) {
        await CultureUniverse.bulkWrite(fresh.map((v) => ({
            updateOne: {filter: {weekKey, symbol: v.symbol}, update: {$set: {...v, checkedAt: new Date()}}, upsert: true},
        })), {ordered: false});
    }
    return {rows: symbols.map((symbol) => known.get(symbol) ?? fresh.find((v) => v.symbol === symbol) as VerifiedSymbol), fetched: fresh.length};
};

export const getWeekUniverse = async (weekKey: string): Promise<VerifiedSymbol[]> => {
    await connectToDatabase();
    return (await CultureUniverse.find({weekKey}).lean<LeanUniverse[]>()).map(toVerified);
};

// ---- the earnings dates ----

export const refreshReportDates = async (symbols: readonly string[], today: string): Promise<{ok: boolean; skipped: boolean; dated: number}> => {
    const result = await fetchReportDates(symbols, today);
    if (result.skipped || !result.ok || result.dates.size === 0) return {ok: result.ok, skipped: result.skipped, dated: 0};
    await connectToDatabase();
    const now = new Date();
    const rows = [...result.dates].filter(([, dates]) => dates.lastReportDate !== null || dates.nextReportDate !== null);
    if (rows.length > 0) {
        await CultureEarnings.bulkWrite(rows.map(([symbol, dates]) => ({
            updateOne: {filter: {symbol}, update: {$set: {...dates, checkedAt: now}}, upsert: true},
        })), {ordered: false});
    }
    return {ok: true, skipped: false, dated: rows.length};
};

export const getReportDates = async (symbols: readonly string[]): Promise<Map<string, ReportDates>> => {
    if (symbols.length === 0) return new Map();
    await connectToDatabase();
    const docs = await CultureEarnings.find({symbol: {$in: symbols}}).lean<{symbol: string; lastReportDate: string | null; nextReportDate: string | null}[]>();
    return new Map(docs.map((doc) => [doc.symbol, {lastReportDate: doc.lastReportDate ?? null, nextReportDate: doc.nextReportDate ?? null}]));
};

// ---- bars ----

// `deep`: symbols whose dividends are not yet vouched for across the backtest window (the
// simulation's readiness guard), refetched whole so a rebuild never runs on partial data.
export const ensureCultureBars = async (symbols: readonly string[], {deep = []}: {deep?: readonly string[]} = {}): Promise<{updated: number; failed: string[]; fresh: number}> => {
    const options = {backfillCalendarDays: CULTURE_BACKFILL_CALENDAR_DAYS, backfillRange: '10y' as const, requireOhlc: true, topupRange: '1mo' as const};
    const deepSet = new Set(deep.map((s) => s.toUpperCase()));
    const refetch = symbols.filter((symbol) => deepSet.has(symbol.toUpperCase()));
    const shallow = symbols.filter((symbol) => !deepSet.has(symbol.toUpperCase()));
    // One after the other, never in parallel: ensureBars spaces its Yahoo calls.
    const runs = [
        refetch.length > 0 ? await ensureBars(refetch, {...options, limit: refetch.length, forceBackfill: true}) : null,
        shallow.length > 0 ? await ensureBars(shallow, {...options, limit: shallow.length}) : null,
    ];
    return {
        updated: runs.reduce((n, r) => n + (r?.updated ?? 0), 0),
        failed: runs.flatMap((r) => r?.failed ?? []),
        fresh: runs.reduce((n, r) => n + (r?.fresh ?? 0), 0),
    };
};

// ---- the scoring inputs ----

export const loadScoringInputs = async (
    tickers: readonly CultureTicker[],
    quoted: readonly string[],
    asOf: string,
): Promise<{inputs: CultureScoringInput[]; feeds: CultureFeed[]}> => {
    const symbols = tickers.map((t) => t.symbol);
    const brandIds = CULTURE_BRANDS.map((brand) => brand.id);
    const [bars, series, entities, reports] = await Promise.all([
        getBarsForSymbols(symbols, {from: addCalendarDays(asOf, -LIVE_LOOKBACK_CALENDAR_DAYS), to: asOf}),
        getAttentionSeries(brandIds, {sources: ['wikipedia', 'appstore', 'news'], from: addCalendarDays(asOf, -SERIES_LOOKBACK_DAYS), to: asOf}),
        getCultureEntities(brandIds),
        getReportDates(symbols),
    ]);
    const brands = new Map<string, BrandSeriesInput>();
    for (const brand of CULTURE_BRANDS) {
        const bySource = series.get(brand.id);
        brands.set(brand.id, {
            brand,
            wikipedia: bySource?.get('wikipedia') ?? [],
            appstore: bySource?.get('appstore') ?? [],
            news: bySource?.get('news') ?? [],
            entity: entities.get(brand.id) ?? null,
            reportDate: brand.owner ? reports.get(brand.owner.ticker)?.lastReportDate ?? null : null,
        });
    }
    return toScoringInputs({tickers, quoted: new Set(quoted), bars, brands, asOf});
};

// ---- a picker's book ----

export type LoadedBook = {book: Book; accountName: string; startingBalance: number};

// The account as the allocator reads it: held rows priced from the week's verified quotes
// (unpriced = null, skipped by the allocator), the holding age from the last buy, and a
// quantity-0 quote carrier for every targetable symbol not held.
export const loadBook = async (
    accountId: string,
    priceBySymbol: Readonly<Record<string, number>>,
    targetable: readonly string[],
    nowMs: number,
): Promise<LoadedBook | null> => {
    const account = await getOwnedAccount(CULTURE_OWNER_ID, accountId);
    if (!account) return null;
    const priceMap = new Map(Object.entries(priceBySymbol).map(([symbol, price]) => [symbol.toUpperCase(), {price}]));
    const portfolio = computePortfolio(
        {cash: account.cash, startingBalance: account.startingBalance, positions: account.positions.map((p) => ({symbol: p.symbol, company: p.company, quantity: p.quantity, avgCost: p.avgCost}))},
        priceMap,
    );
    const lastBuys = await PaperTrade.aggregate([
        {$match: {accountId: String(account._id), side: 'buy'}},
        {$group: {_id: '$symbol', last: {$max: '$createdAt'}}},
    ]);
    const lastBuyBySymbol = new Map<string, number>(lastBuys.map((r: {_id: string; last: Date}) => [r._id, new Date(r.last).getTime()]));
    const positions: HeldPosition[] = portfolio.positions.map((p) => {
        const lastBuy = lastBuyBySymbol.get(p.symbol);
        const calendarDays = lastBuy ? (nowMs - lastBuy) / 86_400_000 : null;
        return {
            symbol: p.symbol,
            quantity: p.quantity,
            avgCost: p.avgCost,
            price: typeof p.currentPrice === 'number' ? p.currentPrice : null,
            heldTradingDays: calendarDays === null ? null : Math.floor(calendarDays * 5 / 7),
            thesisBroken: false,
            score: null,
        };
    });
    const held = new Set(positions.map((p) => p.symbol.toUpperCase()));
    for (const symbol of targetable) {
        if (held.has(symbol.toUpperCase())) continue;
        const price = priceBySymbol[symbol];
        positions.push({symbol, quantity: 0, avgCost: 0, price: typeof price === 'number' ? price : null, heldTradingDays: null, thesisBroken: false, score: null});
    }
    return {
        book: {totalValue: portfolio.totalValue, cash: portfolio.cash, positions},
        accountName: account.name,
        startingBalance: account.startingBalance,
    };
};

// ---- the decisions ----

export type CultureDecisionInput = {
    date: string;
    profile: ProfileId;
    weekKey: string;
    kind: 'executed' | 'preview' | 'skipped';
    items: CultureDecisionItem[];
    universe: {tickers: number; quoted: number; unquoted: {symbol: string; reason: string}[]};
    feeds: readonly CultureFeed[];
    summary: string;
};

// A preview never overwrites the record of trades executed that day.
export const saveCultureDecision = async (input: CultureDecisionInput): Promise<boolean> => {
    await connectToDatabase();
    const existing = await CultureDecision.findOne({date: input.date, profile: input.profile}).lean<{kind: string} | null>();
    if (existing && existing.kind === 'executed' && input.kind !== 'executed') return false;
    await CultureDecision.updateOne(
        {date: input.date, profile: input.profile},
        {$set: {weekKey: input.weekKey, kind: input.kind, items: input.items, universe: input.universe, feeds: [...input.feeds], summary: input.summary}},
        {upsert: true},
    );
    return true;
};

export const saveCultureRationale = async (profile: ProfileId, date: string, text: string): Promise<void> => {
    if (!text) return;
    await connectToDatabase();
    await CultureDecision.updateOne({date, profile}, {$set: {rationaleMd: text}});
};

export type OutcomeRecord = {symbol: string; side: 'buy' | 'sell'; executed: boolean; message?: string};

export const completeCultureRun = async ({profile, date, outcomes}: {profile: ProfileId; date: string; outcomes: readonly OutcomeRecord[]}): Promise<void> => {
    await connectToDatabase();
    const failed = outcomes.filter((o) => !o.executed);
    const update: Record<string, unknown> = {lastRunDate: date, version: CULTURE_ENGINE_VERSION, catalogHash: catalogHash(CULTURE_BRANDS)};
    if (outcomes.some((o) => o.executed)) update.lastTradeDate = date;
    await CultureState.updateOne(
        {key: profile},
        failed.length > 0
            ? {$set: {...update, lastError: `${failed.length} of ${outcomes.length} order(s) failed: ${failed.map((o) => `${o.side} ${o.symbol} — ${o.message ?? 'unknown'}`).join('; ')}`.slice(0, 500)}}
            : {$set: update, $unset: {lastError: ''}},
    );
};

export type CultureDecisionView = {
    date: string;
    profile: ProfileId;
    weekKey: string;
    kind: 'executed' | 'preview' | 'skipped';
    items: CultureDecisionItem[];
    universe: {tickers: number; quoted: number; unquoted: {symbol: string; reason: string}[]};
    feeds: string[];
    rationaleMd: string | null;
    summary: string;
};

const toDecisionView = (doc: CultureDecisionDoc): CultureDecisionView => ({
    date: doc.date,
    profile: doc.profile as ProfileId,
    weekKey: doc.weekKey,
    kind: doc.kind,
    items: doc.items.map((item) => ({
        symbol: item.symbol,
        action: item.action,
        ...(typeof item.quantity === 'number' ? {quantity: item.quantity} : {}),
        targetWeight: item.targetWeight,
        currentWeight: item.currentWeight,
        score: item.score,
        reasons: [...item.reasons],
        brands: item.brands.map((b) => ({id: b.id, name: b.name})),
        executed: item.executed,
        ...(typeof item.executionPrice === 'number' ? {executionPrice: item.executionPrice} : {}),
        ...(item.error ? {error: item.error} : {}),
    })),
    universe: {tickers: doc.universe?.tickers ?? 0, quoted: doc.universe?.quoted ?? 0, unquoted: (doc.universe?.unquoted ?? []).map((u) => ({symbol: u.symbol, reason: u.reason}))},
    feeds: [...(doc.feeds ?? [])],
    rationaleMd: doc.rationaleMd ?? null,
    summary: doc.summary,
});

export const getLatestCultureDecision = async (profile: ProfileId): Promise<CultureDecisionView | null> => {
    await connectToDatabase();
    const doc = await CultureDecision.findOne({profile}).sort({date: -1});
    return doc ? toDecisionView(doc) : null;
};

// Owners with a last report date on file — the system view's earnings line.
export const countReportDates = async (): Promise<number> => {
    await connectToDatabase();
    return CultureEarnings.countDocuments({lastReportDate: {$ne: null}});
};

// A profile's decisions on the given days, for the trade log's "What the picker saw": each
// fill's row carries the reasons of the decision item that placed it. Bounded by the dates asked.
export const getCultureDecisionsForDates = async (profile: ProfileId, dates: readonly string[]): Promise<CultureDecisionView[]> => {
    const distinct = [...new Set(dates)];
    if (distinct.length === 0) return [];
    await connectToDatabase();
    const docs = await CultureDecision.find({profile, date: {$in: distinct}});
    return docs.map(toDecisionView);
};
