// An account's trades: the current-epoch filter every per-account trade read applies, the one
// cached ledger read a page makes, the bounded history, the /history feed and the CSV export's
// read. Server-only (NOT 'use server').

import {cache} from "react";
import {Types} from "mongoose";
import {connectToDatabase} from "@/database/mongoose";
import PaperAccount from "@/database/models/paper-account.model";
import PaperTrade from "@/database/models/paper-trade.model";
import {DEFAULT_ACCOUNT_NAME} from "@/lib/trading/accounts";

type LeanTrade = {
    _id: unknown; symbol: string; company?: string; side: 'buy' | 'sell'; quantity: number; price: number; total: number;
    realizedPnl?: number; source?: string; reason?: string; accountId?: string; createdAt: Date;
};

const toTradeRecord = (t: LeanTrade, accountName?: string): PaperTradeRecord => ({
    id: String(t._id),
    symbol: t.symbol,
    company: t.company || t.symbol,
    side: t.side,
    quantity: t.quantity,
    price: t.price,
    total: t.total,
    realizedPnl: t.realizedPnl,
    ...(t.source ? {source: t.source as TradeSource} : {}),
    ...(t.reason ? {reason: t.reason} : {}),
    ...(accountName ? {accountName} : {}),
    createdAt: new Date(t.createdAt).getTime(),
});

// Where an account's current epoch starts, for every per-account trade read. A reset
// re-anchors inceptionAt and then deletes the old epoch's trades; one that crashed between the
// two leaves rows behind that must not feed a receipt, a lot note or a count, so reads start at
// inceptionAt, as creditAccountIncome's do. Accounts from before inceptionAt existed have none
// and keep their migrated history. Undefined when the account is not this user's — nothing of
// theirs to read. cache() shares it between a render's ledger and history reads.
const tradeEpoch = cache(async (userId: string, accountId: string): Promise<{since: Date | null} | undefined> => {
    if (!Types.ObjectId.isValid(accountId)) return undefined;
    await connectToDatabase();
    const account = await PaperAccount.findOne({_id: accountId, userId}).select('inceptionAt').lean<{inceptionAt?: Date} | null>();
    return account ? {since: account.inceptionAt ?? null} : undefined;
});

// The one PaperTrade filter for an account's current epoch. Exported for readers that already
// hold the account (the CSV export, the chat's learner figures) — they apply the same rule
// without reading the account again.
export const epochTrades = (userId: string, accountId: string, since: Date | null | undefined) =>
    ({userId, accountId, ...(since ? {createdAt: {$gte: since}} : {})});

// The same rule over several accounts at once: each account's trades from its own inceptionAt.
// No accounts match nothing (MongoDB rejects an empty $or).
export const epochTradesOf = (userId: string, accounts: readonly {_id: unknown; inceptionAt?: Date | null}[]) =>
    (accounts.length === 0
        ? {userId, accountId: {$in: [] as string[]}}
        : {$or: accounts.map((a) => epochTrades(userId, String(a._id), a.inceptionAt))});

// One account's whole trade ledger for its current epoch, oldest first — the one PaperTrade
// read a page makes for an account: analytics (trade count, realized P&L, win rate), the trade
// log's tail, fill receipts and the buy notes all derive from it. cache() dedupes it within a
// render. Unbounded on purpose (analytics sums every trade, as the income job reads the whole
// epoch), and walked on the {accountId, createdAt, _id} index, so it never sorts in memory.
// A failed read THROWS: an empty ledger would read as "0 trades", $0 realized and "No trades
// yet". getAccountAnalytics and getIncomeActivity catch it and hide their sections; a page that
// calls it directly catches it and hides what it draws from it.
export const getTradeLedger = cache(async (userId: string, accountId: string): Promise<PaperTradeRecord[]> => {
    const epoch = await tradeEpoch(userId, accountId);
    if (!epoch) return [];
    const trades = await PaperTrade.find(epochTrades(userId, accountId, epoch.since)).sort({createdAt: 1, _id: 1}).lean<LeanTrade[]>();
    return trades.map((t) => toTradeRecord(t));
});

// The trade log's page size, for getTradeHistory and for pages that slice their ledger.
export const TRADE_HISTORY_LIMIT = 50;

// The newest `limit` fills of the current epoch, newest first, in a bounded read of their own
// (the same index, walked backwards, `limit` rows) — for callers that do not hold the ledger:
// the chat tool, the recent-trades widget, a strategy page. /portfolio and /trade already read
// the ledger and slice it instead.
export const getTradeHistory = async (userId: string, accountId: string, limit = TRADE_HISTORY_LIMIT): Promise<PaperTradeRecord[]> => {
    try {
        const epoch = await tradeEpoch(userId, accountId);
        if (!epoch) return [];
        const trades = await PaperTrade.find(epochTrades(userId, accountId, epoch.since))
            .sort({createdAt: -1, _id: -1})
            .limit(limit)
            .lean<LeanTrade[]>();
        return trades.map((t) => toTradeRecord(t));
    } catch (error) {
        console.error('Error fetching trade history:', error);
        return [];
    }
};

// Newest fills across every strategy account, each tagged with its account's name —
// the /history page's trade feed. Read-only (no lazy account creation). The list and its count
// are each account's current epoch (epochTradesOf), as every per-account read is: a reset that
// crashed before deleting the old epoch's fills must not bring them back here either.
// Null when the read fails, so the page can say so instead of showing an empty ledger.
export const getRecentTradesForUser = async (userId: string, limit = 50): Promise<{trades: PaperTradeRecord[]; total: number} | null> => {
    try {
        await connectToDatabase();
        const accounts = await PaperAccount.find({userId}).select('name inceptionAt').lean<{_id: unknown; name?: string; inceptionAt?: Date}[]>();
        const epoch = epochTradesOf(userId, accounts);
        const [trades, total] = await Promise.all([
            PaperTrade.find(epoch).sort({createdAt: -1, _id: -1}).limit(limit).lean<LeanTrade[]>(),
            PaperTrade.countDocuments(epoch),
        ]);
        const names = new Map(accounts.map((a) => [String(a._id), a.name || DEFAULT_ACCOUNT_NAME]));
        return {trades: trades.map((t) => toTradeRecord(t, t.accountId ? names.get(t.accountId) : undefined)), total};
    } catch (error) {
        console.error('Error fetching recent trades:', error);
        return null;
    }
};
