// The looks' registry and the CSS it renders: every scene and felt the room's settings allow has a
// look, every id resolved through a whitelist, the generated CSS safe to drop inside a <style> tag
// (literals only: no url(), expression, @import or '<', every hex six digits), one block per id, and
// the colours read as text holding their contrast — lib/theme/color.contrastRatio, the same measure
// the palettes are held to: on-felt 4.5:1 and the soft ink 3:1 on both tones of every felt, every
// suit 4.5:1 on the paper with four different inks in the four-colour deck, every chip's ink 3:1.

import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import {contrastRatio, isHex6} from '@/lib/theme/color';
import {AVATAR_COLOURS} from '@/lib/poker-night/avatar';
import {DENOMINATIONS} from '@/lib/poker-night/chips';
import {DEFAULT_SETTINGS, FELT_IDS, SCENE_IDS} from '@/lib/poker-night/config';
import {
    AMBIENTS, AVATAR_COLOUR_VALUES, avatarColourFor, buildLooksCss, CARD_BACK_IDS, CARD_BACKS, CARD_FACE_IDS, CARD_PAPER, cardBackFor, cardFaceFor, CHIP_SET_IDS,
    CHIP_SETS, chipSetFor, DEFAULT_CARD_BACK, DEFAULT_CARD_FACE, DEFAULT_CHIP_SET, DEFAULT_FELT, DEFAULT_SCENE, DEFAULT_TABLE_LOOK, feltFor, FELTS, isFeltId,
    isSceneId, LOOK_FELT_IDS, LOOK_SCENE_IDS, LOOKS_CSS, resolveTableLook, SCENE_ARTS, sceneFor, scenePatch, SCENES, SUIT_COLOURS, SUIT_LETTERS,
} from '@/lib/poker-night/looks';

describe('the registries', () => {
    it('hold a look for every scene and felt the room settings allow, the defaults first among them', () => {
        expect(Object.keys(SCENES).sort()).toEqual([...SCENE_IDS].sort());
        expect(Object.keys(FELTS).sort()).toEqual([...FELT_IDS].sort());
        expect(LOOK_SCENE_IDS).toEqual(SCENE_IDS);
        expect(LOOK_FELT_IDS).toEqual(FELT_IDS);
        expect(DEFAULT_SCENE).toBe(DEFAULT_SETTINGS.scene);
        expect(DEFAULT_FELT).toBe(DEFAULT_SETTINGS.felt);
        expect(DEFAULT_TABLE_LOOK).toEqual({scene: 'casino-classic', felt: 'emerald'});
        expect(SCENE_IDS).toHaveLength(8);
        expect(FELT_IDS).toHaveLength(8);
    });

    it('give each scene its art, its loop and the felt it opens with (the design\'s table)', () => {
        const table = Object.fromEntries(LOOK_SCENE_IDS.map((id) => [id, [SCENES[id].art, SCENES[id].ambient, SCENES[id].felt]]));
        expect(table).toEqual({
            'casino-classic': ['chandelier', 'none', 'emerald'],
            'midnight-lounge': ['lamps', 'drift', 'burgundy'],
            'neon-city': ['skyline', 'flicker', 'charcoal'],
            'beach-sunset': ['palms', 'waves', 'teal'],
            'deep-space': ['planets', 'twinkle', 'violet'],
            'log-cabin': ['fireplace', 'flicker', 'emerald'],
            'garden-party': ['bulbs', 'twinkle', 'emerald'],
            'my-theme': ['none', 'none', 'charcoal'],
        });
        for (const id of LOOK_SCENE_IDS) {
            expect(SCENE_ARTS).toContain(SCENES[id].art);
            expect(AMBIENTS).toContain(SCENES[id].ambient);
        }
        // Exactly one daylight scene.
        expect(LOOK_SCENE_IDS.filter((id) => SCENES[id].light)).toEqual(['garden-party']);
        // my-theme follows the viewer's palette.
        expect(SCENES['my-theme'].ink).toBe('var(--surface-3)');
        expect(SCENES['my-theme'].glow).toBe('var(--brand)');
    });

    it('list eight card backs, two faces, two suit schemes and four chip sets', () => {
        expect(CARD_BACK_IDS).toEqual(['classic-red', 'classic-blue', 'aero', 'checker', 'starfield', 'waves', 'neon-grid', 'tartan']);
        expect([...CARD_FACE_IDS]).toEqual(['classic', 'large']);
        expect(DEFAULT_CARD_FACE).toBe('large');
        expect(Object.keys(SUIT_COLOURS)).toEqual(['two', 'four']);
        expect(CHIP_SET_IDS).toEqual(['classic', 'pastel', 'neon', 'mono']);
        expect(CARD_BACKS.aero.base).toBe('var(--surface-1)');
        expect(CARD_BACKS.aero.edge).toBe('var(--brand)');
    });

    it('cover every avatar colour and every chip denomination', () => {
        expect(Object.keys(AVATAR_COLOUR_VALUES).sort()).toEqual([...AVATAR_COLOURS].sort());
        for (const set of CHIP_SET_IDS) expect(Object.keys(CHIP_SETS[set]).map(Number).sort((a, b) => a - b)).toEqual([...DENOMINATIONS]);
    });
});

