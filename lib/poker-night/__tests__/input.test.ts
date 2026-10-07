// What a request may say: strict schemas that refuse an unknown key anywhere, ids of the right
// shape, whole chip counts within bounds and seats within the table; the engine action each parsed
// request becomes (a table name cleaned on the way); and the query strings of the two GETs.

import {describe, expect, it} from 'vitest';
import {
    ACTION_ID, ActionSchema, EmoteSchema, isRoomAction, JoinSchema, parseDetailQuery, parseSeq, parseStateQuery, PID, TickSchema, toTableAction,
    type ActionInput, type TableActionInput,
} from '@/lib/poker-night/input';

const ID = 'a1B2c3D4e5F6g7H8';
const PLAYER = 'Pq3x9Zk2L01';
const AVATAR = 'v1:fox:tangerine:ring:crown';

const ok = (schema: {safeParse(v: unknown): {success: boolean}}, value: unknown) => expect(schema.safeParse(value).success, JSON.stringify(value)).toBe(true);
const no = (schema: {safeParse(v: unknown): {success: boolean}}, value: unknown) => expect(schema.safeParse(value).success, JSON.stringify(value)).toBe(false);

describe('the ids', () => {
    it('take a UUID or 16 to 36 base64url characters as an action id', () => {
        expect(ACTION_ID.test(crypto.randomUUID())).toBe(true);
        expect(ACTION_ID.test(ID)).toBe(true);
        for (const bad of ['short', 'x'.repeat(37), 'has space in it!!', 'a.b.c.d.e.f.g.h.i']) expect(ACTION_ID.test(bad), bad).toBe(false);
    });

    it('take 11 base64url characters as a pid', () => {
        expect(PID.test(PLAYER)).toBe(true);
        for (const bad of ['Pq3x9Zk2L0', 'Pq3x9Zk2L012', 'Pq3x9Zk2L0$', '']) expect(PID.test(bad), bad).toBe(false);
    });
});

describe('JoinSchema', () => {
    it('takes a join id, a name, an avatar, a role and optionally a seat and a buy-in', () => {
        ok(JoinSchema, {joinId: ID, name: 'Ana', avatar: AVATAR, as: 'player'});
        ok(JoinSchema, {joinId: ID, name: '', avatar: AVATAR, as: 'watcher'});
        ok(JoinSchema, {joinId: ID, name: 'Ana', avatar: AVATAR, as: 'player', seat: 8, buyIn: 2000});
    });

    it('needs a join id shaped like an action id', () => {
        no(JoinSchema, {name: 'Ana', avatar: AVATAR, as: 'player'});
        no(JoinSchema, {joinId: 'short', name: 'Ana', avatar: AVATAR, as: 'player'});
        no(JoinSchema, {joinId: `${ID}$`, name: 'Ana', avatar: AVATAR, as: 'player'});
    });

    it('refuses extra keys, a bad avatar, a long name, a seat past the ninth and chips that are not whole', () => {
        no(JoinSchema, {joinId: ID, name: 'Ana', avatar: AVATAR, as: 'player', userId: 'x'});
        no(JoinSchema, {joinId: ID, name: 'Ana', avatar: 'v1:wolf:tangerine:ring:crown', as: 'player'});
        no(JoinSchema, {joinId: ID, name: 'x'.repeat(65), avatar: AVATAR, as: 'player'});
        no(JoinSchema, {joinId: ID, name: 'Ana', avatar: AVATAR, as: 'host'});
        no(JoinSchema, {joinId: ID, name: 'Ana', avatar: AVATAR, as: 'player', seat: 9});
        no(JoinSchema, {joinId: ID, name: 'Ana', avatar: AVATAR, as: 'player', seat: -1});
        no(JoinSchema, {joinId: ID, name: 'Ana', avatar: AVATAR, as: 'player', buyIn: 20.5});
        no(JoinSchema, {joinId: ID, name: 'Ana', avatar: AVATAR, as: 'player', buyIn: 0});
        no(JoinSchema, {joinId: ID, name: 'Ana', avatar: AVATAR, as: 'player', buyIn: 10_000_001});
        no(JoinSchema, {joinId: ID, avatar: AVATAR, as: 'player'});
    });
});

