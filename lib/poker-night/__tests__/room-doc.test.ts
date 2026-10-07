// The room document both ways: a new room's document read back is the room it was made from; a
// lean read's Dates come back as milliseconds and its missing fields as their empty values; a
// commit writes exactly the fields mutateRoom owns — never seen, the emotes or the other
// out-of-band fields — and drops only the presence stamps of rows a join pruned; the head carries
// who may ask and nothing else; a state from a newer deploy is told apart from a broken one; the
// player's view of a read room leaks nothing, nor does the wire view the channel carries; and a
// server room is not something a route can send.

import {describe, expect, expectTypeOf, it} from 'vitest';
import {STATE_VERSION, TIMING} from '@/lib/poker-night/config';
import type {JoinInput} from '@/lib/poker-night/input';
import {LIMITS} from '@/lib/poker-night/limits';
import {clockStep, joinStep, newRoom, tableStep, wireOf, type KnownIdentity, type RoomCore, type StepResult} from '@/lib/poker-night/room';
import {
    casUpdate, commitFields, coreFromDoc, emotesSince, HEAD_PROJECTION, headFromDoc, ms, newRoomDoc, playerViewOf, publicSeq, realtimeOkAt, seenFrom, serverRoomFromDoc,
    unchangedOf, unchangedOfRoom, unreadableCloseUpdate, unreadableKind, unreadRefusal, wireOfRoom, type RoomDocLean, type ServerRoom,
} from '@/lib/poker-night/room-doc';
import {FULL_DECK} from '@/lib/poker-night/deck';
import type {DeckSource} from '@/lib/poker-night/types';
import type {EmoteView, ResponseBody} from '@/lib/poker-night/view-types';
import {T0} from './fixtures';

const AV = 'v1:fox:tangerine:ring:crown';
const ROOM_ID = '6650a1b2c3d4e5f601234567';
const HOST = 'HostPid0001';
const ANA = 'AnaPid00001';
const SOURCE: DeckSource = {deck: () => [...FULL_DECK], draw: () => 0};
const guest = (id: string): KnownIdentity => ({kind: 'guest', guestId: id.padEnd(22, 'x'), issuedAt: T0});
const joinInput = (input: Partial<JoinInput> = {}): JoinInput => ({name: '', avatar: AV, as: 'player', ...input});
const okStep = (r: StepResult): Extract<StepResult, {ok: true}> => {
    if (!r.ok) throw new Error(`refused: ${r.code}`);
    return r;
};

const room = (): RoomCore => {
    const core = newRoom({id: ROOM_ID, code: 'K7QXM4', env: 'preview', host: {userId: 'u-host', pid: HOST, name: 'Hana', avatar: AV}, at: T0});
    return okStep(joinStep(joinInput({name: 'Ana'}), guest('ana'), ANA)(core, T0 + 5)).core;
};

// What a lean read of a written document gives back: the driver's Dates, the ObjectId as an object.
const asRead = (doc: ReturnType<typeof newRoomDoc>, extra: Partial<RoomDocLean> = {}): RoomDocLean => ({
    ...structuredClone(doc), _id: {toString: () => doc._id}, lastActivityAt: doc.lastActivityAt, ...extra,
} as RoomDocLean);

const OUT_OF_BAND = ['seen', 'emotes', 'emoteSeq', 'emoteAt', 'awards', 'rt', 'lastError', 'seq', 'hiddenCommits'];

