'use server';

import {connectToDatabase} from "@/database/mongoose";
import {getCurrentUserId} from "@/lib/actions/watchlist.actions";
import {unsetPreference, upsertPreferences} from "@/lib/preferences/upsert";
import {DashboardLayoutSchema, normalizeLayout, resetLayout, type DashboardLayout} from "@/lib/dashboard/layout";

// Writes only. Reads live in lib/dashboard/layout-store.ts (a plain server module),
// so they are not exposed as POST endpoints. Neither action revalidates a path:
// an action-triggered re-render would remount the dashboard grid before the
// client finishes its own save flow, so callers refresh explicitly.

export type LayoutResult = OrderResult & {layout?: DashboardLayout};

export const saveDashboardLayout = async (input: unknown): Promise<LayoutResult> => {
    const userId = await getCurrentUserId();
    if (!userId) return {success: false, message: 'Not authenticated'};

    const parsed = DashboardLayoutSchema.safeParse(input);
    if (!parsed.success) return {success: false, message: 'Invalid layout'};
    const layout = normalizeLayout(parsed.data);   // drops unknown ids, clamps spans, trims

    try {
        await connectToDatabase();
        await upsertPreferences(userId, {dashboardLayout: layout, updatedAt: new Date()});
        return {success: true, layout};
    } catch (error) {
        console.error('Error saving dashboard layout:', error);
        return {success: false, message: 'Could not save your dashboard'};
    }
};

export const resetDashboardLayout = async (): Promise<LayoutResult> => {
    const userId = await getCurrentUserId();
    if (!userId) return {success: false, message: 'Not authenticated'};
    try {
        await connectToDatabase();
        await unsetPreference(userId, 'dashboardLayout');
        return {success: true, layout: resetLayout()};
    } catch (error) {
        console.error('Error resetting dashboard layout:', error);
        return {success: false, message: 'Could not reset your dashboard'};
    }
};
