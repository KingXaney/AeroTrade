// A user's paper accounts as documents: the ownership gate, the listing (with the lazy first
// account and the legacy-trade backfill), the summary the UI carries and the symbols they hold.
// Server-only, NOT a 'use server' module: plain async functions for server components, the
// server actions, the jobs and the chat tools, keeping Mongoose docs out of that boundary.

import {cache} from "react";
import {Types} from "mongoose";
import {connectToDatabase} from "@/database/mongoose";
import PaperAccount, {type PaperAccountDoc} from "@/database/models/paper-account.model";
import PaperTrade from "@/database/models/paper-trade.model";
import {PAPER_STARTING_BALANCE} from "@/lib/trading/starting-balance";
import {accountEpoch} from "@/lib/trading/epoch";
import type {PaperAccountSummary, PaperPosition} from '@/lib/trading/types';

// The name a user's first paper account is created with. Only new accounts get it: an
// account already stored keeps its own name (older ones were created as "Main Strategy").
export const DEFAULT_ACCOUNT_NAME = 'Main account';

// Pre-migration accounts may lack name/inceptionAt in the DB — fall back gracefully.
export const toAccountSummary = (account: PaperAccountDoc): PaperAccountSummary => ({
    id: String(account._id),
    name: account.name || DEFAULT_ACCOUNT_NAME,
    inceptionAt: accountEpoch(account).getTime(),
    createdAt: new Date(account.createdAt).getTime(),
    ...(account.incomeTotals ? {income: {interest: account.incomeTotals.interest ?? 0, dividends: account.incomeTotals.dividends ?? 0}} : {}),
});

// Plain copies of the stored positions, for valuation and analytics.
export const toPlainPositions = (account: {positions: PaperPosition[]}): PaperPosition[] =>
    account.positions.map((p) => ({
        symbol: p.symbol,
        company: p.company || p.symbol,
        quantity: p.quantity,
        avgCost: p.avgCost,
    }));

// All paper accounts for a user, oldest first. Creates DEFAULT_ACCOUNT_NAME on first use
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

// One read per server render: getPortfoliosForUser and a page that resolves its account
// before pricing (/trade) share it. cache() is a pass-through outside React.
export const getCachedAccountsForUser = cache(getAccountsForUser);

// Read-only sibling of getAccountsForUser: no lazy create, no legacy backfill.
//
// Use this wherever a *question* is being answered rather than an action taken. The chat
// assistant is the motivating case — "how am I doing?" must not conjure a paper account
// with a $100k starting balance for someone who has never traded, and must not race the
// real creation path. getHeldSymbolsByUserId already reads this way.
export const readAccountsForUser = async (userId: string): Promise<PaperAccountDoc[]> => {
    await connectToDatabase();
    return PaperAccount.find({userId}).sort({createdAt: 1});
};

// Ownership gate: every account-scoped read or write resolves the account through this.
export const getOwnedAccount = async (userId: string, accountId: string): Promise<PaperAccountDoc | null> => {
    if (!Types.ObjectId.isValid(accountId)) return null;
    await connectToDatabase();
    return PaperAccount.findOne({_id: accountId, userId});
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
