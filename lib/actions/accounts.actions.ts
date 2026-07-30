'use server';

import {revalidatePath} from "next/cache";
import {cookies} from "next/headers";
import PaperAccount from "@/database/models/paper-account.model";
import PaperTrade from "@/database/models/paper-trade.model";
import AccountSnapshot from "@/database/models/account-snapshot.model";
import {connectToDatabase} from "@/database/mongoose";
import {ACTIVE_ACCOUNT_COOKIE, MAX_PAPER_ACCOUNTS, PAPER_STARTING_BALANCE} from "@/lib/constants";
import {getCurrentUserId} from "@/lib/actions/watchlist.actions";
import {getAccountsForUser, getOwnedAccount, seedDayZeroSnapshot} from "@/lib/trading/account";

const ACCOUNT_NAME_MAX_LENGTH = 40;
const ACTIVE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

const revalidateAccountPaths = () => {
    revalidatePath('/');
    revalidatePath('/trade');
    revalidatePath('/portfolio');
    revalidatePath('/friends');
};

const setActiveAccountCookie = async (accountId: string) => {
    const store = await cookies();
    store.set(ACTIVE_ACCOUNT_COOKIE, accountId, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: ACTIVE_COOKIE_MAX_AGE_SECONDS,
    });
};

const validateName = (name: string): string | null => {
    const clean = name.trim();
    if (clean.length === 0) return null;
    if (clean.length > ACCOUNT_NAME_MAX_LENGTH) return null;
    return clean;
};

const isDuplicateKeyError = (error: unknown): boolean =>
    typeof error === 'object' && error !== null && (error as {code?: number}).code === 11000;

// Pre-migration databases still carry the old ONE-account-per-user unique index
// (userId_1). A second-account create then throws E11000 on {userId} alone —
// distinguishable from a real duplicate NAME, whose index key is {userId, name}.
const isLegacySingleAccountIndexError = (error: unknown): boolean => {
    if (!isDuplicateKeyError(error)) return false;
    const e = error as {keyPattern?: Record<string, unknown>; message?: string};
    if (e.keyPattern) return 'userId' in e.keyPattern && !('name' in e.keyPattern);
    return /index:\s*userId_1\b/.test(e.message ?? '');
};

// Self-heal: dropping the legacy index is exactly what scripts/migrate-multi-account.mjs
// does — doing it lazily here removes the deploy-order dependency on the script.
const dropLegacySingleAccountIndex = async (): Promise<boolean> => {
    try {
        const mongoose = await connectToDatabase();
        await mongoose.connection.db?.collection('paperaccounts').dropIndex('userId_1');
        console.warn('Dropped legacy userId_1 unique index (lazy migration)');
        return true;
    } catch (error) {
        console.error('Could not drop legacy userId_1 index:', error);
        return false;
    }
};

// Create a new strategy account with the standard starting balance and make it active.
export const createPaperAccount = async ({name}: {name: string}): Promise<OrderResult & {accountId?: string}> => {
    try {
        const userId = await getCurrentUserId();
        if (!userId) return {success: false, message: 'Not authenticated'};

        const clean = validateName(name);
        if (!clean) return {success: false, message: `Name must be 1–${ACCOUNT_NAME_MAX_LENGTH} characters`};

        const accounts = await getAccountsForUser(userId);
        if (accounts.length >= MAX_PAPER_ACCOUNTS) {
            return {success: false, message: `You can have at most ${MAX_PAPER_ACCOUNTS} strategy accounts`};
        }
        if (accounts.some((a) => (a.name || '').toLowerCase() === clean.toLowerCase())) {
            return {success: false, message: `You already have a strategy named "${clean}"`};
        }

        const insertAndActivate = async (): Promise<OrderResult & {accountId?: string}> => {
            const created = await PaperAccount.create({
                userId,
                name: clean,
                cash: PAPER_STARTING_BALANCE,
                startingBalance: PAPER_STARTING_BALANCE,
                inceptionAt: new Date(),
                positions: [],
            });
            await seedDayZeroSnapshot(created);
            await setActiveAccountCookie(String(created._id));
            revalidateAccountPaths();
            return {success: true, message: `Created "${clean}"`, accountId: String(created._id)};
        };

        try {
            return await insertAndActivate();
        } catch (error) {
            if (isLegacySingleAccountIndexError(error) && await dropLegacySingleAccountIndex()) {
                return await insertAndActivate();
            }
            throw error;
        }
    } catch (error) {
        if (isLegacySingleAccountIndexError(error)) {
            console.error('Legacy single-account index still blocking creates:', error);
            return {success: false, message: 'A database migration is pending — run `npm run migrate:accounts`, then try again'};
        }
        if (isDuplicateKeyError(error)) {
            return {success: false, message: 'You already have a strategy with that name'};
        }
        console.error('Error creating account:', error);
        return {success: false, message: 'Could not create the account'};
    }
};