describe('ids from outside', () => {
    const BAD = [undefined, null, 7, '', 'casino', '"]{}<style>', 'constructor', '__proto__', 'toString', {}, ['emerald']];

    it('come back as themselves when known, else as the default — never a throw', () => {
        for (const id of LOOK_SCENE_IDS) expect(sceneFor(id)).toBe(id);
        for (const id of LOOK_FELT_IDS) expect(feltFor(id)).toBe(id);
        for (const id of CARD_BACK_IDS) expect(cardBackFor(id)).toBe(id);
        for (const id of CARD_FACE_IDS) expect(cardFaceFor(id)).toBe(id);
        for (const id of CHIP_SET_IDS) expect(chipSetFor(id)).toBe(id);
        for (const id of AVATAR_COLOURS) expect(avatarColourFor(id)).toBe(id);
        for (const bad of BAD) {
            expect(sceneFor(bad)).toBe(DEFAULT_SCENE);
            expect(feltFor(bad)).toBe(DEFAULT_FELT);
            expect(cardBackFor(bad)).toBe(DEFAULT_CARD_BACK);
            expect(cardFaceFor(bad)).toBe(DEFAULT_CARD_FACE);
            expect(chipSetFor(bad)).toBe(DEFAULT_CHIP_SET);
            expect(avatarColourFor(bad)).toBe('tangerine');
            expect(isSceneId(bad)).toBe(false);
            expect(isFeltId(bad)).toBe(false);
        }
    });

    it('resolve a table look field by field, a missing felt falling back on the scene\'s own', () => {
        expect(resolveTableLook(DEFAULT_SETTINGS)).toEqual({scene: 'casino-classic', felt: 'emerald'});
        expect(resolveTableLook({scene: 'my-theme', felt: 'charcoal'})).toEqual({scene: 'my-theme', felt: 'charcoal'});
        expect(resolveTableLook({scene: 'deep-space', felt: 'rose'})).toEqual({scene: 'deep-space', felt: 'rose'});
        expect(resolveTableLook({scene: 'deep-space', felt: 'plaid'})).toEqual({scene: 'deep-space', felt: 'violet'});
        expect(resolveTableLook({scene: 'moon-base', felt: 'teal'})).toEqual({scene: 'casino-classic', felt: 'teal'});
        expect(resolveTableLook({scene: 'moon-base'})).toEqual({scene: 'casino-classic', felt: 'emerald'});
        expect(resolveTableLook(null)).toEqual({scene: 'casino-classic', felt: 'emerald'});
        expect(resolveTableLook({})).toEqual({scene: 'casino-classic', felt: 'emerald'});
    });

    it('pick a scene with the felt it opens with', () => {
        for (const id of LOOK_SCENE_IDS) expect(scenePatch(id)).toEqual({scene: id, felt: SCENES[id].felt});
    });
});