describe('ActionSchema', () => {
    const valid: ActionInput[] = [
        {actionId: ID, type: 'act', turn: 3, move: {kind: 'fold'}},
        {actionId: ID, type: 'act', turn: 3, move: {kind: 'raise', to: 340}},
        {actionId: ID, type: 'pre', pre: {kind: 'call', amount: 40}},
        {actionId: ID, type: 'pre', pre: null},
        {actionId: ID, type: 'sit', seat: 2, buyIn: 2000},
        {actionId: ID, type: 'leave'},
        {actionId: ID, type: 'sit-in'},
        {actionId: ID, type: 'show'},
        {actionId: ID, type: 'claim-host'},
        {actionId: ID, type: 'buy', amount: 500},
        {actionId: ID, type: 'host', op: {op: 'start'}},
        {actionId: ID, type: 'host', op: {op: 'config', patch: {smallBlind: 25, bigBlind: 50, maxRebuys: null}}},
        {actionId: ID, type: 'host', op: {op: 'settings', patch: {locked: true, name: 'Friday'}}},
        {actionId: ID, type: 'host', op: {op: 'kick', pid: PLAYER}},
        {actionId: ID, type: 'profile', name: 'Ana'},
        {actionId: ID, type: 'profile', avatar: AVATAR},
        {actionId: ID, type: 'unban', pid: PLAYER},
        {actionId: ID, type: 'hand-over', pid: PLAYER},
    ];

    it('takes every action the table offers', () => {
        for (const action of valid) ok(ActionSchema, action);
    });

    it('refuses an unknown key at any depth', () => {
        no(ActionSchema, {actionId: ID, type: 'leave', by: PLAYER});
        no(ActionSchema, {actionId: ID, type: 'act', turn: 3, move: {kind: 'fold', to: 1}});
        no(ActionSchema, {actionId: ID, type: 'host', op: {op: 'start', now: true}});
        no(ActionSchema, {actionId: ID, type: 'host', op: {op: 'config', patch: {seats: 9}}});
        no(ActionSchema, {actionId: ID, type: 'host', op: {op: 'config', patch: {deck: [1, 2]}}});
        no(ActionSchema, {actionId: ID, type: 'host', op: {op: 'settings', patch: {colour: 'red'}}});
        no(ActionSchema, {actionId: ID, type: 'pre', pre: {kind: 'call', amount: 40, atBet: 0}});
    });

    it('refuses the clock\'s own actions and anything without a good id', () => {
        no(ActionSchema, {actionId: ID, type: 'timeout', turn: 3});
        no(ActionSchema, {actionId: ID, type: 'start-hand', deck: [], draw: 0});
        no(ActionSchema, {actionId: ID, type: 'deal-street'});
        no(ActionSchema, {type: 'leave'});
        no(ActionSchema, {actionId: 'short', type: 'leave'});
    });

    it('holds chips to whole, safe, positive numbers and seats to the table', () => {
        no(ActionSchema, {actionId: ID, type: 'act', turn: 3, move: {kind: 'raise', to: 0}});
        no(ActionSchema, {actionId: ID, type: 'act', turn: 3, move: {kind: 'raise', to: 40.5}});
        no(ActionSchema, {actionId: ID, type: 'act', turn: 3, move: {kind: 'raise', to: 2 ** 60}});
        no(ActionSchema, {actionId: ID, type: 'act', turn: -1, move: {kind: 'check'}});
        no(ActionSchema, {actionId: ID, type: 'buy', amount: -5});
        no(ActionSchema, {actionId: ID, type: 'buy', amount: '500'});
        no(ActionSchema, {actionId: ID, type: 'sit', seat: 9, buyIn: 2000});
        no(ActionSchema, {actionId: ID, type: 'sit', seat: 1});
        no(ActionSchema, {actionId: ID, type: 'host', op: {op: 'config', patch: {turnSeconds: 5}}});
        no(ActionSchema, {actionId: ID, type: 'host', op: {op: 'kick', pid: 'nope'}});
        no(ActionSchema, {actionId: ID, type: 'profile', avatar: 'v2:fox'});
    });

    it('turns a table request into the engine\'s action by the room\'s own player', () => {
        const parse = (v: unknown) => ActionSchema.parse(v) as TableActionInput;
        expect(toTableAction(parse({actionId: ID, type: 'act', turn: 3, move: {kind: 'raise', to: 340}}), 'p1', 99))
            .toEqual({type: 'act', by: 'p1', turn: 3, move: {kind: 'raise', to: 340}, at: 99});
        expect(toTableAction(parse({actionId: ID, type: 'pre', pre: {kind: 'call', amount: 40}}), 'p1', 99))
            .toEqual({type: 'pre', by: 'p1', pre: {kind: 'call', amount: 40}, at: 99});
        expect(toTableAction(parse({actionId: ID, type: 'sit', seat: 2, buyIn: 2000}), 'p1', 99)).toEqual({type: 'sit', by: 'p1', seat: 2, buyIn: 2000, at: 99});
        expect(toTableAction(parse({actionId: ID, type: 'sit-out'}), 'p1', 99)).toEqual({type: 'sit-out', by: 'p1', at: 99});
        expect(toTableAction(parse({actionId: ID, type: 'host', op: {op: 'kick', pid: PLAYER}}), 'p1', 99))
            .toEqual({type: 'host', by: 'p1', op: {op: 'kick', pid: PLAYER}, at: 99});
        expect(toTableAction(parse({actionId: ID, type: 'host', op: {op: 'settings', patch: {name: `  Fri${String.fromCodePoint(0x202e)}day  night `, felt: 'teal'}}}), 'p1', 99))
            .toEqual({type: 'host', by: 'p1', op: {op: 'settings', patch: {felt: 'teal', name: 'Friday night'}}, at: 99});
        expect(toTableAction(parse({actionId: ID, type: 'host', op: {op: 'settings', patch: {name: '   '}}}), 'p1', 99))
            .toEqual({type: 'host', by: 'p1', op: {op: 'settings', patch: {name: ''}}, at: 99});
    });

    it('tells the room\'s own actions from the engine\'s', () => {
        const room = valid.filter(isRoomAction).map((a) => a.type);
        expect(new Set(room)).toEqual(new Set(['claim-host', 'profile', 'unban', 'hand-over']));
    });
});

