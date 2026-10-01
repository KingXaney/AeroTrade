// The delete behind deletePaperAccount, kept out of the 'use server' module so its
// refusals are unit-tested with the models stubbed. Server-only (DB-bound).

import PaperAccount from "@/database/models/paper-account.model";
import PaperTrade from "@/database/models/paper-trade.model";
import AccountSnapshot from "@/database/models/account-snapshot.model";
import AccountIncome from "@/database/models/account-income.model";
import AiNavigator from "@/database/models/ai-navigator.model";
import {getOwnedAccount} from "@/lib/trading/account";

// Delete a strategy account and everything scoped to it (trades, snapshots, income).
// `deletedId` lets the action clear the active-account cookie when it named this one.
export const deleteOwnedAccount = async (
    userId: string,
    accountId: string,
): Promise<OrderResult & {deletedId?: string}> => {
    const account = await getOwnedAccount(userId, accountId);
    if (!account) return {success: false, message: 'Strategy account not found'};

    const count = await PaperAccount.countDocuments({userId});
    if (count <= 1) return {success: false, message: 'You need at least one strategy account'};

    // Deleting it would leave the weekly run with no account to trade, and enrolling
    // again is refused while the enrollment stands; unenrolling keeps the account.
    const id = String(account._id);
    if (await AiNavigator.exists({userId, accountId: id})) {
        return {success: false, message: 'The AI Navigator trades in this account — unenroll it on the Brain page first'};
    }

    // Children first, parent last: a crash mid-cascade leaves the account intact and
    // the delete retryable, instead of permanently orphaning trades/snapshots behind
    // an ownership gate that can no longer resolve the account.
    await PaperTrade.deleteMany({accountId: id});
    await AccountSnapshot.deleteMany({accountId: id});
    await AccountIncome.deleteMany({accountId: id});
    await PaperAccount.deleteOne({_id: account._id, userId});
    return {success: true, message: `Deleted "${account.name || 'strategy'}"`, deletedId: id};
};
