// The poker night room store: every read and write of PokerRoom (database/models/poker-room.model.ts).
// Server-only — the poker-night server guard keeps every client file from reaching it — and a plain
// module, never 'use server': the routes call it after lib/poker-night/route-kit has checked who is
// asking. The decisions are pure and tested: what a read means (lib/poker-night/room-doc) and what an
// attempt writes (lib/poker-night/mutation.planMutation); this file is the I/O around them.
//
// mutateRoom is the one way the game moves: read the room, plan, write behind a compare-and-set on
// `seq`, up to TIMING.CAS_ATTEMPTS times with a jittered backoff. The out-of-band fields (seen,
// emotes, rt, lastError) are written beside it, never through it, so a heartbeat never costs a bet
// its race. afterCommit, in the route's after(), sets off what a commit means beyond its answer:
// history, the accounts' results and the realtime publish (lib/poker-night/realtime), whose failure
// stamps the room's rt so every answer says realtimeOk: false for a while. Every query names the env, and every read wants `expiresAt > now`: the TTL monitor runs
// late. Nothing here logs a room, a state or a document — only codes, seqs and messages (the logs
// outlive nothing on Hobby; lastError keeps the last failure on the room itself).

import {Types} from "mongoose";
import {cache} from "react";
import {connectToDatabase} from "@/database/mongoose";
import PokerRoom from "@/database/models/poker-room.model";
import {generateCode} from "@/lib/poker-night/code";
import {TIMING} from "@/lib/poker-night/config";
import type {Env} from "@/lib/poker-night/env";
import type {PokerNightErrorCode} from "@/lib/poker-night/http";
import {LIMITS} from "@/lib/poker-night/limits";
import {migrateState} from "@/lib/poker-night/migrate";
import {backoffMs, planMutation} from "@/lib/poker-night/mutation";
import {PID} from "@/lib/poker-night/input";
import {LOBBY_PROJECTION, lobbyRoomFromDoc, openRoomsFilter, type LobbyDoc, type LobbyRoom} from "@/lib/poker-night/lobby";
import {isDuplicateKey} from "@/lib/poker-night/results";
import {appliedKey, newPid, newRoom, type JoinResult, type NewRoom, type Step} from "@/lib/poker-night/room";
import {
    casUpdate, coreFromDoc, headFromDoc, HEAD_PROJECTION, ms, newRoomDoc, serverRoom, serverRoomFromDoc, unreadableCloseUpdate, unreadableKind, wireOfRoom,
    type Commit, type RoomDocLean, type RoomHead, type RoomRef, type ServerRoom, type Unread,
} from "@/lib/poker-night/room-doc";
import {SECURE_SOURCE} from "@/lib/poker-night/shuffle";
import {writeHands} from "@/lib/poker-night/hands-store";
import {writeResults} from "@/lib/poker-night/results-store";
import {publishWire} from "@/lib/poker-night/realtime";

export type {Commit, RoomHead, RoomRef, ServerRoom, Unread};

// A full read leaves out what no response or step needs: the emote cooldowns and award counts,
// and (outside mutateRoom) the applied ring.
const READ_PROJECTION = {emoteAt: 0, awards: 0, applied: 0} as const;
const MUTATE_PROJECTION = {emoteAt: 0, awards: 0} as const;
const CODE_ATTEMPTS = 5;
// At most one lastError write a minute per room, and at most one realtime failure stamp.
const ERROR_THROTTLE_MS = 60_000;
const REALTIME_FAIL_THROTTLE_MS = 60_000;

type LogFields = {code?: string | null; env: Env; seq?: number | null; actionType?: string; message: string};

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

// The only way this file logs: a label and primitives, never a room, a state or a document.
const logFailure = (label: string, fields: LogFields): void => {
    console.error(`poker night: ${label}`, fields);
};

const sleep = (wait: number) => new Promise<void>((resolve) => setTimeout(resolve, wait));

// ── reads ──

// A full read: the room, or why there is none (room-doc.Unread) — gone, or a stored state this
// deploy cannot read: 'newer' (a newer deploy wrote it; a read route answers reload, as mutateRoom
// does, so a rollout never tells a live table it is closed) or 'broken' (mutateRoom closes it).
export type RoomRead = {ok: true; room: ServerRoom} | {ok: false; why: Unread};

