// Session-free order execution (NOT a 'use server' module). The placeOrder server
// action wraps this with a session check; background jobs (the AI navigator) call it
// directly with an explicit userId — next/headers is unavailable inside Inngest.
// Ownership is enforced here via getOwnedAccount, so every caller gets the same gate.

import {Types} from "mongoose";
import PaperAccount, {type PaperAccountDoc} from "@/database/models/paper-account.model";
import PaperTrade from "@/database/models/paper-trade.model";
import {formatShares} from "@/lib/format";
import {getCompanyProfile} from "@/lib/prices/finnhub";
import {getFreshQuote} from "@/lib/prices/quote-store";
import {getOwnedAccount, toPlainPositions} from "@/lib/trading/accounts";
import {applyFill, type FillRejection} from "@/lib/trading/fill";
import {TRADE_REASON_MAX} from "@/lib/trading/config";
import {isOrderSide} from "@/lib/trading/order-math";
import {settlePendingFill} from "@/lib/trading/pending-fill";
import type {ActionResult} from '@/lib/actions/types';
import type {PaperPosition, TradeSource} from '@/lib/trading/types';

type OrderRequest = {
    accountId: string;
    symbol: string;
    side: 'buy' | 'sell';
    quantity: number;
    // Optional cash floor re-enforced at execution time (the AI navigator plans with
    // slightly stale prices; live drift must not let a buy breach the floor).
    minCashAfter?: number;
    // Recorded on the trade so history and the CSV export can say who placed it.
    source?: TradeSource;
    // An automated caller's explanation for the fill, shown in the trade log.
    reason?: string;
    // Replays of the same automated order (a job step retried after its response was lost)
    // return the earlier fill instead of filling again.
    idempotencyKey?: string;
};

// What an automated run records for a buy it never sent because a sell meant to fund it failed
// (the AI Navigator and the quant strategies): without the proceeds, buying could drain cash
// through the floor.
export const FUNDING_SELL_FAILED = 'Skipped: a funding sell failed this run';

type OrderResult = ActionResult & {price?: number};

// The account as an order is about to act on it. A fill an earlier order took and never
// recorded (its trade row's insert failed) is recorded first, so what this order reads — the
// idempotency lookup, the holding it sells from — is the whole book.
export const loadAccountForFill = async (userId: string, accountId: string): Promise<PaperAccountDoc | null> => {
    const account = await getOwnedAccount(userId, accountId);
    if (!account?.pendingFill) return account;
    await settlePendingFill(account);
    return getOwnedAccount(userId, accountId);
};

type PricedOrder = {
    sym: string;
    company: string;
    side: 'buy' | 'sell';
    quantity: number;
    price: number;
    minCashAfter?: number;
    source?: TradeSource;
    reason?: string;
    idempotencyKey?: string;
};

