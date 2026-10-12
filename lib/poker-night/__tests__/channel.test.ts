// The realtime channel as both ends name it: a room's channel carries the env and the room's id,
// never its share code; a browser's token may only subscribe to it (no publish, no presence); a
// state message is the public wire view under an id a retried publish repeats, and nothing private
// rides on it; and realtime is on only for a key shaped like an Ably key, unless the kill switch
// says off.

import {describe, expect, it} from 'vitest';
import {
    ablyKeyOf, CAPABILITY, capabilityFor, CHANNEL_NAMESPACE, channelName, emoteMessage, isWire, nudgeMessage, nudgeOf, privateChannelName, realtimeEnabled,
    stateMessage, STATE_MESSAGE, WIRE_BUDGET_BYTES,
} from '@/lib/poker-night/channel';
import {ENVS} from '@/lib/poker-night/env';
import {newRoom, wireOf} from '@/lib/poker-night/room';
import type {EmoteView} from '@/lib/poker-night/view-types';
import {T0} from './fixtures';

const ROOM_ID = '6650a1b2c3d4e5f601234567';
const AV = 'v1:fox:tangerine:ring:crown';

const room = () => newRoom({id: ROOM_ID, code: 'K7QXM4', env: 'production', host: {userId: 'u-host', pid: 'Pq3x9Zk2L00', name: 'Hana', avatar: AV}, at: T0});

// Every key anywhere in a value.
const keysOf = (value: unknown): string[] => {
    if (Array.isArray(value)) return value.flatMap(keysOf);
    if (typeof value !== 'object' || value === null) return [];
    return Object.entries(value).flatMap(([key, inner]) => [key, ...keysOf(inner)]);
};

describe('the channel', () => {
    it('names the env and the room id, never the share code', () => {
        const core = room();
        const name = channelName(core.env, core.id);
        expect(name).toBe(`poker-night:production:${ROOM_ID}`);
        expect(name).not.toContain(core.code);
        expect(name.startsWith(`${CHANNEL_NAMESPACE}:`)).toBe(true);
        // One room, three deployments: three channels.
        expect(new Set(ENVS.map((env) => channelName(env, ROOM_ID))).size).toBe(3);
        expect(channelName('preview', ROOM_ID)).toBe(`poker-night:preview:${ROOM_ID}`);
    });

    it('grants a browser subscribe on its own channel and nothing else', () => {
        const name = channelName('production', ROOM_ID);
        const capability = capabilityFor(name);
        expect(capability).toEqual({[name]: ['subscribe']});
        expect(CAPABILITY).toEqual(['subscribe']);
        const text = JSON.stringify(capability);
        for (const op of ['publish', 'presence', '*', 'history', 'push']) expect(text).not.toContain(`"${op}"`);
        expect(Object.keys(capability)).toEqual([name]);
        // The list is the module's own, copied: a caller cannot widen it.
        capability[name].push('publish');
        expect(capabilityFor(name)).toEqual({[name]: ['subscribe']});
    });
});

describe('the messages', () => {
    it('carry the public wire view under the room and its seq', () => {
        const core = room();
        const wire = wireOf(core, 42, T0, {realtimeOk: true});
        const message = stateMessage(core.id, wire);
        expect(message.name).toBe(STATE_MESSAGE);
        expect(message.id).toBe(`${ROOM_ID}:42`);
        expect(message.data).toBe(wire);
        // The same commit published twice is the same message.
        expect(stateMessage(core.id, wire).id).toBe(message.id);
        expect(isWire(message.data)).toBe(true);
        // Nothing only the server or one viewer may see: no deck, no hole cards, no viewer, no
        // config, no people, no account.
        const keys = new Set(keysOf(JSON.parse(JSON.stringify(message))));
        for (const key of ['deck', 'hole', 'me', 'config', 'people', 'userId', 'guestId', 'bannedKeys', 'applied', 'pass', 'emotes']) expect(keys.has(key), key).toBe(false);
        expect(JSON.stringify(message)).not.toContain('u-host');
        expect(WIRE_BUDGET_BYTES).toBe(4500);
    });

    it('give an emote its own id', () => {
        const emote: EmoteView = {kind: 'react', item: 'laugh', id: 'e1', seq: 3, from: 'Pq3x9Zk2L00', at: T0};
        expect(emoteMessage(ROOM_ID, emote)).toEqual({name: 'emote', id: `${ROOM_ID}:e:e1`, data: emote});
    });

    it('know a wire view from anything else', () => {
        // Version 2 only: a version 1 message (an older deploy's) is not one this page reads.
        for (const junk of [null, 'state', 3, [], {}, {v: 2, seq: 1}, {v: 1, seq: 1, seats: [], code: 'K7QXM4', serverNow: T0}, {v: 3, seq: 1, seats: [], code: 'K7QXM4', serverNow: T0}, {v: 2, seq: 1.5, seats: [], code: 'K', serverNow: T0}]) {
            expect(isWire(junk)).toBe(false);
        }
        expect(isWire({v: 2, seq: 1, seats: [], code: 'K7QXM4', serverNow: T0})).toBe(true);
    });

    it('nudge a player on their own channel with their count alone, and read a count back', () => {
        expect(privateChannelName('production', ROOM_ID, 'Pq3x9Zk2L00')).toBe(`poker-night:production:${ROOM_ID}:Pq3x9Zk2L00`);
        expect(nudgeMessage(ROOM_ID, 'Pq3x9Zk2L00', 4)).toEqual({name: 'nudge', id: `${ROOM_ID}:n:Pq3x9Zk2L00:4`, data: {nudge: 4}});
        expect(nudgeOf({nudge: 4})).toBe(4);
        for (const junk of [null, 4, {}, {nudge: -1}, {nudge: 1.5}, {nudge: '4'}]) expect(nudgeOf(junk)).toBeNull();
        expect(capabilityFor('a', 'b')).toEqual({a: ['subscribe'], b: ['subscribe']});
    });
});

describe('realtimeEnabled', () => {
    const KEY = 'xVLyHw.DQrNxQ:3sTmJhYm_Ex4mple-Secret+/=';

    it('is off without a key, or with one not shaped like an Ably key', () => {
        expect(realtimeEnabled({})).toBe(false);
        for (const key of ['', '   ', 'secret', 'appId:secret', 'appId.keyId', 'appId.keyId:', '.keyId:secret', 'appId.:secret', 'app Id.keyId:secret', 'a.b.c:secret', 'appId.keyId:sec ret']) {
            expect(realtimeEnabled({ABLY_API_KEY: key}), key).toBe(false);
            expect(ablyKeyOf({ABLY_API_KEY: key}), key).toBeNull();
        }
    });

    it('is on for a key shaped like one', () => {
        expect(realtimeEnabled({ABLY_API_KEY: KEY})).toBe(true);
        expect(ablyKeyOf({ABLY_API_KEY: ` ${KEY}\n`})).toBe(KEY);
        expect(realtimeEnabled({ABLY_API_KEY: KEY, POKER_NIGHT_REALTIME: 'on'})).toBe(true);
        expect(realtimeEnabled({ABLY_API_KEY: KEY, POKER_NIGHT_REALTIME: ''})).toBe(true);
    });

    it('is off while the kill switch says off, key or not', () => {
        expect(realtimeEnabled({ABLY_API_KEY: KEY, POKER_NIGHT_REALTIME: 'off'})).toBe(false);
        expect(realtimeEnabled({ABLY_API_KEY: KEY, POKER_NIGHT_REALTIME: ' OFF '})).toBe(false);
        expect(realtimeEnabled({POKER_NIGHT_REALTIME: 'on'})).toBe(false);
    });
});