export const renamePaperAccount = async ({accountId, name}: {accountId: string; name: string}): Promise<OrderResult> => {
    try {
        const userId = await getCurrentUserId();
        if (!userId) return {success: false, message: 'Not authenticated'};

        const clean = validateName(name);
        if (!clean) return {success: false, message: `Name must be 1–${ACCOUNT_NAME_MAX_LENGTH} characters`};

        const account = await getOwnedAccount(userId, accountId);
        if (!account) return {success: false, message: 'Strategy account not found'};

        // Mirror create's case-insensitive duplicate guard (the unique index is
        // case-sensitive); exclude this account so case-only self-renames still work.
        const accounts = await getAccountsForUser(userId);
        const duplicate = accounts.some((a) =>
            String(a._id) !== String(account._id) && (a.name || '').toLowerCase() === clean.toLowerCase());
        if (duplicate) {
            return {success: false, message: `You already have a strategy named "${clean}"`};
        }

        await PaperAccount.updateOne({_id: account._id, userId}, {$set: {name: clean}});
        revalidateAccountPaths();
        return {success: true, message: `Renamed to "${clean}"`};
    } catch (error) {
        if (isDuplicateKeyError(error)) {
            return {success: false, message: 'You already have a strategy with that name'};
        }
        console.error('Error renaming account:', error);
        return {success: false, message: 'Could not rename the account'};
    }
};

// Delete a strategy account and everything scoped to it (trades + snapshots).
export const deletePaperAccount = async (accountId: string): Promise<OrderResult> => {
    try {
        const userId = await getCurrentUserId();
        if (!userId) return {success: false, message: 'Not authenticated'};

        const account = await getOwnedAccount(userId, accountId);
        if (!account) return {success: false, message: 'Strategy account not found'};

        const count = await PaperAccount.countDocuments({userId});
        if (count <= 1) return {success: false, message: 'You need at least one strategy account'};

        // Children first, parent last: a crash mid-cascade leaves the account intact and
        // the delete retryable, instead of permanently orphaning trades/snapshots behind
        // an ownership gate that can no longer resolve the account.
        const id = String(account._id);
        await PaperTrade.deleteMany({accountId: id});
        await AccountSnapshot.deleteMany({accountId: id});
        await PaperAccount.deleteOne({_id: account._id, userId});

        const store = await cookies();
        if (store.get(ACTIVE_ACCOUNT_COOKIE)?.value === id) {
            store.delete(ACTIVE_ACCOUNT_COOKIE);
        }

        revalidateAccountPaths();
        return {success: true, message: `Deleted "${account.name || 'strategy'}"`};
    } catch (error) {
        console.error('Error deleting account:', error);
        return {success: false, message: 'Could not delete the account'};
    }
};

// Switch which strategy account the trade/portfolio pages operate on.
export const setActiveAccount = async (accountId: string): Promise<OrderResult> => {
    try {
        const userId = await getCurrentUserId();
        if (!userId) return {success: false, message: 'Not authenticated'};

        const account = await getOwnedAccount(userId, accountId);
        if (!account) return {success: false, message: 'Strategy account not found'};

        await setActiveAccountCookie(String(account._id));
        revalidatePath('/');
        revalidatePath('/trade');
        revalidatePath('/portfolio');
        return {success: true, message: `Switched to "${account.name || 'strategy'}"`};
    } catch (error) {
        console.error('Error switching account:', error);
        return {success: false, message: 'Could not switch accounts'};
    }
};
