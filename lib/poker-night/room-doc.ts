// The poker night room document as the store reads and writes it, and the server-side room it reads
// into. Pure — lib/poker-night/store.ts does the I/O and nothing else — so the mapping both ways is
// unit-tested: times stored as Dates come back as milliseconds, a missing field reads as its empty
// value, and a commit writes exactly the fields mutateRoom owns (never the out-of-band ones: seen,
// emotes, emoteSeq, emoteAt, awards, rt, lastError).

import {nextDueAt} from '@/lib/poker-night/clock';
import {STATE_VERSION} from '@/lib/poker-night/config';
import type {Env} from '@/lib/poker-night/env';
import type {PokerNightErrorCode} from '@/lib/poker-night/http';
import {LIMITS} from '@/lib/poker-night/limits';
import {expiryOf, mirrorsOf, playerViewFor, wireOf, type JoinResult, type PlayerKeys, type RoomCore, type RoomPlayer, type Seen} from '@/lib/poker-night/room';
import type {HandSummary, TableState, TableStatus} from '@/lib/poker-night/types';
import type {EmoteView, PlayerView, Unchanged, WireView} from '@/lib/poker-night/view-types';

// A time as the driver hands it back (a Date) or as a number of milliseconds.
type Time = Date | number | string;

export const ms = (value: Time | null | undefined): number => {
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
        const parsed = Date.parse(value);
        return Number.isNaN(parsed) ? 0 : parsed;
    }
    return 0;
};

const msOrNull = (value: Time | null | undefined): number | null => (value === null || value === undefined ? null : ms(value));

// The fields of a lean PokerRoom read (database/models/poker-room.model.ts), each as loose as the
// driver may hand it back. A projection leaves some out.
export type RoomDocLean = {
    _id: {toString(): string} | string;
    env: Env;
    code: string;
    hostUserId: string;
    status: TableStatus;
    seq: number;
    peopleV?: number;
    nextDueAt?: Time | null;
    state?: unknown;
    players?: {pid: string; userId?: string | null; guestId?: string | null; name?: string; avatar?: string; joinedAt?: Time; banned?: boolean}[];
    bannedKeys?: string[] | null;
    applied?: string[] | null;
    seen?: Record<string, {at?: unknown; hidden?: unknown}> | null;
    emotes?: unknown[] | null;
    emoteSeq?: number;
    rt?: {failAt?: Time; fails?: number} | null;
    lastActivityAt?: Time;
    closedAt?: Time | null;
    expiresAt?: Time;
};

// Which room, in which env: every store call names both.
export type RoomRef = {env: Env; id: string};

export const refOf = (doc: Pick<RoomDocLean, '_id' | 'env'>): RoomRef => ({env: doc.env, id: String(doc._id)});

// The presence beats as stored (seen.<pid> = {at, hidden}), kept only where they have that shape.
export const seenFrom = (raw: RoomDocLean['seen']): Record<string, Seen> => {
    const out: Record<string, Seen> = {};
    if (!raw || typeof raw !== 'object') return out;
    for (const [pid, beat] of Object.entries(raw)) {
        if (beat && typeof beat.at === 'number' && Number.isFinite(beat.at)) out[pid] = {at: beat.at, hidden: beat.hidden === true};
    }
    return out;
};

const playerFrom = (p: NonNullable<RoomDocLean['players']>[number]): RoomPlayer => ({
    pid: p.pid,
    userId: p.userId ?? null,
    guestId: p.guestId ?? null,
    name: p.name ?? '',
    avatar: p.avatar ?? '',
    joinedAt: ms(p.joinedAt),
    banned: p.banned === true,
});

// The core the room's steps run on, from a full read and its migrated state.
export const coreFromDoc = (doc: RoomDocLean, state: TableState): RoomCore => ({
    id: String(doc._id),
    code: doc.code,
    env: doc.env,
    hostUserId: doc.hostUserId,
    state,
    players: (doc.players ?? []).map(playerFrom),
    bannedKeys: [...(doc.bannedKeys ?? [])],
    seen: seenFrom(doc.seen),
    peopleV: doc.peopleV ?? 1,
});

// What a stored state that migrateState refused is: one written by a newer deploy (this instance
// must not touch it: the client reloads onto the new code) or one that cannot be read at all (the
// room is closed, out of band).
export const unreadableKind = (raw: unknown): 'newer' | 'broken' => {
    const v = typeof raw === 'object' && raw !== null ? (raw as {v?: unknown}).v : undefined;
    return typeof v === 'number' && v > STATE_VERSION ? 'newer' : 'broken';
};

