'use server';

import {revalidatePath} from "next/cache";
import {getCurrentUserId} from "@/lib/auth/session";
import {ORDER_COPY} from "@/lib/learn/copy/trade";
import {withinOrderLimit} from "@/lib/prices/action-limits";
import {takeRateLimit} from "@/lib/rate-limit";
import {executeOrder} from "@/lib/trading/orders";
import {closeOutGoneHolding} from "@/lib/trading/close-out";
import {sanitizeTradeNote} from "@/lib/trading/order-math";
import type {ActionResult} from '@/lib/actions/types';

// Every surface that shows account data — trade desk, portfolio hub, dashboard, friends.
// The account lifecycle (create, rename, reset, delete) is accounts.actions.ts.
const revalidateTradingPaths = () => {
    revalidatePath('/');
    revalidatePath('/dashboard');
    revalidatePath('/trade');
    revalidatePath('/portfolio');
    revalidatePath('/friends');
};

// Place a market order at the current live price. Whole shares, long-only.
// Thin session wrapper — the execution logic lives in lib/trading/orders.ts so the
// AI navigator job can share the exact same path without a request context.
// `note` is the learner's own "why": typed unknown because a server action's arguments
// arrive from the client unchecked; sanitizeTradeNote keeps only a bounded one-line string.
// Counted per reader by the minute before executeOrder is reached (lib/prices/action-limits.ts):
// every order it takes that far asks Finnhub for a fresh quote, which the quote sheet counts
// against the plan's one shared minute and never refuses, and for the company's profile — even an
// order the cash check then turns down. The jobs call executeOrder themselves and are not counted.
export const placeOrder = async (
    {symbol, side, quantity, accountId, note}: {symbol: string; side: 'buy' | 'sell'; quantity: number; accountId: string; note?: unknown},
): Promise<ActionResult> => {
    const userId = await getCurrentUserId();
    if (!userId) return {success: false, message: 'Not authenticated'};
    // A counter that cannot be written (a failover, a dropped connection) is an order that did
    // not go through, and is said as one: both tickets wait on this answer with no catch of their own.
    let within: boolean;
    try {
        within = await withinOrderLimit(userId, takeRateLimit);
    } catch (error) {
        console.error('The order counter could not be read:', error);
        return {success: false, message: 'Order failed. Please try again.'};
    }
    if (!within) return {success: false, message: ORDER_COPY.tooFast};

    const reason = sanitizeTradeNote(note);
    const result = await executeOrder(userId, {accountId, symbol, side, quantity, source: 'user', ...(reason ? {reason} : {})});
    if (result.success) revalidateTradingPaths();
    return {success: result.success, message: result.message};
};

// Close a holding whose symbol has stopped quoting, at its last stored close
// (lib/trading/close-out.ts decides whether it has; the arguments arrive unchecked).
export const closeOutHolding = async ({accountId, symbol}: {accountId: unknown; symbol: unknown}): Promise<ActionResult> => {
    const userId = await getCurrentUserId();
    if (!userId) return {success: false, message: 'Not authenticated'};
    if (typeof accountId !== 'string' || typeof symbol !== 'string' || symbol.length > 24) return {success: false, message: 'Account not found'};

    const result = await closeOutGoneHolding(userId, {accountId, symbol});
    if (result.success) revalidateTradingPaths();
    return result;
};
