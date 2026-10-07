// How a poker night table looks: the scene behind it, the felt, the card backs and faces, the suit
// colours, the chip sets and the avatar colours — every colour the table draws, as literals in one
// pure registry. buildLooksCss renders it into LOOKS_CSS, the way lib/theme/palettes.buildPaletteCss
// renders the palettes: data-attribute selectors only ([data-pn-scene="casino-classic"],
// [data-pn-felt], [data-pn-back], [data-pn-colours], [data-pn-chips] [data-denom], [data-pn-av-bg]),
// each setting --pn-* custom properties that app/globals.css's poker night section reads. The
// (play) layout and the lobby inject it once. So no .tsx file holds a colour: the DOM carries ids,
// whitelisted here before they reach an attribute (sceneFor, feltFor, cardBackFor, …), and the CSS
// does the rest.
//
// Values are literals only — 6-digit hex, rgba(), the app's own var(--…) tokens, and gradients of
// them — never a url(), an expression, an @import or a '<' (which could close the <style> tag);
// lib/poker-night/__tests__/looks.test.ts checks that, and the contrast of everything read as text.
//
// Who picks what: the host picks the scene and the felt for everyone (the room's settings, applied
// at once); each player picks their card back, card face, suit colours and chip set for their own
// eyes (lib/poker-night/personal). A scene names the felt it opens with and the art and ambient
// loop components/poker-night/SceneArt draws over its sky, in the scene's two inks (--pn-ink, the
// silhouettes; --pn-glow, the lights). Every id's name is lib/learn/copy/poker-night LOOKS_COPY.

import {AVATAR_COLOURS, type ColourId} from '@/lib/poker-night/avatar';
import {DENOMINATIONS, type Denomination} from '@/lib/poker-night/chips';
import {DEFAULT_SETTINGS, FELT_IDS, SCENE_IDS} from '@/lib/poker-night/config';
import type {FeltId, SceneId} from '@/lib/poker-night/types';

export type Hex = `#${string}`;
// A colour a look may use: a literal, or one of the app's palette tokens (my-theme, the aero back).
export type ColourValue = Hex | `var(--${string})`;

// ── scenes ──

// What SceneArt draws over a scene's sky, and the loop that moves it (none for a still scene).
export const SCENE_ARTS = ['chandelier', 'lamps', 'skyline', 'palms', 'planets', 'fireplace', 'bulbs', 'none'] as const;
export type SceneArtId = (typeof SCENE_ARTS)[number];
export const AMBIENTS = ['none', 'twinkle', 'drift', 'flicker', 'waves'] as const;
export type AmbientId = (typeof AMBIENTS)[number];

// sky: a CSS background, gradients only; ink and glow: the art's two fills; art and ambient: what
// SceneArt draws and how it moves; felt: the felt the scene opens with when the host picks it;
// light: the one daylight scene, whose art reads dark on light.
export type SceneLook = {sky: string; ink: ColourValue; glow: ColourValue; art: SceneArtId; ambient: AmbientId; felt: FeltId; light: boolean};

const layers = (...list: string[]): string => list.join(', ');

// A field of tiny stars repeating every `tile` px, each star a dot at (x, y) inside the tile.
const stars = (tile: number, alpha: number, dots: readonly (readonly [x: number, y: number, r: number])[]): string =>
    dots.map(([x, y, r]) => `radial-gradient(circle at ${x}px ${y}px, rgba(255,255,255,${alpha}) 0 ${r}px, rgba(0,0,0,0) ${Number((r + 0.6).toFixed(2))}px) 0 0/${tile}px ${tile}px`).join(', ');

