// The looks' registry and the CSS it renders: every id resolved through a whitelist, the generated
// CSS safe to drop inside a <style> tag (literals only: no url(), expression, @import or '<', every
// hex six digits), one block per id, and the colours read as text holding their contrast —
// lib/theme/color.contrastRatio, the same measure the palettes are held to.

import {describe, expect, it} from 'vitest';
import {contrastRatio, isHex6} from '@/lib/theme/color';
import {AVATAR_COLOURS} from '@/lib/poker-night/avatar';
import {DENOMINATIONS} from '@/lib/poker-night/chips';
import {DEFAULT_SETTINGS, FELT_IDS, SCENE_IDS} from '@/lib/poker-night/config';
import {
    AVATAR_COLOUR_VALUES, avatarColourFor, buildLooksCss, CARD_BACK_IDS, CARD_BACKS, CARD_PAPER, cardBackFor, CHIP_SET_IDS, CHIP_SETS, chipSetFor, DEFAULT_CARD_BACK,
    DEFAULT_FELT, DEFAULT_SCENE, feltFor, FELTS, LOOK_FELT_IDS, LOOK_SCENE_IDS, LOOKS_CSS, resolveTableLook, sceneFor, SCENES, SUIT_COLOURS, SUIT_LETTERS,
} from '@/lib/poker-night/looks';

describe('the registries', () => {
    it('hold the default scene and felt, and only ids the room settings allow', () => {
        expect(LOOK_SCENE_IDS).toContain(DEFAULT_SETTINGS.scene);
        expect(LOOK_FELT_IDS).toContain(DEFAULT_SETTINGS.felt);
        expect(DEFAULT_SCENE).toBe(DEFAULT_SETTINGS.scene);
        expect(DEFAULT_FELT).toBe(DEFAULT_SETTINGS.felt);
        for (const id of LOOK_SCENE_IDS) expect(SCENE_IDS as readonly string[]).toContain(id);
        for (const id of LOOK_FELT_IDS) expect(FELT_IDS as readonly string[]).toContain(id);
        // P3: the casino and the app's own theme; emerald and charcoal.
        expect([...LOOK_SCENE_IDS].sort()).toEqual(['casino-classic', 'my-theme']);
        expect([...LOOK_FELT_IDS].sort()).toEqual(['charcoal', 'emerald']);
        for (const id of LOOK_SCENE_IDS) expect(LOOK_FELT_IDS).toContain(SCENES[id].felt);
    });

    it('cover every avatar colour and every chip denomination', () => {
        expect(Object.keys(AVATAR_COLOUR_VALUES).sort()).toEqual([...AVATAR_COLOURS].sort());
        for (const set of CHIP_SET_IDS) expect(Object.keys(CHIP_SETS[set]).map(Number).sort((a, b) => a - b)).toEqual([...DENOMINATIONS]);
    });
});

describe('ids from outside', () => {
    it('come back as themselves when known, else as the default — never a throw', () => {
        for (const id of LOOK_SCENE_IDS) expect(sceneFor(id)).toBe(id);
        for (const id of LOOK_FELT_IDS) expect(feltFor(id)).toBe(id);
        for (const id of CARD_BACK_IDS) expect(cardBackFor(id)).toBe(id);
        for (const id of CHIP_SET_IDS) expect(chipSetFor(id)).toBe(id);
        for (const bad of [undefined, null, 7, '', 'neon-city', '"]{}<style>', 'constructor', '__proto__', {}, ['emerald']]) {
            expect(sceneFor(bad)).toBe(DEFAULT_SCENE);
            expect(feltFor(bad)).toBe(DEFAULT_FELT);
            expect(cardBackFor(bad)).toBe(DEFAULT_CARD_BACK);
            expect(chipSetFor(bad)).toBe('classic');
            expect(avatarColourFor(bad)).toBe('tangerine');
        }
        expect(avatarColourFor('ocean')).toBe('ocean');
    });

    it('resolve a table look field by field, a missing felt falling back on the scene\'s own', () => {
        expect(resolveTableLook(DEFAULT_SETTINGS)).toEqual({scene: 'casino-classic', felt: 'emerald'});
        expect(resolveTableLook({scene: 'my-theme', felt: 'charcoal'})).toEqual({scene: 'my-theme', felt: 'charcoal'});
        expect(resolveTableLook({scene: 'my-theme', felt: 'violet'})).toEqual({scene: 'my-theme', felt: 'charcoal'});
        expect(resolveTableLook({scene: 'deep-space', felt: 'charcoal'})).toEqual({scene: 'casino-classic', felt: 'charcoal'});
        expect(resolveTableLook({scene: 'deep-space', felt: 'violet'})).toEqual({scene: 'casino-classic', felt: 'emerald'});
        expect(resolveTableLook(null)).toEqual({scene: 'casino-classic', felt: 'emerald'});
        expect(resolveTableLook({})).toEqual({scene: 'casino-classic', felt: 'emerald'});
    });
});

