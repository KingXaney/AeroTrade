// Closing a holding whose symbol has stopped quoting. Server-only (NOT 'use server'); the
// closeOutHolding action wraps it with the session.
//
// executeOrder fills at Finnhub's price at that moment and refuses without one — and stays that
// way. A symbol that is GONE (no price for three sessions, lib/prices/gone.ts) can therefore
// never be sold, which left its account stuck for good. This is the one fill made without a live
// quote, and only for such a symbol: the whole holding, at its newest stored close, with the
// fill's reason saying so and from which day. Everything after the price is commitFill's — the
// same arithmetic, the same guarded write, the same trade row.

import {getGoneSymbols} from "@/lib/prices/quote-store";
import {GONE_AFTER_SESSIONS} from "@/lib/prices/gone";
import {getLatestBars} from "@/lib/prices/store";
import {addCalendarDays, getEasternDateString} from "@/lib/dates";
import {GONE_COPY} from "@/lib/learn/copy/portfolio";
import {LAST_CLOSE_LOOKBACK_DAYS} from "@/lib/trading/config";
import {commitFill, loadAccountForFill} from "@/lib/trading/orders";
import type {ActionResult} from '@/lib/actions/types';

export const closeOutGoneHolding = async (userId: string, {accountId, symbol}: {accountId: string; symbol: string}): Promise<ActionResult> => {
    try {
        const sym = (typeof symbol === 'string' ? symbol : '').trim().toUpperCase();
        if (!sym) return {success: false, message: GONE_COPY.failed};

        const account = await loadAccountForFill(userId, accountId);
        if (!account) return {success: false, message: 'Account not found'};
        const held = account.positions.find((position) => position.symbol.toUpperCase() === sym);
        if (!held) return {success: false, message: GONE_COPY.notHeld(sym)};

        // The server decides what is gone, from the quote sheet's own record.
        if (!(await getGoneSymbols([sym])).includes(sym)) return {success: false, message: GONE_COPY.stillQuoted(sym)};

        const today = getEasternDateString();
        const bar = (await getLatestBars([sym], {since: addCalendarDays(today, -LAST_CLOSE_LOOKBACK_DAYS), onOrBefore: today})).get(sym);
        if (!bar || !Number.isFinite(bar.close) || !(bar.close > 0)) return {success: false, message: GONE_COPY.noClose(sym)};

        const result = await commitFill(userId, account, {
            sym,
            company: held.company || sym,
            side: 'sell',
            // Every whole share; applyFill takes a fraction of a share with the last one.
            quantity: Math.max(1, Math.floor(held.quantity)),
            price: bar.close,
            source: 'user',
            reason: GONE_COPY.reason(bar.date, GONE_AFTER_SESSIONS),
        });
        return {success: result.success, message: result.message};
    } catch (error) {
        console.error('Error closing out a holding:', error);
        return {success: false, message: GONE_COPY.failed};
    }
};