describe('LOOKS_CSS', () => {
    it('is the registry rendered, the same every time, and small enough to inline', () => {
        expect(LOOKS_CSS).toBe(buildLooksCss());
        expect(LOOKS_CSS.length).toBeLessThan(20_000);
    });

    it('holds nothing that could escape a <style> tag or fetch anything', () => {
        expect(LOOKS_CSS).not.toMatch(/</);
        expect(LOOKS_CSS).not.toMatch(/>/);
        expect(LOOKS_CSS).not.toMatch(/url\s*\(/i);
        expect(LOOKS_CSS).not.toMatch(/expression/i);
        expect(LOOKS_CSS).not.toMatch(/@import/i);
        expect(LOOKS_CSS).not.toMatch(/@/);
        expect(LOOKS_CSS).not.toMatch(/\\/);
        expect(LOOKS_CSS).not.toMatch(/!important/);
        expect(LOOKS_CSS).not.toMatch(/["']\s*\)|\/\*|\*\//);
        expect(LOOKS_CSS).not.toMatch(/\d\.\d{3,}/);
    });

    it('uses only 6-digit hex, rgba(), the app\'s own tokens and gradients as values', () => {
        for (const hex of LOOKS_CSS.match(/#[0-9a-zA-Z]*/g) ?? []) expect(isHex6(hex), hex).toBe(true);
        const functions = new Set([...LOOKS_CSS.matchAll(/([a-z-]+)\(/g)].map((m) => m[1]));
        for (const fn of functions) expect(['var', 'rgba', 'radial-gradient', 'repeating-conic-gradient', 'repeating-linear-gradient', 'linear-gradient']).toContain(fn);
        for (const [, name] of LOOKS_CSS.matchAll(/var\((--[a-z0-9-]+)\)/g)) expect(name).toMatch(/^--(surface-[0-4]|bg|fg|fg-soft|fg-muted|brand|line-strong)$/);
        // The only words are CSS's own: gradient keywords, units and the background shorthand.
        const words = new Set([...LOOKS_CSS.replace(/#[0-9a-f]{6}/g, '').replace(/\[data-[^\]]+\]/g, '').replace(/--pn-[a-z-]+/g, '').replace(/var\(--[a-z0-9-]+\)/g, '')
            .matchAll(/[a-z][a-z-]*/g)].map((m) => m[0]));
        const ALLOWED = ['rgba', 'radial-gradient', 'repeating-conic-gradient', 'repeating-linear-gradient', 'linear-gradient', 'ellipse', 'circle', 'at', 'from',
            'deg', 'px', 'no-repeat'];
        for (const word of words) expect(ALLOWED, word).toContain(word);
    });

    it('is one rule per id, each a data-attribute selector setting --pn-* properties only', () => {
        const rules = LOOKS_CSS.split('\n');
        const expected = LOOK_SCENE_IDS.length + LOOK_FELT_IDS.length + CARD_BACK_IDS.length + Object.keys(SUIT_COLOURS).length
            + CHIP_SET_IDS.length * DENOMINATIONS.length + AVATAR_COLOURS.length;
        expect(rules).toHaveLength(expected);
        for (const rule of rules) {
            const m = /^((?:\[data-[a-z-]+="[a-z0-9-]+"\] ?)+)\{([^{}]+)\}$/.exec(rule);
            expect(m, rule).not.toBeNull();
            for (const declaration of m![2].split(';')) expect(declaration).toMatch(/^--pn-[a-z-]+:[^;{}]+$/);
        }
        for (const id of LOOK_SCENE_IDS) expect(LOOKS_CSS).toContain(`[data-pn-scene="${id}"]{`);
        for (const id of LOOK_FELT_IDS) expect(LOOKS_CSS).toContain(`[data-pn-felt="${id}"]{`);
        for (const id of CARD_BACK_IDS) expect(LOOKS_CSS).toContain(`[data-pn-back="${id}"]{`);
        expect(LOOKS_CSS).toContain('[data-pn-colours="two"]{');
        expect(LOOKS_CSS).toContain('[data-pn-colours="four"]{');
        for (const set of CHIP_SET_IDS) {
            for (const denom of DENOMINATIONS) expect(LOOKS_CSS).toContain(`[data-pn-chips="${set}"] [data-denom="${denom}"]{`);
        }
        for (const id of AVATAR_COLOURS) expect(LOOKS_CSS).toContain(`[data-pn-av-bg="${id}"]{`);
    });

    it('sets every property the table\'s CSS reads', () => {
        for (const name of ['sky', 'ink', 'glow', 'felt', 'felt-light', 'felt-line', 'rail', 'rail-light', 'on-felt', 'on-felt-soft', 'back-base', 'back-pattern',
            'back-edge', 'card-paper', 'suit-c', 'suit-d', 'suit-h', 'suit-s', 'chip-face', 'chip-edge', 'chip-ink', 'av-bg', 'av-ring']) {
            expect(LOOKS_CSS).toContain(`--pn-${name}:`);
        }
    });

    it('balances the brackets in every value', () => {
        for (const rule of LOOKS_CSS.split('\n')) {
            let depth = 0;
            for (const ch of rule) {
                if (ch === '(') depth++;
                if (ch === ')') depth--;
                expect(depth, rule).toBeGreaterThanOrEqual(0);
            }
            expect(depth, rule).toBe(0);
        }
    });
});

describe('contrast', () => {
    it('keeps text on the felt readable: on-felt at 4.5:1 and the soft ink at 3:1, on both tones', () => {
        for (const id of LOOK_FELT_IDS) {
            const f = FELTS[id];
            expect(contrastRatio(f.onFelt, f.felt), `${id} on-felt`).toBeGreaterThanOrEqual(4.5);
            expect(contrastRatio(f.onFelt, f.light), `${id} on-felt / light`).toBeGreaterThanOrEqual(4.5);
            expect(contrastRatio(f.onFeltSoft, f.felt), `${id} soft`).toBeGreaterThanOrEqual(3);
            expect(contrastRatio(f.onFeltSoft, f.light), `${id} soft / light`).toBeGreaterThanOrEqual(3);
        }
    });

    it('sets every felt apart from its rail', () => {
        for (const id of LOOK_FELT_IDS) expect(FELTS[id].felt, id).not.toBe(FELTS[id].rail);
        expect(new Set(LOOK_FELT_IDS.map((id) => FELTS[id].felt)).size).toBe(LOOK_FELT_IDS.length);
    });

    it('prints every suit at 4.5:1 on the paper, the four-colour deck with four different inks', () => {
        for (const id of ['two', 'four'] as const) {
            for (const suit of SUIT_LETTERS) expect(contrastRatio(SUIT_COLOURS[id][suit], CARD_PAPER), `${id} ${suit}`).toBeGreaterThanOrEqual(4.5);
        }
        expect(new Set(Object.values(SUIT_COLOURS.four)).size).toBe(4);
        expect(SUIT_COLOURS.two.c).toBe(SUIT_COLOURS.two.s);
        expect(SUIT_COLOURS.two.d).toBe(SUIT_COLOURS.two.h);
        // The four inks are told apart from each other, not only from the paper.
        const four = Object.values(SUIT_COLOURS.four);
        for (let i = 0; i < four.length; i++) {
            for (let j = i + 1; j < four.length; j++) expect(four[i], `${four[i]} ${four[j]}`).not.toBe(four[j]);
        }
    });

    it('keeps a chip\'s ink at 3:1 on its face, and every denomination a different face', () => {
        for (const set of CHIP_SET_IDS) {
            for (const denom of DENOMINATIONS) {
                const c = CHIP_SETS[set][denom];
                expect(contrastRatio(c.ink, c.face), `${set} ${denom}`).toBeGreaterThanOrEqual(3);
                expect(c.edge, `${set} ${denom} edge`).not.toBe(c.face);
            }
            expect(new Set(DENOMINATIONS.map((d) => CHIP_SETS[set][d].face)).size).toBe(DENOMINATIONS.length);
        }
    });

    it('sets a card back apart from its border', () => {
        for (const id of CARD_BACK_IDS) {
            const b = CARD_BACKS[id];
            if (isHex6(b.base) && isHex6(b.edge)) expect(contrastRatio(b.base, b.edge), id).toBeGreaterThanOrEqual(3);
        }
    });

    it('keeps each scene\'s two inks apart, so the art reads', () => {
        for (const id of LOOK_SCENE_IDS) {
            const s = SCENES[id];
            if (isHex6(s.ink) && isHex6(s.glow)) expect(contrastRatio(s.ink, s.glow), id).toBeGreaterThanOrEqual(3);
        }
    });
});

// What sits over the scene draws its own ground: an open seat straddles the rail, partly over the
// sky (garden party's is light), so it is filled with the felt and inked with the felt's tested
// colours, never a see-through tint; and a card that does not play dims without turning
// see-through, so the scene's art never shows through the paper.
describe('over the scene', () => {
    const css = readFileSync(fileURLToPath(new URL('../../../app/globals.css', import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
    const rule = (selector: string): string => {
        const at = css.indexOf(`${selector} {`);
        return at === -1 ? '' : css.slice(at, css.indexOf('}', at));
    };

    it('fills an open seat with the felt, its words and ring in the felt\'s own inks', () => {
        const seat = rule('  .pn-open-seat');
        expect(seat).toMatch(/background: var\(--pn-felt\);/);
        expect(seat).toMatch(/color: var\(--pn-on-felt\);/);
        expect(seat).toMatch(/border: 2px dashed var\(--pn-on-felt-soft\);/);
        expect(seat).not.toMatch(/rgb\(0 0 0/);
        expect(css).toMatch(/button\.pn-open-seat:hover, button\.pn-open-seat:focus-visible \{[^}]*background: var\(--pn-felt-light\);/);
        const ring = readFileSync(fileURLToPath(new URL('../../../components/poker-night/SeatRing.tsx', import.meta.url)), 'utf8');
        expect(ring).toMatch(/pn-open-seat/);
        for (const line of ring.split('\n').filter((l) => l.includes('pn-open-seat'))) expect(line, line).not.toMatch(/opacity/);
        // …which reads on every felt whatever the sky behind the seat.
        for (const id of LOOK_FELT_IDS) {
            expect(contrastRatio(FELTS[id].onFelt, FELTS[id].felt), id).toBeGreaterThanOrEqual(4.5);
            expect(contrastRatio(FELTS[id].onFeltSoft, FELTS[id].felt), id).toBeGreaterThanOrEqual(3);
        }
    });

    it('dims a card without opacity', () => {
        const dim = rule('  .pn-card[data-state="dim"] > .pn-card-inner');
        expect(dim).toMatch(/filter: brightness\(/);
        expect(dim).not.toMatch(/opacity/);
        expect(css).toMatch(/@keyframes pn-dim \{\n  from \{ filter: none; \}\n\}/);
    });
});