describe('reading a room back', () => {
    it('gives back the room a new document was made from', () => {
        const core = room();
        const doc = newRoomDoc(core, T0 + 5);
        expect(doc).toMatchObject({_id: ROOM_ID, env: 'preview', code: 'K7QXM4', seq: 0, seen: {}, emotes: [], emoteSeq: 0, applied: []});
        expect(coreFromDoc(asRead(doc), core.state)).toEqual(core);
    });

    it('reads Dates as milliseconds and missing fields as their empty values', () => {
        expect(ms(new Date(T0))).toBe(T0);
        expect(ms(T0)).toBe(T0);
        expect(ms(new Date(T0).toISOString())).toBe(T0);
        expect(ms('not a date')).toBe(0);
        expect(ms(undefined)).toBe(0);
        const core = room();
        const bare = asRead(newRoomDoc(core, T0), {bannedKeys: undefined, peopleV: undefined, seen: null, players: [{pid: ANA, name: 'Ana', avatar: AV, joinedAt: new Date(T0)}]});
        const read = coreFromDoc(bare, core.state);
        expect(read.bannedKeys).toEqual([]);
        expect(read.peopleV).toBe(1);
        expect(read.seen).toEqual({});
        expect(read.players).toEqual([{pid: ANA, userId: null, guestId: null, name: 'Ana', avatar: AV, joinedAt: T0, banned: false}]);
    });

    it('keeps only presence stamps with a time', () => {
        expect(seenFrom({[ANA]: {at: T0, hidden: true}, [HOST]: {at: 'soon'}, Other00001: {at: T0}})).toEqual({
            [ANA]: {at: T0, hidden: true}, Other00001: {at: T0, hidden: false},
        });
        expect(seenFrom(null)).toEqual({});
    });

    it('tells a state from a newer deploy from one that cannot be read', () => {
        expect(unreadableKind({v: STATE_VERSION + 1})).toBe('newer');
        expect(unreadableKind({v: STATE_VERSION, seats: 'nonsense'})).toBe('broken');
        expect(unreadableKind(null)).toBe('broken');
        expect(unreadableKind('v2')).toBe('broken');
    });

    it('answers a read of a state a newer deploy wrote with reload, never closed, and anything else unreadable as closed', () => {
        expect(unreadRefusal(unreadableKind({v: STATE_VERSION + 1}))).toBe('reload');
        expect(unreadRefusal(unreadableKind(null))).toBe('closed');
        expect(unreadRefusal('gone')).toBe('closed');
    });
});

describe('a commit', () => {
    it('writes the state, the people and the mirrors, and nothing out of band', () => {
        const core = okStep(tableStep({type: 'host', by: HOST, op: {op: 'start'}})(room(), T0)).core;
        const fields = commitFields(core, {applied: ['k1'], now: T0 + 10, closedAt: null});
        expect(fields.state).toBe(core.state);
        expect(fields).toMatchObject({
            hostUserId: 'u-host', status: 'playing', name: '', seatCount: 8, seatsTaken: 2, showToFriends: false, peopleV: core.peopleV,
            applied: ['k1'], bannedKeys: [], closedAt: null,
        });
        expect(fields.nextDueAt).toEqual(new Date(core.state.nextHandAt!));
        expect(fields.lastActivityAt).toEqual(new Date(T0 + 10));
        expect(fields.expiresAt).toEqual(new Date(T0 + 10 + TIMING.ROOM_TTL_MS));
        expect(fields.players.map((p) => p.joinedAt)).toEqual([new Date(T0), new Date(T0 + 5)]);
        for (const key of OUT_OF_BAND) expect(fields, key).not.toHaveProperty(key);
    });

    it('moves seq on, and drops the presence stamps of pruned rows only', () => {
        const core = room();
        const plain = casUpdate(core, {applied: [], now: T0, closedAt: null, pruned: [], visible: true});
        expect(plain.update.$inc).toEqual({seq: 1});
        expect(plain.update).not.toHaveProperty('$unset');
        const pruned = casUpdate(core, {applied: [], now: T0, closedAt: null, pruned: ['Gone0000001', 'Gone0000002'], visible: true});
        expect(pruned.update.$unset).toEqual({'seen.Gone0000001': '', 'seen.Gone0000002': ''});
        expect(Object.keys(pruned.update.$set)).not.toContain('seen');
    });

    it('moves hiddenCommits with seq for a write only its author can see, so the public seq stays put', () => {
        const core = room();
        const quiet = casUpdate(core, {applied: [], now: T0, closedAt: null, pruned: [], visible: false});
        expect(quiet.update.$inc).toEqual({seq: 1, hiddenCommits: 1});
        expect(Object.keys(quiet.update.$set)).not.toContain('hiddenCommits');
        expect(newRoomDoc(core, T0)).toMatchObject({seq: 0, hiddenCommits: 0});
        // seq 9 after two such writes: every answer says 7, the head and a full read alike.
        const doc = asRead(newRoomDoc(core, T0), {seq: 9, hiddenCommits: 2});
        expect(publicSeq(doc)).toBe(7);
        expect(headFromDoc(doc).seq).toBe(7);
        expect(serverRoomFromDoc(doc, core, T0).seq).toBe(7);
        expect(wireOfRoom(serverRoomFromDoc(doc, core, T0)).seq).toBe(7);
        expect(HEAD_PROJECTION).toHaveProperty('hiddenCommits', 1);
        // A document from before hiddenCommits: its seq is its public seq.
        expect(publicSeq({seq: 4})).toBe(4);
        // Closing an unreadable room is seen by everyone: seq alone.
        expect(unreadableCloseUpdate(T0, 9).$inc).toEqual({seq: 1});
    });

    it('stamps a close once and keeps the room a week past it', () => {
        const core = room();
        const closed = {...core, state: {...core.state, status: 'closed' as const}};
        const first = casUpdate(closed, {applied: [], now: T0 + 100, closedAt: null, pruned: [], visible: true});
        expect(first.closedAt).toBe(T0 + 100);
        expect(first.update.$set.expiresAt).toEqual(new Date(T0 + 100 + TIMING.ROOM_TTL_MS));
        const later = casUpdate(closed, {applied: [], now: T0 + 999, closedAt: T0 + 100, pruned: [], visible: true});
        expect(later.closedAt).toBe(T0 + 100);
        expect(later.update.$set.nextDueAt).toBeNull();
        expect(unreadableCloseUpdate(T0, 7)).toEqual({
            $set: {status: 'closed', nextDueAt: null, closedAt: new Date(T0), expiresAt: new Date(T0 + TIMING.ROOM_TTL_MS), lastError: {at: new Date(T0), kind: 'upgrade', seq: 7}},
            $inc: {seq: 1},
        });
    });
});

