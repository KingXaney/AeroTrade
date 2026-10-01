'use server';

import {revalidatePath} from "next/cache";
import {getCurrentUserId} from "@/lib/auth/session";
import {executeOrder} from "@/lib/trading/orders";
import {sanitizeTradeNote} from "@/lib/trading/order-math";

// Every surface that shows account data — trade desk, portfolio hub, dashboard, friends.
// The account lifecycle (create, rename, reset, delete) is accounts.actions.ts.
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
