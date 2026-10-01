'use server';

import {connectToDatabase} from "@/database/mongoose";
import {getCurrentUserId} from "@/lib/auth/session";
import {upsertPreferences} from "@/lib/settings/preferences-store";
import {isPaletteId, resolveTheme, type Theme} from "@/lib/theme/resolve";
import {isStyleId} from "@/lib/theme/styles";
import {getAppearanceForUser, setThemeCookie} from "@/lib/theme/store";

type AppearanceResult = OrderResult & {theme?: Theme};

const isThemeInput = (input: unknown): input is Theme =>
    typeof input === 'object' && input !== null
    && isPaletteId((input as Theme).palette)
    && isStyleId((input as Theme).style)
    && typeof (input as Theme).reduceMotion === 'boolean';

export const setAppearance = async (input: unknown): Promise<AppearanceResult> => {
    const userId = await getCurrentUserId();
    if (!userId) return {success: false, message: 'Not authenticated'};
    if (!isThemeInput(input)) return {success: false, message: 'Invalid theme'};

    const theme = resolveTheme(input);
    try {
        await connectToDatabase();
        await upsertPreferences(userId, {appearance: theme, updatedAt: new Date()});
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
