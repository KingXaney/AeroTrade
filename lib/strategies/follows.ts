// Which quant strategies a user pinned on the dashboard. Plain server module.

import {connectToDatabase} from "@/database/mongoose";
import UserPreferencesModel from "@/database/models/user-preferences.model";
import {STRATEGY_SLUGS} from "@/lib/strategies/catalog";

export const getFollowedStrategies = async (userId: string): Promise<string[]> => {
    try {
        await connectToDatabase();
        const prefs = await UserPreferencesModel.findOne({userId}).select('followedStrategies').lean<{followedStrategies?: string[]}>();
        const known = new Set<string>(STRATEGY_SLUGS);
        return (prefs?.followedStrategies ?? []).filter((slug) => known.has(slug));
    } catch (error) {
        console.error('Error reading followed strategies:', error);
        return [];
    }
};
