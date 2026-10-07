// The seat pass: a short-lived signed note that this browser is player `pid` in room `roomId`, sent
// back in the X-PN-Pass header, so a poll, a tick or an emote skips the session's database read.
// Server-only (node:crypto; on the poker-night server guard's list) and pure apart from the key.
//
// `v1.<roomId>.<pid>.<expires, seconds in base 36>.<mac>`, an HMAC-SHA256 under a key derived for
// this purpose alone, good for LIMITS.passTtlMs. A join or an action always reads the identity in
// full and mints a fresh one, and a pass past half its life is answered with a fresh one; a pass
// that fails, for any reason, just means a full read. On every route a valid pass keys the
// request's rate-limit bucket by its player.

import {createHmac} from 'node:crypto';
import {deriveKey, sameText} from '@/lib/poker-night/guest-token';
import {LIMITS} from '@/lib/poker-night/limits';

export const PASS_VERSION = 'v1';
export const PASS_KEY_LABEL = 'aerotrade/poker-night/pass/v1';

const ROOM_ID = /^[0-9a-f]{24}$/;
const PID = /^[A-Za-z0-9_-]{11}$/;
const EXPIRES = /^[0-9a-z]{1,9}$/;
const MAC = /^[A-Za-z0-9_-]{43}$/;

type EnvVars = Readonly<Record<string, string | undefined>>;

// Passes do not outlive a rotation: a pass that stops verifying costs one full identity read.
export const passKey = (vars: EnvVars = process.env): Buffer => {
    const secret = vars.POKER_NIGHT_GUEST_SECRET || vars.BETTER_AUTH_SECRET;
    if (!secret) throw new Error('poker night: set POKER_NIGHT_GUEST_SECRET or BETTER_AUTH_SECRET');
    return deriveKey(secret, PASS_KEY_LABEL);
};

const mac = (key: Buffer, body: string): string => createHmac('sha256', key).update(body).digest('base64url');

export type Pass = {roomId: string; pid: string; exp: number};

// exp in ms; the pass carries it to the second.
export const mintPass = (key: Buffer, {roomId, pid, exp}: Pass): string => {
    const body = `${PASS_VERSION}.${roomId}.${pid}.${Math.floor(exp / 1000).toString(36)}`;
    return `${body}.${mac(key, body)}`;
};

// A pass good from now for LIMITS.passTtlMs.
export const passFor = (key: Buffer, roomId: string, pid: string, nowMs: number): string =>
    mintPass(key, {roomId, pid, exp: nowMs + LIMITS.passTtlMs});

// Whether a pass a request came with is answered with a fresh one: past half its life.
export const passRenewalDue = (pass: Pick<Pass, 'exp'>, nowMs: number): boolean => pass.exp - nowMs < LIMITS.passTtlMs / 2;

// The pass's room, player and expiry, or null: malformed, another version, expired, expiring
// further ahead than a pass lives, signed with another key, or (when `roomId` is given) for another
// room. Never throws.
export const verifyPass = (raw: string | null | undefined, key: Buffer, nowMs: number, roomId?: string): Pass | null => {
    if (typeof raw !== 'string' || raw.length > 128) return null;
    const parts = raw.split('.');
    if (parts.length !== 5) return null;
    const [version, room, pid, expires, given] = parts;
    if (version !== PASS_VERSION || !ROOM_ID.test(room) || !PID.test(pid) || !EXPIRES.test(expires) || !MAC.test(given)) return null;
    if (roomId !== undefined && room !== roomId) return null;
    const exp = parseInt(expires, 36) * 1000;
    if (exp <= nowMs || exp > nowMs + LIMITS.passTtlMs + 60_000) return null;
    if (!sameText(mac(key, `${version}.${room}.${pid}.${expires}`), given)) return null;
    return {roomId: room, pid, exp};
};
