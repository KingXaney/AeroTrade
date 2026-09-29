'use server';

import {revalidatePath} from "next/cache";
import {connectToDatabase} from "@/database/mongoose";
import {getCurrentUserId} from "@/lib/actions/watchlist.actions";
import {upsertPreferences} from "@/lib/preferences/upsert";

// Writes only; the reads live in lib/learn/facts-store.ts (a plain server module).

// The one-time "Hide" on the First-week checklist. A stamp, never a recomputation:
// a dismissed checklist stays dismissed however fresh the account still looks.
export const dismissMissions = async (): Promise<OrderResult> => {
    const userId = await getCurrentUserId();
    if (!userId) return {success: false, message: 'Not authenticated'};
    try {
        await connectToDatabase();
        await upsertPreferences(userId, {$set: {'learn.missionsDismissedAt': new Date(), updatedAt: new Date()}});
        revalidatePath('/');
        return {success: true};
    } catch (error) {
        console.error('Error dismissing missions:', error);
        return {success: false, message: 'Could not hide the checklist'};
    }
};