// Why a full read has no room to answer with: gone since the head was read (expired), or a stored
// state this deploy cannot read (unreadableKind).
export type Unread = 'gone' | 'newer' | 'broken';

// What a read route answers then: reload for a state a newer deploy wrote — the table is live, and
// the client's reload lands on the new code, as POST action's 426 says — and closed otherwise. A
// rollout never tells a table it is closed.
export const unreadRefusal = (why: Unread): PokerNightErrorCode => (why === 'newer' ? 'reload' : 'closed');

// ── the room a server holds ──

declare const SERVER_ONLY: unique symbol;

// A room as the store read it: the core with every private part, its version, and the out-of-band
// parts a response carries. Branded, and not one of the client's types, so lib/poker-night/
// route-kit's json() refuses it at compile time; a response is always one of the projections.
export type ServerRoom = {
    readonly [SERVER_ONLY]: true;
    core: RoomCore;
    seq: number;
    emotes: EmoteView[];
    emoteSeq: number;
    realtimeOk: boolean;
    lastActivityAt: number;
    closedAt: number | null;
    readAt: number; // the time the read (or the commit) saw it: every view's serverNow
};

const isEmote = (e: unknown): e is EmoteView =>
    typeof e === 'object' && e !== null && typeof (e as EmoteView).id === 'string' && typeof (e as EmoteView).seq === 'number';

// Realtime is healthy unless a publish failed within the window (P4 records failures).
export const realtimeOkAt = (failAt: number | null, now: number): boolean => failAt === null || failAt <= now - LIMITS.realtimeFailWindowMs;

export const serverRoom = (fields: Omit<ServerRoom, typeof SERVER_ONLY>): ServerRoom => fields as ServerRoom;

// The room a full read gives: the core plus the out-of-band parts, as of `readAt`.
export const serverRoomFromDoc = (doc: RoomDocLean, core: RoomCore, readAt: number): ServerRoom => serverRoom({
    core,
    seq: doc.seq,
    emotes: (doc.emotes ?? []).filter(isEmote),
    emoteSeq: doc.emoteSeq ?? 0,
    realtimeOk: realtimeOkAt(msOrNull(doc.rt?.failAt), readAt),
    lastActivityAt: ms(doc.lastActivityAt),
    closedAt: msOrNull(doc.closedAt),
    readAt,
});

// Player `pid`'s own view of a room the store read.
export const playerViewOf = (room: ServerRoom, pid: string, opts: {pass: string | null; duplicate?: boolean}): PlayerView =>
    playerViewFor(room.core, pid, room.seq, room.readAt, {
        realtimeOk: room.realtimeOk, emotes: room.emotes, emoteSeq: room.emoteSeq, pass: opts.pass, duplicate: opts.duplicate,
    });

// The public wire view of a room the store read or committed: what the realtime channel carries
// (store.afterCommit publishes it after every commit; the browser QA's relay builds it the same way).
export const wireOfRoom = (room: ServerRoom): WireView => wireOf(room.core, room.seq, room.readAt, {realtimeOk: room.realtimeOk});

// ── the head: the cheap read every request starts with ──

// What playerRequest and the polling fast path read before anything else: the version, the clock,
// who may ask, and the last failed realtime publish (so an Unchanged says realtimeOk as a view does)
// — one projected findOne, no state.
export type RoomHead = {
    id: string;
    seq: number;
    emoteSeq: number;
    nextDueAt: number | null;
    status: TableStatus;
    players: PlayerKeys[];
    bannedKeys: string[];
    realtimeFailAt: number | null;
};

export const HEAD_PROJECTION = {
    seq: 1, emoteSeq: 1, nextDueAt: 1, status: 1, bannedKeys: 1, 'rt.failAt': 1,
    'players.pid': 1, 'players.userId': 1, 'players.guestId': 1, 'players.banned': 1,
} as const;

export const headFromDoc = (doc: RoomDocLean): RoomHead => ({
    id: String(doc._id),
    seq: doc.seq,
    emoteSeq: doc.emoteSeq ?? 0,
    nextDueAt: msOrNull(doc.nextDueAt),
    status: doc.status,
    players: (doc.players ?? []).map((p) => ({pid: p.pid, userId: p.userId ?? null, guestId: p.guestId ?? null, banned: p.banned === true})),
    bannedKeys: [...(doc.bannedKeys ?? [])],
    realtimeFailAt: msOrNull(doc.rt?.failAt),
});

// The emotes a client has not seen: those after its emoteSeq.
export const emotesSince = (emotes: readonly EmoteView[], esince: number | null): EmoteView[] =>
    emotes.filter((e) => esince === null || e.seq > esince);