describe('the head', () => {
    it('carries the version, the clock and who may ask', () => {
        const core = room();
        const doc = asRead(newRoomDoc(core, T0), {seq: 4, emoteSeq: 2, nextDueAt: new Date(T0 + 3000), bannedKeys: ['g:x']});
        expect(headFromDoc(doc)).toEqual({
            id: ROOM_ID, seq: 4, emoteSeq: 2, nextDueAt: T0 + 3000, status: 'open', bannedKeys: ['g:x'], realtimeFailAt: null,
            players: [
                {pid: HOST, userId: 'u-host', guestId: null, banned: false},
                {pid: ANA, userId: null, guestId: 'ana'.padEnd(22, 'x'), banned: false},
            ],
        });
        // The last failed publish too, so an Unchanged answered from the head alone says realtimeOk.
        expect(headFromDoc(asRead(newRoomDoc(core, T0), {seq: 4, rt: {failAt: new Date(T0 - 1000), fails: 1}})).realtimeFailAt).toBe(T0 - 1000);
        expect(HEAD_PROJECTION).toHaveProperty(['rt.failAt'], 1);
    });
});

describe('a room the server read', () => {
    const emote = (seq: number): EmoteView => ({kind: 'react', item: 'clap', id: `e${seq}`, seq, from: ANA, at: T0});

    it('reads realtime as healthy unless a publish failed within the window', () => {
        expect(realtimeOkAt(null, T0)).toBe(true);
        expect(realtimeOkAt(T0 - LIMITS.realtimeFailWindowMs, T0)).toBe(true);
        expect(realtimeOkAt(T0 - LIMITS.realtimeFailWindowMs + 1, T0)).toBe(false);
        const core = room();
        const doc = asRead(newRoomDoc(core, T0), {seq: 9, rt: {failAt: new Date(T0 - 1000), fails: 2}, emotes: [emote(1), {junk: true}, emote(2)], emoteSeq: 2});
        const read = serverRoomFromDoc(doc, core, T0);
        expect(read).toMatchObject({seq: 9, realtimeOk: false, emoteSeq: 2, readAt: T0, lastActivityAt: T0, closedAt: null});
        expect(read.emotes).toEqual([emote(1), emote(2)]);
    });

    it('answers a poll with nothing new from the head or the room, emotes after the client\'s only', () => {
        expect(emotesSince([emote(1), emote(2), emote(3)], 1)).toEqual([emote(2), emote(3)]);
        expect(emotesSince([emote(1)], null)).toEqual([emote(1)]);
        expect(unchangedOf({seq: 3, emoteSeq: 1, nextDueAt: null, realtimeFailAt: null}, T0, [], 'pass')).toEqual({
            unchanged: true, seq: 3, emoteSeq: 1, serverNow: T0, nextDueAt: null, emotes: [], pass: 'pass', realtimeOk: true,
        });
        // Like a view, an Unchanged says whether a publish failed within the window (rt moves no seq).
        expect(unchangedOf({seq: 3, emoteSeq: 1, nextDueAt: null, realtimeFailAt: T0 - 1000}, T0, [], null).realtimeOk).toBe(false);
        expect(unchangedOf({seq: 3, emoteSeq: 1, nextDueAt: null, realtimeFailAt: T0 - LIMITS.realtimeFailWindowMs}, T0, [], null).realtimeOk).toBe(true);
        const core = okStep(tableStep({type: 'host', by: HOST, op: {op: 'start'}})(room(), T0)).core;
        const read = serverRoomFromDoc(asRead(newRoomDoc(core, T0), {seq: 5, emotes: [emote(1), emote(2)], emoteSeq: 2}), core, T0 + 50);
        expect(unchangedOfRoom(read, 1, null)).toEqual({
            unchanged: true, seq: 5, emoteSeq: 2, serverNow: T0 + 50, nextDueAt: core.state.nextHandAt, emotes: [emote(2)], pass: null, realtimeOk: true,
        });
        const failing = serverRoomFromDoc(asRead(newRoomDoc(core, T0), {seq: 5, rt: {failAt: new Date(T0), fails: 1}}), core, T0 + 50);
        expect(unchangedOfRoom(failing, 1, null).realtimeOk).toBe(false);
    });

    it('gives a player their own view, with nothing private in it', () => {
        let core = okStep(tableStep({type: 'host', by: HOST, op: {op: 'start'}})(room(), T0)).core;
        core = okStep(clockStep(SOURCE)(core, core.state.nextHandAt!)).core;
        const read = serverRoomFromDoc(asRead(newRoomDoc(core, T0), {seq: 12, bannedKeys: ['g:someone'], applied: ['k']}), core, T0 + 9);
        const view = playerViewOf(read, ANA, {pass: 'the-pass', duplicate: true});
        expect(view).toMatchObject({seq: 12, serverNow: T0 + 9, pass: 'the-pass', duplicate: true, me: {pid: ANA, role: 'seated', hasAccount: false}});
        const json = JSON.stringify(view);
        for (const word of ['deck', 'userId', 'guestId', 'bannedKeys', 'applied', 'u-host', 'ana'.padEnd(22, 'x'), ROOM_ID]) expect(json).not.toContain(word);
        const hostHole = core.state.hand!.seats.find((p) => p.pid === HOST)!.hole;
        expect(view.seats.find((s) => s?.pid === HOST)!.cards).toBe('hidden');
        expect(view.me.hole).not.toEqual(hostHole);
    });

    it('publishes the public table at the read\'s seq and time: no people, no viewer, no hole', () => {
        let core = okStep(tableStep({type: 'host', by: HOST, op: {op: 'start'}})(room(), T0)).core;
        core = okStep(clockStep(SOURCE)(core, core.state.nextHandAt!)).core;
        const read = serverRoomFromDoc(asRead(newRoomDoc(core, T0), {seq: 7, rt: {failAt: new Date(T0), fails: 1}}), core, T0 + 30);
        const wire = wireOfRoom(read);
        expect(wire).toEqual(wireOf(core, 7, T0 + 30, {realtimeOk: false}));
        expect(wire).toMatchObject({seq: 7, serverNow: T0 + 30, realtimeOk: false, code: 'K7QXM4'});
        for (const key of ['people', 'removed', 'me', 'config', 'emotes', 'pass']) expect(wire, key).not.toHaveProperty(key);
        const json = JSON.stringify(wire);
        for (const word of ['deck', 'userId', 'guestId', ROOM_ID]) expect(json).not.toContain(word);
        for (const p of core.state.hand!.seats) expect(json).not.toContain(JSON.stringify(p.hole));
    });

    it('is not something a route can send', () => {
        expectTypeOf<ServerRoom>().not.toExtend<ResponseBody>();
        expectTypeOf<RoomCore>().not.toExtend<ResponseBody>();
    });
});
