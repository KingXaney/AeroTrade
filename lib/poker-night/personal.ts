// What each player picks for their own eyes at a poker night table (the personal look): their card
// back and card face, a four-colour deck, their chip set, and the table's sound, vibration, screen
// wake, single-key shortcuts, the hand's name under their cards, their cards kept face down until
// a press (peek) and other players' emotes on or off. Nobody else sees any of it; the host's scene
// and felt are the room's (lib/poker-night/looks).
//
// Where it lives: this browser's localStorage under ME_STORAGE_KEY, one JSON value
// {v: 1, name, avatar, look} the table (components/poker-night/PokerNightRoom) and the lobby's My
// look (components/poker-night/lobby/MyLookPanel) both read and write — a change at the table is
// kept at once, and never sent to the server from /play (no server action runs there). An account
// also keeps a look in its preferences (user-preferences.pokerNight.look, saved from the lobby by
// lib/actions/poker-night.actions.savePokerNightProfile); the table lays this browser's own changes
// over it, field by field. `look` in the stored value holds only the fields this browser changed.
//
// Everything here reads untrusted input (a stored value another version or a person wrote): every
// field is whitelisted on its own, so one bad part never costs the rest. Pure and client-safe.

import {z} from 'zod';
import {isAvatar} from '@/lib/poker-night/avatar';
import {FELT_IDS, SCENE_IDS} from '@/lib/poker-night/config';
import {
    CARD_BACK_IDS, CARD_FACE_IDS, CHIP_SET_IDS, DEFAULT_CARD_BACK, DEFAULT_CARD_FACE, DEFAULT_CHIP_SET, type CardBackId, type CardFaceId, type ChipSetId,
} from '@/lib/poker-night/looks';
import {cleanName} from '@/lib/poker-night/names';

// The key the table and the lobby keep a browser's name, look and personal look under.
export const ME_STORAGE_KEY = 'aero-poker-night:me';
export const ME_VERSION = 1;

export type PersonalLook = {
    cardBack: CardBackId;
    cardFace: CardFaceId;
    fourColour: boolean; // clubs green and diamonds blue
    chips: ChipSetId;
    sound: boolean;
    buzz: boolean; // a vibration when the turn comes round, where the device has one
    keepAwake: boolean; // the screen stays on while the table is open
    shortcuts: boolean; // the table's single-key shortcuts (F, C, R, A, 1–4); a player can turn them off
    handHints: boolean; // the name of the viewer's hand under their cards
    peek: boolean; // the viewer's own cards face down in the dock until they press on them
    muteEmotes: boolean; // other players' reactions, phrases and throws hidden
};

// The pickers, then the switches, in the order My look shows them.
export const PERSONAL_CHOICES = ['cardBack', 'cardFace', 'chips'] as const;
export const PERSONAL_SWITCHES = ['fourColour', 'sound', 'buzz', 'keepAwake', 'shortcuts', 'handHints', 'peek', 'muteEmotes'] as const;
export type PersonalChoice = (typeof PERSONAL_CHOICES)[number];
export type PersonalSwitch = (typeof PERSONAL_SWITCHES)[number];
export const PERSONAL_KEYS: readonly (keyof PersonalLook)[] = [...PERSONAL_CHOICES, ...PERSONAL_SWITCHES];

export const DEFAULT_PERSONAL_LOOK: Readonly<PersonalLook> = Object.freeze({
    cardBack: DEFAULT_CARD_BACK, cardFace: DEFAULT_CARD_FACE, fourColour: false, chips: DEFAULT_CHIP_SET,
    sound: true, buzz: true, keepAwake: true, shortcuts: true, handHints: true, peek: false, muteEmotes: false,
});

const CHOICE_IDS: {readonly [K in PersonalChoice]: readonly PersonalLook[K][]} = {cardBack: CARD_BACK_IDS, cardFace: CARD_FACE_IDS, chips: CHIP_SET_IDS};

const record = (raw: unknown): Record<string, unknown> | null =>
    typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;

// An own property only: a key named like Object.prototype's reads nothing.
const own = (value: Record<string, unknown>, key: string): unknown => (Object.prototype.hasOwnProperty.call(value, key) ? value[key] : undefined);

// The fields of a value that read — each choice one of its ids, each switch a boolean — and nothing
// else; {} for anything that is not an object.
export const personalPatchOf = (raw: unknown): Partial<PersonalLook> => {
    const value = record(raw);
    if (!value) return {};
    const out: Record<string, unknown> = {};
    for (const key of PERSONAL_CHOICES) {
        const v = own(value, key);
        if (typeof v === 'string' && (CHOICE_IDS[key] as readonly string[]).includes(v)) out[key] = v;
    }
    for (const key of PERSONAL_SWITCHES) {
        const v = own(value, key);
        if (typeof v === 'boolean') out[key] = v;
    }
    return out as Partial<PersonalLook>;
};