export const SCENES = {
    // A burgundy room under a gold damask, darkening toward the corners; a chandelier above.
    'casino-classic': {
        sky: layers(
            'radial-gradient(ellipse 120% 90% at 50% 40%, rgba(0,0,0,0) 0%, rgba(12,2,5,0.62) 80%)',
            'repeating-conic-gradient(from 45deg at 50% 50%, rgba(214,174,92,0.08) 0deg 90deg, rgba(0,0,0,0) 90deg 180deg) 0 0/48px 48px',
            'radial-gradient(ellipse at 50% 30%, #6d1a2e 0%, #3f0e1b 55%, #1d060c 100%)',
        ),
        ink: '#2a0910',
        glow: '#d6ae5c',
        art: 'chandelier',
        ambient: 'none',
        felt: 'emerald',
        light: false,
    },
    // Navy and plum under one warm spotlight; two floor lamps and a slow haze.
    'midnight-lounge': {
        sky: layers(
            'radial-gradient(ellipse 55% 42% at 50% -4%, rgba(255,196,120,0.32) 0%, rgba(0,0,0,0) 72%)',
            'radial-gradient(ellipse 120% 90% at 50% 45%, rgba(0,0,0,0) 35%, rgba(5,3,14,0.7) 100%)',
            'linear-gradient(180deg, #1a1638 0%, #2a1842 55%, #0d0a1c 100%)',
        ),
        ink: '#0a0818',
        glow: '#ffc478',
        art: 'lamps',
        ambient: 'drift',
        felt: 'burgundy',
        light: false,
    },
    // A violet night over a pink and cyan grid; a skyline whose windows flicker.
    'neon-city': {
        sky: layers(
            'repeating-linear-gradient(90deg, rgba(0,229,255,0.16) 0 1px, rgba(0,0,0,0) 1px 64px) 0 100%/100% 30% no-repeat',
            'repeating-linear-gradient(180deg, rgba(255,59,212,0.22) 0 1px, rgba(0,0,0,0) 1px 24px) 0 100%/100% 30% no-repeat',
            'radial-gradient(ellipse 90% 30% at 50% 72%, rgba(255,59,212,0.35) 0%, rgba(0,0,0,0) 70%)',
            'linear-gradient(180deg, #0c0420 0%, #2b0b52 45%, #4a1070 70%, #12042a 100%)',
        ),
        ink: '#0d0420',
        glow: '#ff3bd4',
        art: 'skyline',
        ambient: 'flicker',
        felt: 'charcoal',
        light: false,
    },
    // Orange into coral into plum, the sun half in the sea; palms at the edges, the waves rolling.
    'beach-sunset': {
        sky: layers(
            'linear-gradient(180deg, rgba(0,0,0,0) 0 66%, #2c3e6e 66%, #1b2547 100%)',
            'radial-gradient(circle at 50% 66%, #ffe08a 0 8%, rgba(255,200,120,0.55) 10%, rgba(0,0,0,0) 26%)',
            'linear-gradient(180deg, #ff9a3c 0%, #ff6f61 34%, #b54a78 58%, #6a2f68 66%)',
        ),
        ink: '#2a1530',
        glow: '#ffd27a',
        art: 'palms',
        ambient: 'waves',
        felt: 'teal',
        light: false,
    },
    // Two nebulae in deep blue, stars on stars; planets in the corners, the stars twinkling.
    'deep-space': {
        sky: layers(
            stars(97, 0.8, [[12, 18, 0.9], [61, 44, 0.7], [33, 80, 1.1], [84, 9, 0.6]]),
            stars(151, 0.55, [[40, 120, 0.8], [118, 30, 1], [90, 88, 0.6]]),
            'radial-gradient(ellipse 48% 38% at 20% 26%, rgba(155,60,220,0.42) 0%, rgba(0,0,0,0) 70%)',
            'radial-gradient(ellipse 44% 34% at 82% 72%, rgba(40,120,220,0.38) 0%, rgba(0,0,0,0) 70%)',
            'linear-gradient(180deg, #05060f 0%, #0b0a1f 60%, #070614 100%)',
        ),
        ink: '#2b2160',
        glow: '#9fd4ff',
        art: 'planets',
        ambient: 'twinkle',
        felt: 'violet',
        light: false,
    },
    // Pine planks and firelight from below; a stone fireplace whose flames flicker.
    'log-cabin': {
        sky: layers(
            'radial-gradient(ellipse 85% 60% at 15% 100%, rgba(255,140,40,0.34) 0%, rgba(0,0,0,0) 70%)',
            'radial-gradient(ellipse 120% 90% at 50% 45%, rgba(0,0,0,0) 38%, rgba(10,5,2,0.72) 100%)',
            'repeating-linear-gradient(90deg, #5a3a22 0 46px, #3c2616 46px 48px, #63402a 48px 94px, #3c2616 94px 96px)',
        ),
        ink: '#1e120a',
        glow: '#ffa040',
        art: 'fireplace',
        ambient: 'flicker',
        felt: 'emerald',
        light: false,
    },
    // Daylight: a blue sky over a lawn, string lights across the top — the one light scene.
    'garden-party': {
        sky: layers(
            'radial-gradient(ellipse 70% 40% at 80% 8%, rgba(255,255,255,0.7) 0%, rgba(0,0,0,0) 70%)',
            'linear-gradient(180deg, #8fd3ff 0%, #c8ecff 46%, #e4f6d4 58%, #8cc874 61%, #4f9a45 100%)',
        ),
        ink: '#2f5d2a',
        glow: '#ffd84d',
        art: 'bulbs',
        ambient: 'twinkle',
        felt: 'emerald',
        light: true,
    },
    // The app's own palette: each viewer sees their theme. No art.
    'my-theme': {
        sky: 'radial-gradient(ellipse at 50% 30%, var(--surface-2) 0%, var(--bg) 75%)',
        ink: 'var(--surface-3)',
        glow: 'var(--brand)',
        art: 'none',
        ambient: 'none',
        felt: 'charcoal',
        light: false,
    },
} as const satisfies Record<SceneId, SceneLook>;