describe('the other bodies', () => {
    it('TickSchema takes an optional beat and nothing else', () => {
        ok(TickSchema, {});
        ok(TickSchema, {beat: {hidden: true}});
        no(TickSchema, {beat: {hidden: 'yes'}});
        no(TickSchema, {beat: {hidden: false, at: 1}});
        no(TickSchema, {now: 1});
    });

    it('EmoteSchema takes a reaction, a phrase or a throw at a pid', () => {
        ok(EmoteSchema, {kind: 'react', item: 'laugh'});
        ok(EmoteSchema, {kind: 'say', item: 'good-luck'});
        ok(EmoteSchema, {kind: 'throw', item: 'tomato', to: PLAYER});
        no(EmoteSchema, {kind: 'throw', item: 'tomato'});
        no(EmoteSchema, {kind: 'say', item: 'Free text here'});
        no(EmoteSchema, {kind: 'react', item: 'laugh', to: PLAYER});
        // Each item from its own registry (lib/poker-night/emotes).
        no(EmoteSchema, {kind: 'say', item: 'laugh'});
        no(EmoteSchema, {kind: 'react', item: 'gg'});
        no(EmoteSchema, {kind: 'throw', item: 'snowball', to: PLAYER});
    });
});

describe('the query strings', () => {
    it('read a version as a whole number, else null', () => {
        expect(parseSeq('0')).toBe(0);
        expect(parseSeq('3100')).toBe(3100);
        for (const raw of [null, '', 'abc', '-1', '1.5', '01', '1e3', '9'.repeat(16)]) expect(parseSeq(raw), String(raw)).toBeNull();
        expect(parseStateQuery(new URLSearchParams('since=12&esince=3'))).toEqual({since: 12, esince: 3});
        expect(parseStateQuery(new URLSearchParams(''))).toEqual({since: null, esince: null});
    });

    it('read the detail part asked for', () => {
        expect(parseDetailQuery(new URLSearchParams('part=log&hand=4'))).toEqual({part: 'log', hand: 4});
        expect(parseDetailQuery(new URLSearchParams('part=log'))).toEqual({part: 'log', hand: null});
        expect(parseDetailQuery(new URLSearchParams('part=history&before=40'))).toEqual({part: 'history', before: 40});
        expect(parseDetailQuery(new URLSearchParams('part=bank'))).toEqual({part: 'bank'});
        expect(parseDetailQuery(new URLSearchParams('part=deck'))).toBeNull();
        expect(parseDetailQuery(new URLSearchParams(''))).toBeNull();
    });
});
