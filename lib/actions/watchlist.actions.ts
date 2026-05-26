'use server';

import {revalidatePath} from "next/cache";
import {headers} from "next/headers";
import {connectToDatabase} from "@/database/mongoose";
import Watchlist from "@/database/models/watchlist.model";
import {auth} from "@/lib/better-auth/auth";

// ============================================================================
// --- Session ---
// ============================================================================

export const getCurrentUserId = async (): Promise<string | null> => {
    try {
        const session = await auth.api.getSession({headers: await headers()});
        return session?.user?.id ?? null;
    } catch (error) {
        console.error('Error reading session:', error);
        return null;
    }
};

// ============================================================================
// --- Reads ---
// ============================================================================

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

export const getWatchlistForUser = async (userId: string): Promise<WatchlistEntry[]> => {
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
        return [];
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

// ============================================================================
// --- Mutations ---
// ============================================================================

export const addToWatchlist = async (
    {symbol, company}: {symbol: string; company: string},
): Promise<{success: boolean; message?: string}> => {
    try {
        const userId = await getCurrentUserId();
        if (!userId) return {success: false, message: 'Not authenticated'};

        await connectToDatabase();
        await Watchlist.updateOne(
            {userId, symbol: symbol.toUpperCase()},
            {$setOnInsert: {company, addedAt: new Date()}},
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
