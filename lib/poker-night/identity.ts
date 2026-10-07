// Who a poker night request comes from. Server-only: it reads the request's cookies and headers and
// goes through lib/auth/session, so no test may import it (invariant 1) and the poker-night server
// guard keeps every client file from reaching it. The pure rules it serves — which row an identity
// plays as, what a removal bans — are lib/poker-night/room.ts.
//
// 1. The guest cookie is read and verified (lib/poker-night/guest-token), with no database call.
// 2. Only when the request carries a better-auth session cookie is the session read (a database
//    read): an account always wins over the guest cookie it may also carry. A session read that
//    throws is 'unavailable' — a 503 — never quietly a guest.
// 3. Otherwise the guest, else 'none'.
//
// Guests are never better-auth users: an anonymous session would open every (root) page, the shell
// and the daily email to them. Only POST join mints the cookie (issueGuestCookie).

import {cookies, headers} from "next/headers";
import {getSessionCookie} from "better-auth/cookies";
import {getSessionUser} from "@/lib/auth/session";
import {envOf, type Env} from "@/lib/poker-night/env";
import {
    guestCookieName, guestCookieOptions, guestIdForJoin, guestKeys, needsReissue, reissueGuestToken, verifyGuestToken, type GuestToken,
} from "@/lib/poker-night/guest-token";
import type {PlayerIdentity} from "@/lib/poker-night/room";

export type {PlayerIdentity};

export type RequestIdentity = {identity: PlayerIdentity; guest: GuestToken | null};

// The guest cookie's token, verified; null when absent, forged, expired, or when no key can be
// derived (no secret set: then nobody is a guest, and a join answers 'unavailable').
const readGuest = (value: string | undefined, now: number): GuestToken | null => {
    if (!value) return null;
    try {
        return verifyGuestToken(value, guestKeys(), now);
    } catch {
        return null;
    }
};

// The identity and the guest token it rests on (the join route re-signs an old one).
export const readRequestIdentity = async (env: Env = envOf()): Promise<RequestIdentity> => {
    const [headerList, cookieStore] = await Promise.all([headers(), cookies()]);
    const guest = readGuest(cookieStore.get(guestCookieName(env))?.value, Date.now());
    if (getSessionCookie(headerList)) {
        try {
            const user = await getSessionUser();
            if (user) return {identity: {kind: 'user', userId: user.id, accountName: user.name, guestId: guest?.guestId ?? null}, guest};
        } catch (error) {
            console.error('poker night: the session read failed', {message: error instanceof Error ? error.message : String(error)});
            return {identity: {kind: 'unavailable'}, guest: null};
        }
    }
    if (guest) return {identity: {kind: 'guest', guestId: guest.guestId, issuedAt: guest.issuedAt}, guest};
    return {identity: {kind: 'none'}, guest: null};
};

export const readIdentity = async (env: Env = envOf()): Promise<PlayerIdentity> => (await readRequestIdentity(env)).identity;

// POST join's cookie: for a request with no identity, the guest its join id names
// (guestIdForJoin: a retried join is the same guest); for a guest whose token is 30 days old or
// was signed with the previous key, the same guest re-signed. Set on the route's response
// (cookies().set in a route handler). Throws when no secret is set.
export const issueGuestCookie = async (
    env: Env, now: number, from: {current: GuestToken} | {joinId: string},
): Promise<{guestId: string; issuedAt: number}> => {
    const [key] = guestKeys();
    const issuedAt = Math.floor(now / 1000) * 1000;
    const guestId = 'current' in from ? from.current.guestId : guestIdForJoin(key, from.joinId);
    const token = reissueGuestToken(key, guestId, now);
    (await cookies()).set(guestCookieName(env), token, guestCookieOptions(env));
    return {guestId, issuedAt};
};

export const guestNeedsReissue = (guest: GuestToken | null, now: number): guest is GuestToken => guest !== null && needsReissue(guest, now);
