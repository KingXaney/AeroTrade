'use server';

import {cookies} from "next/headers";
import {connectToDatabase} from "@/database/mongoose";
import UserPreferencesModel from "@/database/models/user-preferences.model";
import {getCurrentUserId} from "@/lib/actions/watchlist.actions";
import {upsertPreferences} from "@/lib/preferences/upsert";
import {
    DEFAULT_THEME,
    encodeThemeCookie,
    isPaletteId,
    resolveTheme,
    THEME_COOKIE,
    THEME_COOKIE_MAX_AGE,
    type Theme,
} from "@/lib/theme/resolve";
import {isStyleId} from "@/lib/theme/styles";

export type AppearanceResult = OrderResult & {theme?: Theme};

// The cookie mirrors the DB so the root layout can render the right <html>
// attributes before any client JS runs. It carries whitelisted ids only.
const setThemeCookie = async (theme: Theme) => {
    (await cookies()).set(THEME_COOKIE, encodeThemeCookie(theme), {
        path: '/',
        maxAge: THEME_COOKIE_MAX_AGE,
        sameSite: 'lax',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
    });
};

const readAppearance = async (userId: string): Promise<Theme | null> => {
    await connectToDatabase();
    const prefs = await UserPreferencesModel.findOne({userId}).select('appearance').lean();
    return prefs?.appearance ? resolveTheme(prefs.appearance) : null;
};

// Used by the (root) layout to reconcile a stale cookie on another device.
export const getAppearanceForUser = async (userId: string): Promise<Theme | null> => {
    try {
        return await readAppearance(userId);
    } catch (e) {
        console.error('Error reading appearance:', e);
        return null;
    }
};

export const getAppearance = async (): Promise<Theme> => {
    const userId = await getCurrentUserId();
    if (!userId) return DEFAULT_THEME;
    return (await getAppearanceForUser(userId)) ?? DEFAULT_THEME;
};

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

// After sign-in the cookie must describe THIS account (a previous user's theme may
// still be on the device). No saved theme -> back to the default.
export const syncThemeCookieForUser = async (userId: string): Promise<void> => {
    const theme = await getAppearanceForUser(userId);
    if (theme) await setThemeCookie(theme);
    else (await cookies()).delete(THEME_COOKIE);
};
