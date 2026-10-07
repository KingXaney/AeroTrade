// A player's avatar as the table stores and sends it: one short string, 'v1:fox:tangerine:ring:crown'
// — a face, a colour, a frame and a badge, each an id from the lists below. This is the encoding,
// the check, the dice and the builder's one edit (withPart); the colours' values are
// lib/poker-night/looks AVATAR_COLOUR_VALUES (LOOKS_CSS), the frames' drawing app/globals.css's
// .pn-avatar[data-frame] rules, and components/poker-night/AvatarBuilder the builder. Pure and
// client-safe.
//
// Faces and badges are emoji, each a single code point from Emoji 12.0 or earlier with no
// zero-width joiner, skin tone or variation selector, so every platform draws one glyph. They are
// held here as code points: no glyph is written into a .tsx file. Their names are
// lib/learn/copy/poker-night's AVATAR_COPY, keyed by the same ids.

import {fnv1a, mulberry32} from '@/lib/random';

export const AVATAR_VERSION = 'v1';

export const AVATAR_FACES = {
    fox: 0x1f98a, cat: 0x1f431, dog: 0x1f436, panda: 0x1f43c, koala: 0x1f428, tiger: 0x1f42f, lion: 0x1f981, frog: 0x1f438,
    monkey: 0x1f435, penguin: 0x1f427, owl: 0x1f989, octopus: 0x1f419, unicorn: 0x1f984, dragon: 0x1f432, turtle: 0x1f422,
    rabbit: 0x1f430, bear: 0x1f43b, pig: 0x1f437, cow: 0x1f42e, shark: 0x1f988, dinosaur: 0x1f996, bee: 0x1f41d,
    butterfly: 0x1f98b, whale: 0x1f433, robot: 0x1f916, alien: 0x1f47d, ghost: 0x1f47b, pumpkin: 0x1f383, cowboy: 0x1f920,
    wizard: 0x1f9d9, vampire: 0x1f9db, superhero: 0x1f9b8, clown: 0x1f921, cactus: 0x1f335, mushroom: 0x1f344,
    sunflower: 0x1f33b, doughnut: 0x1f369, pizza: 0x1f355, die: 0x1f3b2, rocket: 0x1f680,
} as const;

export const AVATAR_COLOURS = ['tangerine', 'lemon', 'lime', 'mint', 'sky', 'ocean', 'grape', 'berry', 'rose', 'coral', 'sand', 'slate'] as const;
export const AVATAR_FRAMES = ['none', 'ring', 'double', 'dashed', 'gold', 'neon'] as const;

// 'none' has no glyph.
export const AVATAR_BADGES = {
    none: null, crown: 0x1f451, 'top-hat': 0x1f3a9, star: 0x2b50, clover: 0x1f340, flame: 0x1f525, gem: 0x1f48e, bow: 0x1f380,
    moon: 0x1f319, target: 0x1f3af, cherries: 0x1f352, heart: 0x1f496, balloon: 0x1f388,
} as const;

export type FaceId = keyof typeof AVATAR_FACES;
export type ColourId = (typeof AVATAR_COLOURS)[number];
export type FrameId = (typeof AVATAR_FRAMES)[number];
export type BadgeId = keyof typeof AVATAR_BADGES;

export const FACE_IDS = Object.keys(AVATAR_FACES) as FaceId[];
export const BADGE_IDS = Object.keys(AVATAR_BADGES) as BadgeId[];

export type AvatarSpec = {face: FaceId; colour: ColourId; frame: FrameId; badge: BadgeId};

// The builder's four parts, in the order it shows them, each with the ids it offers.
export const AVATAR_PARTS = ['face', 'colour', 'frame', 'badge'] as const;
export type AvatarPart = (typeof AVATAR_PARTS)[number];
export const PART_IDS: {readonly [P in AvatarPart]: readonly AvatarSpec[P][]} = {
    face: FACE_IDS, colour: AVATAR_COLOURS, frame: AVATAR_FRAMES, badge: BADGE_IDS,
};

