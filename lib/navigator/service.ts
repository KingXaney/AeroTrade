// Navigator read/assembly helpers (NOT a 'use server' module — plain server code
// shared by the /brain page and the weekly Inngest job).

import {connectToDatabase} from "@/database/mongoose";
import SuggestionSet, {GLOBAL_SUGGESTIONS_USER, type SuggestionSetDoc} from "@/database/models/suggestion-set.model";

export type SuggestionSetView = {
    date: string;
    items: SuggestionItem[];
    rationaleMd: string | null;
};

const toView = (set: SuggestionSetDoc | null): SuggestionSetView | null => {
    if (!set) return null;
    return {
        date: set.date,
        items: set.items.map((i) => ({
            symbol: i.symbol,
            action: i.action,
            quantity: i.quantity,
            targetWeight: i.targetWeight,
            currentWeight: i.currentWeight,
            score: i.score,
            reasons: i.reasons,
            executed: i.executed,
            executionPrice: i.executionPrice,
            error: i.error,
        })),
        rationaleMd: set.rationaleMd ?? null,
    };
};

// Latest global model portfolio + the user's own executed set (if enrolled).
export const getLatestSuggestions = async (userId: string): Promise<{global: SuggestionSetView | null; user: SuggestionSetView | null}> => {
    try {
        await connectToDatabase();
        const [globalSet, userSet] = await Promise.all([
            SuggestionSet.findOne({userId: GLOBAL_SUGGESTIONS_USER}).sort({date: -1}),
            SuggestionSet.findOne({userId}).sort({date: -1}),
        ]);
        return {global: toView(globalSet), user: toView(userSet)};
    } catch (error) {
        console.error('Error reading suggestions:', error);
        return {global: null, user: null};
    }
};