export type LookSceneId = SceneId;
export const LOOK_SCENE_IDS: readonly SceneId[] = SCENE_IDS;
export const DEFAULT_SCENE: SceneId = 'casino-classic';

// ── felts ──

// felt and light: the cloth's two tones; line: the printed betting line; rail and railLight: the
// padded edge; onFelt: text printed on the cloth (≥ 4.5:1 on both tones); onFeltSoft: quieter
// text and marks (≥ 3:1 on both tones).
export type FeltLook = {felt: Hex; light: Hex; line: string; rail: Hex; railLight: Hex; onFelt: Hex; onFeltSoft: Hex};

export const FELTS = {
    emerald: {felt: '#0e5c3c', light: '#167a50', line: 'rgba(245,241,227,0.22)', rail: '#3a2417', railLight: '#5c3b25', onFelt: '#f5f1e3', onFeltSoft: '#bcd3c4'},
    'royal-blue': {felt: '#14367a', light: '#1f4ea6', line: 'rgba(240,244,255,0.22)', rail: '#1b1410', railLight: '#3a2a1e', onFelt: '#f2f5ff', onFeltSoft: '#bccaec'},
    burgundy: {felt: '#5c1023', light: '#7a1a33', line: 'rgba(250,236,240,0.2)', rail: '#24130c', railLight: '#4a2a18', onFelt: '#fbeef1', onFeltSoft: '#e2b6c2'},
    charcoal: {felt: '#2a2e33', light: '#3b4148', line: 'rgba(242,242,240,0.18)', rail: '#121416', railLight: '#2b2f34', onFelt: '#f2f2f0', onFeltSoft: '#b7bcc2'},
    violet: {felt: '#3b1d6e', light: '#512a92', line: 'rgba(243,238,255,0.2)', rail: '#120c1e', railLight: '#2c2142', onFelt: '#f3eeff', onFeltSoft: '#c9b9ec'},
    teal: {felt: '#0b5257', light: '#116c73', line: 'rgba(236,251,251,0.2)', rail: '#2b1d14', railLight: '#4d3524', onFelt: '#ecfbfb', onFeltSoft: '#a9d6d8'},
    tangerine: {felt: '#7a3209', light: '#94400f', line: 'rgba(255,244,234,0.22)', rail: '#2a160b', railLight: '#4f2c16', onFelt: '#fff4ea', onFeltSoft: '#f3c9a8'},
    rose: {felt: '#78213f', light: '#952c52', line: 'rgba(255,240,245,0.2)', rail: '#2a1019', railLight: '#4d2232', onFelt: '#fff0f5', onFeltSoft: '#f0bccd'},
} as const satisfies Record<FeltId, FeltLook>;

export type LookFeltId = FeltId;
export const LOOK_FELT_IDS: readonly FeltId[] = FELT_IDS;
export const DEFAULT_FELT: FeltId = 'emerald';

// ── cards ──

// base: the back's ground; pattern: gradients laid over it; edge: its border.
export type CardBackLook = {base: ColourValue; pattern: string; edge: ColourValue};

const lattice = (alpha: number): string =>
    `repeating-linear-gradient(45deg, rgba(255,255,255,${alpha}) 0 2px, rgba(0,0,0,0) 2px 7px), repeating-linear-gradient(-45deg, rgba(255,255,255,${alpha}) 0 2px, rgba(0,0,0,0) 2px 7px)`;

