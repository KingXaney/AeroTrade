// What an account saved for poker night (user-preferences.pokerNight): the name and look it sits down
// with, its personal look (card back, suits, chips, sound …) and the scene and felt its new tables
// open with — read for the lobby's My look, for a new table's host and for the table's own render.
// Server-only (on the poker-night server guard's list) and a plain module, never 'use server': it
// takes a user id, so as an action it would read anyone's. The lobby's write is
// lib/actions/poker-night.actions.savePokerNightProfile; the table's one write is saveTableLook,
// which the action route calls after the host changes the scene or the felt at a table. What an
// account sits down as when nothing is saved is lib/poker-night/lobby.profileOf.

import {connectToDatabase} from "@/database/mongoose";
import UserPreferences from "@/database/models/user-preferences.model";
import type {SavedProfile} from "@/lib/poker-night/lobby";
import {isFeltId, isSceneId, type TableLook} from "@/lib/poker-night/looks";
import {personalPatchOf} from "@/lib/poker-night/personal";
import {upsertPreferences} from "@/lib/settings/preferences-store";

type PrefsDoc = {pokerNight?: {name?: unknown; avatar?: unknown; look?: unknown; table?: {scene?: unknown; felt?: unknown} | null} | null};

const text = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

const tableOf = (raw: {scene?: unknown; felt?: unknown} | null | undefined): TableLook | null =>
    raw && isSceneId(raw.scene) && isFeltId(raw.felt) ? {scene: raw.scene, felt: raw.felt} : null;

const NOTHING: SavedProfile = {name: null, avatar: null, look: null, table: null};

// What the account saved, each part null when it is not there (the look: only its fields that
// read). A failed read is an empty profile, never an error: the lobby and a new table fall back on
// the account's defaults.
export const getPokerNightPrefs = async (userId: string): Promise<SavedProfile> => {
    try {
        await connectToDatabase();
        const doc = await UserPreferences.findOne({userId}, {_id: 0, pokerNight: 1}).lean<PrefsDoc | null>();
        const saved = doc?.pokerNight;
        if (!saved) return NOTHING;
        const look = personalPatchOf(saved.look);
        return {name: text(saved.name), avatar: text(saved.avatar), look: Object.keys(look).length > 0 ? look : null, table: tableOf(saved.table)};
    } catch (error) {
        console.error('poker night: reading the saved look failed', {message: error instanceof Error ? error.message : String(error)});
        return NOTHING;
    }
};

// The scene and felt the host just chose at a table, kept as their new tables' look. Best effort:
// it runs after the answer, and a failure costs only the default.
export const saveTableLook = async (userId: string, look: TableLook): Promise<void> => {
    try {
        await connectToDatabase();
        await upsertPreferences(userId, {$set: {'pokerNight.table': {scene: look.scene, felt: look.felt}, updatedAt: new Date()}});
    } catch (error) {
        console.error('poker night: saving the table look failed', {message: error instanceof Error ? error.message : String(error)});
    }
};