const roomOf = (doc: RoomDocLean | null, readAt: number): RoomRead => {
    if (!doc) return {ok: false, why: 'gone'};
    const state = migrateState(doc.state);
    if (state === null) {
        const why = unreadableKind(doc.state);
        logFailure('a stored state could not be read', {code: doc.code, env: doc.env, seq: doc.seq, message: why});
        return {ok: false, why};
    }
    return {ok: true, room: serverRoomFromDoc(doc, coreFromDoc(doc, state), readAt)};
};

export const getRoomByCode = async (env: Env, code: string): Promise<RoomRead> => {
    await connectToDatabase();
    const readAt = Date.now();
    const doc = await PokerRoom.findOne({env, code, expiresAt: {$gt: new Date(readAt)}}, READ_PROJECTION).lean<RoomDocLean | null>();
    return roomOf(doc, readAt);
};

// The /play page and its metadata read the same room once per render.
export const getRoomByCodeCached = cache(getRoomByCode);

export const getRoomById = async (ref: RoomRef): Promise<RoomRead> => {
    await connectToDatabase();
    const readAt = Date.now();
    const doc = await PokerRoom.findOne({_id: ref.id, env: ref.env, expiresAt: {$gt: new Date(readAt)}}, READ_PROJECTION).lean<RoomDocLean | null>();
    return roomOf(doc, readAt);
};

// The cheap read every table request starts with (room-doc.RoomHead): one projected findOne.
export const readRoomHead = async (env: Env, code: string): Promise<RoomHead | null> => {
    await connectToDatabase();
    const doc = await PokerRoom.findOne({env, code, expiresAt: {$gt: new Date()}}, HEAD_PROJECTION).lean<RoomDocLean | null>();
    return doc ? headFromDoc(doc) : null;
};

// ── a new room ──

export type RoomDraft = Omit<NewRoom, 'id' | 'code' | 'host'> & {host: Omit<NewRoom['host'], 'pid'>};

// A new table with its host seated (room.newRoom), under a fresh code: a code already taken in the
// env fails the unique index and is drawn again, at most CODE_ATTEMPTS times. Throws on a config
// outside the limits — the lobby checks it first.
export const insertRoom = async (draft: RoomDraft): Promise<ServerRoom> => {
    await connectToDatabase();
    for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
        const core = newRoom({...draft, id: new Types.ObjectId().toHexString(), code: generateCode(), host: {...draft.host, pid: newPid()}});
        try {
            await PokerRoom.create(newRoomDoc(core, draft.at));
            return serverRoom({core, seq: 0, emotes: [], emoteSeq: 0, realtimeOk: true, lastActivityAt: draft.at, closedAt: null, readAt: draft.at});
        } catch (error) {
            if (!isDuplicateKey(error)) throw error;
        }
    }
    throw new Error('poker night: no free table code after five draws');
};

// ── the one way the game moves ──

export type MutateOptions = {
    receivedAt: number; // when the request arrived: the clock runs to it before the step
    pid?: string; // the requester (POST action): their own turn's timeout is judged without the slack;
    // with actionId, the applied ring's key, so a repeat is answered, not applied
    actionId?: string;
    label?: string; // the action's type, for the log
};

// ok: the room after the request, written (changed) or as it was (a repeat, or a step that changed
// nothing). commit: what was written, for afterCommit — also on a refusal whose clock moved, and on
// an idle room's close.
export type MutateResult =
    | {ok: true; room: ServerRoom; seq: number; changed: boolean; duplicate: boolean; join: JoinResult | null; commit: Commit | null}
    | {ok: false; code: PokerNightErrorCode; commit: Commit | null};

const refused = (code: PokerNightErrorCode): MutateResult => ({ok: false, code, commit: null});