export const CARD_BACKS = {
    'classic-red': {base: '#b0122b', pattern: lattice(0.16), edge: '#fbfaf6'},
    'classic-blue': {base: '#1d4fc4', pattern: lattice(0.16), edge: '#fbfaf6'},
    // The app's own colours: its brand on its darkest surface, so it follows the viewer's theme.
    aero: {
        base: 'var(--surface-1)',
        pattern: layers(
            'radial-gradient(circle at 50% 50%, var(--brand) 0 9%, rgba(0,0,0,0) 10%)',
            'repeating-linear-gradient(135deg, rgba(0,0,0,0) 0 6px, var(--surface-3) 6px 8px)',
        ),
        edge: 'var(--brand)',
    },
    checker: {base: '#1d1d1f', pattern: 'repeating-conic-gradient(rgba(242,239,230,0.92) 0deg 90deg, rgba(0,0,0,0) 90deg 180deg) 0 0/10px 10px', edge: '#fbfaf6'},
    starfield: {
        base: '#0b1033',
        pattern: layers(
            'radial-gradient(circle at 3px 3px, rgba(255,255,255,0.95) 0 1px, rgba(0,0,0,0) 1.6px) 0 0/9px 9px',
            'radial-gradient(circle at 9px 10px, rgba(255,226,150,0.8) 0 0.8px, rgba(0,0,0,0) 1.4px) 0 0/13px 13px',
            'radial-gradient(ellipse 70% 50% at 30% 30%, rgba(140,90,230,0.45) 0%, rgba(0,0,0,0) 70%)',
        ),
        edge: '#e9e4ff',
    },
    waves: {
        base: '#0e6f8a',
        pattern: 'radial-gradient(circle at 50% 0, rgba(0,0,0,0) 0 4px, rgba(255,255,255,0.4) 4px 5.5px, rgba(0,0,0,0) 6px) 0 0/12px 8px',
        edge: '#f2fbff',
    },
    'neon-grid': {
        base: '#14062b',
        pattern: layers(
            'repeating-linear-gradient(0deg, rgba(255,59,212,0.75) 0 1px, rgba(0,0,0,0) 1px 8px)',
            'repeating-linear-gradient(90deg, rgba(0,229,255,0.75) 0 1px, rgba(0,0,0,0) 1px 8px)',
        ),
        edge: '#ff3bd4',
    },
    tartan: {
        base: '#1f4d2b',
        pattern: layers(
            'repeating-linear-gradient(90deg, rgba(200,16,46,0.5) 0 3px, rgba(0,0,0,0) 3px 12px)',
            'repeating-linear-gradient(0deg, rgba(200,16,46,0.5) 0 3px, rgba(0,0,0,0) 3px 12px)',
            'repeating-linear-gradient(90deg, rgba(0,0,0,0) 0 7px, rgba(255,215,0,0.4) 7px 8px, rgba(0,0,0,0) 8px 12px)',
            'repeating-linear-gradient(0deg, rgba(0,0,0,0) 0 7px, rgba(255,215,0,0.4) 7px 8px, rgba(0,0,0,0) 8px 12px)',
        ),
        edge: '#f4e9c8',
    },
} as const satisfies Record<string, CardBackLook>;

export type CardBackId = keyof typeof CARD_BACKS;
export const CARD_BACK_IDS = Object.keys(CARD_BACKS) as CardBackId[];
export const DEFAULT_CARD_BACK: CardBackId = 'classic-red';

// The faces: 'large' prints a big corner index (the default, readable on a phone), 'classic' a
// small index in two corners with a pip in the middle. The CSS for both is app/globals.css's
// [data-pn-face] rules.
export const CARD_FACE_IDS = ['classic', 'large'] as const;
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

