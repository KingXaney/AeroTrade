// The guest cookie: how a browser with no account is the same player at a table from one visit to
// the next. Server-only (node:crypto) — the poker-night server guard keeps every client file and
// everything under components/ from reaching it — but pure apart from the randomness it is handed,
// so it is unit-tested. Guests are never better-auth users: an anonymous session would open every
// (root) page and the daily email to them.
//
// The token is `v1.<guestId>.<issued at, seconds in base 36>.<mac>`: a 22-character id (16 random
// bytes of base64url) and an HMAC-SHA256 over the first three parts. It is minted only by POST join,
// httpOnly, SameSite=Lax (a tap on the link in a chat app is a cross-site top-level GET, which
// still carries it), path /, kept 180 days and re-issued after 30. The key comes from
// POKER_NIGHT_GUEST_SECRET, else from BETTER_AUTH_SECRET; POKER_NIGHT_GUEST_SECRET_PREVIOUS names
// the secret the keys came from before a rotation (BETTER_AUTH_SECRET's value if no guest secret
// was set), so seated guests keep their seats through it.

import {createHmac, randomBytes, timingSafeEqual} from 'node:crypto';
import type {Env} from '@/lib/poker-night/env';
import {LIMITS} from '@/lib/poker-night/limits';

export const GUEST_TOKEN_VERSION = 'v1';
export const GUEST_KEY_LABEL = 'aerotrade/poker-night/guest/v1';

const GUEST_ID = /^[A-Za-z0-9_-]{22}$/;
const ISSUED = /^[0-9a-z]{1,9}$/;
const MAC = /^[A-Za-z0-9_-]{43}$/;

type EnvVars = Readonly<Record<string, string | undefined>>;

// A 32-byte key for one purpose (the label), from a secret. Throws on an empty secret.
export const deriveKey = (secret: string, label: string): Buffer => {
    if (!secret) throw new Error('poker night: no secret to derive a key from');
    return createHmac('sha256', secret).update(label).digest();
};

// The keys guest tokens verify under, the one they are minted with first.
export const guestKeys = (vars: EnvVars = process.env): Buffer[] => {
    const current = vars.POKER_NIGHT_GUEST_SECRET || vars.BETTER_AUTH_SECRET;
    if (!current) throw new Error('poker night: set POKER_NIGHT_GUEST_SECRET or BETTER_AUTH_SECRET');
    const previous = vars.POKER_NIGHT_GUEST_SECRET_PREVIOUS;
    return [deriveKey(current, GUEST_KEY_LABEL), ...(previous && previous !== current ? [deriveKey(previous, GUEST_KEY_LABEL)] : [])];
};

const mac = (key: Buffer, body: string): string => createHmac('sha256', key).update(body).digest('base64url');

// Two macs compared as the text they are, in constant time: two base64url strings can decode to
// the same bytes (the last character carries spare bits), so comparing bytes would let a changed
// character through.
export const sameText = (a: string, b: string): boolean => {
    const x = Buffer.from(a, 'utf8');
    const y = Buffer.from(b, 'utf8');
    return x.length === y.length && timingSafeEqual(x, y);
};

export const mintGuestToken = (key: Buffer, nowMs: number, bytes: (n: number) => Buffer = randomBytes): {guestId: string; token: string} => {
    const guestId = bytes(16).toString('base64url');
    const body = `${GUEST_TOKEN_VERSION}.${guestId}.${Math.floor(nowMs / 1000).toString(36)}`;
    return {guestId, token: `${body}.${mac(key, body)}`};
};

// The guest a join with no identity is given: an HMAC of the join's own id (input.JoinSchema's
// joinId, made once per intent and reused on a retry) under the current key, as 16 bytes of
// base64url. The same join id — a double tap, a retry after a lost answer — is the same guest, so a
// join is one row however often it is sent; without the key, no one can tell which guest an id names.
export const guestIdForJoin = (key: Buffer, joinId: string): string =>
    createHmac('sha256', key).update(`join:${joinId}`).digest().subarray(0, 16).toString('base64url');

export type GuestToken = {guestId: string; issuedAt: number; keyIndex: number};

// The token's guest, or null: a malformed token, another version, a bad mac under every key, one
// issued more than LIMITS.guestCookieMaxAgeMs ago or more than LIMITS.guestFutureSkewMs ahead.
// Never throws.
export const verifyGuestToken = (raw: string | null | undefined, keys: Buffer | readonly Buffer[], nowMs: number): GuestToken | null => {
    if (typeof raw !== 'string' || raw.length > 128) return null;
    const parts = raw.split('.');
    if (parts.length !== 4) return null;
    const [version, guestId, issued, given] = parts;
    if (version !== GUEST_TOKEN_VERSION || !GUEST_ID.test(guestId) || !ISSUED.test(issued) || !MAC.test(given)) return null;
    const issuedAt = parseInt(issued, 36) * 1000;
    if (issuedAt > nowMs + LIMITS.guestFutureSkewMs || issuedAt < nowMs - LIMITS.guestCookieMaxAgeMs) return null;
    const body = `${version}.${guestId}.${issued}`;
    const list = Array.isArray(keys) ? keys : [keys as Buffer];
    for (let i = 0; i < list.length; i++) if (sameText(mac(list[i], body), given)) return {guestId, issuedAt, keyIndex: i};
    return null;
};

// A verified token is minted afresh (same guest) once it is 30 days old or was signed with a
// previous key, so a regular keeps the cookie and a rotation completes.
export const needsReissue = (token: GuestToken, nowMs: number): boolean =>
    token.keyIndex > 0 || nowMs - token.issuedAt > LIMITS.guestReissueAfterMs;

// The same guest's token signed now with the current key.
export const reissueGuestToken = (key: Buffer, guestId: string, nowMs: number): string => {
    const body = `${GUEST_TOKEN_VERSION}.${guestId}.${Math.floor(nowMs / 1000).toString(36)}`;
    return `${body}.${mac(key, body)}`;
};

// __Host- (secure, path /, no domain) wherever the site is served over HTTPS: production and
// previews. A local server is plain http, where a __Host- cookie would never be set.
export const guestCookieName = (env: Env): string => (env === 'development' ? 'aero-pn-guest' : '__Host-aero-pn-guest');

export const guestCookieOptions = (env: Env) => ({
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    secure: env !== 'development',
    maxAge: Math.floor(LIMITS.guestCookieMaxAgeMs / 1000),
});
