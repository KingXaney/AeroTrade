'use server';

import {connectToDatabase} from "@/database/mongoose";
import {getCurrentUserId} from "@/lib/auth/session";
import {upsertPreferences} from "@/lib/settings/preferences-store";
import {isThemeInput, resolveTheme, type Theme} from "@/lib/theme/resolve";
import {getAppearanceForUser, setThemeCookie} from "@/lib/theme/store";
import type {ActionResult} from '@/lib/actions/types';

type AppearanceResult = ActionResult & {theme?: Theme};

export const setAppearance = async (input: unknown): Promise<AppearanceResult> => {
    const userId = await getCurrentUserId();
    if (!userId) return {success: false, message: 'Not authenticated'};
    // A palette and a boolean, whatever else is posted (lib/theme/resolve.ts isThemeInput, held
    // by its test): a tab opened before the app kept one look still posts the style it had, and
    // resolveTheme below drops it, so that save lands without it instead of failing here.
    if (!isThemeInput(input)) return {success: false, message: 'Invalid theme'};

    const theme = resolveTheme(input);
    try {
        await connectToDatabase();
        // The two fields by path, never the whole sub-document: a `style` saved before the one
        // look stays where it is, the record of that reader's choice if this is rolled back — and
        // what a build from before it reads while a preview of this one shares its database.
        await upsertPreferences(userId, {$set: {'appearance.palette': theme.palette, 'appearance.reduceMotion': theme.reduceMotion, updatedAt: new Date()}});
        await setThemeCookie(theme);
        return {success: true, theme};
    } catch (e) {
        console.error('Error saving appearance:', e);
        return {success: false, message: 'Could not save your theme'};
    }
};

export const adoptAppearanceCookie = async (): Promise<AppearanceResult> => {
    const userId = await getCurrentUserId();
    if (!userId) return {success: false, message: 'Not authenticated'};

    const theme = await getAppearanceForUser(userId);
    if (!theme) return {success: false, message: 'No saved theme'};

    await setThemeCookie(theme);
    return {success: true, theme};
};