// The longest encoding is well under this; the join and profile inputs accept no more.
export const AVATAR_MAX_LENGTH = 64;

export const DEFAULT_AVATAR: Readonly<AvatarSpec> = Object.freeze({face: 'fox', colour: 'tangerine', frame: 'none', badge: 'none'});

const isFace = (v: string): v is FaceId => Object.prototype.hasOwnProperty.call(AVATAR_FACES, v);
const isColour = (v: string): v is ColourId => (AVATAR_COLOURS as readonly string[]).includes(v);
const isFrame = (v: string): v is FrameId => (AVATAR_FRAMES as readonly string[]).includes(v);
const isBadge = (v: string): v is BadgeId => Object.prototype.hasOwnProperty.call(AVATAR_BADGES, v);

export const encodeAvatar = (spec: AvatarSpec): string => [AVATAR_VERSION, spec.face, spec.colour, spec.frame, spec.badge].join(':');

const parts = (raw: unknown): string[] | null => {
    if (typeof raw !== 'string' || raw.length > AVATAR_MAX_LENGTH) return null;
    const list = raw.split(':');
    return list.length === 5 && list[0] === AVATAR_VERSION ? list : null;
};

// The whole value, or null when any part of it is not one of ours.
export const decodeAvatar = (raw: unknown): AvatarSpec | null => {
    const list = parts(raw);
    if (!list) return null;
    const [, face, colour, frame, badge] = list;
    return isFace(face) && isColour(colour) && isFrame(frame) && isBadge(badge) ? {face, colour, frame, badge} : null;
};

export const isAvatar = (raw: unknown): raw is string => decodeAvatar(raw) !== null;

// Field by field: whatever part a later version renamed or dropped falls back on its own.
export const resolveAvatar = (raw: unknown, fallback: AvatarSpec = DEFAULT_AVATAR): AvatarSpec => {
    const list = parts(raw) ?? [];
    const [, face = '', colour = '', frame = '', badge = ''] = list;
    return {
        face: isFace(face) ? face : fallback.face,
        colour: isColour(colour) ? colour : fallback.colour,
        frame: isFrame(frame) ? frame : fallback.frame,
        badge: isBadge(badge) ? badge : fallback.badge,
    };
};

const pick = <T>(list: readonly T[], random: () => number): T => list[Math.min(list.length - 1, Math.floor(random() * list.length))];

// A random look: any face and colour; no frame half the time and no badge about two times in three.
export const rollAvatar = (random: () => number): AvatarSpec => {
    const face = pick(FACE_IDS, random);
    const colour = pick(AVATAR_COLOURS, random);
    const frame = random() < 0.5 ? 'none' : pick(AVATAR_FRAMES.filter((f) => f !== 'none'), random);
    const badge = random() < 0.65 ? 'none' : pick(BADGE_IDS.filter((b) => b !== 'none'), random);
    return {face, colour, frame, badge};
};

// An account's look until they choose one: the same every time for the same account.
export const avatarForUser = (userId: string): AvatarSpec => rollAvatar(mulberry32(fnv1a(userId)));

// The encoded look with one part changed, the builder's one edit: a part or id this version does not
// know leaves the look as it was (the other parts resolve as resolveAvatar reads them).
export const withPart = (raw: unknown, part: AvatarPart, id: unknown): string => {
    const spec = resolveAvatar(raw);
    if (!(AVATAR_PARTS as readonly string[]).includes(part) || typeof id !== 'string' || !(PART_IDS[part] as readonly string[]).includes(id)) return encodeAvatar(spec);
    return encodeAvatar({...spec, [part]: id});
};

export const faceGlyph = (face: FaceId): string => String.fromCodePoint(AVATAR_FACES[face]);

export const badgeGlyph = (badge: BadgeId): string | null => {
    const point = AVATAR_BADGES[badge];
    return point === null ? null : String.fromCodePoint(point);
};