// face: the chip; edge: its stripes; ink: anything printed on it (≥ 3:1 on the face). Within a
// set every denomination has a face of its own; the amount is always printed beside a stack.
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
    pastel: {
        1: {face: '#fdfcf7', edge: '#a8c5f0', ink: '#3a3a3a'},
        5: {face: '#f7a8b8', edge: '#fffaf5', ink: '#4a1020'},
        25: {face: '#a8e6c4', edge: '#fffaf5', ink: '#0f3d25'},
        100: {face: '#b8c0cc', edge: '#fffaf5', ink: '#1f2630'},
        500: {face: '#cdb4f5', edge: '#fffaf5', ink: '#2e1a52'},
        1000: {face: '#fde68a', edge: '#c9a227', ink: '#4a3500'},
        5000: {face: '#f5c6a5', edge: '#fffaf5', ink: '#4a2a12'},
        25000: {face: '#a5e3f5', edge: '#fffaf5', ink: '#0b3a4a'},
    },
    neon: {
        1: {face: '#e8fffd', edge: '#00e5ff', ink: '#00303a'},
        5: {face: '#ff2d75', edge: '#ffe600', ink: '#ffffff'},
        25: {face: '#39ff14', edge: '#0a0a0a', ink: '#0a2a00'},
        100: {face: '#12002b', edge: '#00e5ff', ink: '#ff3bd4'},
        500: {face: '#b026ff', edge: '#39ff14', ink: '#ffffff'},
        1000: {face: '#ffe600', edge: '#ff2d75', ink: '#1a1a00'},
        5000: {face: '#ff7a00', edge: '#00e5ff', ink: '#1a0a00'},
        25000: {face: '#00e5ff', edge: '#ff2d75', ink: '#001a20'},
    },
    mono: {
        1: {face: '#f5f5f5', edge: '#1a1a1a', ink: '#1a1a1a'},
        5: {face: '#d6d6d6', edge: '#1a1a1a', ink: '#1a1a1a'},
        25: {face: '#b5b5b5', edge: '#1a1a1a', ink: '#111111'},
        100: {face: '#939393', edge: '#f5f5f5', ink: '#111111'},
        500: {face: '#707070', edge: '#f5f5f5', ink: '#ffffff'},
        1000: {face: '#545454', edge: '#f5f5f5', ink: '#ffffff'},
        5000: {face: '#383838', edge: '#d6d6d6', ink: '#ffffff'},
        25000: {face: '#1c1c1c', edge: '#b5b5b5', ink: '#ffffff'},
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

const inList = <T extends string>(list: readonly T[], id: unknown): id is T => typeof id === 'string' && (list as readonly string[]).includes(id);

// A scene, felt, back, face or chip set id fit for a data attribute: the id when the registry has
// it, else the default. Never throws, whatever the input.
export const sceneFor = (id: unknown): SceneId => (has(SCENES, id) ? id : DEFAULT_SCENE);
export const feltFor = (id: unknown): FeltId => (has(FELTS, id) ? id : DEFAULT_FELT);
export const cardBackFor = (id: unknown): CardBackId => (has(CARD_BACKS, id) ? id : DEFAULT_CARD_BACK);
export const cardFaceFor = (id: unknown): CardFaceId => (inList(CARD_FACE_IDS, id) ? id : DEFAULT_CARD_FACE);
export const chipSetFor = (id: unknown): ChipSetId => (has(CHIP_SETS, id) ? id : DEFAULT_CHIP_SET);
export const avatarColourFor = (id: unknown): ColourId => (inList(AVATAR_COLOURS, id) ? id : 'tangerine');

export const isSceneId = (id: unknown): id is SceneId => has(SCENES, id);
export const isFeltId = (id: unknown): id is FeltId => has(FELTS, id);

export type TableLook = {scene: SceneId; felt: FeltId};
export const DEFAULT_TABLE_LOOK: Readonly<TableLook> = Object.freeze({scene: DEFAULT_SCENE, felt: DEFAULT_FELT});

// The table's look from the room's settings (or a host's saved default), field by field. A felt the
// registry lacks falls back on the scene's own felt.
export const resolveTableLook = (settings: {scene?: unknown; felt?: unknown} | null | undefined): TableLook => {
    const scene = sceneFor(settings?.scene ?? DEFAULT_SETTINGS.scene);
    const asked = settings?.felt;
    const felt = has(FELTS, asked) ? asked : SCENES[scene].felt;
    return {scene, felt};
};

// What the host's settings patch is when they pick a scene: the scene with the felt it opens with.
export const scenePatch = (scene: SceneId): TableLook => ({scene, felt: SCENES[scene].felt});

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

// Built once at module load; the (play) layout and the lobby render this constant, never user input.
export const LOOKS_CSS = buildLooksCss();