// Writes lastError out of band, at most once a minute; never throws.
export const recordError = async (ref: RoomRef, kind: string, seq: number | null): Promise<void> => {
    try {
        const now = Date.now();
        await PokerRoom.updateOne(
            {_id: ref.id, env: ref.env, 'lastError.at': {$not: {$gte: new Date(now - ERROR_THROTTLE_MS)}}},
            {$set: {lastError: {at: new Date(now), kind, seq: seq ?? -1}}},
        );
    } catch (error) {
        logFailure('recording an error failed', {env: ref.env, seq, message: messageOf(error)});
    }
};

// A stored state this deploy cannot read. Written by a newer deploy: leave it, and tell the client
// to reload onto the new code. Unreadable: close the room out of band so it stops answering.
const onUnreadable = async (ref: RoomRef, doc: RoomDocLean, now: number): Promise<MutateResult> => {
    const kind = unreadableKind(doc.state);
    logFailure('a stored state could not be read', {code: doc.code, env: ref.env, seq: doc.seq, message: kind});
    if (kind === 'newer') return refused('reload');
    if (doc.status !== 'closed') {
        await PokerRoom.updateOne({_id: ref.id, env: ref.env, seq: doc.seq}, unreadableCloseUpdate(now, doc.seq));
    }
    return refused('closed');
};

// One change to a room: `step` at the moment the request arrived, or the clock alone (step null).
export const mutateRoom = async (ref: RoomRef, step: Step | null, opts: MutateOptions): Promise<MutateResult> => {
    let code: string | null = null;
    let seq: number | null = null;
    try {
        await connectToDatabase();
        const key = opts.pid && opts.actionId ? appliedKey(opts.pid, opts.actionId) : null;
        for (let attempt = 0; attempt < TIMING.CAS_ATTEMPTS; attempt++) {
            if (attempt > 0) await sleep(backoffMs(attempt - 1, Math.random));
            const now = Date.now();
            const doc = await PokerRoom.findOne({_id: ref.id, env: ref.env, expiresAt: {$gt: new Date(now)}}, MUTATE_PROJECTION).lean<RoomDocLean | null>();
            if (!doc) return refused('not_found');
            code = doc.code;
            seq = doc.seq;
            const state = migrateState(doc.state);
            if (state === null) return await onUnreadable(ref, doc, now);
            const core = coreFromDoc(doc, state);
            const plan = planMutation({
                core, step, applied: doc.applied ?? [], key, by: opts.pid ?? null, lastActivityAt: ms(doc.lastActivityAt), receivedAt: opts.receivedAt, now,
                source: SECURE_SOURCE,
            });
            if (plan.kind === 'refused') return refused(plan.code);
            if (plan.kind === 'duplicate' || plan.kind === 'unchanged') {
                const room = serverRoomFromDoc(doc, core, now);
                return {ok: true, room, seq: doc.seq, changed: false, duplicate: plan.kind === 'duplicate', join: plan.kind === 'unchanged' ? plan.join : null, commit: null};
            }
            const closedAt = doc.closedAt ? ms(doc.closedAt) : null;
            const write = casUpdate(plan.core, {applied: plan.applied, now, closedAt, pruned: plan.join?.pruned ?? []});
            const written = await PokerRoom.updateOne({_id: ref.id, env: ref.env, seq: doc.seq}, write.update);
            if (written.matchedCount !== 1) continue;
            const base = serverRoomFromDoc(doc, plan.core, now);
            const room = serverRoom({...base, seq: doc.seq + 1, lastActivityAt: now, closedAt: write.closedAt});
            const commit: Commit = {ref, room, prevState: state, hands: plan.hands, ledgerDirty: plan.ledgerDirty};
            if (plan.refusal !== null) return {ok: false, code: plan.refusal, commit};
            return {ok: true, room, seq: room.seq, changed: true, duplicate: false, join: plan.join, commit};
        }
        return refused('busy');
    } catch (error) {
        logFailure('a table write failed', {code, env: ref.env, seq, actionType: opts.label, message: messageOf(error)});
        await recordError(ref, 'mutate', seq);
        return refused('unavailable');
    }
};

