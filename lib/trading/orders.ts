// Session-free order execution (NOT a 'use server' module). The placeOrder server
// action wraps this with a session check; background jobs (the AI navigator) call it
// directly with an explicit userId — next/headers is unavailable inside Inngest.
// Ownership is enforced here via getOwnedAccount, so every caller gets the same gate.

import PaperAccount from "@/database/models/paper-account.model";
import PaperTrade from "@/database/models/paper-trade.model";
import {getQuote, getCompanyProfile} from "@/lib/actions/finnhub.actions";
import {getOwnedAccount} from "@/lib/trading/account";
import {TRADE_REASON_MAX} from "@/lib/strategies/config";

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
};

// Market order at the current live price. Whole shares, long-only.
export const executeOrder = async (
    userId: string,
    {accountId, symbol, side, quantity, minCashAfter, source, reason}: OrderRequest,
): Promise<OrderResult & {price?: number}> => {
    try {
        const sym = (symbol || '').trim().toUpperCase();
        if (!sym) return {success: false, message: 'Enter a stock symbol'};

        const qty = Math.floor(Number(quantity));
        if (!Number.isFinite(qty) || qty <= 0) {
            return {success: false, message: 'Enter a whole number of shares greater than 0'};
        }

        const account = await getOwnedAccount(userId, accountId);
        if (!account) return {success: false, message: 'Strategy account not found'};

        const [quote, profile] = await Promise.all([getQuote(sym), getCompanyProfile(sym)]);
        const price = quote.c;
        if (typeof price !== 'number' || !(price > 0)) {
            return {success: false, message: `Couldn't fetch a live price for ${sym}`};
        }
        const company = profile.name || sym;
        const total = qty * price;

        // Work on a plain copy of positions, then persist atomically with updateOne.
        const positions: PaperPosition[] = account.positions.map((p) => ({
            symbol: p.symbol,
            company: p.company || p.symbol,
            quantity: p.quantity,
            avgCost: p.avgCost,
        }));
        let newCash = account.cash;
        let realizedPnl: number | undefined;
        const existing = positions.find((p) => p.symbol.toUpperCase() === sym);

        if (side === 'buy') {
            if (total > newCash) {
                return {success: false, message: `Insufficient buying power — need $${total.toFixed(2)}, have $${newCash.toFixed(2)}`};
            }
            if (typeof minCashAfter === 'number' && newCash - total < minCashAfter) {
                return {success: false, message: `Buy skipped — would leave $${(newCash - total).toFixed(2)} cash, below the $${minCashAfter.toFixed(2)} floor`};
            }
            if (existing) {
                const newQty = existing.quantity + qty;
                existing.avgCost = (existing.avgCost * existing.quantity + price * qty) / newQty;
                existing.quantity = newQty;
                existing.company = company;
            } else {
                positions.push({symbol: sym, company, quantity: qty, avgCost: price});
            }
            newCash -= total;
        } else {
            if (!existing || existing.quantity < qty) {
                return {success: false, message: `You only own ${existing?.quantity ?? 0} share(s) of ${sym}`};
            }
            realizedPnl = (price - existing.avgCost) * qty;
            existing.quantity -= qty;
            newCash += total;
        }

        const finalPositions = positions.filter((p) => p.quantity > 0);
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
        });

        const verb = side === 'buy' ? 'Bought' : 'Sold';
        return {success: true, message: `${verb} ${qty} ${sym} @ $${price.toFixed(2)}`, price};
    } catch (error) {
        console.error('Error executing order:', error);
        return {success: false, message: 'Order failed. Please try again.'};
    }
};
