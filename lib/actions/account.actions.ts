'use server';

import {cookies, headers} from "next/headers";
import {auth} from "@/lib/auth/server";
import {getCurrentUser} from "@/lib/auth/session";
import {MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH} from "@/lib/auth/validation";
import {
    ACCOUNT_DELETE_LIMIT,
    ACCOUNT_DELETE_WINDOW_MS,
    PASSWORD_CHANGE_LIMIT,
    PASSWORD_CHANGE_WINDOW_MS,
    accountDeleteKey,
    confirmsDeletion,
    passwordChangeKey,
} from "@/lib/account/limits";
import {ACCOUNT_COPY} from "@/lib/learn/copy/account";
import {takeRateLimit} from "@/lib/rate-limit";
import {THEME_COOKIE} from "@/lib/theme/resolve";
import type {ActionResult} from '@/lib/actions/types';

// Settings › Account. Both actions act on the session's own account and take its password, so
// each is counted per account before the password is looked at: a place to guess a password
// gets a handful of tries a window, right or wrong. Arguments arrive from the client unchecked.

const passwordOf = (value: unknown): string | null =>
    (typeof value === 'string' && value.length >= MIN_PASSWORD_LENGTH && value.length <= MAX_PASSWORD_LENGTH ? value : null);

// better-auth says a wrong password in its error's message or code.
const wrongPassword = (error: unknown): boolean => {
    const text = [(error as {message?: unknown})?.message, (error as {body?: {message?: unknown; code?: unknown}})?.body?.message, (error as {body?: {code?: unknown}})?.body?.code]
        .filter((part): part is string => typeof part === 'string').join(' ');
    return /invalid[ _]password/i.test(text);
};

// Changes the password and signs every other device out; the session making the change stays.
export const changeMyPassword = async ({currentPassword, newPassword}: {currentPassword: unknown; newPassword: unknown}): Promise<ActionResult> => {
    const user = await getCurrentUser();
    if (!user) return {success: false, message: ACCOUNT_COPY.notAuthenticated};
    const next = passwordOf(newPassword);
    if (typeof currentPassword !== 'string' || currentPassword.length === 0 || currentPassword.length > MAX_PASSWORD_LENGTH || next === null) {
        return {success: false, message: ACCOUNT_COPY.password.length};
    }
    if (next === currentPassword) return {success: false, message: ACCOUNT_COPY.password.same};
    try {
        if (!(await takeRateLimit(passwordChangeKey(user.id), PASSWORD_CHANGE_LIMIT, PASSWORD_CHANGE_WINDOW_MS))) {
            return {success: false, message: ACCOUNT_COPY.password.limited};
        }
        // Two calls, on purpose. The library's own `revokeOtherSessions: true` deletes EVERY
        // session and issues a new one; the action's response then re-renders the page on the
        // request's old cookie, finds no session and sends the reader away from the form they
        // just used. Changing the password alone leaves this session as it is, and the second
        // call signs the other devices out.
        const sent = await headers();
        await auth.api.changePassword({body: {currentPassword, newPassword: next, revokeOtherSessions: false}, headers: sent});
        await auth.api.revokeOtherSessions({headers: sent}).catch((error) => console.error('The password changed, but other sessions could not be revoked:', error));
        return {success: true, message: ACCOUNT_COPY.password.done};
    } catch (error) {
        if (wrongPassword(error)) return {success: false, message: ACCOUNT_COPY.password.wrong};
        console.error('Changing a password failed:', error);
        return {success: false, message: ACCOUNT_COPY.password.failed};
    }
};

// Deletes the account and everything stored for it. The auth library verifies the session and
// the password, runs lib/account/delete-store.deleteUserData (its beforeDelete, lib/auth/server.ts)
// and only then removes the user, its credentials and its sessions: a cascade that fails leaves
// the account in place, to be tried again.
export const deleteMyAccount = async ({password, confirm}: {password: unknown; confirm: unknown}): Promise<ActionResult> => {
    const user = await getCurrentUser();
    if (!user) return {success: false, message: ACCOUNT_COPY.notAuthenticated};
    if (!confirmsDeletion(confirm, user.email)) return {success: false, message: ACCOUNT_COPY.remove.mismatch};
    if (typeof password !== 'string' || password.length === 0 || password.length > MAX_PASSWORD_LENGTH) {
        return {success: false, message: ACCOUNT_COPY.remove.wrong};
    }
    try {
        if (!(await takeRateLimit(accountDeleteKey(user.id), ACCOUNT_DELETE_LIMIT, ACCOUNT_DELETE_WINDOW_MS))) {
            return {success: false, message: ACCOUNT_COPY.remove.limited};
        }
        await auth.api.deleteUser({body: {password}, headers: await headers()});
        (await cookies()).delete(THEME_COOKIE);
        return {success: true, message: ACCOUNT_COPY.remove.done};
    } catch (error) {
        if (wrongPassword(error)) return {success: false, message: ACCOUNT_COPY.remove.wrong};
        console.error('Deleting an account failed:', error);
        return {success: false, message: ACCOUNT_COPY.remove.failed};
    }
};
