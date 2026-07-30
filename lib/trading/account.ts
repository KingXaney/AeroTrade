// Server-only paper-trading helpers (NOT a 'use server' module — these are plain
// async functions used by server components and by the server actions in
// lib/actions/trading.actions.ts, accounts.actions.ts and friends.actions.ts).
// Keeping the non-serializable bits (Mongoose docs, price Maps) out of the
// 'use server' boundary.

import {Types} from "mongoose";
import {connectToDatabase} from "@/database/mongoose";
import PaperAccount, {type PaperAccountDoc} from "@/database/models/paper-account.model";
import PaperTrade from "@/database/models/paper-trade.model";
import AccountSnapshot from "@/database/models/account-snapshot.model";
import BenchmarkSnapshot from "@/database/models/benchmark-snapshot.model";
import {BENCHMARK_SYMBOL, MAX_STARTING_BALANCE, MIN_STARTING_BALANCE, PAPER_STARTING_BALANCE} from "@/lib/constants";
import {getEasternDateString} from "@/lib/utils";
import {getQuote} from "@/lib/actions/finnhub.actions";
import {
    buildPerfSeries,
    computeMaxDrawdown,
    computeRealizedPnl,
    computeWinStats,
    mergeLivePoint,
} from "@/lib/trading/analytics";

export type PriceInfo = {price?: number; changePercent?: number};

// Minimal plain shape used to compute a portfolio (works for Mongoose docs after
// mapping, lean docs, or a synthesized default account).
export type AccountLike = {cash: number; startingBalance: number; positions: PaperPosition[]};

export const DEFAULT_ACCOUNT_NAME = 'Main Strategy';

// Whole dollars within bounds; undefined means the standard default; null = invalid.
// The starting balance is fixed at creation — editing it mid-flight would corrupt
// every return/benchmark calculation, so changes go through create or reset.
export const resolveStartingBalance = (value?: number): number | null => {
    if (value === undefined) return PAPER_STARTING_BALANCE;
    if (!Number.isFinite(value)) return null;
    const whole = Math.floor(value);
    if (whole < MIN_STARTING_BALANCE || whole > MAX_STARTING_BALANCE) return null;
    return whole;
};

// Pre-migration accounts may lack name/inceptionAt in the DB — fall back gracefully.
export const toAccountSummary = (account: PaperAccountDoc): PaperAccountSummary => ({
    id: String(account._id),
    name: account.name || DEFAULT_ACCOUNT_NAME,
    inceptionAt: new Date(account.inceptionAt || account.createdAt).getTime(),
    createdAt: new Date(account.createdAt).getTime(),
});

const toPlainPositions = (account: {positions: PaperPosition[]}): PaperPosition[] =>
    account.positions.map((p) => ({
        symbol: p.symbol,
        company: p.company || p.symbol,
        quantity: p.quantity,
        avgCost: p.avgCost,
    }));

// All strategy accounts for a user, oldest first. Creates "Main Strategy" on first use
// (preserves the original lazy-create behavior).
export const getAccountsForUser = async (userId: string): Promise<PaperAccountDoc[]> => {
    await connectToDatabase();
    const existing = await PaperAccount.find({userId}).sort({createdAt: 1});
    if (existing.length === 1) {
        // Lazy backfill for pre-migration trades (no accountId): a single-account user's
        // legacy trades all belong to that account. Self-extinguishing — after the first
        // updateMany the exists() probe never matches again.
        const hasLegacy = await PaperTrade.exists({userId, accountId: {$exists: false}});
        if (hasLegacy) {
            await PaperTrade.updateMany(
                {userId, accountId: {$exists: false}},
                {$set: {accountId: String(existing[0]._id)}},
            );
        }
    }
    if (existing.length > 0) return existing;

    const created = await PaperAccount.create({
        userId,
        name: DEFAULT_ACCOUNT_NAME,
        cash: PAPER_STARTING_BALANCE,
        startingBalance: PAPER_STARTING_BALANCE,
        inceptionAt: new Date(),
        positions: [],
    });
    return [created];
};

