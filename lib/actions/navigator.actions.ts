'use server';

import {revalidatePath} from "next/cache";
import AiNavigator from "@/database/models/ai-navigator.model";
import {connectToDatabase} from "@/database/mongoose";
import {getCurrentUserId} from "@/lib/actions/watchlist.actions";
import {createPaperAccount} from "@/lib/actions/accounts.actions";
import PaperAccount from "@/database/models/paper-account.model";
import PaperTrade from "@/database/models/paper-trade.model";
import AccountSnapshot from "@/database/models/account-snapshot.model";
import {getAccountsForUser, getOwnedAccount, getPortfolio, resolveStartingBalance, seedDayZeroSnapshot} from "@/lib/trading/account";
import {executeOrder} from "@/lib/trading/orders";
import {getQuote} from "@/lib/actions/finnhub.actions";
import {AI_NAVIGATOR_ACCOUNT_NAME} from "@/lib/navigator/config";

const revalidateNavigatorPaths = () => {
    revalidatePath('/brain');
    revalidatePath('/');
    revalidatePath('/portfolio');
};

export const getNavigatorStatus = async (userId: string): Promise<NavigatorStatus> => {
    try {
        await connectToDatabase();
        const doc = await AiNavigator.findOne({userId});
        if (!doc) return {enrolled: false};
        return {
            enrolled: true,
            status: doc.status,
            accountId: doc.accountId,
            enrolledAt: new Date(doc.enrolledAt).getTime(),
            lastRunDate: doc.lastRunDate,
            lastError: doc.lastError,
        };
    } catch (error) {
        console.error('Error reading navigator status:', error);
        return {enrolled: false};
    }
};

// Opt in: the AI gets its own dedicated paper account, created (or reclaimed on
// re-enrollment) through the normal account flow so caps/seeding all apply. The
// user picks how much the AI starts with (default $100k).
export const enrollAiNavigator = async (
    {startingBalance}: {startingBalance?: number} = {},
): Promise<OrderResult> => {
    try {
        const userId = await getCurrentUserId();
        if (!userId) return {success: false, message: 'Not authenticated'};

        await connectToDatabase();
        const existing = await AiNavigator.findOne({userId});
        if (existing) return {success: false, message: 'AI Navigator is already enrolled'};

        // Reuse a previously created "AI Navigator" account (unenroll keeps it), else create.
        const accounts = await getAccountsForUser(userId);
        const reusable = accounts.find((a) => (a.name || '').toLowerCase() === AI_NAVIGATOR_ACCOUNT_NAME.toLowerCase());
        if (reusable && reusable.positions.length > 0) {
            // Never silently adopt an account with holdings — the AI would gain the
            // authority to liquidate positions the user placed there manually.
            return {
                success: false,
                message: 'Your "AI Navigator" account still has holdings. Empty it (or rename it) before re-enrolling.',
            };
        }
        let accountId = reusable ? String(reusable._id) : undefined;
        if (accountId && reusable && startingBalance !== undefined) {
            // Re-enrollment with a chosen balance: the reclaimed account is empty
            // (guarded above), so restart it cleanly at the requested amount.
            const balance = resolveStartingBalance(startingBalance);
            if (balance === null) return {success: false, message: 'Invalid starting balance'};
            await PaperAccount.updateOne(
                {_id: reusable._id, userId},
                {$set: {cash: balance, startingBalance: balance, positions: [], inceptionAt: new Date()}},
            );
            await PaperTrade.deleteMany({accountId});
            await AccountSnapshot.deleteMany({accountId});
            const fresh = await getOwnedAccount(userId, accountId);
            if (fresh) await seedDayZeroSnapshot(fresh);
        }
        if (!accountId) {
            const created = await createPaperAccount({name: AI_NAVIGATOR_ACCOUNT_NAME, startingBalance});
            if (!created.success || !created.accountId) {
                return {success: false, message: created.message || 'Could not create the AI account'};
            }
            accountId = created.accountId;
        }

        await AiNavigator.create({userId, accountId, status: 'active', enrolledAt: new Date()});
        revalidateNavigatorPaths();
        return {success: true, message: 'AI Navigator enrolled — first decisions arrive with the next weekly run'};
    } catch (error) {
        console.error('Error enrolling navigator:', error);
        return {success: false, message: 'Could not enroll the AI Navigator'};
    }
};

