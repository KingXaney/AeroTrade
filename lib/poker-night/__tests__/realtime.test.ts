// The server's side of Ably, against a stand-in for the SDK (no network): without realtime nothing
// is loaded or sent; a token is requested for the player's pid, subscribe-only on the room's own
// channel, fifteen minutes long, and handed over field by field; a commit's wire view goes out as
// the 'state' message under the room and its seq; a failure comes back as a message, never a throw;
// one client per key.

import {beforeEach, describe, expect, it, vi} from 'vitest';
import {LIMITS} from '@/lib/poker-night/limits';
import {newRoom, wireOf} from '@/lib/poker-night/room';
import {T0} from './fixtures';

const sdk = vi.hoisted(() => ({
    built: [] as Record<string, unknown>[],
    tokenParams: [] as Record<string, unknown>[],
    published: [] as {channel: string; message: unknown}[],
    failPublish: null as Error | null,
}));

vi.mock('ably', () => ({
    Rest: class {
        constructor(options: Record<string, unknown>) {
            sdk.built.push(options);
        }

        auth = {
            requestToken: async (params: Record<string, unknown>) => {
                sdk.tokenParams.push(params);
                return {token: 'tok-123', expires: T0 + LIMITS.tokenTtlMs, issued: T0, capability: params.capability, clientId: params.clientId, keyName: 'appId.keyId'};
            },
        };

        channels = {
            get: (channel: string) => ({
                publish: async (message: unknown) => {
                    if (sdk.failPublish) throw sdk.failPublish;
                    sdk.published.push({channel, message});
                    return {serials: ['s1']};
                },
            }),
        };
    },
}));

const {issueToken, publishEmote, publishNudge, publishWire} = await import('@/lib/poker-night/realtime');

const ROOM_ID = '6650a1b2c3d4e5f601234567';
const KEY = 'appId.keyId:c2VjcmV0';
const ON = {ABLY_API_KEY: KEY};
const room = () => newRoom({id: ROOM_ID, code: 'K7QXM4', env: 'production', host: {userId: 'u-host', pid: 'Pq3x9Zk2L00', name: 'Hana', avatar: 'v1:fox:tangerine:ring:crown'}, at: T0});

beforeEach(() => {
    sdk.tokenParams.length = 0;
    sdk.published.length = 0;
    sdk.failPublish = null;
});

describe('without realtime', () => {
    it('loads nothing, sends nothing and says so', async () => {
        const built = sdk.built.length;
        expect(await issueToken('production', ROOM_ID, 'Pq3x9Zk2L00', {})).toEqual({realtime: false});
        expect(await issueToken('production', ROOM_ID, 'Pq3x9Zk2L00', {ABLY_API_KEY: KEY, POKER_NIGHT_REALTIME: 'off'})).toEqual({realtime: false});
        expect(await publishWire('production', ROOM_ID, wireOf(room(), 1, T0, {realtimeOk: true}), {ABLY_API_KEY: 'not a key'})).toEqual({ok: true, sent: false});
        expect(sdk.built.length).toBe(built);
        expect(sdk.tokenParams).toEqual([]);
        expect(sdk.published).toEqual([]);
    });
});

describe('with realtime', () => {
    it('requests a subscribe-only token for the pid on the room\'s channel and its own, and hands it over field by field', async () => {
        const reply = await issueToken('production', ROOM_ID, 'Pq3x9Zk2L00', ON);
        const channel = `poker-night:production:${ROOM_ID}`;
        const own = `${channel}:Pq3x9Zk2L00`;
        const capability = JSON.stringify({[channel]: ['subscribe'], [own]: ['subscribe']});
        expect(sdk.tokenParams).toEqual([{clientId: 'Pq3x9Zk2L00', capability, ttl: LIMITS.tokenTtlMs}]);
        expect(LIMITS.tokenTtlMs).toBe(15 * 60_000);
        expect(reply).toEqual({
            realtime: true, channel, private: own,
            token: {token: 'tok-123', expires: T0 + LIMITS.tokenTtlMs, issued: T0, capability, clientId: 'Pq3x9Zk2L00'},
        });
        // Nothing else of the SDK's object (its keyName) reaches the answer.
        expect(JSON.stringify(reply)).not.toContain('keyName');
    });

    it('publishes a commit\'s wire view as the state message, under the room and its seq', async () => {
        const wire = wireOf(room(), 42, T0, {realtimeOk: true});
        expect(await publishWire('preview', ROOM_ID, wire, ON)).toEqual({ok: true, sent: true});
        expect(sdk.published).toEqual([{channel: `poker-night:preview:${ROOM_ID}`, message: {name: 'state', id: `${ROOM_ID}:42`, data: wire}}]);
        const emote = {kind: 'react' as const, item: 'laugh', id: 'e7', seq: 3, from: 'Pq3x9Zk2L00', at: T0};
        expect(await publishEmote('preview', ROOM_ID, emote, ON)).toEqual({ok: true, sent: true});
        expect(sdk.published[1]).toEqual({channel: `poker-night:preview:${ROOM_ID}`, message: {name: 'emote', id: `${ROOM_ID}:e:e7`, data: emote}});
        // A nudge goes on the player's own channel, with their count alone.
        expect(await publishNudge('preview', ROOM_ID, 'Pq3x9Zk2L00', 5, ON)).toEqual({ok: true, sent: true});
        expect(sdk.published[2]).toEqual({
            channel: `poker-night:preview:${ROOM_ID}:Pq3x9Zk2L00`, message: {name: 'nudge', id: `${ROOM_ID}:n:Pq3x9Zk2L00:5`, data: {nudge: 5}},
        });
    });

    it('answers a failed publish with its message, never a throw', async () => {
        sdk.failPublish = new Error('Ably is down');
        expect(await publishWire('production', ROOM_ID, wireOf(room(), 7, T0, {realtimeOk: true}), ON)).toEqual({ok: false, message: 'Ably is down'});
    });

    it('builds one client per key, with short timeouts and no logging of its own', async () => {
        const before = sdk.built.length;
        await issueToken('production', ROOM_ID, 'Pq3x9Zk2L00', ON);
        await publishWire('production', ROOM_ID, wireOf(room(), 8, T0, {realtimeOk: true}), ON);
        expect(sdk.built.length).toBe(before);
        await issueToken('production', ROOM_ID, 'Pq3x9Zk2L00', {ABLY_API_KEY: 'appId.otherKey:c2VjcmV0'});
        expect(sdk.built.length).toBe(before + 1);
        expect(sdk.built.at(-1)).toMatchObject({key: 'appId.otherKey:c2VjcmV0', idempotentRestPublishing: true, logLevel: 0});
        expect(sdk.built.at(-1)!.httpRequestTimeout as number).toBeLessThanOrEqual(5000);
    });
});
