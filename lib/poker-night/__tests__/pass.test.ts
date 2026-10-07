// The seat pass: a round trip within its ten minutes; expiry; another room; any changed character,
// another key, the wrong number of parts or an expiry further out than a pass lives all read as no
// pass; and its key is its own, never the guest cookie's.

import {describe, expect, it} from 'vitest';
import {deriveKey, GUEST_KEY_LABEL} from '@/lib/poker-night/guest-token';
import {LIMITS} from '@/lib/poker-night/limits';
import {mintPass, PASS_KEY_LABEL, passFor, passKey, passRenewalDue, verifyPass} from '@/lib/poker-night/pass';

const NOW = 1_790_000_000_000;
const KEY = passKey({BETTER_AUTH_SECRET: 'auth-secret'});
const ROOM = '6650a1b2c3d4e5f601234567';
const OTHER_ROOM = '6650a1b2c3d4e5f601234568';
const PID = 'Pq3x9Zk2L01';
const swap = (c: string) => (c === 'A' ? 'B' : 'A');

describe('the seat pass', () => {
    it('round-trips within its ten minutes', () => {
        const pass = passFor(KEY, ROOM, PID, NOW);
        expect(pass.split('.')).toHaveLength(5);
        const exp = Math.floor((NOW + LIMITS.passTtlMs) / 1000) * 1000;
        expect(verifyPass(pass, KEY, NOW)).toEqual({roomId: ROOM, pid: PID, exp});
        expect(verifyPass(pass, KEY, NOW, ROOM)).toEqual({roomId: ROOM, pid: PID, exp});
        expect(verifyPass(pass, KEY, NOW + LIMITS.passTtlMs - 2000)).not.toBeNull();
    });

    it('expires', () => {
        const pass = passFor(KEY, ROOM, PID, NOW);
        expect(verifyPass(pass, KEY, NOW + LIMITS.passTtlMs)).toBeNull();
        expect(verifyPass(pass, KEY, NOW + LIMITS.passTtlMs + 60_000)).toBeNull();
    });

    it('is good for its own room only', () => {
        expect(verifyPass(passFor(KEY, ROOM, PID, NOW), KEY, NOW, OTHER_ROOM)).toBeNull();
    });

    it('reads as no pass with any character changed, or under another key', () => {
        const pass = passFor(KEY, ROOM, PID, NOW);
        for (let i = 0; i < pass.length; i++) {
            if (pass[i] === '.') continue;
            const changed = `${pass.slice(0, i)}${swap(pass[i])}${pass.slice(i + 1)}`;
            expect(verifyPass(changed, KEY, NOW), `position ${i}`).toBeNull();
        }
        expect(verifyPass(pass, passKey({BETTER_AUTH_SECRET: 'another'}), NOW)).toBeNull();
        // The guest cookie's key is a different key from the same secret.
        expect(verifyPass(pass, deriveKey('auth-secret', GUEST_KEY_LABEL), NOW)).toBeNull();
        expect(KEY.equals(deriveKey('auth-secret', PASS_KEY_LABEL))).toBe(true);
    });

    it('reads as no pass when malformed or claiming to live longer than a pass does', () => {
        const pass = passFor(KEY, ROOM, PID, NOW);
        const [v, room, pid, exp, mac] = pass.split('.');
        for (const bad of [`${v}.${room}.${pid}.${exp}`, `${pass}.x`, `v2.${room}.${pid}.${exp}.${mac}`, `${v}.${room.toUpperCase()}.${pid}.${exp}.${mac}`,
            `${v}.${room}.${pid}x.${exp}.${mac}`, '', 'x'.repeat(300)]) {
            expect(verifyPass(bad, KEY, NOW), bad).toBeNull();
        }
        expect(verifyPass(undefined, KEY, NOW)).toBeNull();
        const longLived = mintPass(KEY, {roomId: ROOM, pid: PID, exp: NOW + 24 * 3_600_000});
        expect(verifyPass(longLived, KEY, NOW)).toBeNull();
    });

    it('takes its key from the guest secret, else the auth secret', () => {
        expect(passKey({BETTER_AUTH_SECRET: 'a', POKER_NIGHT_GUEST_SECRET: 'g'}).equals(deriveKey('g', PASS_KEY_LABEL))).toBe(true);
        expect(() => passKey({})).toThrow();
    });
});

describe('renewal', () => {
    it('answers a pass past half its life with a fresh one, so a player who only polls never lets it lapse', () => {
        const pass = verifyPass(passFor(KEY, ROOM, PID, NOW), KEY, NOW)!;
        expect(passRenewalDue(pass, NOW)).toBe(false);
        expect(passRenewalDue(pass, NOW + LIMITS.passTtlMs / 2 - 1000)).toBe(false);
        expect(passRenewalDue(pass, NOW + LIMITS.passTtlMs / 2 + 1000)).toBe(true);
        // Polled at least every half life, a pass is always renewed before it lapses.
        expect(LIMITS.passTtlMs / 2).toBeGreaterThan(LIMITS.heartbeatMs);
    });
});
