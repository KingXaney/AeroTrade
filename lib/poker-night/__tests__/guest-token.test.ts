// The guest cookie's token: a round trip; any changed part, a wrong key, an expired token, one from
// more than five minutes ahead, the wrong number of parts or another version all read as no guest;
// a key rotation keeps verifying the old tokens and re-issues them under the new key; and the cookie
// is __Host- and secure on HTTPS deployments, plain on a local http server.

import {describe, expect, it} from 'vitest';
import {
    deriveKey, GUEST_KEY_LABEL, guestCookieName, guestCookieOptions, guestIdForJoin, guestKeys, mintGuestToken, needsReissue, reissueGuestToken, sameText,
    verifyGuestToken,
} from '@/lib/poker-night/guest-token';
import {LIMITS} from '@/lib/poker-night/limits';

const NOW = 1_790_000_000_000;
const KEY = deriveKey('current-secret', GUEST_KEY_LABEL);
const OLD = deriveKey('old-secret', GUEST_KEY_LABEL);
const fixedBytes = (n: number) => Buffer.alloc(n, 7);

// The same character class, another character: a change that keeps the token's shape.
const swap = (c: string) => (c === 'A' ? 'B' : 'A');

describe('mint and verify', () => {
    it('round-trips a guest with a 22-character id', () => {
        const {guestId, token} = mintGuestToken(KEY, NOW);
        expect(guestId).toMatch(/^[A-Za-z0-9_-]{22}$/);
        expect(token.split('.')).toHaveLength(4);
        expect(token.startsWith('v1.')).toBe(true);
        expect(verifyGuestToken(token, KEY, NOW)).toEqual({guestId, issuedAt: Math.floor(NOW / 1000) * 1000, keyIndex: 0});
        expect(verifyGuestToken(token, [KEY], NOW + 1000)?.guestId).toBe(guestId);
    });

    it('draws a new guest each time and takes its randomness as an argument', () => {
        expect(mintGuestToken(KEY, NOW).guestId).not.toBe(mintGuestToken(KEY, NOW).guestId);
        expect(mintGuestToken(KEY, NOW, fixedBytes)).toEqual(mintGuestToken(KEY, NOW, fixedBytes));
    });

    it('reads no guest from a token with any character changed', () => {
        const {token} = mintGuestToken(KEY, NOW, fixedBytes);
        for (let i = 0; i < token.length; i++) {
            if (token[i] === '.') continue;
            const changed = `${token.slice(0, i)}${swap(token[i])}${token.slice(i + 1)}`;
            expect(verifyGuestToken(changed, KEY, NOW), `position ${i}`).toBeNull();
        }
    });

    it('reads no guest under a wrong key, after 180 days, or more than five minutes ahead', () => {
        const {token} = mintGuestToken(KEY, NOW);
        expect(verifyGuestToken(token, OLD, NOW)).toBeNull();
        expect(verifyGuestToken(token, KEY, NOW + LIMITS.guestCookieMaxAgeMs - 1000)).not.toBeNull();
        expect(verifyGuestToken(token, KEY, NOW + LIMITS.guestCookieMaxAgeMs + 1000)).toBeNull();
        const ahead = mintGuestToken(KEY, NOW + LIMITS.guestFutureSkewMs + 2000).token;
        expect(verifyGuestToken(ahead, KEY, NOW)).toBeNull();
        const slightlyAhead = mintGuestToken(KEY, NOW + 60_000).token;
        expect(verifyGuestToken(slightlyAhead, KEY, NOW)).not.toBeNull();
    });

    it('reads no guest from a malformed token', () => {
        const {token} = mintGuestToken(KEY, NOW);
        const [v, id, iat, mac] = token.split('.');
        for (const bad of [`${v}.${id}.${iat}`, `${token}.x`, `v2.${id}.${iat}.${mac}`, `${v}.${id}x.${iat}.${mac}`, `${v}.${id}.${iat}.${mac}=`,
            `${v}.${id}.-${iat}.${mac}`, '', 'v1....', 'x'.repeat(500)]) {
            expect(verifyGuestToken(bad, KEY, NOW), bad).toBeNull();
        }
        expect(verifyGuestToken(undefined, KEY, NOW)).toBeNull();
        expect(verifyGuestToken(null, KEY, NOW)).toBeNull();
    });
});

