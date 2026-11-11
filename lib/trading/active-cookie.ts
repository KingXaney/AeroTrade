// The cookie that names the paper account the UI operates on (lib/trading/config
// ACTIVE_ACCOUNT_COOKIE): written when an account is switched to or created, cleared when the
// account it names is deleted. HTTP-only, so only the server reads or writes it — a route
// handler or a server action; a page reads it through lib/trading/active-account.preferredAccountId.
// Server-only (next/headers).

import {cookies} from "next/headers";
import {ACTIVE_ACCOUNT_COOKIE} from "@/lib/trading/config";

const ACTIVE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export const setActiveAccountCookie = async (accountId: string): Promise<void> => {
    const store = await cookies();
    store.set(ACTIVE_ACCOUNT_COOKIE, accountId, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: ACTIVE_COOKIE_MAX_AGE_SECONDS,
    });
};

// Clears the cookie when it names `accountId` (the account just deleted).
export const clearActiveAccountCookie = async (accountId: string): Promise<void> => {
    const store = await cookies();
    if (store.get(ACTIVE_ACCOUNT_COOKIE)?.value === accountId) store.delete(ACTIVE_ACCOUNT_COOKIE);
};
