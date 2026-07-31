// Navigator read/assembly + decision helpers (NOT a 'use server' module — plain
// server code shared by the /brain page and BOTH Inngest jobs: the weekly run and
// the one-time enrollment bootstrap, which must make identical decisions).

import {connectToDatabase} from "@/database/mongoose";
import SuggestionSet, {GLOBAL_SUGGESTIONS_USER, type SuggestionSetDoc} from "@/database/models/suggestion-set.model";
import AiNavigator from "@/database/models/ai-navigator.model";
import BrainEntity from "@/database/models/brain-entity.model";
import NewsItem from "@/database/models/news-item.model";
import PaperTrade from "@/database/models/paper-trade.model";
import {getTopVerifiedTickers} from "@/lib/brain/queries";
import {getBarsForSymbols} from "@/lib/prices/store";
import {computeSignals} from "@/lib/prices/signals";
import {dominantSectorKey, rankNormalize, scoreUniverse, type ScoredSymbol, type ScoringInput} from "@/lib/navigator/scoring";
import {diffToOrders, type HeldPosition, type PlannedOrder, type TargetWeight} from "@/lib/navigator/allocator";
import {
    ALWAYS_ELIGIBLE_SYMBOLS,
    ELIGIBILITY_LOOKBACK_DAYS,
    ETF_TO_SECTOR_KEY,
    SECTOR_KEY_PREFIX,
} from "@/lib/navigator/config";
import {buildPriceMap, computePortfolio, getHeldSymbolsByUserId, getOwnedAccount} from "@/lib/trading/account";
import {getEasternDateString} from "@/lib/utils";

export type SuggestionSetView = {
    date: string;
    kind: 'executed' | 'preview';
    items: SuggestionItem[];
    rationaleMd: string | null;
};

const toView = (set: SuggestionSetDoc | null): SuggestionSetView | null => {
    if (!set) return null;
    return {
        date: set.date,
        kind: set.kind === 'preview' ? 'preview' : 'executed',
        items: set.items.map((i) => ({
            symbol: i.symbol,
            action: i.action,
            quantity: i.quantity,
            targetWeight: i.targetWeight,
            currentWeight: i.currentWeight,
            score: i.score,
            reasons: i.reasons,
            executed: i.executed,
            executionPrice: i.executionPrice,
            error: i.error,
        })),
        rationaleMd: set.rationaleMd ?? null,
    };
};

// ---------------------------------------------------------------------------
// Decision pipeline (shared by the weekly run and the enrollment bootstrap)
// ---------------------------------------------------------------------------

// Symbols worth scoring: always-eligible ETFs + the brain's top verified tickers
// + everything any enrolled account currently holds.
export const buildNavigatorUniverse = async (): Promise<{symbols: string[]; navigators: {userId: string; accountId: string}[]}> => {
    await connectToDatabase();
    const navigators = (await AiNavigator.find({status: 'active'}).lean())
        .map((n) => ({userId: n.userId, accountId: n.accountId}));
    const held = new Set<string>();
    for (const nav of navigators) {
        for (const sym of await getHeldSymbolsByUserId(nav.userId)) held.add(sym);
    }
    const topTickers = await getTopVerifiedTickers(25);
    const symbols = Array.from(new Set([...ALWAYS_ELIGIBLE_SYMBOLS, ...topTickers, ...held]));
    return {symbols, navigators};
};

// Deterministic scoring inputs: brain slow layer + eligibility counts + signals.
// Sector standing, shared by both consumers of it: an ETF *is* its sector, and a
// single name inherits a tilt from whichever sector it is most linked to. Ranked
// across sectors (not across symbols) so a sector holding five tickers in the
// universe does not count five times.
type SectorStanding = {tiltByKey: Map<string, number>; nameByKey: Map<string, string>};

const buildSectorStanding = async (): Promise<SectorStanding> => {
    const sectors = await BrainEntity.find({type: 'sector'}).lean();
    const normalized = rankNormalize(sectors.map((s) => s.weightSlow ?? 0));
    return {
        tiltByKey: new Map(sectors.map((s, i) => [s.key, normalized[i]])),
        nameByKey: new Map(sectors.map((s) => [s.key, s.displayName || s.key.replace(SECTOR_KEY_PREFIX, '')])),
    };
};

