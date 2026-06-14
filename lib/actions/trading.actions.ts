'use server';

import {revalidatePath} from "next/cache";
import {connectToDatabase} from "@/database/mongoose";
import PaperAccount from "@/database/models/paper-account.model";
import PaperTrade from "@/database/models/paper-trade.model";
import {PAPER_STARTING_BALANCE} from "@/lib/constants";
import {getCurrentUserId} from "@/lib/actions/watchlist.actions";
import {getQuote, getCompanyProfile} from "@/lib/actions/finnhub.actions";
import {getOrCreatePaperAccount} from "@/lib/trading/account";

// Place a market order at the current live price. Whole shares, long-only.
export const placeOrder = async (
    {symbol, side, quantity}: {symbol: string; side: 'buy' | 'sell'; quantity: number},
): Promise<OrderResult> => {
    try {
        const userId = await getCurrentUserId();
        if (!userId) return {success: false, message: 'Not authenticated'};

        const sym = (symbol || '').trim().toUpperCase();
        if (!sym) return {success: false, message: 'Enter a stock symbol'};

        const qty = Math.floor(Number(quantity));
        if (!Number.isFinite(qty) || qty <= 0) {
            return {success: false, message: 'Enter a whole number of shares greater than 0'};
        }

        const [quote, profile] = await Promise.all([getQuote(sym), getCompanyProfile(sym)]);
        const price = quote.c;
        if (typeof price !== 'number' || !(price > 0)) {
            return {success: false, message: `Couldn't fetch a live price for ${sym}`};
        }
        const company = profile.name || sym;

        const account = await getOrCreatePaperAccount(userId);
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
        await PaperAccount.updateOne({userId}, {$set: {cash: newCash, positions: finalPositions}});
        await PaperTrade.create({userId, symbol: sym, company, side, quantity: qty, price, total, ...(realizedPnl !== undefined ? {realizedPnl} : {})});

        revalidatePath('/trade');
        revalidatePath('/friends');
        const verb = side === 'buy' ? 'Bought' : 'Sold';
        return {success: true, message: `${verb} ${qty} ${sym} @ $${price.toFixed(2)}`};
    } catch (error) {
        console.error('Error placing order:', error);
        return {success: false, message: 'Order failed. Please try again.'};
    }
};

// Reset the competition: back to starting cash, no positions, clear trade log.
export const resetPaperAccount = async (): Promise<OrderResult> => {
    try {
        const userId = await getCurrentUserId();
        if (!userId) return {success: false, message: 'Not authenticated'};

        await connectToDatabase();
        await PaperAccount.updateOne(
            {userId},
            {$set: {cash: PAPER_STARTING_BALANCE, startingBalance: PAPER_STARTING_BALANCE, positions: []}},
            {upsert: true},
        );
        await PaperTrade.deleteMany({userId});
        revalidatePath('/trade');
        revalidatePath('/friends');
        return {success: true, message: 'Account reset to $100,000'};
    } catch (error) {
        console.error('Error resetting account:', error);
        return {success: false, message: 'Reset failed'};
    }
};
