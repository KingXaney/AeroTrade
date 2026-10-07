// How a poker night table looks: the scene behind it, the felt, the card backs and faces, the suit
// colours, the chip sets and the avatar colours — every colour the table draws, as literals in one
// pure registry. buildLooksCss renders it into LOOKS_CSS, the way lib/theme/palettes.buildPaletteCss
// renders the palettes: data-attribute selectors only ([data-pn-scene="casino-classic"],
// [data-pn-felt], [data-pn-back], [data-pn-colours], [data-pn-chips] [data-denom], [data-pn-av-bg]),
// each setting --pn-* custom properties that app/globals.css's poker night section reads. The
// (play) layout injects it once. So no .tsx file holds a colour: the DOM carries ids, whitelisted
// here before they reach an attribute (sceneFor, feltFor, cardBackFor), and the CSS does the rest.
//
// Values are literals only — 6-digit hex, rgba(), the app's own var(--…) tokens, and gradients of
// them — never a url(), an expression, an @import or a '<' (which could close the <style> tag);
// lib/poker-night/__tests__/looks.test.ts checks that, and the contrast of everything read as text.
//
// P3 ships the default scene (casino-classic) and my-theme, which follows the app's own palette,
// the emerald and charcoal felts, two card backs, the large card face and the classic chips. The
// rest of the ids the host may pick (lib/poker-night/config SCENE_IDS, FELT_IDS) resolve to the
// defaults until their looks arrive (P5).

import {AVATAR_COLOURS, type ColourId} from '@/lib/poker-night/avatar';
import {DENOMINATIONS, type Denomination} from '@/lib/poker-night/chips';
import {DEFAULT_SETTINGS} from '@/lib/poker-night/config';
import type {FeltId, SceneId} from '@/lib/poker-night/types';

export type Hex = `#${string}`;
// A colour a look may use: a literal, or one of the app's palette tokens (my-theme, the aero back).
export type ColourValue = Hex | `var(--${string})`;

// ── scenes ──

// sky: a CSS background, gradients only; ink and glow: the scene art's two fills (P5).
export type SceneLook = {sky: string; ink: ColourValue; glow: ColourValue; felt: FeltId};

export const SCENES = {
    // A burgundy room under a gold damask, darkening toward the corners.
    'casino-classic': {
        sky: [
            'radial-gradient(ellipse 120% 90% at 50% 40%, rgba(0,0,0,0) 0%, rgba(12,2,5,0.62) 80%)',
            'repeating-conic-gradient(from 45deg at 50% 50%, rgba(214,174,92,0.08) 0deg 90deg, rgba(0,0,0,0) 90deg 180deg) 0 0/48px 48px',
            'radial-gradient(ellipse at 50% 30%, #6d1a2e 0%, #3f0e1b 55%, #1d060c 100%)',
        ].join(', '),
        ink: '#2a0910',
        glow: '#d6ae5c',
        felt: 'emerald',
    },
    // The app's own palette: each viewer sees their theme.
    'my-theme': {
        sky: 'radial-gradient(ellipse at 50% 30%, var(--surface-2) 0%, var(--bg) 75%)',
        ink: 'var(--surface-3)',
        glow: 'var(--brand)',
        felt: 'charcoal',
    },
} as const satisfies Partial<Record<SceneId, SceneLook>>;

export type LookSceneId = keyof typeof SCENES;
export const LOOK_SCENE_IDS = Object.keys(SCENES) as LookSceneId[];
export const DEFAULT_SCENE: LookSceneId = 'casino-classic';

// ── felts ──

// felt and light: the cloth's two tones; line: the printed betting line; rail and railLight: the
// padded edge; onFelt: text printed on the cloth (≥ 4.5:1 on both tones); onFeltSoft: quieter
// text and marks (≥ 3:1 on the cloth).
export type FeltLook = {felt: Hex; light: Hex; line: string; rail: Hex; railLight: Hex; onFelt: Hex; onFeltSoft: Hex};

export const FELTS = {
    emerald: {felt: '#0e5c3c', light: '#167a50', line: 'rgba(245,241,227,0.22)', rail: '#3a2417', railLight: '#5c3b25', onFelt: '#f5f1e3', onFeltSoft: '#bcd3c4'},
    charcoal: {felt: '#2a2e33', light: '#3b4148', line: 'rgba(242,242,240,0.18)', rail: '#121416', railLight: '#2b2f34', onFelt: '#f2f2f0', onFeltSoft: '#b7bcc2'},
} as const satisfies Partial<Record<FeltId, FeltLook>>;