export const computeNavigatorScores = async (symbols: string[]): Promise<ScoredSymbol[]> => {
    await connectToDatabase();
    // Sector entities are fetched alongside the symbols themselves: a sector ETF's
    // narrative lives under 'sector:<slug>', never under its ticker.
    const sectorKeysForSymbols = symbols
        .map((s) => ETF_TO_SECTOR_KEY[s])
        .filter((k): k is string => Boolean(k));
    const entities = await BrainEntity.find({key: {$in: [...symbols, ...sectorKeysForSymbols]}}).lean();
    const entityByKey = new Map(entities.map((e) => [e.key, e]));
    const sectorStanding = await buildSectorStanding();
    const thesisKeys = new Set(
        (await BrainEntity.find({thesisSince: {$ne: null}}).lean()).map((e) => e.key),
    );

    const lookbackStart = getEasternDateString(new Date(Date.now() - ELIGIBILITY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000));
    const counts = await NewsItem.aggregate([
        {$match: {publishedDate: {$gte: lookbackStart}, 'extraction.entities.key': {$in: symbols}}},
        {$unwind: '$extraction.entities'},
        {$match: {'extraction.entities.key': {$in: symbols}}},
        {$group: {_id: '$extraction.entities.key', articles: {$addToSet: '$contentHash'}, sources: {$addToSet: '$source'}}},
    ]);
    const countByKey = new Map<string, {articles: number; sources: number}>(
        counts.map((c: {_id: string; articles: unknown[]; sources: unknown[]}) => [c._id, {articles: c.articles.length, sources: c.sources.length}]),
    );

    const barsBySymbol = await getBarsForSymbols(symbols);

    const inputs: ScoringInput[] = symbols.map((symbol) => {
        // A sector ETF reads its own sector entity; anything else reads its own.
        const sectorKeyForEtf = ETF_TO_SECTOR_KEY[symbol];
        const entity = entityByKey.get(sectorKeyForEtf ?? symbol);
        const links: {key: string; weight: number}[] = entity?.links ?? [];
        const sectorKey = sectorKeyForEtf ?? dominantSectorKey(links);

        // The ETF inherits its sector's thesis; a single name inherits from any
        // linked entity with one, including its sector or a theme.
        const ownKeys = [entity?.key, symbol].filter((k): k is string => Boolean(k));
        const thesisSelf = ownKeys.find((k) => thesisKeys.has(k));
        const thesisLink = thesisSelf ?? links.find((l) => thesisKeys.has(l.key))?.key;

        const bars = barsBySymbol.get(symbol) ?? [];
        const weight = entity?.weightSlow ?? 0;
        return {
            symbol,
            newsWeightSlow: weight,
            sentimentSlow: weight > 1e-9 ? (entity?.sentimentSumSlow ?? 0) / weight : 0,
            signals: computeSignals(bars),
            sectorTilt: sectorKey ? sectorStanding.tiltByKey.get(sectorKey) ?? 0 : 0,
            sectorLabel: sectorKey ? sectorStanding.nameByKey.get(sectorKey) : undefined,
            hasActiveThesis: thesisLink !== undefined,
            thesisLabel: thesisLink,
            articleCount: countByKey.get(symbol)?.articles ?? 0,
            sourceCount: countByKey.get(symbol)?.sources ?? 0,
            barsCount: bars.length,
            alwaysEligible: ALWAYS_ELIGIBLE_SYMBOLS.includes(symbol),
        };
    });
    return scoreUniverse(inputs);
};

export type AccountPlan = {planned: PlannedOrder[]; positions: HeldPosition[]; totalValue: number};

