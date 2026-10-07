// The name and look an account saved for poker night (user-preferences.pokerNight), read for the
// lobby's My look and for a new table's host. Server-only (on the poker-night server guard's list)
// and a plain module, never 'use server': it takes a user id, so as an action it would read anyone's.
// The write is lib/actions/poker-night.actions.savePokerNightProfile; what an account sits down as
// when nothing is saved is lib/poker-night/lobby.profileOf.

import {connectToDatabase} from "@/database/mongoose";
import UserPreferences from "@/database/models/user-preferences.model";
import type {SavedProfile} from "@/lib/poker-night/lobby";

type PrefsDoc = {pokerNight?: {name?: unknown; avatar?: unknown} | null};

const text = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

// What the account saved, each part null when it is not there. A failed read is an empty profile,
// never an error: the lobby and a new table fall back on the account's defaults.
export const getPokerNightPrefs = async (userId: string): Promise<SavedProfile> => {
    try {
        await connectToDatabase();
        const doc = await UserPreferences.findOne({userId}, {_id: 0, pokerNight: 1}).lean<PrefsDoc | null>();
        return {name: text(doc?.pokerNight?.name), avatar: text(doc?.pokerNight?.avatar)};
    } catch (error) {
        console.error('poker night: reading the saved look failed', {message: error instanceof Error ? error.message : String(error)});
        return {name: null, avatar: null};
    }
};