// Ownership gate: every account-scoped read or write resolves the account through this.
export const getOwnedAccount = async (userId: string, accountId: string): Promise<PaperAccountDoc | null> => {
    if (!Types.ObjectId.isValid(accountId)) return null;
    await connectToDatabase();
    return PaperAccount.findOne({_id: accountId, userId});
};

// The account the UI operates on: the preferred one (cookie / ?account= param) when
// owned, else the user's first account.
export const resolveActiveAccount = async (userId: string, preferredId?: string | null): Promise<PaperAccountDoc> => {
    const accounts = await getAccountsForUser(userId);
    if (preferredId) {
        const match = accounts.find((a) => String(a._id) === preferredId);
        if (match) return match;
    }
    return accounts[0];
};

// Build a symbol -> live price map. One Finnhub quote call per unique symbol
// (company names come from the stored position, so no profile/financials calls).
export const buildPriceMap = async (symbols: string[]): Promise<Map<string, PriceInfo>> => {
    const map = new Map<string, PriceInfo>();
    const unique = Array.from(new Set(symbols.map((s) => s.toUpperCase()))).filter(Boolean);
    if (unique.length === 0) return map;

    const quotes = await Promise.all(unique.map((s) => getQuote(s)));
    unique.forEach((symbol, i) => {
        const q = quotes[i];
        map.set(symbol, {
            // c <= 0 means Finnhub doesn't know the symbol (delisted/unknown) — treat as missing,
            // never as a real $0 price.
            price: typeof q.c === 'number' && q.c > 0 ? q.c : undefined,
            changePercent: q.dp,
        });
    });
    return map;
};

// Pure computation: turn a stored account + price map into a serializable portfolio summary.
export const computePortfolio = (
    account: AccountLike,
    priceMap: Map<string, PriceInfo>,
): PortfolioSummary => {
    const positions: EnrichedPosition[] = account.positions.map((p) => {
        const info = priceMap.get(p.symbol.toUpperCase());
        const currentPrice = info?.price;
        const costBasis = p.avgCost * p.quantity;
        const marketValue = typeof currentPrice === 'number' ? currentPrice * p.quantity : costBasis;
        const unrealizedPnl = marketValue - costBasis;
        const unrealizedPnlPct = costBasis > 0 ? (unrealizedPnl / costBasis) * 100 : 0;
        return {
            symbol: p.symbol,
            quantity: p.quantity,
            avgCost: p.avgCost,
            company: p.company || p.symbol,
            currentPrice,
            changePercent: info?.changePercent,
            costBasis,
            marketValue,
            unrealizedPnl,
            unrealizedPnlPct,
        };
    });

    const holdingsValue = positions.reduce((sum, p) => sum + p.marketValue, 0);
    const totalValue = account.cash + holdingsValue;
    const totalReturnAbs = totalValue - account.startingBalance;
    const totalReturnPct = account.startingBalance > 0 ? (totalReturnAbs / account.startingBalance) * 100 : 0;

    return {
        startingBalance: account.startingBalance,
        cash: account.cash,
        positions: positions.sort((a, b) => b.marketValue - a.marketValue),
        holdingsValue,
        totalValue,
        totalReturnAbs,
        totalReturnPct,
    };
};

// Full portfolio for one account (prices fetched fresh). Without an accountId this
// falls back to the user's first/active account.
export const getPortfolio = async (userId: string, accountId?: string): Promise<PortfolioSummary> => {
    const account = (accountId ? await getOwnedAccount(userId, accountId) : null)
        ?? await resolveActiveAccount(userId);
    const positions = toPlainPositions(account);
    const priceMap = await buildPriceMap(positions.map((p) => p.symbol));
    return computePortfolio({cash: account.cash, startingBalance: account.startingBalance, positions}, priceMap);
};

