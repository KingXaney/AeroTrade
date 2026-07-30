'use server';

import {revalidatePath} from "next/cache";
import PaperAccount from "@/database/models/paper-account.model";
import PaperTrade from "@/database/models/paper-trade.model";
import AccountSnapshot from "@/database/models/account-snapshot.model";
import {PAPER_STARTING_BALANCE} from "@/lib/constants";
import {getCurrentUserId} from "@/lib/actions/watchlist.actions";
import {getOwnedAccount, seedDayZeroSnapshot} from "@/lib/trading/account";
import {executeOrder} from "@/lib/trading/orders";

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
export const placeOrder = async (
    {symbol, side, quantity, accountId}: {symbol: string; side: 'buy' | 'sell'; quantity: number; accountId: string},
): Promise<OrderResult> => {
    const userId = await getCurrentUserId();
    if (!userId) return {success: false, message: 'Not authenticated'};

    const result = await executeOrder(userId, {accountId, symbol, side, quantity});
    if (result.success) revalidateTradingPaths();
    return {success: result.success, message: result.message};
};

// Reset one strategy account: back to starting cash, no positions, cleared trade log
// and performance history, with inception re-anchored to now.
export const resetPaperAccount = async (accountId: string): Promise<OrderResult> => {
    try {
        const userId = await getCurrentUserId();
        if (!userId) return {success: false, message: 'Not authenticated'};

        const account = await getOwnedAccount(userId, accountId);
        if (!account) return {success: false, message: 'Strategy account not found'};

        await PaperAccount.updateOne(
            {_id: account._id, userId},
            {$set: {cash: PAPER_STARTING_BALANCE, startingBalance: PAPER_STARTING_BALANCE, positions: [], inceptionAt: new Date()}},
        );
        // Also sweep pre-migration trades with no accountId: pre-migration this user had
        // exactly one account (old unique index), so they all belong here — otherwise the
        // migration's backfill would later resurrect "deleted" history onto this account.
        await PaperTrade.deleteMany({
            userId,
            $or: [{accountId: String(account._id)}, {accountId: {$exists: false}}],
        });
        await AccountSnapshot.deleteMany({accountId: String(account._id)});

        // Re-read so the day-0 snapshot reflects the reset balances.
        const fresh = await getOwnedAccount(userId, accountId);
        if (fresh) await seedDayZeroSnapshot(fresh);

        revalidateTradingPaths();
        return {success: true, message: `${account.name || 'Strategy'} reset to $${PAPER_STARTING_BALANCE.toLocaleString('en-US')}`};
    } catch (error) {
        console.error('Error resetting account:', error);
        return {success: false, message: 'Reset failed'};
    }
};