// A realtime publish failed: stamped on the room out of band (rt.failAt, rt.fails), at most once a
// minute, so every answer for the next LIMITS.realtimeFailWindowMs says realtimeOk: false and the
// browsers poll beside the channel (lib/poker-night/feed's watchdog). Never throws.
export const markRealtimeFailure = async (ref: RoomRef, now: number): Promise<void> => {
    try {
        await connectToDatabase();
        await PokerRoom.updateOne(
            {_id: ref.id, env: ref.env, 'rt.failAt': {$not: {$gte: new Date(now - REALTIME_FAIL_THROTTLE_MS)}}},
            {$set: {'rt.failAt': new Date(now)}, $inc: {'rt.fails': 1}},
        );
    } catch (error) {
        logFailure('recording a realtime failure failed', {env: ref.env, message: messageOf(error)});
    }
};

// The commit's public wire view on the room's channel; a no-op without realtime. A failure is
// logged with the code and the seq, and stamped on the room.
const publishCommit = async (commit: Commit): Promise<void> => {
    const {ref, room} = commit;
    const sent = await publishWire(ref.env, ref.id, wireOfRoom(room));
    if (sent.ok) return;
    logFailure('a realtime publish failed', {code: room.core.code, env: ref.env, seq: room.seq, message: sent.message});
    await markRealtimeFailure(ref, Date.now());
};

// Everything a commit sets off once the response is on its way, run in the route's after(): the
// hands it completed into history, the accounts' results when a figure they carry moved, and the
// commit's wire view on the realtime channel. Each part catches and logs its own failure; the next
// commit heals it (results carry totals, hands are upserted whole, and every message carries the
// whole public table, applied by seq).
export const afterCommit = async (result: MutateResult): Promise<void> => {
    const commit = result.commit;
    if (!commit) return;
    await Promise.all([
        commit.hands.length > 0 ? writeHands(commit) : undefined,
        commit.ledgerDirty ? writeResults(commit) : undefined,
        publishCommit(commit),
    ]);
};

// ── out of band ──

// A presence beat (POST tick): written at most once per LIMITS.seenThrottleMs per player, or when
// the page's visibility changed — the filter does the throttling, so a beat in between costs a
// read and no write.
export const stampSeen = async (ref: RoomRef, pid: string, hidden: boolean, now: number): Promise<void> => {
    if (!PID.test(pid)) return;
    await connectToDatabase();
    await PokerRoom.updateOne(
        {
            _id: ref.id, env: ref.env,
            $or: [{[`seen.${pid}.at`]: {$not: {$gte: now - LIMITS.seenThrottleMs}}}, {[`seen.${pid}.hidden`]: {$ne: hidden}}],
        },
        {$set: {[`seen.${pid}`]: {at: now, hidden}}},
    );
};

// ── the lobby (P3) ──

// How many tables `userId` hosts that still hold a place under LIMITS.hostOpenTables: not closed
// and written within LIMITS.hostActiveWindowMs (lobby.openRoomsFilter), so a table left to go idle
// stops counting without anyone closing it. Two creates at once may both pass: one table over.
export const countActiveHosted = async (env: Env, userId: string, now: number): Promise<number> => {
    await connectToDatabase();
    return PokerRoom.countDocuments({...openRoomsFilter(env, now), hostUserId: userId});
};

// The open tables the given accounts host, newest first, as the lobby lists them (lobby.LobbyRoom):
// the reader's own, or (friendsOnly) the ones friends chose to show. Projected: never the state,
// a guest or a card (lobby.LOBBY_PROJECTION). lobby.shapeLobby drops the idle ones.
export const listOpenRooms = async (
    env: Env, hostUserIds: readonly string[], opts: {friendsOnly: boolean; limit: number; now: number},
): Promise<LobbyRoom[]> => {
    if (hostUserIds.length === 0) return [];
    await connectToDatabase();
    const filter = {
        ...openRoomsFilter(env, opts.now),
        hostUserId: {$in: [...hostUserIds]},
        ...(opts.friendsOnly ? {showToFriends: true} : {}),
    };
    const docs = await PokerRoom.find(filter, LOBBY_PROJECTION).sort({lastActivityAt: -1}).limit(opts.limit).lean<LobbyDoc[]>();
    return docs.map(lobbyRoomFromDoc);
};