// Every account priced from ONE shared quote map (same trick as the friends leaderboard).
export const getPortfoliosForUser = async (userId: string): Promise<AccountWithPortfolio[]> => {
    const accounts = await getAccountsForUser(userId);
    const allSymbols = accounts.flatMap((a) => a.positions.map((p) => p.symbol));
    const priceMap = await buildPriceMap(allSymbols);
    return accounts.map((a) => ({
        account: toAccountSummary(a),
        summary: computePortfolio(
            {cash: a.cash, startingBalance: a.startingBalance, positions: toPlainPositions(a)},
            priceMap,
        ),
    }));
};

// Pure: collapse all of a user's strategy accounts into one summary (sidebar/dashboard).
export const aggregatePortfolios = (list: AccountWithPortfolio[]): PortfolioSummary => {
    const cash = list.reduce((sum, x) => sum + x.summary.cash, 0);
    const startingBalance = list.reduce((sum, x) => sum + x.summary.startingBalance, 0);
    const holdingsValue = list.reduce((sum, x) => sum + x.summary.holdingsValue, 0);
    const positions = list
        .flatMap((x) => x.summary.positions)
        .sort((a, b) => b.marketValue - a.marketValue);
    const totalValue = cash + holdingsValue;
    const totalReturnAbs = totalValue - startingBalance;
    const totalReturnPct = startingBalance > 0 ? (totalReturnAbs / startingBalance) * 100 : 0;

    return {startingBalance, cash, positions, holdingsValue, totalValue, totalReturnAbs, totalReturnPct};
};

export const getTradeHistory = async (userId: string, accountId: string, limit = 50): Promise<PaperTradeRecord[]> => {
    try {
        await connectToDatabase();
        const trades = await PaperTrade.find({userId, accountId}).sort({createdAt: -1}).limit(limit).lean();
        return trades.map((t) => ({
            id: String(t._id),
            symbol: t.symbol,
            company: t.company || t.symbol,
            side: t.side,
            quantity: t.quantity,
            price: t.price,
            total: t.total,
            realizedPnl: t.realizedPnl,
            createdAt: new Date(t.createdAt).getTime(),
        }));
    } catch (error) {
        console.error('Error fetching trade history:', error);
        return [];
    }
};

// Write today's baseline snapshot for a fresh (created or just-reset) account so the
// performance chart has a day-0 point immediately instead of waiting for the cron.
export const seedDayZeroSnapshot = async (account: PaperAccountDoc): Promise<void> => {
    await AccountSnapshot.updateOne(
        {accountId: String(account._id), date: getEasternDateString()},
        {
            $set: {
                userId: account.userId,
                totalValue: account.startingBalance,
                cash: account.startingBalance,
                holdingsValue: 0,
                startingBalance: account.startingBalance,
            },
        },
        {upsert: true},
    );
};

