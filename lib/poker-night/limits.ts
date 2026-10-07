// Poker night's limits outside the game itself, in one table: how many people a room keeps, how
// long the guest cookie, the seat pass and the realtime token last, the heartbeat and presence
// windows, and the rate limits — the in-memory buckets on the hot routes and the Mongo counters on
// the few low-frequency ones. Pure, and the one place these numbers live (limits.test.ts).
//
// Every rate-limit key carries the env (lib/poker-night/env), like every room query: a preview
// build shares production's database and its counters.

import {TIMING} from '@/lib/poker-night/config';
import type {Env} from '@/lib/poker-night/env';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const LIMITS = {
    // People a room keeps. A watcher is a player row with no seat; watchers count toward the cap
    // only while active (seen in the last activeWindowMs). `players` bounds the rows a room keeps,
    // so the room document (and the ledger, one row per player who sat) keeps to its budget: a join
    // first prunes stale watcher rows and, at the bound, lets go of departed guests' rows that hold
    // nothing (room.joinStep), so people who are gone never fill the room. `bannedKeys` bounds the
    // removals the room remembers; past it, the oldest whose rows are gone are forgotten first.
    watchers: 12,
    players: 30,
    bannedKeys: 32,
    activeWindowMs: 2 * MINUTE,
    // A host's open tables: those not closed and active in the last hostActiveWindowMs.
    hostOpenTables: 3,
    hostActiveWindowMs: 12 * HOUR,
    // A seated account holder may take over as host once the host has gone unseen this long.
    hostTakeoverMs: 10 * MINUTE,
    // Presence: the heartbeat a visible page posts, how recent a beat counts as here, and the
    // fewest milliseconds between two writes of one player's stamp.
    heartbeatMs: 25 * SECOND,
    onlineWindowMs: 60 * SECOND,
    seenThrottleMs: 15 * SECOND,
    realtimeConnectGraceMs: 8 * SECOND,
    realtimeFailWindowMs: 5 * MINUTE,
    emoteCooldownMs: 1200,
    // Requests.
    postBodyBytes: 2048,
    // Credentials.
    tokenTtlMs: 15 * MINUTE,
    passTtlMs: 10 * MINUTE,
    guestCookieMaxAgeMs: 180 * DAY,
    guestReissueAfterMs: 30 * DAY,
    // A guest token stamped further ahead than this is refused (clock skew between instances).
    guestFutureSkewMs: 5 * MINUTE,
    // A room's life, as the engine's clock counts it: closed after this long idle, kept this long
    // after its last write (or its close).
    idleCloseMs: TIMING.IDLE_CLOSE_MS,
    retentionMs: TIMING.ROOM_TTL_MS,
} as const;

// The in-memory token buckets (lib/poker-night/bucket), per server instance and checked before any
// database call: GETs (state, detail) and POSTs (join, action, tick, emote), keyed by the pid a
// valid seat pass names, or by the client's address without one.
export const BUCKETS = {
    get: {rate: 3, burst: 15},
    post: {rate: 5, burst: 20},
} as const;

export type BucketKind = keyof typeof BUCKETS;

// The Mongo counters (lib/rate-limit.takeRateLimit), each a write, so only on low-frequency routes.
export const RATE_LIMITS = {
    create: {limit: 10, windowMs: HOUR},
    joinIp: {limit: 30, windowMs: 10 * MINUTE},
    joinRoom: {limit: 60, windowMs: 10 * MINUTE},
    // Unknown codes on every table route (never a page render): a guess at a code costs one.
    miss: {limit: 20, windowMs: 10 * MINUTE},
    token: {limit: 20, windowMs: 10 * MINUTE},
    look: {limit: 20, windowMs: MINUTE},
} as const;

export type RateLimitName = keyof typeof RATE_LIMITS;

const PREFIX = 'poker-night';

export const pnKey = {
    create: (env: Env, userId: string) => `${PREFIX}:${env}:create:${userId}`,
    joinIp: (env: Env, ip: string) => `${PREFIX}:${env}:join:ip:${ip}`,
    joinRoom: (env: Env, roomId: string) => `${PREFIX}:${env}:join:room:${roomId}`,
    miss: (env: Env, ip: string) => `${PREFIX}:${env}:miss:ip:${ip}`,
    token: (env: Env, pid: string) => `${PREFIX}:${env}:token:${pid}`,
    look: (env: Env, userId: string) => `${PREFIX}:${env}:look:${userId}`,
} as const satisfies Record<RateLimitName, (env: Env, id: string) => string>;

// An in-memory bucket's key: the player once known, else the client's address, else one shared
// key for requests no header names a client for.
export const bucketKey = (env: Env, kind: BucketKind, who: {pid: string} | {ip: string | null}): string =>
    'pid' in who ? `${PREFIX}:${env}:${kind}:pid:${who.pid}` : `${PREFIX}:${env}:${kind}:ip:${who.ip ?? 'unknown'}`;
