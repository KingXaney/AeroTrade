'use server';

import {revalidatePath} from "next/cache";
import {connectToDatabase} from "@/database/mongoose";
import Watchlist from "@/database/models/watchlist.model";
import {getCurrentUserId} from "@/lib/auth/session";

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
        const displayName = company.trim().slice(0, 120) || ticker;

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