// Everything the /portfolio analytics section needs for one account: current
// summary, %-return series vs the SPY benchmark, drawdown and trade stats.
// The math lives in analytics.ts (pure); this assembles its inputs.
export const getAccountAnalytics = async (userId: string, accountId: string): Promise<AccountAnalytics | null> => {
    try {
        const account = await getOwnedAccount(userId, accountId);
        if (!account) return null;

        const summaryInfo = toAccountSummary(account);
        const inceptionDate = getEasternDateString(new Date(summaryInfo.inceptionAt));
        const key = String(account._id);

        const [snapshots, benchmarks, trades] = await Promise.all([
            AccountSnapshot.find({accountId: key}).sort({date: 1}).lean(),
            BenchmarkSnapshot.find({symbol: BENCHMARK_SYMBOL, date: {$gte: inceptionDate}}).sort({date: 1}).lean(),
            PaperTrade.find({accountId: key}).lean(),
        ]);

        const positions = toPlainPositions(account);
        const priceMap = await buildPriceMap(positions.map((p) => p.symbol));
        const summary = computePortfolio(
            {cash: account.cash, startingBalance: account.startingBalance, positions},
            priceMap,
        );

        const snapshotPoints: SnapshotPoint[] = snapshots.map((s) => ({date: s.date, value: s.totalValue}));
        const benchmarkPoints: SnapshotPoint[] = benchmarks.map((b) => ({date: b.date, value: b.close}));
        const livePoint: SnapshotPoint = {date: getEasternDateString(), value: summary.totalValue};

        const tradeStats = trades.map((t) => ({side: t.side as string, realizedPnl: t.realizedPnl as number | undefined}));
        const winStats = computeWinStats(tradeStats);

        return {
            account: summaryInfo,
            summary,
            series: buildPerfSeries(snapshotPoints, benchmarkPoints, livePoint),
            maxDrawdownPct: computeMaxDrawdown(mergeLivePoint(snapshotPoints, livePoint)),
            winRatePct: winStats.winRatePct,
            wins: winStats.wins,
            losses: winStats.losses,
            realizedPnl: computeRealizedPnl(tradeStats),
            tradeCount: trades.length,
        };
    } catch (error) {
        console.error('Error computing account analytics:', error);
        return null;
    }
};

// Win rate + max drawdown for every account of a user in two bulk queries
// (feeds the strategy comparison table without N per-account round trips).
// liveValues (accountId -> current total value) folds today's live valuation
// into each drawdown series the same way getAccountAnalytics does.
export const getComparisonStats = async (
    userId: string,
    liveValues?: Record<string, number>,
): Promise<Record<string, {winRatePct: number | null; maxDrawdownPct: number | null}>> => {
    try {
        await connectToDatabase();
        const [trades, snapshots] = await Promise.all([
            PaperTrade.find({userId}).lean(),
            AccountSnapshot.find({userId}).sort({date: 1}).lean(),
        ]);

        const tradesByAccount = new Map<string, {side: string; realizedPnl?: number}[]>();
        for (const t of trades) {
            if (!t.accountId) continue;
            const list = tradesByAccount.get(t.accountId) ?? [];
            list.push({side: t.side, realizedPnl: t.realizedPnl});
            tradesByAccount.set(t.accountId, list);
        }
        const snapshotsByAccount = new Map<string, SnapshotPoint[]>();
        for (const s of snapshots) {
            const list = snapshotsByAccount.get(s.accountId) ?? [];
            list.push({date: s.date, value: s.totalValue});
            snapshotsByAccount.set(s.accountId, list);
        }

        const today = getEasternDateString();
        const ids = new Set([...tradesByAccount.keys(), ...snapshotsByAccount.keys(), ...Object.keys(liveValues ?? {})]);
        const result: Record<string, {winRatePct: number | null; maxDrawdownPct: number | null}> = {};
        for (const id of ids) {
            const live = liveValues?.[id];
            const points = mergeLivePoint(
                snapshotsByAccount.get(id) ?? [],
                typeof live === 'number' ? {date: today, value: live} : undefined,
            );
            result[id] = {
                winRatePct: computeWinStats(tradesByAccount.get(id) ?? []).winRatePct,
                maxDrawdownPct: computeMaxDrawdown(points),
            };
        }
        return result;
    } catch (error) {
        console.error('Error computing comparison stats:', error);
        return {};
    }
};

// Distinct symbols held across ALL of a user's accounts (news digest personalization).
export const getHeldSymbolsByUserId = async (userId: string): Promise<string[]> => {
    try {
        await connectToDatabase();
        const accounts = await PaperAccount.find({userId}).lean();
        return Array.from(new Set(
            accounts.flatMap((a) => (a.positions || []).map((p: PaperPosition) => p.symbol.toUpperCase())),
        ));
    } catch (error) {
        console.error('Error fetching held symbols:', error);
        return [];
    }
};
