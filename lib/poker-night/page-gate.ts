// The table page's one read of its room: /play/CODE's layout, the page and its metadata
// (app/(play)/play/[code]) share it through the request's cache. Server-only, like the store it
// reads through, and it never writes the room.
//
// A page render tells whoever asks whether a code names a table (a 404, or the table and its join
// card), so it pays for a guess the way every table route does (lib/poker-night/route-kit): a code
// that names no table spends the address's miss counter (RATE_LIMITS.miss, the same key the routes
// spend), and an address that has used up its window reads every code as gone — a real 404 for a
// table that exists too — so nobody learns which codes exist faster than the counter allows. The
// counter is read beside the room, never in front of it, so a render waits for one round trip; an
// address seen past it is remembered on this instance until its window ends, so a loop from it costs
// no read at all. A request no header names a client for (a local server without a proxy) is
// counted by neither, as on the routes.

import {cache} from "react";
import {headers} from "next/headers";
import {clientIpFrom} from "@/lib/auth/limits";
import {peekRateLimit, takeRateLimit} from "@/lib/rate-limit";
import type {Env} from "@/lib/poker-night/env";
import {counterSpent, pnKey, RATE_LIMITS} from "@/lib/poker-night/limits";
import {getRoomByCode, type RoomRead} from "@/lib/poker-night/store";

const GONE: RoomRead = {ok: false, why: 'gone'};

// Addresses past the miss counter, by key, with the end of their window: per instance, the least
// recently refused dropped first past PAST_KEPT.
const PAST_KEPT = 2000;
const past = new Map<string, number>();

const isPast = (key: string, now: number): boolean => {
    const until = past.get(key);
    if (until === undefined) return false;
    if (until > now) return true;
    past.delete(key);
    return false;
};

const rememberPast = (key: string, until: number): void => {
    past.delete(key);
    past.set(key, until);
    while (past.size > PAST_KEPT) past.delete(past.keys().next().value as string);
};

// The room behind /play/CODE for this request's address: the store's read, or gone — for a code
// that names no table (a miss, spent), and for any code once the address has spent its misses.
export const readTablePage = cache(async (env: Env, code: string): Promise<RoomRead> => {
    const ip = clientIpFrom(await headers());
    if (ip === null) return getRoomByCode(env, code);
    const key = pnKey.miss(env, ip);
    if (isPast(key, Date.now())) return GONE;
    const [spent, read] = await Promise.all([peekRateLimit(key), getRoomByCode(env, code)]);
    if (spent !== null && counterSpent(spent, RATE_LIMITS.miss.limit)) {
        rememberPast(key, spent.expiresAt);
        return GONE;
    }
    if (!read.ok && read.why === 'gone') await takeRateLimit(key, RATE_LIMITS.miss.limit, RATE_LIMITS.miss.windowMs);
    return read;
});
