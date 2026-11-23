// The daily brief's unsubscribe link: signed, so it works without signing in and for nobody
// else's account. Server-only (node:crypto), but pure given its secret.
//
// The token is an HMAC of the user's id under a key derived from the app's own secret
// (BETTER_AUTH_SECRET) and a purpose label, so it is good for this one thing and cannot be
// turned into a session. It does not expire: an unsubscribe link in a mail from last spring
// must still work. Two addresses carry it:
//   - the page a reader opens from the footer (/unsubscribe), which shows a button and posts;
//   - the endpoint a mail client calls for one-click unsubscribe (RFC 8058), and the page posts
//     to: POST /api/email/unsubscribe. Only the POST changes anything, because mail scanners
//     and link previewers follow every GET in a message.

import {createHmac, timingSafeEqual} from "node:crypto";

const PURPOSE = 'email-unsubscribe:v1';

type Env = Readonly<Record<string, string | undefined>>;

export const unsubscribeSecret = (env: Env = process.env): string | null => {
    const secret = env.BETTER_AUTH_SECRET;
    return typeof secret === 'string' && secret.length >= 16 ? secret : null;
};

export const unsubscribeToken = (userId: string, secret: string): string =>
    createHmac('sha256', secret).update(`${PURPOSE}:${userId}`).digest('base64url');

export const verifyUnsubscribeToken = (userId: unknown, token: unknown, secret: string | null): userId is string => {
    if (secret === null || typeof userId !== 'string' || typeof token !== 'string') return false;
    if (userId.length === 0 || userId.length > 64 || token.length > 128) return false;
    const expected = Buffer.from(unsubscribeToken(userId, secret));
    const given = Buffer.from(token);
    return expected.length === given.length && timingSafeEqual(expected, given);
};

const query = (userId: string, secret: string): string =>
    `u=${encodeURIComponent(userId)}&t=${encodeURIComponent(unsubscribeToken(userId, secret))}`;

// The two addresses for one reader; null without a secret (a mail then carries neither).
export const unsubscribeLinks = (appUrl: string, userId: string, secret: string | null = unsubscribeSecret()): {page: string; oneClick: string} | null => {
    if (secret === null || !userId) return null;
    const base = String(appUrl ?? '').replace(/\/+$/, '');
    return {page: `${base}/unsubscribe?${query(userId, secret)}`, oneClick: `${base}/api/email/unsubscribe?${query(userId, secret)}`};
};
