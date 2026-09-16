// Server-only read of the saved layout. Reads live here (a plain module) rather
// than in the 'use server' action file so they are not exposed as POST endpoints.

import {connectToDatabase} from "@/database/mongoose";
import UserPreferencesModel from "@/database/models/user-preferences.model";
import {migrateLegacyDefault, normalizeLayout, resetLayout, type DashboardLayout} from "@/lib/dashboard/layout";

// Any failure -> default layout: the page never breaks on preferences.
export const getDashboardLayoutForUser = async (userId: string): Promise<DashboardLayout> => {
    try {
        await connectToDatabase();
        const prefs = await UserPreferencesModel.findOne({userId}).select('dashboardLayout').lean();
        return migrateLegacyDefault(normalizeLayout(prefs?.dashboardLayout));
    } catch (error) {
        console.error('Error reading dashboard layout:', error);
        return resetLayout();
    }
};
