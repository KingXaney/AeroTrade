// Server-only paper-trading helpers (NOT a 'use server' module — these are plain
// async functions used by server components and by the server actions in
// lib/actions/trading.actions.ts and friends.actions.ts). Keeping the non-serializable
// bits (Mongoose docs, price Maps) out of the 'use server' boundary.

import {connectToDatabase} from "@/database/mongoose";
import PaperAccount, {type PaperAccountDoc} from "@/database/models/paper-account.model";
import PaperTrade from "@/database/models/paper-trade.model";
import {PAPER_STARTING_BALANCE} from "@/lib/constants";
import {getQuote} from "@/lib/actions/finnhub.actions";

export type PriceInfo = {price?: number; changePercent?: number};

// Minimal plain shape used to compute a portfolio (works for Mongoose docs after
// mapping, lean docs, or a synthesized default account).
export type AccountLike = {cash: number; startingBalance: number; positions: PaperPosition[]};

// Returns the user's paper account, creating it with the starting balance on first use.
export const getOrCreatePaperAccount = async (userId: string): Promise<PaperAccountDoc> => {
    await connectToDatabase();
    const existing = await PaperAccount.findOne({userId});
    if (existing) return existing;

    return PaperAccount.create({
        userId,
        cash: PAPER_STARTING_BALANCE,
        startingBalance: PAPER_STARTING_BALANCE,
        positions: [],
    });
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
            price: typeof q.c === 'number' ? q.c : undefined,
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

// Convenience: full portfolio for a single user (prices fetched fresh).
export const getPortfolio = async (userId: string): Promise<PortfolioSummary> => {
    const account = await getOrCreatePaperAccount(userId);
    const positions: PaperPosition[] = account.positions.map((p) => ({
        symbol: p.symbol,
        company: p.company,
        quantity: p.quantity,
        avgCost: p.avgCost,
    }));
    const priceMap = await buildPriceMap(positions.map((p) => p.symbol));
    return computePortfolio({cash: account.cash, startingBalance: account.startingBalance, positions}, priceMap);
};

export const getTradeHistory = async (userId: string): Promise<PaperTradeRecord[]> => {
    try {
        await connectToDatabase();
        const trades = await PaperTrade.find({userId}).sort({createdAt: -1}).limit(50).lean();
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