// Plan one account's orders under the holding rails. Returns null when the
// account can't be resolved (deleted / not owned).
export const planAccountOrders = async (
    userId: string,
    accountId: string,
    targets: TargetWeight[],
    scoreBySymbol: Map<string, ScoredSymbol>,
    maxTrades?: number,
): Promise<AccountPlan | null> => {
    const account = await getOwnedAccount(userId, accountId);
    if (!account) return null;

    const positionSymbols = account.positions.map((p) => p.symbol);
    const priceMap = await buildPriceMap([...positionSymbols, ...targets.map((t) => t.symbol)]);
    const portfolio = computePortfolio(
        {cash: account.cash, startingBalance: account.startingBalance, positions: account.positions.map((p) => ({symbol: p.symbol, company: p.company, quantity: p.quantity, avgCost: p.avgCost}))},
        priceMap,
    );

    // Last buy per held symbol → approximate trading days held (5/7 of calendar).
    const lastBuys = await PaperTrade.aggregate([
        {$match: {accountId: String(account._id), side: 'buy'}},
        {$group: {_id: '$symbol', last: {$max: '$createdAt'}}},
    ]);
    const lastBuyBySymbol = new Map<string, number>(
        lastBuys.map((r: {_id: string; last: Date}) => [r._id, new Date(r.last).getTime()]),
    );

    const positions: HeldPosition[] = portfolio.positions.map((p) => {
        const lastBuy = lastBuyBySymbol.get(p.symbol);
        const calendarDays = lastBuy ? (Date.now() - lastBuy) / (24 * 60 * 60 * 1000) : null;
        return {
            symbol: p.symbol,
            quantity: p.quantity,
            avgCost: p.avgCost,
            price: typeof p.currentPrice === 'number' ? p.currentPrice : null,
            heldTradingDays: calendarDays === null ? null : Math.floor(calendarDays * 5 / 7),
            // v1: thesis health is already 20% of the score, so score-based exits
            // cover a dying thesis; a dedicated thesis-history trigger is v2.
            thesisBroken: false,
            score: scoreBySymbol.get(p.symbol)?.score ?? null,
        };
    });
    // diffToOrders resolves entry prices from position rows only — unheld
    // targets need quantity-0 quote-carrier rows or they are silently skipped.
    const heldSymbols = new Set(positions.map((p) => p.symbol));
    for (const t of targets) {
        if (heldSymbols.has(t.symbol)) continue;
        positions.push({
            symbol: t.symbol,
            quantity: 0,
            avgCost: 0,
            price: priceMap.get(t.symbol.toUpperCase())?.price ?? null,
            heldTradingDays: null,
            thesisBroken: false,
            score: scoreBySymbol.get(t.symbol)?.score ?? null,
        });
    }

    const planned = diffToOrders({totalValue: portfolio.totalValue, cash: portfolio.cash, positions, targets, maxTrades});
    return {planned, positions, totalValue: portfolio.totalValue};
};

// Assemble the SuggestionItem for one executed (or skipped) order.
export const buildOrderItem = (
    order: PlannedOrder,
    result: {success: boolean; message?: string; price?: number},
    targets: TargetWeight[],
    plan: AccountPlan,
    scoreBySymbol: Map<string, ScoredSymbol>,
): SuggestionItem => {
    const target = targets.find((t) => t.symbol === order.symbol);
    const held = plan.positions.find((p) => p.symbol === order.symbol);
    return {
        symbol: order.symbol,
        action: order.side,
        quantity: order.quantity,
        targetWeight: target?.weight ?? 0,
        currentWeight: held && held.price !== null && plan.totalValue > 0
            ? (held.quantity * held.price) / plan.totalValue : 0,
        score: scoreBySymbol.get(order.symbol)?.score ?? 0,
        reasons: [order.reason, ...(scoreBySymbol.get(order.symbol)?.reasons ?? []).slice(0, 3)],
        executed: result.success,
        ...(result.success && typeof result.price === 'number' ? {executionPrice: result.price} : {}),
        ...(!result.success ? {error: result.message} : {}),
    };
};

// Hold items for real positions kept this run (skips the quantity-0 quote carriers).
export const buildHoldItems = (
    plan: AccountPlan,
    targets: TargetWeight[],
    scoreBySymbol: Map<string, ScoredSymbol>,
): SuggestionItem[] => {
    const orderedSymbols = new Set(plan.planned.map((o) => o.symbol));
    const holds: SuggestionItem[] = [];
    for (const p of plan.positions) {
        if (p.quantity === 0 || orderedSymbols.has(p.symbol)) continue;
        const target = targets.find((t) => t.symbol === p.symbol);
        holds.push({
            symbol: p.symbol,
            action: 'hold',
            targetWeight: target?.weight ?? (p.price !== null && plan.totalValue > 0 ? (p.quantity * p.price) / plan.totalValue : 0),
            currentWeight: p.price !== null && plan.totalValue > 0 ? (p.quantity * p.price) / plan.totalValue : 0,
            score: p.score ?? 0,
            reasons: (scoreBySymbol.get(p.symbol)?.reasons ?? ['holding — no exit trigger']).slice(0, 3),
            executed: false,
        });
    }
    return holds;
};

// Latest global model portfolio + the user's own executed set (if enrolled).
export const getLatestSuggestions = async (userId: string): Promise<{global: SuggestionSetView | null; user: SuggestionSetView | null}> => {
    try {
        await connectToDatabase();
        const [globalSet, userSet] = await Promise.all([
            SuggestionSet.findOne({userId: GLOBAL_SUGGESTIONS_USER}).sort({date: -1}),
            SuggestionSet.findOne({userId}).sort({date: -1}),
        ]);
        return {global: toView(globalSet), user: toView(userSet)};
    } catch (error) {
        console.error('Error reading suggestions:', error);
        return {global: null, user: null};
    }
};
