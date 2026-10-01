// The watchlist's reads, by user id (pages, the chat tools, the dashboard) or by email (the
// daily-news job). A plain server module, NOT 'use server': a server-action export that takes
// a userId would let any caller read anyone's watchlist. The writes, session-derived, are
// lib/actions/watchlist.actions.ts.

import {connectToDatabase} from "@/database/mongoose";
import Watchlist from "@/database/models/watchlist.model";

// Used by the daily-news Inngest pipeline (which only knows the user's email).
export const getWatchlistSymbolsByEmail = async (email: string): Promise<string[]> => {
    try {
        const mongoose = await connectToDatabase();
        const db = mongoose.connection.db;
        if (!db) throw new Error('Mongoose connection not connected');

        const user = await db.collection('user').findOne({email});
        if (!user) return [];

        const userId = user.id || user._id?.toString();
        if (!userId) return [];

        const watchlistItems = await Watchlist.find({userId}).select('symbol').lean();

        return watchlistItems.map((item) => item.symbol);
    } catch (error) {
        console.error('Error fetching watchlist symbols by email:', error);
        return [];
    }
};

export const getWatchlistSymbolsByUserId = async (userId: string): Promise<string[]> => {
    try {
        await connectToDatabase();
        const items = await Watchlist.find({userId}).select('symbol').lean();
        return items.map((item) => item.symbol);
    } catch (error) {
        console.error('Error fetching watchlist symbols by userId:', error);
        return [];
    }
};

// null when the read failed: callers say so rather than showing the empty state.
export const getWatchlistForUser = async (userId: string): Promise<WatchlistEntry[] | null> => {
    try {
        await connectToDatabase();
        const items = await Watchlist.find({userId}).sort({addedAt: -1}).lean();
        return items.map((item) => ({
            symbol: item.symbol,
            company: item.company,
            addedAt: item.addedAt,
        }));
    } catch (error) {
        console.error('Error fetching watchlist for user:', error);
        return null;
    }
};

export const isInWatchlist = async (userId: string, symbol: string): Promise<boolean> => {
    try {
        await connectToDatabase();
        const found = await Watchlist.exists({userId, symbol: symbol.toUpperCase()});
        return !!found;
    } catch (error) {
        console.error('Error checking watchlist membership:', error);
        return false;
    }
};