const setNavigatorStatus = async (status: 'active' | 'paused'): Promise<OrderResult> => {
    try {
        const userId = await getCurrentUserId();
        if (!userId) return {success: false, message: 'Not authenticated'};

        await connectToDatabase();
        const updated = await AiNavigator.updateOne({userId}, {$set: {status}});
        if (updated.matchedCount === 0) return {success: false, message: 'Not enrolled'};

        revalidateNavigatorPaths();
        return {success: true, message: status === 'paused' ? 'AI Navigator paused — it will not trade' : 'AI Navigator resumed'};
    } catch (error) {
        console.error('Error updating navigator status:', error);
        return {success: false, message: 'Could not update the AI Navigator'};
    }
};

export const pauseAiNavigator = async (): Promise<OrderResult> => setNavigatorStatus('paused');
export const resumeAiNavigator = async (): Promise<OrderResult> => setNavigatorStatus('active');

// Unenroll keeps the paper account (least destructive) — delete it via the normal
// account management flow if desired.
export const unenrollAiNavigator = async (): Promise<OrderResult> => {
    try {
        const userId = await getCurrentUserId();
        if (!userId) return {success: false, message: 'Not authenticated'};

        await connectToDatabase();
        const deleted = await AiNavigator.deleteOne({userId});
        if (deleted.deletedCount === 0) return {success: false, message: 'Not enrolled'};

        revalidateNavigatorPaths();
        return {success: true, message: 'AI Navigator unenrolled — the paper account was kept'};
    } catch (error) {
        console.error('Error unenrolling navigator:', error);
        return {success: false, message: 'Could not unenroll the AI Navigator'};
    }
};

// One-click advisory apply: size the suggested target weight against the chosen
// account and execute through the exact same path the AI trader uses.
export const applySuggestion = async (
    {symbol, action, targetWeight, accountId}: {symbol: string; action: SuggestionAction; targetWeight: number; accountId: string},
): Promise<OrderResult> => {
    try {
        const userId = await getCurrentUserId();
        if (!userId) return {success: false, message: 'Not authenticated'};
        if (action === 'hold') return {success: false, message: 'Nothing to apply for a hold'};

        const account = await getOwnedAccount(userId, accountId);
        if (!account) return {success: false, message: 'Strategy account not found'};

        const portfolio = await getPortfolio(userId, accountId);
        const held = portfolio.positions.find((p) => p.symbol.toUpperCase() === symbol.toUpperCase());

        if (action === 'sell') {
            if (!held) return {success: false, message: `You don't hold ${symbol} in this account`};
            const targetValue = targetWeight * portfolio.totalValue;
            const sellValue = Math.max(0, held.marketValue - targetValue);
            const price = held.currentPrice;
            if (typeof price !== 'number' || !(price > 0)) return {success: false, message: `No live price for ${symbol}`};
            const quantity = targetWeight <= 0 ? held.quantity : Math.min(held.quantity, Math.floor(sellValue / price));
            if (quantity < 1) return {success: false, message: 'Position is already at or below the suggested weight'};
            const result = await executeOrder(userId, {accountId, symbol, side: 'sell', quantity});
            if (result.success) revalidateNavigatorPaths();
            return {success: result.success, message: result.message};
        }

        const quote = await getQuote(symbol.toUpperCase());
        const price = quote.c;
        if (typeof price !== 'number' || !(price > 0)) return {success: false, message: `No live price for ${symbol}`};
        const currentValue = held?.marketValue ?? 0;
        const buyValue = targetWeight * portfolio.totalValue - currentValue;
        const quantity = Math.floor(buyValue / price);
        if (quantity < 1) return {success: false, message: 'Position is already at or above the suggested weight'};

        const result = await executeOrder(userId, {accountId, symbol, side: 'buy', quantity});
        if (result.success) revalidateNavigatorPaths();
        return {success: result.success, message: result.message};
    } catch (error) {
        console.error('Error applying suggestion:', error);
        return {success: false, message: 'Could not apply the suggestion'};
    }
};