// A whole look: the fields of `raw` that read, laid over the fallback.
export const resolvePersonalLook = (raw: unknown, fallback: Readonly<PersonalLook> = DEFAULT_PERSONAL_LOOK): PersonalLook =>
    ({...fallback, ...personalPatchOf(raw)});

// The fields where `next` differs from `base`.
export const personalDiff = (base: Readonly<PersonalLook>, next: Readonly<PersonalLook>): Partial<PersonalLook> => {
    const out: Record<string, unknown> = {};
    for (const key of PERSONAL_KEYS) if (base[key] !== next[key]) out[key] = next[key];
    return out as Partial<PersonalLook>;
};

export const samePersonalLook = (a: Readonly<PersonalLook>, b: Readonly<PersonalLook>): boolean => Object.keys(personalDiff(a, b)).length === 0;

// ── what a browser keeps ──

// `look` holds only the fields this browser changed (see the header); name and avatar are null when
// nothing usable is kept.
export type StoredMe = {name: string | null; avatar: string | null; look: Partial<PersonalLook>};

export const EMPTY_ME: Readonly<StoredMe> = Object.freeze({name: null, avatar: null, look: Object.freeze({})});

const parseObject = (raw: string | null): Record<string, unknown> | null => {
    if (!raw) return null;
    try {
        return record(JSON.parse(raw));
    } catch {
        return null;
    }
};

// The stored text, read part by part; EMPTY_ME for nothing, broken JSON or a foreign value.
export const parseStoredMe = (raw: string | null): StoredMe => {
    const value = parseObject(raw);
    if (!value) return EMPTY_ME;
    const avatar = own(value, 'avatar');
    return {name: cleanName(own(value, 'name')), avatar: isAvatar(avatar) ? avatar : null, look: personalPatchOf(own(value, 'look'))};
};

// look: null clears every field this browser changed (the account holds them now).
export type MePatch = {name?: string | null; avatar?: string | null; look?: Partial<PersonalLook> | null};

// The text to keep after a change: what was kept with the patch laid over it — the look field by
// field — and any part a later version added left in place. A name or a look in the patch that does
// not read is dropped (a null name or avatar clears it; a null look clears the browser's look).
export const nextStoredMe = (raw: string | null, patch: MePatch): string => {
    const base = parseObject(raw) ?? {};
    const look = patch.look === null ? {} : {...personalPatchOf(own(base, 'look')), ...personalPatchOf(patch.look)};
    const next: Record<string, unknown> = {...base, v: ME_VERSION, look};
    if (patch.name !== undefined) next.name = patch.name === null ? null : cleanName(patch.name);
    if (patch.avatar !== undefined) next.avatar = patch.avatar === null || isAvatar(patch.avatar) ? patch.avatar : own(base, 'avatar') ?? null;
    return JSON.stringify(next);
};

// The look this browser plays with: the fields it changed over the account's saved look (or the
// defaults for a guest).
export const effectiveLook = (stored: Readonly<StoredMe>, account: Readonly<PersonalLook> = DEFAULT_PERSONAL_LOOK): PersonalLook =>
    ({...account, ...stored.look});

// What a browser keeps once the lobby saved to the account (lobby/MyLookPanel): the saved name and
// avatar, and none of its own look — the account holds that now, so a later save from another device
// reaches the tables opened here (effectiveLook lays nothing of this browser's over it).
export const afterAccountSave = (raw: string | null, saved: {name: string; avatar: string}): string =>
    nextStoredMe(raw, {name: saved.name || null, avatar: saved.avatar, look: null});

// Whether the browser's own changes differ from the account's look: the lobby then offers to save
// them to the account.
export const lookDiffers = (kept: Partial<PersonalLook>, account: Readonly<PersonalLook>): boolean =>
    PERSONAL_KEYS.some((key) => kept[key] !== undefined && kept[key] !== account[key]);

// ── what an account saves (lib/actions/poker-night.actions.savePokerNightProfile) ──

// The personal look as the lobby sends it: any of the fields, each one of ours; nothing else.
export const PersonalLookSchema = z.strictObject({
    cardBack: z.enum(CARD_BACK_IDS as [CardBackId, ...CardBackId[]]),
    cardFace: z.enum(CARD_FACE_IDS),
    fourColour: z.boolean(),
    chips: z.enum(CHIP_SET_IDS as [ChipSetId, ...ChipSetId[]]),
    sound: z.boolean(),
    buzz: z.boolean(),
    keepAwake: z.boolean(),
    shortcuts: z.boolean(),
    handHints: z.boolean(),
    peek: z.boolean(),
    muteEmotes: z.boolean(),
}).partial();

// The scene and felt a host's new tables open with.
export const TableLookSchema = z.strictObject({scene: z.enum(SCENE_IDS), felt: z.enum(FELT_IDS)});