const unchangedBody = (
    head: Pick<RoomHead, 'seq' | 'emoteSeq' | 'nextDueAt'>, serverNow: number, emotes: EmoteView[], pass: string | null, realtimeOk: boolean,
): Unchanged => ({unchanged: true, seq: head.seq, emoteSeq: head.emoteSeq, serverNow, nextDueAt: head.nextDueAt, emotes, pass, realtimeOk});

// A poll or a tick when nothing moved, from the head: realtimeOk as a view would say it then.
export const unchangedOf = (
    head: Pick<RoomHead, 'seq' | 'emoteSeq' | 'nextDueAt' | 'realtimeFailAt'>, serverNow: number, emotes: EmoteView[], pass: string | null,
): Unchanged => unchangedBody(head, serverNow, emotes, pass, realtimeOkAt(head.realtimeFailAt, serverNow));

// The same from a full read: the emotes after the client's emoteSeq, the room's own clock.
export const unchangedOfRoom = (room: ServerRoom, esince: number | null, pass: string | null): Unchanged =>
    unchangedBody({seq: room.seq, emoteSeq: room.emoteSeq, nextDueAt: nextDueAt(room.core.state)}, room.readAt, emotesSince(room.emotes, esince), pass, room.realtimeOk);

// ── writing ──

const playerDoc = (p: RoomPlayer) => ({
    pid: p.pid, userId: p.userId, guestId: p.guestId, name: p.name, avatar: p.avatar, joinedAt: new Date(p.joinedAt), banned: p.banned,
});

// Every field a commit writes, from the core and the bookkeeping around it: the state, the people,
// the mirrors the lobby and the clock read, the applied ring, the activity stamp and the expiry.
export const commitFields = (core: RoomCore, {applied, now, closedAt}: {applied: readonly string[]; now: number; closedAt: number | null}) => {
    const mirrors = mirrorsOf(core);
    const expiry = expiryOf(core.state.status, now, closedAt);
    return {
        state: core.state,
        players: core.players.map(playerDoc),
        bannedKeys: [...core.bannedKeys],
        peopleV: core.peopleV,
        hostUserId: mirrors.hostUserId,
        status: mirrors.status,
        name: mirrors.name,
        seatCount: mirrors.seatCount,
        seatsTaken: mirrors.seatsTaken,
        showToFriends: mirrors.showToFriends,
        nextDueAt: mirrors.nextDueAt === null ? null : new Date(mirrors.nextDueAt),
        applied: [...applied],
        lastActivityAt: new Date(now),
        expiresAt: new Date(expiry.expiresAt),
        closedAt: expiry.closedAt === null ? null : new Date(expiry.closedAt),
    };
};

// A commit's compare-and-set update: the fields above, seq moved on, and the presence stamps of
// watcher rows a join pruned dropped (seen is out of band, so only those paths are touched).
export const casUpdate = (core: RoomCore, opts: {applied: readonly string[]; now: number; closedAt: number | null; pruned: readonly string[]}) => {
    const $set = commitFields(core, opts);
    const unset = opts.pruned.map((pid) => [`seen.${pid}`, ''] as const);
    return {
        update: {$set, $inc: {seq: 1}, ...(unset.length > 0 ? {$unset: Object.fromEntries(unset)} : {})},
        closedAt: $set.closedAt === null ? null : $set.closedAt.getTime(),
    };
};

// A new room's document, seq 0.
export const newRoomDoc = (core: RoomCore, now: number) => ({
    _id: core.id,
    env: core.env,
    code: core.code,
    ...commitFields(core, {applied: [], now, closedAt: null}),
    seq: 0,
    seen: {},
    emotes: [],
    emoteSeq: 0,
});

// Closing a room whose state cannot be read, out of band: the summary then reads PokerResult.
export const unreadableCloseUpdate = (now: number, seq: number) => ({
    $set: {
        status: 'closed' as const,
        nextDueAt: null,
        closedAt: new Date(now),
        expiresAt: new Date(expiryOf('closed', now, now).expiresAt),
        lastError: {at: new Date(now), kind: 'upgrade', seq},
    },
    $inc: {seq: 1},
});

// What a commit sets off once the response is on its way (store.afterCommit): the hands it
// completed or showed cards in, and whether a figure a result row carries moved.
export type Commit = {
    ref: RoomRef;
    room: ServerRoom; // as committed: core, seq and readAt (the commit's time)
    prevState: TableState;
    hands: HandSummary[];
    ledgerDirty: boolean;
};

export type {JoinResult};
