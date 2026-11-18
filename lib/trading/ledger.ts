// An account's trades: the current-epoch filter every per-account trade read applies, the one
// cached ledger read a page makes, the bounded history, the /history feed and the CSV export's
// read. Each read hands back the account's fills as its books hold them now: with a fill whose
// row is still to be inserted, and in today's shares after a split. Server-only (NOT 'use server').

import {cache} from "react";
import {Types} from "mongoose";
import {connectToDatabase} from "@/database/mongoose";
import PaperAccount from "@/database/models/paper-account.model";
import PaperTrade from "@/database/models/paper-trade.model";
import {DEFAULT_ACCOUNT_NAME, getOwnedAccount} from "@/lib/trading/accounts";
import type {CsvTrade} from "@/lib/trading/csv";
import {TRADE_HISTORY_LIMIT} from "@/lib/trading/config";
import {pendingTradeRow, withPendingRows, type PendingFillLike} from "@/lib/trading/pending";
import {restateFill, toAppliedSplits, type AppliedSplit} from "@/lib/trading/splits";
import type {PaperTradeRecord, TradeSource} from '@/lib/trading/types';

type LeanTrade = {
    _id: unknown; symbol: string; company?: string; side: 'buy' | 'sell'; quantity: number; price: number; total: number;
    realizedPnl?: number; source?: string; reason?: string; accountId?: string; createdAt: Date;
};

// Two things every per-account trade read does to the rows it found, both from the account's
// own document. A fill the account has taken whose row is not inserted yet is added
// (lib/trading/pending.ts). And a fill from before a stock split the account has applied is
// restated in today's shares (lib/trading/splits.ts) — the basis its position is stored in.
type StoredSplits = Parameters<typeof toAppliedSplits>[0];

const toTradeRecord = (t: LeanTrade, splits: readonly AppliedSplit[], accountName?: string): PaperTradeRecord => restateFill({
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
}, splits);

// Where an account's current epoch starts, for every per-account trade read. A reset
// re-anchors inceptionAt and then deletes the old epoch's trades; one that crashed between the
// two leaves rows behind that must not feed a receipt, a lot note or a count, so reads start at
// inceptionAt, as creditAccountIncome's do. Accounts from before inceptionAt existed have none
// and keep their migrated history. Undefined when the account is not this user's — nothing of
// theirs to read. cache() shares it between a render's ledger and history reads.
type TradeEpoch = {since: Date | null; pending: LeanTrade | null; splits: AppliedSplit[]};

const tradeEpoch = cache(async (userId: string, accountId: string): Promise<TradeEpoch | undefined> => {
    if (!Types.ObjectId.isValid(accountId)) return undefined;
    await connectToDatabase();
    const account = await PaperAccount.findOne({_id: accountId, userId}).select('inceptionAt pendingFill splits')
        .lean<{inceptionAt?: Date; pendingFill?: PendingFillLike; splits?: StoredSplits} | null>();
    return account
        ? {since: account.inceptionAt ?? null, pending: pendingTradeRow(accountId, account.pendingFill), splits: toAppliedSplits(account.splits)}
        : undefined;
});

// The one PaperTrade filter for an account's current epoch. Exported for readers that already
// hold the account (the CSV export, the chat's learner figures) — they apply the same rule
// without reading the account again.
const epochTrades = (userId: string, accountId: string, since: Date | null | undefined) =>
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
    return withPendingRows(trades, [epoch.pending], 'asc').map((t) => toTradeRecord(t, epoch.splits));
});

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
        return withPendingRows(trades, [epoch.pending], 'desc').slice(0, limit).map((t) => toTradeRecord(t, epoch.splits));
    } catch (error) {
        console.error('Error fetching trade history:', error);
        return [];
    }
};

// Newest fills across every one of the user's accounts, each tagged with its account's name —
// the /history page's trade feed. Read-only (no lazy account creation). The list and its count
// are each account's current epoch (epochTradesOf), as every per-account read is: a reset that
// crashed before deleting the old epoch's fills must not bring them back here either.
// Null when the read fails, so the page can say so instead of showing an empty ledger.
export const getRecentTradesForUser = async (userId: string, limit = 50): Promise<{trades: PaperTradeRecord[]; total: number} | null> => {
    try {
        await connectToDatabase();
        const accounts = await PaperAccount.find({userId}).select('name inceptionAt pendingFill splits')
            .lean<{_id: unknown; name?: string; inceptionAt?: Date; pendingFill?: PendingFillLike; splits?: StoredSplits}[]>();
        const epoch = epochTradesOf(userId, accounts);
        const [found, counted] = await Promise.all([
            PaperTrade.find(epoch).sort({createdAt: -1, _id: -1}).limit(limit).lean<LeanTrade[]>(),
            PaperTrade.countDocuments(epoch),
        ]);
        const names = new Map(accounts.map((a) => [String(a._id), a.name || DEFAULT_ACCOUNT_NAME]));
        const splits = new Map(accounts.map((a) => [String(a._id), toAppliedSplits(a.splits)]));
        const trades = withPendingRows(found, accounts.map((a) => pendingTradeRow(String(a._id), a.pendingFill)), 'desc');
        return {
            trades: trades.slice(0, limit).map((t) => toTradeRecord(t, (t.accountId && splits.get(t.accountId)) || [], t.accountId ? names.get(t.accountId) : undefined)),
            total: counted + (trades.length - found.length),
        };
    } catch (error) {
        console.error('Error fetching recent trades:', error);
        return null;
    }
};

// One account's whole current epoch for its CSV export, oldest first, with the account's name
// for the file. Deliberately not getTradeHistory's page (an export is complete by definition),
// but still the epoch: rows from before inceptionAt (a reset that crashed before deleting them)
// are no more this account's than they are on /portfolio. Null when the account is not the user's.
export const getAccountExport = async (userId: string, accountId: string): Promise<{name: string; trades: CsvTrade[]} | null> => {
    const account = await getOwnedAccount(userId, accountId);
    if (!account) return null;
    const id = String(account._id);
    const trades = await PaperTrade.find(epochTrades(userId, id, account.inceptionAt)).sort({createdAt: 1, _id: 1}).lean<(CsvTrade & {_id: unknown; createdAt: Date})[]>();
    const splits = toAppliedSplits(account.splits);
    return {name: account.name, trades: withPendingRows(trades, [pendingTradeRow(id, account.pendingFill)], 'asc').map((t) => restateFill(t, splits))};
};