export type LookFeltId = keyof typeof FELTS;
export const LOOK_FELT_IDS = Object.keys(FELTS) as LookFeltId[];
export const DEFAULT_FELT: LookFeltId = 'emerald';

// ── cards ──

// base: the back's ground; pattern: gradients laid over it; edge: its border.
export type CardBackLook = {base: ColourValue; pattern: string; edge: ColourValue};

const lattice = (alpha: number): string =>
    `repeating-linear-gradient(45deg, rgba(255,255,255,${alpha}) 0 2px, rgba(0,0,0,0) 2px 7px), repeating-linear-gradient(-45deg, rgba(255,255,255,${alpha}) 0 2px, rgba(0,0,0,0) 2px 7px)`;

export const CARD_BACKS = {
    'classic-red': {base: '#b0122b', pattern: lattice(0.16), edge: '#fbfaf6'},
    'classic-blue': {base: '#1d4fc4', pattern: lattice(0.16), edge: '#fbfaf6'},
} as const satisfies Record<string, CardBackLook>;

export type CardBackId = keyof typeof CARD_BACKS;
export const CARD_BACK_IDS = Object.keys(CARD_BACKS) as CardBackId[];
export const DEFAULT_CARD_BACK: CardBackId = 'classic-red';

// The faces: 'large' prints a big corner index (the default, readable on a phone), 'classic' a
// small one with a centre pip. The CSS for both is app/globals.css's [data-pn-face] rules.
export const CARD_FACE_IDS = ['large', 'classic'] as const;
export type CardFaceId = (typeof CARD_FACE_IDS)[number];
export const DEFAULT_CARD_FACE: CardFaceId = 'large';

// The card's paper and the suits printed on it, by lib/poker/cards' suit letter. Two colours: black
// and red; four: clubs green and diamonds blue. The glyph is always printed, so colour is never the
// only cue.
export const CARD_PAPER: Hex = '#fbfaf6';
export const SUIT_LETTERS = ['c', 'd', 'h', 's'] as const;
export type SuitLetter = (typeof SUIT_LETTERS)[number];
export type SuitColours = Record<SuitLetter, Hex>;
export const SUIT_COLOURS = {
    two: {c: '#1d1d1f', d: '#c8102e', h: '#c8102e', s: '#1d1d1f'},
    four: {c: '#18733a', d: '#1d4fc4', h: '#c8102e', s: '#1d1d1f'},
} as const satisfies Record<'two' | 'four', SuitColours>;
export type SuitColourId = keyof typeof SUIT_COLOURS;

// ── chips ──

// face: the chip; edge: its stripes; ink: anything printed on it (≥ 3:1 on the face).
export type ChipLook = {face: Hex; edge: Hex; ink: Hex};

export const CHIP_SETS = {
    classic: {
        1: {face: '#f4f4f4', edge: '#1d4fc4', ink: '#1a1a1a'},
        5: {face: '#c62828', edge: '#fbfaf6', ink: '#ffffff'},
        25: {face: '#1e7d3a', edge: '#fbfaf6', ink: '#ffffff'},
        100: {face: '#202124', edge: '#fbfaf6', ink: '#ffffff'},
        500: {face: '#6a1b9a', edge: '#fbfaf6', ink: '#ffffff'},
        1000: {face: '#f2a900', edge: '#1a1a1a', ink: '#1a1a1a'},
        5000: {face: '#8d5524', edge: '#fbfaf6', ink: '#ffffff'},
        25000: {face: '#7cc7e8', edge: '#1a1a1a', ink: '#1a1a1a'},
    },
} as const satisfies Record<string, Record<Denomination, ChipLook>>;

export type ChipSetId = keyof typeof CHIP_SETS;
export const CHIP_SET_IDS = Object.keys(CHIP_SETS) as ChipSetId[];
export const DEFAULT_CHIP_SET: ChipSetId = 'classic';

// ── avatars ──

