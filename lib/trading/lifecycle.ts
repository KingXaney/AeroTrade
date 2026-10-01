// An account's lifecycle writes outside the 'use server' module: the day-zero snapshot a fresh
// account starts with, the restart behind resetting an account and re-enrolling the AI
// Navigator, and the delete behind deletePaperAccount, whose refusals are unit-tested with the
// models stubbed. Server-only (DB-bound).

import PaperAccount, {type PaperAccountDoc} from "@/database/models/paper-account.model";
import PaperTrade from "@/database/models/paper-trade.model";
import AccountSnapshot from "@/database/models/account-snapshot.model";
import AccountIncome from "@/database/models/account-income.model";
import AiNavigator from "@/database/models/ai-navigator.model";
import {getEasternDateString} from "@/lib/dates";
import {getOwnedAccount} from "@/lib/trading/accounts";
import type {ActionResult} from '@/lib/actions/types';

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

// The user's oldest account: the one their pre-migration trades belong to.
const isOriginalAccount = async (userId: string, accountId: string): Promise<boolean> => {
    const oldest = await PaperAccount.findOne({userId}).sort({createdAt: 1}).select('_id').lean<{_id: unknown} | null>();
    return oldest !== null && String(oldest._id) === accountId;
};

// Restart an account at `balance`: cash only, no positions, inception re-anchored to now, and
// its trades, snapshots and income rows deleted, then a day-zero snapshot at the new balance.
// The watermark and totals are unset in the same update — a restarted account must never keep
// a watermark claiming its old income.
//
// `sweepLegacyTrades` also deletes the user's pre-migration trades (no accountId). Before the
// migration a user had exactly one account (the old unique index), so those rows are that
// account's — the user's oldest — and the migration's backfill would otherwise resurrect
// "deleted" history onto it. Only a learner's reset asks (the AI Navigator's account is never
// that one), and the sweep happens only when the account reset is the oldest: resetting a
// second account must not delete the original's history.
export const restartAccount = async (
    userId: string,
    account: PaperAccountDoc,
    balance: number,
    {sweepLegacyTrades = false}: {sweepLegacyTrades?: boolean} = {},
): Promise<void> => {
    const id = String(account._id);
    const claimsLegacy = sweepLegacyTrades && await isOriginalAccount(userId, id);
    await PaperAccount.updateOne(
        {_id: account._id, userId},
        {
            $set: {cash: balance, startingBalance: balance, positions: [], inceptionAt: new Date()},
            $unset: {incomeThrough: 1, incomeTotals: 1},
        },
    );
    await PaperTrade.deleteMany(claimsLegacy
        ? {userId, $or: [{accountId: id}, {accountId: {$exists: false}}]}
        : {accountId: id});
    await AccountSnapshot.deleteMany({accountId: id});
    await AccountIncome.deleteMany({accountId: id});

    // Re-read so the day-0 snapshot reflects the restarted balances.
    const fresh = await getOwnedAccount(userId, id);
    if (fresh) await seedDayZeroSnapshot(fresh);
};

// Delete a paper account and everything scoped to it (trades, snapshots, income).
// `deletedId` lets the action clear the active-account cookie when it named this one.
export const deleteOwnedAccount = async (
    userId: string,
    accountId: string,
): Promise<ActionResult & {deletedId?: string}> => {
    const account = await getOwnedAccount(userId, accountId);
    if (!account) return {success: false, message: 'Account not found'};

    const count = await PaperAccount.countDocuments({userId});
    if (count <= 1) return {success: false, message: 'You need at least one account'};

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
    return {success: true, message: `Deleted "${account.name || 'account'}"`, deletedId: id};
};
