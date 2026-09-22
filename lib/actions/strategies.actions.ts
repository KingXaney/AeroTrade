'use server';

import {connectToDatabase} from "@/database/mongoose";
import UserPreferencesModel from "@/database/models/user-preferences.model";
import {getCurrentUserId} from "@/lib/actions/watchlist.actions";
import {unsetPreference, upsertPreferences} from "@/lib/preferences/upsert";
import {strategyBySlug} from "@/lib/strategies/catalog";
import {getFollowedStrategies} from "@/lib/strategies/follows";

// Writes only: which quant strategies a user pins on the dashboard. Reads live in
// lib/strategies/follows.ts. Absence is the default, so emptying the list unsets it.

export type FollowResult = OrderResult & {followed?: string[]};

export const followStrategy = async (slug: unknown): Promise<FollowResult> => {
    const userId = await getCurrentUserId();
    if (!userId) return {success: false, message: 'Not authenticated'};
    const def = typeof slug === 'string' ? strategyBySlug(slug) : undefined;
    if (!def) return {success: false, message: 'Unknown strategy'};
    try {
        await connectToDatabase();
        await upsertPreferences(userId, {$addToSet: {followedStrategies: def.id}, $set: {updatedAt: new Date()}});
        return {success: true, followed: await getFollowedStrategies(userId)};
    } catch (error) {
        console.error('Error following strategy:', error);
        return {success: false, message: 'Could not follow this strategy'};
    }
};

export const unfollowStrategy = async (slug: unknown): Promise<FollowResult> => {
    const userId = await getCurrentUserId();
    if (!userId) return {success: false, message: 'Not authenticated'};
    const def = typeof slug === 'string' ? strategyBySlug(slug) : undefined;
    if (!def) return {success: false, message: 'Unknown strategy'};
    try {
        await connectToDatabase();
        await UserPreferencesModel.updateOne({userId}, {$pull: {followedStrategies: def.id}, $set: {updatedAt: new Date()}});
        const followed = await getFollowedStrategies(userId);
        if (followed.length === 0) await unsetPreference(userId, 'followedStrategies');
        return {success: true, followed};
    } catch (error) {
        console.error('Error unfollowing strategy:', error);
        return {success: false, message: 'Could not unfollow this strategy'};
    }
};
