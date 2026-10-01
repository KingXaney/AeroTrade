// The saved theme's server side: the appearance in a user's preferences and the cookie that
// mirrors it. A plain server module, NOT 'use server': the read and the cookie sync take a user
// id, which only the (root) layout and the session-derived actions in
// lib/actions/appearance.actions.ts and auth.actions.ts supply.

import {cookies} from "next/headers";
import {connectToDatabase} from "@/database/mongoose";
import UserPreferencesModel from "@/database/models/user-preferences.model";
import {
    encodeThemeCookie,
    resolveTheme,
    THEME_COOKIE,
    THEME_COOKIE_MAX_AGE,
    type Theme,
} from "@/lib/theme/resolve";

// The cookie mirrors the DB so the root layout can render the right <html>
// attributes before any client JS runs. It carries whitelisted ids only.
export const setThemeCookie = async (theme: Theme) => {
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

// After sign-in the cookie must describe THIS account (a previous user's theme may
// still be on the device). No saved theme -> back to the default.
export const syncThemeCookieForUser = async (userId: string): Promise<void> => {
    const theme = await getAppearanceForUser(userId);
    if (theme) await setThemeCookie(theme);
    else (await cookies()).delete(THEME_COOKIE);
};
