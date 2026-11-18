'use server';

import {revalidatePath} from "next/cache";
import {connectToDatabase} from "@/database/mongoose";
import Watchlist from "@/database/models/watchlist.model";
import {getCurrentUserId} from "@/lib/auth/session";
import {getCompanyProfile} from "@/lib/prices/finnhub";
import {isShouting} from "@/lib/stocks/watchlist-add";

// ============================================================================
// --- Mutations ---
// ============================================================================

export const addToWatchlist = async (
    {symbol, company}: {symbol: string; company: string},
): Promise<{success: boolean; message?: string}> => {
    try {
        const userId = await getCurrentUserId();
        if (!userId) return {success: false, message: 'Not authenticated'};

        const ticker = symbol.trim().toUpperCase();
        if (!/^[A-Z0-9.\-]{1,12}$/.test(ticker)) return {success: false, message: 'Invalid symbol'};
        // A stock picked from a search comes under Finnhub's name for it, in capitals; the
        // row would read "APPLE INC" from then on, beside rows added elsewhere under "Apple Inc".
        // The profile's name is the company's own (one read, cached a day); without it, as given.
        const given = company.trim().slice(0, 120);
        const displayName = (isShouting(given) ? (await getCompanyProfile(ticker)).name?.trim().slice(0, 120) : '') || given || ticker;

        await connectToDatabase();
        await Watchlist.updateOne(
            {userId, symbol: ticker},
            {$setOnInsert: {company: displayName, addedAt: new Date()}},
            {upsert: true},
        );

        revalidatePath('/watchlist');
        return {success: true};
    } catch (error) {
        console.error('Error adding to watchlist:', error);
        return {success: false, message: 'Failed to add to watchlist'};
    }
};

export const removeFromWatchlist = async (
    symbol: string,
): Promise<{success: boolean; message?: string}> => {
    try {
        const userId = await getCurrentUserId();
        if (!userId) return {success: false, message: 'Not authenticated'};

        await connectToDatabase();
        await Watchlist.deleteOne({userId, symbol: symbol.toUpperCase()});

        revalidatePath('/watchlist');
        return {success: true};
    } catch (error) {
        console.error('Error removing from watchlist:', error);
        return {success: false, message: 'Failed to remove from watchlist'};
    }
};