describe('LOOKS_CSS', () => {
    it('is the registry rendered, the same every time', () => {
        expect(LOOKS_CSS).toBe(buildLooksCss());
        expect(LOOKS_CSS.length).toBeLessThan(12_000);
    });

    it('holds nothing that could escape a <style> tag or fetch anything', () => {
        expect(LOOKS_CSS).not.toMatch(/</);
        expect(LOOKS_CSS).not.toMatch(/>/);
        expect(LOOKS_CSS).not.toMatch(/url\s*\(/i);
        expect(LOOKS_CSS).not.toMatch(/expression/i);
        expect(LOOKS_CSS).not.toMatch(/@import/i);
        expect(LOOKS_CSS).not.toMatch(/\\/);
        expect(LOOKS_CSS).not.toMatch(/!important/);
    });

    it('uses only 6-digit hex, rgba(), the app\'s own tokens and gradients as values', () => {
        for (const hex of LOOKS_CSS.match(/#[0-9a-zA-Z]*/g) ?? []) expect(isHex6(hex), hex).toBe(true);
        const functions = new Set([...LOOKS_CSS.matchAll(/([a-z-]+)\(/g)].map((m) => m[1]));
        for (const fn of functions) expect(['var', 'rgba', 'radial-gradient', 'repeating-conic-gradient', 'repeating-linear-gradient', 'linear-gradient']).toContain(fn);
        for (const [, name] of LOOKS_CSS.matchAll(/var\((--[a-z0-9-]+)\)/g)) expect(name).toMatch(/^--(surface-[0-4]|bg|fg|fg-soft|fg-muted|brand|line-strong)$/);
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
        for (const denom of DENOMINATIONS) expect(LOOKS_CSS).toContain(`[data-pn-chips="classic"] [data-denom="${denom}"]{`);
        for (const id of AVATAR_COLOURS) expect(LOOKS_CSS).toContain(`[data-pn-av-bg="${id}"]{`);
    });

    it('sets every property the table\'s CSS reads', () => {
        for (const name of ['sky', 'ink', 'glow', 'felt', 'felt-light', 'felt-line', 'rail', 'rail-light', 'on-felt', 'on-felt-soft', 'back-base', 'back-pattern',
            'back-edge', 'card-paper', 'suit-c', 'suit-d', 'suit-h', 'suit-s', 'chip-face', 'chip-edge', 'chip-ink', 'av-bg', 'av-ring']) {
            expect(LOOKS_CSS).toContain(`--pn-${name}:`);
        }
    });
});

describe('contrast', () => {
    it('keeps text on the felt readable: on-felt at 4.5:1 on both tones, the soft ink at 3:1', () => {
        for (const id of LOOK_FELT_IDS) {
            const f = FELTS[id];
            expect(contrastRatio(f.onFelt, f.felt), `${id} on-felt`).toBeGreaterThanOrEqual(4.5);
            expect(contrastRatio(f.onFelt, f.light), `${id} on-felt / light`).toBeGreaterThanOrEqual(4.5);
            expect(contrastRatio(f.onFeltSoft, f.felt), `${id} soft`).toBeGreaterThanOrEqual(3);
        }
    });

    it('prints every suit at 4.5:1 on the paper, the four-colour deck with four different inks', () => {
        for (const id of ['two', 'four'] as const) {
            for (const suit of SUIT_LETTERS) expect(contrastRatio(SUIT_COLOURS[id][suit], CARD_PAPER), `${id} ${suit}`).toBeGreaterThanOrEqual(4.5);
        }
        expect(new Set(Object.values(SUIT_COLOURS.four)).size).toBe(4);
        expect(SUIT_COLOURS.two.c).toBe(SUIT_COLOURS.two.s);
        expect(SUIT_COLOURS.two.d).toBe(SUIT_COLOURS.two.h);
    });

    it('keeps a chip\'s ink at 3:1 on its face, and every denomination a different face', () => {
        for (const set of CHIP_SET_IDS) {
            for (const denom of DENOMINATIONS) {
                const c = CHIP_SETS[set][denom];
                expect(contrastRatio(c.ink, c.face), `${set} ${denom}`).toBeGreaterThanOrEqual(3);
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
});