// Each avatar colour (lib/poker-night/avatar AVATAR_COLOURS): the disc's fill and the ring a
// framed avatar draws in it.
export const AVATAR_COLOUR_VALUES = {
    tangerine: {bg: '#ff9f43', ring: '#c46a12'},
    lemon: {bg: '#ffd93d', ring: '#b89400'},
    lime: {bg: '#a3e635', ring: '#5f8f12'},
    mint: {bg: '#5eead4', ring: '#14a08a'},
    sky: {bg: '#7dd3fc', ring: '#1d8fc4'},
    ocean: {bg: '#3b82f6', ring: '#1d4fb8'},
    grape: {bg: '#a78bfa', ring: '#6d4fd1'},
    berry: {bg: '#db2777', ring: '#99164f'},
    rose: {bg: '#fb7185', ring: '#c43b52'},
    coral: {bg: '#ff7f6e', ring: '#c4483a'},
    sand: {bg: '#e7c9a0', ring: '#a8865a'},
    slate: {bg: '#64748b', ring: '#334155'},
} as const satisfies Record<ColourId, {bg: Hex; ring: Hex}>;

// ── ids from the outside world ──

const has = <T extends object>(registry: T, id: unknown): id is keyof T =>
    typeof id === 'string' && Object.prototype.hasOwnProperty.call(registry, id);

// A scene, felt, back or chip set id fit for a data attribute: the id when the registry has it,
// else the default. Never throws, whatever the input.
export const sceneFor = (id: unknown): LookSceneId => (has(SCENES, id) ? id : DEFAULT_SCENE);
export const feltFor = (id: unknown): LookFeltId => (has(FELTS, id) ? id : DEFAULT_FELT);
export const cardBackFor = (id: unknown): CardBackId => (has(CARD_BACKS, id) ? id : DEFAULT_CARD_BACK);
export const chipSetFor = (id: unknown): ChipSetId => (has(CHIP_SETS, id) ? id : DEFAULT_CHIP_SET);
export const avatarColourFor = (id: unknown): ColourId => ((AVATAR_COLOURS as readonly unknown[]).includes(id) ? (id as ColourId) : 'tangerine');

export type TableLook = {scene: LookSceneId; felt: LookFeltId};

// The table's look from the room's settings, field by field. A felt the registry lacks falls back
// on the scene's own felt, then the default.
export const resolveTableLook = (settings: {scene?: unknown; felt?: unknown} | null | undefined): TableLook => {
    const scene = sceneFor(settings?.scene ?? DEFAULT_SETTINGS.scene);
    const asked = settings?.felt;
    const felt = has(FELTS, asked) ? asked : feltFor(SCENES[scene].felt);
    return {scene, felt};
};

// ── the CSS ──

const block = (selector: string, vars: Record<string, string>): string =>
    `${selector}{${Object.entries(vars).map(([name, value]) => `--pn-${name}:${value}`).join(';')}}`;

export const buildLooksCss = (): string => [
    ...LOOK_SCENE_IDS.map((id) => {
        const s: SceneLook = SCENES[id];
        return block(`[data-pn-scene="${id}"]`, {sky: s.sky, ink: s.ink, glow: s.glow});
    }),
    ...LOOK_FELT_IDS.map((id) => {
        const f: FeltLook = FELTS[id];
        return block(`[data-pn-felt="${id}"]`, {
            felt: f.felt, 'felt-light': f.light, 'felt-line': f.line, rail: f.rail, 'rail-light': f.railLight, 'on-felt': f.onFelt, 'on-felt-soft': f.onFeltSoft,
        });
    }),
    ...CARD_BACK_IDS.map((id) => {
        const b: CardBackLook = CARD_BACKS[id];
        return block(`[data-pn-back="${id}"]`, {'back-base': b.base, 'back-pattern': b.pattern, 'back-edge': b.edge});
    }),
    ...(Object.keys(SUIT_COLOURS) as SuitColourId[]).map((id) => {
        const c: SuitColours = SUIT_COLOURS[id];
        return block(`[data-pn-colours="${id}"]`, {'card-paper': CARD_PAPER, 'suit-c': c.c, 'suit-d': c.d, 'suit-h': c.h, 'suit-s': c.s});
    }),
    ...CHIP_SET_IDS.flatMap((set) => DENOMINATIONS.map((denom) => {
        const c: ChipLook = CHIP_SETS[set][denom];
        return block(`[data-pn-chips="${set}"] [data-denom="${denom}"]`, {'chip-face': c.face, 'chip-edge': c.edge, 'chip-ink': c.ink});
    })),
    ...AVATAR_COLOURS.map((id) => block(`[data-pn-av-bg="${id}"]`, {'av-bg': AVATAR_COLOUR_VALUES[id].bg, 'av-ring': AVATAR_COLOUR_VALUES[id].ring})),
].join('\n');

// Built once at module load; the (play) layout renders this constant, never user input.
export const LOOKS_CSS = buildLooksCss();