describe('the guest a join names', () => {
    it('is the same guest for the same join id, so a retried join is one row, and another for another id or key', () => {
        const id = 'a1B2c3D4e5F6g7H8';
        const guestId = guestIdForJoin(KEY, id);
        expect(guestId).toMatch(/^[A-Za-z0-9_-]{22}$/);
        expect(guestIdForJoin(KEY, id)).toBe(guestId);
        expect(guestIdForJoin(KEY, 'a1B2c3D4e5F6g7H9')).not.toBe(guestId);
        expect(guestIdForJoin(OLD, id)).not.toBe(guestId);
        // It is not the join id, nor read off it without the key.
        expect(guestId).not.toContain(id);
        // A token signed for it verifies as that guest.
        expect(verifyGuestToken(reissueGuestToken(KEY, guestId, NOW), KEY, NOW)?.guestId).toBe(guestId);
    });
});

describe('rotation and re-issue', () => {
    it('verifies an old token under the previous key, mints with the current one, and re-issues', () => {
        const keys = guestKeys({POKER_NIGHT_GUEST_SECRET: 'current-secret', POKER_NIGHT_GUEST_SECRET_PREVIOUS: 'old-secret'});
        expect(keys).toHaveLength(2);
        expect(keys[0].equals(KEY)).toBe(true);
        const old = mintGuestToken(OLD, NOW);
        const read = verifyGuestToken(old.token, keys, NOW)!;
        expect(read).toEqual({guestId: old.guestId, issuedAt: Math.floor(NOW / 1000) * 1000, keyIndex: 1});
        expect(needsReissue(read, NOW)).toBe(true);
        const fresh = reissueGuestToken(keys[0], read.guestId, NOW);
        expect(verifyGuestToken(fresh, keys, NOW)).toEqual({...read, keyIndex: 0});
        expect(verifyGuestToken(fresh, KEY, NOW)?.guestId).toBe(old.guestId);
    });

    it('re-issues a token once it is 30 days old', () => {
        const {token} = mintGuestToken(KEY, NOW);
        const read = verifyGuestToken(token, KEY, NOW)!;
        expect(needsReissue(read, NOW + LIMITS.guestReissueAfterMs - 1000)).toBe(false);
        expect(needsReissue(read, NOW + LIMITS.guestReissueAfterMs + 1000)).toBe(true);
    });

    it('derives the key from the guest secret, else from the auth secret, and needs one of them', () => {
        expect(guestKeys({BETTER_AUTH_SECRET: 'auth-secret'})[0].equals(deriveKey('auth-secret', GUEST_KEY_LABEL))).toBe(true);
        expect(guestKeys({BETTER_AUTH_SECRET: 'auth-secret', POKER_NIGHT_GUEST_SECRET: 'current-secret'})[0].equals(KEY)).toBe(true);
        expect(guestKeys({BETTER_AUTH_SECRET: 'auth-secret', POKER_NIGHT_GUEST_SECRET_PREVIOUS: 'auth-secret'})).toHaveLength(1);
        // The key is never the secret itself.
        expect(KEY.equals(Buffer.from('current-secret'))).toBe(false);
        expect(KEY).toHaveLength(32);
        expect(() => guestKeys({})).toThrow();
        expect(() => deriveKey('', GUEST_KEY_LABEL)).toThrow();
    });

    it('compares macs as text, so two spellings of the same bytes differ', () => {
        expect(sameText('abc', 'abc')).toBe(true);
        expect(sameText('abc', 'abd')).toBe(false);
        expect(sameText('abc', 'abcd')).toBe(false);
        // 'A' and 'B' as the 43rd base64url character carry the same two spare bits.
        expect(Buffer.from(`${'x'.repeat(42)}A`, 'base64url').equals(Buffer.from(`${'x'.repeat(42)}B`, 'base64url'))).toBe(true);
        expect(sameText(`${'x'.repeat(42)}A`, `${'x'.repeat(42)}B`)).toBe(false);
    });
});

describe('the cookie', () => {
    it('is __Host- and secure on HTTPS deployments', () => {
        for (const env of ['production', 'preview'] as const) {
            expect(guestCookieName(env)).toBe('__Host-aero-pn-guest');
            expect(guestCookieOptions(env)).toEqual({httpOnly: true, sameSite: 'lax', path: '/', secure: true, maxAge: 180 * 24 * 3600});
        }
    });

    it('is plain on a local server, where http must carry it', () => {
        expect(guestCookieName('development')).toBe('aero-pn-guest');
        expect(guestCookieOptions('development')).toEqual({httpOnly: true, sameSite: 'lax', path: '/', secure: false, maxAge: 180 * 24 * 3600});
    });
});