// One priced order against the account as read: the fill arithmetic, then ONE account write
// that moves cash and positions and carries the trade row it is about to insert, then the row.
// A failure after that write is not a failed order — the cash has moved — so the answer is the
// fill, and the row is inserted by whoever touches the account next (lib/trading/pending-fill.ts).
export const commitFill = async (
    userId: string,
    account: PaperAccountDoc,
    {sym, company, side, quantity, price, minCashAfter, source, reason, idempotencyKey}: PricedOrder,
): Promise<OrderResult> => {
    // The holding this order adds to or sells from, matched case-insensitively; the fill
    // goes under the holding's own spelling, so a stored position keeps it.
    const held = account.positions.find((p) => p.symbol.toUpperCase() === sym);
    const fill = applyFill(
        {cash: account.cash, positions: toPlainPositions(account)},
        {symbol: held?.symbol ?? sym, side, quantity, company},
        price,
        minCashAfter,
    );
    if (!fill.ok) {
        const total = Math.floor(quantity) * price;
        const message: Record<FillRejection, string> = {
            'invalid quantity': 'Enter a whole number of shares greater than 0',
            'no price': `Couldn't fetch a live price for ${sym}`,
            'insufficient cash': `Insufficient buying power — need $${total.toFixed(2)}, have $${account.cash.toFixed(2)}`,
            'cash floor': `Buy skipped — would leave $${(account.cash - total).toFixed(2)} cash, below the $${(minCashAfter ?? 0).toFixed(2)} floor`,
            'not held': `You only own ${held?.quantity ?? 0} share(s) of ${sym}`,
        };
        return {success: false, message: message[fill.reason]};
    }
    const {realizedPnl} = fill;
    // Every position here came in with a company (toPlainPositions, or the buy's own).
    const finalPositions: PaperPosition[] = fill.account.positions.map((p) => ({
        symbol: p.symbol,
        company: p.company ?? p.symbol,
        quantity: p.quantity,
        avgCost: p.avgCost,
    }));
    // The trade row is stamped with the moment its cash moved, not when the row was
    // inserted after it: the income job rebuilds each day's cash and holdings from trade
    // times, and an order spanning midnight must land on the day it actually filled.
    const pendingFill = {
        tradeId: new Types.ObjectId(),
        symbol: sym,
        company,
        side,
        // What actually moved: a sell that closes a holding takes its fraction of a share too.
        quantity: fill.quantity,
        price,
        total: fill.total,
        ...(realizedPnl !== undefined ? {realizedPnl} : {}),
        ...(source ? {source} : {}),
        ...(reason ? {reason: reason.slice(0, TRADE_REASON_MAX)} : {}),
        ...(idempotencyKey ? {idempotencyKey} : {}),
        createdAt: new Date(),
    };
    // Three guards. `cash` is a version stamp: every fill and every income credit changes it,
    // so a concurrent order that landed first makes this write match nothing. `splitRev` is the
    // same for a split, which rewrites positions and leaves cash alone. And no unrecorded fill
    // may be overwritten by this one's.
    let landed: boolean;
    try {
        const updated = await PaperAccount.updateOne(
            {_id: account._id, userId, cash: account.cash, splitRev: account.splitRev ?? null, pendingFill: {$exists: false}},
            {$set: {cash: fill.account.cash, positions: finalPositions, pendingFill}},
        );
        landed = updated.matchedCount > 0;
    } catch (error) {
        // The write may have landed and only its answer been lost. The account says which: it
        // carries this fill's own id if it did. (If this read fails too, nothing is known and
        // the caller reports a failed order.)
        landed = (await PaperAccount.exists({_id: account._id, 'pendingFill.tradeId': pendingFill.tradeId})) !== null;
        if (!landed) throw error;
    }
    if (!landed) {
        const stillThere = await PaperAccount.exists({_id: account._id, userId});
        return {success: false, message: stillThere ? 'Account changed while placing the order — please try again.' : 'Account not found'};
    }
    try {
        await settlePendingFill({_id: account._id, userId, pendingFill});
    } catch (error) {
        console.error(`A fill's trade row could not be written for account ${String(account._id)}; the next order or the nightly job records it:`, error);
    }

    const verb = side === 'buy' ? 'Bought' : 'Sold';
    return {success: true, message: `${verb} ${formatShares(fill.quantity)} ${sym} @ $${price.toFixed(2)}`, price};
};

// Market order at the current live price. Whole shares, long-only.
export const executeOrder = async (
    userId: string,
    {accountId, symbol, side, quantity, minCashAfter, source, reason, idempotencyKey}: OrderRequest,
): Promise<OrderResult> => {
    try {
        // Checked before anything else: any other value used to run the sell branch, commit the
        // account update, and only then fail the trade row's enum — cash moved, no trade.
        if (!isOrderSide(side)) return {success: false, message: 'Choose buy or sell'};

        const sym = (symbol || '').trim().toUpperCase();
        if (!sym) return {success: false, message: 'Enter a stock symbol'};

        const qty = Math.floor(Number(quantity));
        if (!Number.isFinite(qty) || qty <= 0) {
            return {success: false, message: 'Enter a whole number of shares greater than 0'};
        }

        const account = await loadAccountForFill(userId, accountId);
        if (!account) return {success: false, message: 'Account not found'};

        if (idempotencyKey) {
            const prior = await PaperTrade.findOne({accountId: String(account._id), idempotencyKey}).lean<{price: number; quantity: number; symbol: string} | null>();
            if (prior) {
                return {success: true, message: `Already filled: ${prior.quantity} ${prior.symbol} @ $${prior.price.toFixed(2)}`, price: prior.price};
            }
        }

        // The fill's price is Finnhub's at this moment, never the sheet's or a cached one; it is
        // written into the sheet, so the page that follows shows the price that filled.
        const [quote, profile] = await Promise.all([getFreshQuote(sym), getCompanyProfile(sym)]);
        const price = quote.c;
        if (typeof price !== 'number' || !(price > 0)) {
            return {success: false, message: `Couldn't fetch a live price for ${sym}`};
        }

        return await commitFill(userId, account, {
            sym, company: profile.name || sym, side, quantity: qty, price, minCashAfter, source, reason, idempotencyKey,
        });
    } catch (error) {
        // Nothing has moved: commitFill answers for itself once its account write has landed.
        console.error('Error executing order:', error);
        return {success: false, message: 'Order failed. Please try again.'};
    }
};
