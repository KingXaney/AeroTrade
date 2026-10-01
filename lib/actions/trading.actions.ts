'use server';

import {revalidatePath} from "next/cache";
import PaperAccount from "@/database/models/paper-account.model";
import PaperTrade from "@/database/models/paper-trade.model";
import AccountSnapshot from "@/database/models/account-snapshot.model";
import AccountIncome from "@/database/models/account-income.model";
import {PAPER_STARTING_BALANCE} from "@/lib/trading/config";
import {getCurrentUserId} from "@/lib/auth/session";
import {getOwnedAccount} from "@/lib/trading/accounts";
import {resolveStartingBalance} from "@/lib/trading/starting-balance";
import {seedDayZeroSnapshot} from "@/lib/trading/lifecycle";
import {executeOrder} from "@/lib/trading/orders";
import {sanitizeTradeNote} from "@/lib/trading/order-math";

// Every surface that shows account data — trade desk, portfolio hub, dashboard, friends.
const revalidateTradingPaths = () => {
    revalidatePath('/');
    revalidatePath('/trade');
    revalidatePath('/portfolio');
    revalidatePath('/friends');
};

// Place a market order at the current live price. Whole shares, long-only.
// Thin session wrapper — the execution logic lives in lib/trading/orders.ts so the
// AI navigator job can share the exact same path without a request context.
// `note` is the learner's own "why": typed unknown because a server action's arguments
// arrive from the client unchecked; sanitizeTradeNote keeps only a bounded one-line string.
export const placeOrder = async (
    {symbol, side, quantity, accountId, note}: {symbol: string; side: 'buy' | 'sell'; quantity: number; accountId: string; note?: unknown},
): Promise<OrderResult> => {
    const userId = await getCurrentUserId();
    if (!userId) return {success: false, message: 'Not authenticated'};

    const reason = sanitizeTradeNote(note);
    const result = await executeOrder(userId, {accountId, symbol, side, quantity, source: 'user', ...(reason ? {reason} : {})});
    if (result.success) revalidateTradingPaths();
    return {success: result.success, message: result.message};
};

// Reset one strategy account: back to starting cash, no positions, cleared trade log
// and performance history, with inception re-anchored to now. Preserves the account's
// own starting balance unless a new one is passed.
export const resetPaperAccount = async (accountId: string, startingBalance?: number): Promise<OrderResult> => {
    try {
        const userId = await getCurrentUserId();
        if (!userId) return {success: false, message: 'Not authenticated'};

        const account = await getOwnedAccount(userId, accountId);
        if (!account) return {success: false, message: 'Strategy account not found'};

        const balance = startingBalance === undefined
            ? (account.startingBalance || PAPER_STARTING_BALANCE)
            : resolveStartingBalance(startingBalance);
        if (balance === null) return {success: false, message: 'Invalid starting balance'};

        // One update: a reset account must never keep a watermark claiming its old income.
        await PaperAccount.updateOne(
            {_id: account._id, userId},
            {
                $set: {cash: balance, startingBalance: balance, positions: [], inceptionAt: new Date()},
                $unset: {incomeThrough: 1, incomeTotals: 1},
            },
        );
        // Also sweep pre-migration trades with no accountId: pre-migration this user had
        // exactly one account (old unique index), so they all belong here — otherwise the
        // migration's backfill would later resurrect "deleted" history onto this account.
        await PaperTrade.deleteMany({
            userId,
            $or: [{accountId: String(account._id)}, {accountId: {$exists: false}}],
        });
        await AccountSnapshot.deleteMany({accountId: String(account._id)});
        await AccountIncome.deleteMany({accountId: String(account._id)});

        // Re-read so the day-0 snapshot reflects the reset balances.
        const fresh = await getOwnedAccount(userId, accountId);
        if (fresh) await seedDayZeroSnapshot(fresh);

        revalidateTradingPaths();
        return {success: true, message: `${account.name || 'Strategy'} reset to $${balance.toLocaleString('en-US')}`};
    } catch (error) {
        console.error('Error resetting account:', error);
        return {success: false, message: 'Reset failed'};
    }
};
