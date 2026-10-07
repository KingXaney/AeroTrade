// The avatar encoding: every face and badge one plain emoji code point (no joiner, skin tone or
// variation selector), the string round-tripping through decode, a bad part refusing the whole
// value but resolving field by field, the dice's odds, and an account's look the same every time.

import {describe, expect, it} from 'vitest';
import {
    AVATAR_BADGES, AVATAR_COLOURS, AVATAR_FACES, AVATAR_FRAMES, AVATAR_MAX_LENGTH, avatarForUser, BADGE_IDS, badgeGlyph, decodeAvatar, DEFAULT_AVATAR,
    encodeAvatar, FACE_IDS, faceGlyph, isAvatar, resolveAvatar, rollAvatar, type AvatarSpec,
} from '@/lib/poker-night/avatar';
import {mulberry32} from '@/lib/random';

describe('the registries', () => {
    it('list 40 faces, 12 colours, 6 frames and 12 badges besides none', () => {
        expect(FACE_IDS).toHaveLength(40);
        expect(AVATAR_COLOURS).toHaveLength(12);
        expect(AVATAR_FRAMES).toHaveLength(6);
        expect(BADGE_IDS.filter((b) => b !== 'none')).toHaveLength(12);
    });

    it('draw each face and badge as one plain emoji code point', () => {
        const points: number[] = [...Object.values(AVATAR_FACES), ...Object.values(AVATAR_BADGES).filter((p): p is NonNullable<typeof p> => p !== null)];
        for (const point of points) {
            // Emoji 12.0 or earlier lives in these blocks; no joiner, skin tone or selector is a whole glyph.
            expect(point >= 0x2b50 && point <= 0x1f9ff, point.toString(16)).toBe(true);
            expect(point === 0x200d || (point >= 0x1f3fb && point <= 0x1f3ff) || (point >= 0xfe00 && point <= 0xfe0f)).toBe(false);
        }
        for (const face of FACE_IDS) expect(Array.from(faceGlyph(face))).toHaveLength(1);
        expect(badgeGlyph('none')).toBeNull();
        expect(badgeGlyph('crown')).toBe(String.fromCodePoint(0x1f451));
        expect(new Set(Object.values(AVATAR_FACES)).size).toBe(FACE_IDS.length);
    });

    it('keep every id short, lower case and free of the separator', () => {
        for (const id of [...FACE_IDS, ...AVATAR_COLOURS, ...AVATAR_FRAMES, ...BADGE_IDS]) expect(id).toMatch(/^[a-z][a-z-]{1,15}$/);
    });
});

describe('encode and decode', () => {
    it('round-trip every spec the dice can roll', () => {
        const random = mulberry32(7);
        for (let i = 0; i < 2000; i++) {
            const spec = rollAvatar(random);
            const encoded = encodeAvatar(spec);
            expect(encoded.length).toBeLessThanOrEqual(AVATAR_MAX_LENGTH);
            expect(decodeAvatar(encoded)).toEqual(spec);
            expect(isAvatar(encoded)).toBe(true);
        }
        expect(encodeAvatar({face: 'fox', colour: 'tangerine', frame: 'ring', badge: 'crown'})).toBe('v1:fox:tangerine:ring:crown');
    });

    it('refuse the whole value when any part is not ours', () => {
        for (const raw of ['v1:fox:tangerine:ring', 'v1:fox:tangerine:ring:crown:x', 'v2:fox:tangerine:ring:crown', 'v1:wolf:tangerine:ring:crown',
            'v1:fox:teal:ring:crown', 'v1:fox:tangerine:square:crown', 'v1:fox:tangerine:ring:hat', 'v1:FOX:tangerine:ring:crown',
            'v1:constructor:tangerine:ring:crown', 'v1:fox:tangerine:ring:toString', '', `v1:fox:tangerine:ring:${'x'.repeat(80)}`]) {
            expect(decodeAvatar(raw), raw).toBeNull();
        }
        expect(decodeAvatar(null)).toBeNull();
        expect(decodeAvatar(42)).toBeNull();
    });

    it('resolve field by field, falling back where a part is unknown', () => {
        const fallback: AvatarSpec = {face: 'owl', colour: 'slate', frame: 'gold', badge: 'moon'};
        expect(resolveAvatar('v1:fox:mauve:ring:hat', fallback)).toEqual({face: 'fox', colour: 'slate', frame: 'ring', badge: 'moon'});
        expect(resolveAvatar('nonsense', fallback)).toEqual(fallback);
        expect(resolveAvatar(undefined)).toEqual(DEFAULT_AVATAR);
    });
});

describe('the dice', () => {
    it('leave the frame off about half the time and the badge about two times in three', () => {
        const random = mulberry32(2026);
        const n = 20_000;
        let noFrame = 0;
        let noBadge = 0;
        const faces = new Set<string>();
        for (let i = 0; i < n; i++) {
            const spec = rollAvatar(random);
            if (spec.frame === 'none') noFrame++;
            if (spec.badge === 'none') noBadge++;
            faces.add(spec.face);
        }
        expect(Math.abs(noFrame / n - 0.5)).toBeLessThan(0.02);
        expect(Math.abs(noBadge / n - 0.65)).toBeLessThan(0.02);
        expect(faces.size).toBe(FACE_IDS.length);
    });

    it('give an account the same look every time', () => {
        expect(avatarForUser('6650a1b2c3d4e5f601234567')).toEqual(avatarForUser('6650a1b2c3d4e5f601234567'));
        const looks = new Set(Array.from({length: 50}, (_, i) => encodeAvatar(avatarForUser(`user-${i}`))));
        expect(looks.size).toBeGreaterThan(40);
    });
});
