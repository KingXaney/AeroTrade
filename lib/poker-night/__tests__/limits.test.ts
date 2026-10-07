// The numbers outside the game, pinned to the design's table, sane against each other and against
// the engine's clock; and every rate-limit key scoped by env, so a preview sharing production's
// database never spends production's counters.

import {describe, expect, it} from 'vitest';
import {TABLE_LIMITS, TIMING} from '@/lib/poker-night/config';
import {ENVS} from '@/lib/poker-night/env';
import {BUCKETS, bucketKey, LIMITS, pnKey, RATE_LIMITS} from '@/lib/poker-night/limits';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('the limits', () => {
    it('hold the design\'s numbers', () => {
        expect(LIMITS.watchers).toBe(12);
        expect(LIMITS.players).toBe(30);
        expect(LIMITS.bannedKeys).toBe(32);
        expect(LIMITS.activeWindowMs).toBe(2 * MINUTE);
        expect(LIMITS.hostOpenTables).toBe(3);
        expect(LIMITS.hostActiveWindowMs).toBe(12 * HOUR);
        expect(LIMITS.hostTakeoverMs).toBe(10 * MINUTE);
        expect([LIMITS.heartbeatMs, LIMITS.onlineWindowMs, LIMITS.seenThrottleMs]).toEqual([25_000, 60_000, 15_000]);
        expect(LIMITS.realtimeConnectGraceMs).toBe(8000);
        expect(LIMITS.emoteCooldownMs).toBe(1200);
        expect(LIMITS.postBodyBytes).toBe(2048);
        expect(LIMITS.tokenTtlMs).toBe(15 * MINUTE);
        expect(LIMITS.passTtlMs).toBe(10 * MINUTE);
        expect(LIMITS.guestCookieMaxAgeMs).toBe(180 * DAY);
        expect(LIMITS.guestReissueAfterMs).toBe(30 * DAY);
        expect(LIMITS.idleCloseMs).toBe(12 * HOUR);
        expect(LIMITS.retentionMs).toBe(7 * DAY);
        expect(BUCKETS).toEqual({get: {rate: 3, burst: 15}, post: {rate: 5, burst: 20}});
        expect(RATE_LIMITS.create).toEqual({limit: 10, windowMs: HOUR});
        expect(RATE_LIMITS.joinIp).toEqual({limit: 30, windowMs: 10 * MINUTE});
        expect(RATE_LIMITS.joinRoom).toEqual({limit: 60, windowMs: 10 * MINUTE});
        expect(RATE_LIMITS.miss).toEqual({limit: 20, windowMs: 10 * MINUTE});
        expect(RATE_LIMITS.token).toEqual({limit: 20, windowMs: 10 * MINUTE});
        expect(RATE_LIMITS.look).toEqual({limit: 20, windowMs: MINUTE});
    });

    it('are sane against each other and the engine', () => {
        // Every seat and every watcher fit in the rows a room keeps.
        expect(TABLE_LIMITS.seats.max + LIMITS.watchers).toBeLessThanOrEqual(LIMITS.players);
        // Every removal among the rows a room keeps is remembered, with room for a few it let go.
        expect(LIMITS.bannedKeys).toBeGreaterThan(LIMITS.players);
        // A visible page beats well inside the window that counts it here, and the stamp is written
        // more often than the page beats.
        expect(LIMITS.heartbeatMs * 2).toBeLessThanOrEqual(LIMITS.onlineWindowMs);
        expect(LIMITS.seenThrottleMs).toBeLessThan(LIMITS.heartbeatMs);
        expect(LIMITS.onlineWindowMs).toBeLessThan(LIMITS.activeWindowMs);
        expect(LIMITS.activeWindowMs).toBeLessThan(LIMITS.hostTakeoverMs);
        // A pass outlives the poll that renews it; the guest cookie is re-issued well before it lapses.
        expect(LIMITS.passTtlMs).toBeGreaterThan(LIMITS.heartbeatMs * 4);
        expect(LIMITS.guestReissueAfterMs).toBeLessThan(LIMITS.guestCookieMaxAgeMs);
        expect(LIMITS.idleCloseMs).toBe(TIMING.IDLE_CLOSE_MS);
        expect(LIMITS.retentionMs).toBe(TIMING.ROOM_TTL_MS);
        expect(LIMITS.hostActiveWindowMs).toBe(LIMITS.idleCloseMs);
        for (const {rate, burst} of Object.values(BUCKETS)) expect(burst).toBeGreaterThanOrEqual(rate);
        for (const {limit, windowMs} of Object.values(RATE_LIMITS)) {
            expect(Number.isInteger(limit) && limit > 0).toBe(true);
            expect(windowMs).toBeGreaterThan(0);
        }
    });
});

describe('the keys', () => {
    it('build every Mongo counter key under poker-night and the env', () => {
        expect(pnKey.create('production', 'u1')).toBe('poker-night:production:create:u1');
        expect(pnKey.joinIp('preview', '1.2.3.4')).toBe('poker-night:preview:join:ip:1.2.3.4');
        expect(pnKey.joinRoom('development', 'r1')).toBe('poker-night:development:join:room:r1');
        expect(pnKey.miss('production', '::1')).toBe('poker-night:production:miss:ip:::1');
        expect(pnKey.token('production', 'Pq3x9Zk2L01')).toBe('poker-night:production:token:Pq3x9Zk2L01');
        expect(pnKey.look('production', 'u1')).toBe('poker-night:production:look:u1');
        expect(Object.keys(pnKey).sort()).toEqual(Object.keys(RATE_LIMITS).sort());
    });

    it('never share a key between envs', () => {
        for (const build of Object.values(pnKey)) {
            const keys = ENVS.map((env) => build(env, 'x'));
            expect(new Set(keys).size).toBe(ENVS.length);
            ENVS.forEach((env, i) => expect(keys[i].startsWith(`poker-night:${env}:`)).toBe(true));
        }
    });

    it('key a bucket by pid, else by address, else one shared key', () => {
        expect(bucketKey('production', 'post', {pid: 'Pq3x9Zk2L01'})).toBe('poker-night:production:post:pid:Pq3x9Zk2L01');
        expect(bucketKey('preview', 'get', {ip: '1.2.3.4'})).toBe('poker-night:preview:get:ip:1.2.3.4');
        expect(bucketKey('development', 'get', {ip: null})).toBe('poker-night:development:get:ip:unknown');
    });
});
