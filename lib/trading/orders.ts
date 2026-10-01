// Session-free order execution (NOT a 'use server' module). The placeOrder server
// action wraps this with a session check; background jobs (the AI navigator) call it
// directly with an explicit userId — next/headers is unavailable inside Inngest.
// Ownership is enforced here via getOwnedAccount, so every caller gets the same gate.

import PaperAccount from "@/database/models/paper-account.model";
import PaperTrade from "@/database/models/paper-trade.model";
import {getQuote, getCompanyProfile} from "@/lib/prices/finnhub";
import {getOwnedAccount, toPlainPositions} from "@/lib/trading/accounts";
import {applyFill, type FillRejection} from "@/lib/trading/fill";
import {TRADE_REASON_MAX} from "@/lib/trading/config";
import {isOrderSide} from "@/lib/trading/order-math";

export type OrderRequest = {
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

// Market order at the current live price. Whole shares, long-only.
export const executeOrder = async (
    userId: string,
    {accountId, symbol, side, quantity, minCashAfter, source, reason, idempotencyKey}: OrderRequest,
): Promise<OrderResult & {price?: number}> => {
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

        const account = await getOwnedAccount(userId, accountId);
        if (!account) return {success: false, message: 'Strategy account not found'};

        if (idempotencyKey) {
            const prior = await PaperTrade.findOne({accountId: String(account._id), idempotencyKey}).lean<{price: number; quantity: number; symbol: string} | null>();
            if (prior) {
                return {success: true, message: `Already filled: ${prior.quantity} ${prior.symbol} @ $${prior.price.toFixed(2)}`, price: prior.price};
            }
        }

        const [quote, profile] = await Promise.all([getQuote(sym), getCompanyProfile(sym)]);
        const price = quote.c;
        if (typeof price !== 'number' || !(price > 0)) {
            return {success: false, message: `Couldn't fetch a live price for ${sym}`};
        }
        const company = profile.name || sym;
        const total = qty * price;

        // The holding this order adds to or sells from, matched case-insensitively; the fill
        // goes under the holding's own spelling, so a stored position keeps it.
        const held = account.positions.find((p) => p.symbol.toUpperCase() === sym);
        const fill = applyFill(
            {cash: account.cash, positions: toPlainPositions(account)},
            {symbol: held?.symbol ?? sym, side, quantity: qty, company},
            price,
            minCashAfter,
        );
        if (!fill.ok) {
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
        const newCash = fill.account.cash;
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
        const filledAt = new Date();
        // `cash` doubles as a version stamp: every fill changes it, so a concurrent order
        // that landed first makes this write match nothing instead of overwriting it.
        const updated = await PaperAccount.updateOne(
            {_id: account._id, userId, cash: account.cash},
            {$set: {cash: newCash, positions: finalPositions}},
        );
        if (updated.matchedCount === 0) {
            const stillThere = await PaperAccount.exists({_id: account._id, userId});
            return {success: false, message: stillThere ? 'Account changed while placing the order — please try again.' : 'Strategy account not found'};
        }
        await PaperTrade.create({
            userId,
            accountId: String(account._id),
            symbol: sym,
            company,
            side,
            quantity: qty,
            price,
            total,
            ...(realizedPnl !== undefined ? {realizedPnl} : {}),
            ...(source ? {source} : {}),
            ...(reason ? {reason: reason.slice(0, TRADE_REASON_MAX)} : {}),
            ...(idempotencyKey ? {idempotencyKey} : {}),
            createdAt: filledAt,
        });

        const verb = side === 'buy' ? 'Bought' : 'Sold';
        return {success: true, message: `${verb} ${qty} ${sym} @ $${price.toFixed(2)}`, price};
    } catch (error) {
        console.error('Error executing order:', error);
        return {success: false, message: 'Order failed. Please try again.'};
    }
};
