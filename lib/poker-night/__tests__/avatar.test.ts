// The avatar encoding: every face and badge one plain emoji code point from the allowlist below
// (Emoji 12.0 or earlier, no joiner, skin tone or variation selector), the string round-tripping
// through decode, a bad part refusing the whole value but resolving field by field, the builder's
// one edit (withPart), the dice's odds, and an account's look the same every time.

import {describe, expect, it} from 'vitest';
import {
    AVATAR_BADGES, AVATAR_COLOURS, AVATAR_FACES, AVATAR_FRAMES, AVATAR_MAX_LENGTH, avatarForUser, BADGE_IDS, badgeGlyph, decodeAvatar, DEFAULT_AVATAR,
    encodeAvatar, FACE_IDS, faceGlyph, isAvatar, PART_IDS, resolveAvatar, rollAvatar, withPart, type AvatarSpec,
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

    // The design's list, code point by code point: every one a whole glyph since Emoji 12.0 (2019) or
    // earlier, none needing a joiner, a skin tone or VS16 to draw as an emoji. A new face or badge
    // is added here first, after checking its Emoji version.
    it('use only the allowlisted code points, each face and badge under its own name', () => {
        const FACES: Record<string, number> = {
            fox: 0x1f98a, cat: 0x1f431, dog: 0x1f436, panda: 0x1f43c, koala: 0x1f428, tiger: 0x1f42f, lion: 0x1f981, frog: 0x1f438, monkey: 0x1f435,
            penguin: 0x1f427, owl: 0x1f989, octopus: 0x1f419, unicorn: 0x1f984, dragon: 0x1f432, turtle: 0x1f422, rabbit: 0x1f430, bear: 0x1f43b,
            pig: 0x1f437, cow: 0x1f42e, shark: 0x1f988, dinosaur: 0x1f996, bee: 0x1f41d, butterfly: 0x1f98b, whale: 0x1f433, robot: 0x1f916,
            alien: 0x1f47d, ghost: 0x1f47b, pumpkin: 0x1f383, cowboy: 0x1f920, wizard: 0x1f9d9, vampire: 0x1f9db, superhero: 0x1f9b8, clown: 0x1f921,
            cactus: 0x1f335, mushroom: 0x1f344, sunflower: 0x1f33b, doughnut: 0x1f369, pizza: 0x1f355, die: 0x1f3b2, rocket: 0x1f680,
        };
        const BADGES: Record<string, number | null> = {
            none: null, crown: 0x1f451, 'top-hat': 0x1f3a9, star: 0x2b50, clover: 0x1f340, flame: 0x1f525, gem: 0x1f48e, bow: 0x1f380, moon: 0x1f319,
            target: 0x1f3af, cherries: 0x1f352, heart: 0x1f496, balloon: 0x1f388,
        };
        expect(AVATAR_FACES).toEqual(FACES);
        expect(AVATAR_BADGES).toEqual(BADGES);
        // Nothing newer than Emoji 12.0 sits in these blocks' later rows.
        for (const point of [...Object.values(FACES), ...Object.values(BADGES)].filter((p): p is number => p !== null)) {
            expect(point < 0x1f9e8 && !(point >= 0x1f6d6 && point <= 0x1f6ff) && !(point >= 0x1fa70), point.toString(16)).toBe(true);
            expect(Array.from(String.fromCodePoint(point))).toHaveLength(1);
        }
    });

    it('offer every id of every part in the builder', () => {
        expect(PART_IDS.face).toEqual(FACE_IDS);
        expect(PART_IDS.colour).toEqual(AVATAR_COLOURS);
        expect(PART_IDS.frame).toEqual(AVATAR_FRAMES);
        expect(PART_IDS.badge).toEqual(BADGE_IDS);
        expect(AVATAR_FRAMES).toEqual(['none', 'ring', 'double', 'dashed', 'gold', 'neon']);
        expect(AVATAR_COLOURS).toEqual(['tangerine', 'lemon', 'lime', 'mint', 'sky', 'ocean', 'grape', 'berry', 'rose', 'coral', 'sand', 'slate']);
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

describe('the builder\'s edit', () => {
    const owl = 'v1:owl:sky:ring:star';

    it('changes one part and keeps the rest', () => {
        expect(withPart(owl, 'face', 'fox')).toBe('v1:fox:sky:ring:star');
        expect(withPart(owl, 'colour', 'berry')).toBe('v1:owl:berry:ring:star');
        expect(withPart(owl, 'frame', 'gold')).toBe('v1:owl:sky:gold:star');
        expect(withPart(owl, 'badge', 'none')).toBe('v1:owl:sky:ring:none');
        for (const [part, ids] of Object.entries(PART_IDS) as [keyof typeof PART_IDS, readonly string[]][]) {
            for (const id of ids) expect(decodeAvatar(withPart(owl, part, id))?.[part]).toBe(id);
        }
    });

    it('leaves the look as it was for an id or a part it does not know', () => {
        expect(withPart(owl, 'face', 'wolf')).toBe(owl);
        expect(withPart(owl, 'colour', 'tangerine:x')).toBe(owl);
        expect(withPart(owl, 'badge', 7)).toBe(owl);
        expect(withPart(owl, 'shape' as never, 'fox')).toBe(owl);
        expect(withPart(owl, 'face', 'constructor')).toBe(owl);
        // A look that no longer reads starts from the default, part by part.
        expect(withPart('nonsense', 'face', 'cat')).toBe(encodeAvatar({...DEFAULT_AVATAR, face: 'cat'}));
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
