// The registry is rendered straight into a <style> tag and drives every colour in
// the app, so its shape, its readability floors and the CSS it produces are
// contracts, not conventions.

import {describe, expect, it} from 'vitest';

import {contrastRatio, hexToRgb, isHex6, relativeLuminance, rgbString} from '@/lib/theme/color';
import {
    CSS_VAR_BY_TOKEN,
    PALETTES,
    PALETTE_CSS,
    PALETTE_IDS,
    PALETTE_TOKEN_KEYS,
    buildPaletteCss,
    modeOf,
    type PaletteToken,
} from '@/lib/theme/palettes';

const EXPECTED_TOKENS: PaletteToken[] = [
    'bg',
    'chrome',
    'surface0',
    'surface1',
    'surface2',
    'surface3',
    'surface4',
    'fg',
    'fgSoft',
    'fgMuted',
    'line',
    'lineStrong',
    'brand',
    'brandStrong',
    'brandDim',
    'onBrand',
    'positive',
    'negative',
    'onNegative',
    'warning',
    'secondaryTint',
];

const RGBA = /^rgba\(\d{1,3},\d{1,3},\d{1,3},(0|1|0?\.\d+)\)$/;

describe('colour helpers', () => {
    it('parses 6-digit hex in either case', () => {
        expect(hexToRgb('#ff8000')).toEqual({r: 255, g: 128, b: 0});
        expect(hexToRgb('#FF8000')).toEqual({r: 255, g: 128, b: 0});
        expect(rgbString('#ff8000')).toBe('255 128 0');
    });

    it('rejects anything that is not a 6-digit hex', () => {
        for (const value of ['#fff', 'ff8000', '#ff800', '#ff80000', '#gg8000', '', null, undefined, 0xff8000]) {
            expect(isHex6(value), String(value)).toBe(false);
        }
        expect(isHex6('#ff8000')).toBe(true);
        expect(() => hexToRgb('#fff')).toThrow();
    });

    it('computes WCAG luminance and contrast', () => {
        expect(relativeLuminance('#000000')).toBe(0);
        expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 6);
        expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 6);
        expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 6);
        expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
        expect(contrastRatio('#123456', '#123456')).toBe(1);
    });
});

describe('PALETTE_IDS', () => {
    it('lists twelve unique ids with the default first', () => {
        expect(PALETTE_IDS).toHaveLength(12);
        expect(new Set(PALETTE_IDS).size).toBe(12);
        expect(PALETTE_IDS[0]).toBe('quiet-cyber');
    });

    it('matches the registry keys exactly', () => {
        expect(Object.keys(PALETTES).sort()).toEqual([...PALETTE_IDS].sort());
        for (const id of PALETTE_IDS) {
            expect(PALETTES[id].id).toBe(id);
        }
    });

    it('are safe to interpolate into an attribute selector', () => {
        for (const id of PALETTE_IDS) {
            expect(id).toMatch(/^[a-z][a-z0-9-]*$/);
        }
    });
});

describe('every palette', () => {
    it('has exactly the expected token keys', () => {
        expect(PALETTE_TOKEN_KEYS.sort()).toEqual([...EXPECTED_TOKENS].sort());
        for (const id of PALETTE_IDS) {
            expect(Object.keys(PALETTES[id].tokens).sort(), id).toEqual([...EXPECTED_TOKENS].sort());
        }
    });

    it('uses 6-digit hex everywhere except the rgba hairline', () => {
        for (const id of PALETTE_IDS) {
            const {tokens} = PALETTES[id];
            for (const key of EXPECTED_TOKENS) {
                if (key === 'line') {
                    expect(tokens.line, `${id}.line`).toMatch(RGBA);
                } else {
                    expect(isHex6(tokens[key]), `${id}.${key}=${tokens[key]}`).toBe(true);
                    expect(tokens[key], `${id}.${key}`).toBe(tokens[key].toLowerCase());
                }
            }
        }
    });

    it('declares a mode and both modes are represented', () => {
        const modes = new Set<string>();
        for (const id of PALETTE_IDS) {
            expect(['dark', 'light'], id).toContain(PALETTES[id].mode);
            expect(modeOf(id)).toBe(PALETTES[id].mode);
            modes.add(PALETTES[id].mode);
        }
        expect([...modes].sort()).toEqual(['dark', 'light']);
    });

    it('has a non-empty label and description', () => {
        for (const id of PALETTE_IDS) {
            expect(PALETTES[id].label.trim().length, id).toBeGreaterThan(0);
            expect(PALETTES[id].description.trim().length, id).toBeGreaterThan(0);
        }
    });

    it('previews bg, brand and positive in its swatch', () => {
        for (const id of PALETTE_IDS) {
            const {swatch, tokens} = PALETTES[id];
            expect(swatch, id).toEqual([tokens.bg, tokens.brand, tokens.positive]);
        }
    });

    it('derives chrome from surface0 (darker on dark, equal on light)', () => {
        for (const id of PALETTE_IDS) {
            const {mode, tokens} = PALETTES[id];
            if (mode === 'light') {
                expect(tokens.chrome, id).toBe(tokens.surface0);
            } else {
                expect(relativeLuminance(tokens.chrome), id).toBeLessThan(relativeLuminance(tokens.surface0));
                // "2%" darker, not a different colour: well under one contrast step.
                expect(contrastRatio(tokens.chrome, tokens.surface0), id).toBeLessThan(1.25);
            }
        }
    });

    it('keeps the surface ladder monotonic in luminance', () => {
        for (const id of PALETTE_IDS) {
            const {mode, tokens} = PALETTES[id];
            const ladder = [tokens.surface0, tokens.surface1, tokens.surface2, tokens.surface3, tokens.surface4].map(
                relativeLuminance,
            );
            for (let i = 1; i < ladder.length; i += 1) {
                if (mode === 'dark') {
                    expect(ladder[i], `${id} surface${i}`).toBeGreaterThan(ladder[i - 1]);
                } else {
                    expect(ladder[i], `${id} surface${i}`).toBeLessThan(ladder[i - 1]);
                }
            }
        }
    });
});

// The readability floors from the plan. None of the Appendix A palettes needed an
// adjustment to pass; the lowest margins are one-dark / tokyo-night muted text
// (~3.5) and solarized-dark on-brand (~5.1).
describe('contrast floors', () => {
    it('body text on a card reaches AA (4.5:1)', () => {
        for (const id of PALETTE_IDS) {
            const {tokens} = PALETTES[id];
            expect(contrastRatio(tokens.fg, tokens.surface1), id).toBeGreaterThanOrEqual(4.5);
        }
    });

    it('muted text on a card reaches 3:1', () => {
        for (const id of PALETTE_IDS) {
            const {tokens} = PALETTES[id];
            expect(contrastRatio(tokens.fgMuted, tokens.surface1), id).toBeGreaterThanOrEqual(3);
        }
    });

    it('text on the accent reaches AA (4.5:1)', () => {
        for (const id of PALETTE_IDS) {
            const {tokens} = PALETTES[id];
            expect(contrastRatio(tokens.onBrand, tokens.brand), id).toBeGreaterThanOrEqual(4.5);
        }
    });

    it('keeps warning readable on panels — it marks caution, so it has to be read', () => {
        for (const id of PALETTE_IDS) {
            const {tokens} = PALETTES[id];
            expect(contrastRatio(tokens.warning, tokens.surface1), id).toBeGreaterThanOrEqual(4.5);
        }
    });
});

describe('quiet-cyber parity', () => {
    it("matches today's hard-coded globals.css values", () => {
        const {tokens} = PALETTES['quiet-cyber'];
        expect(tokens).toEqual({
            bg: '#050608',
            chrome: '#0d1014',
            surface0: '#111318',
            surface1: '#14171b',
            surface2: '#1e2024',
            surface3: '#282a2e',
            surface4: '#333539',
            fg: '#e2e2e8',
            fgSoft: '#b9cacb',
            fgMuted: '#849495',
            line: 'rgba(255,255,255,.06)',
            lineStrong: '#3b494b',
            brand: '#7df4ff',
            brandStrong: '#00f0ff',
            brandDim: '#00dbe9',
            onBrand: '#002022',
            positive: '#7df4ff',
            negative: '#ffb4ab',
            onNegative: '#690005',
            warning: '#ffd166',
            secondaryTint: '#7000ff',
        });
    });
});

describe('CSS_VAR_BY_TOKEN', () => {
    it('maps every token to a unique kebab-case custom property', () => {
        const names = Object.values(CSS_VAR_BY_TOKEN);
        expect(names).toHaveLength(EXPECTED_TOKENS.length);
        expect(new Set(names).size).toBe(names.length);
        for (const name of names) {
            expect(name).toMatch(/^--[a-z][a-z0-9-]*$/);
        }
        expect(CSS_VAR_BY_TOKEN.surface0).toBe('--surface-0');
        expect(CSS_VAR_BY_TOKEN.fgMuted).toBe('--fg-muted');
        expect(CSS_VAR_BY_TOKEN.onBrand).toBe('--on-brand');
        expect(CSS_VAR_BY_TOKEN.secondaryTint).toBe('--secondary-tint');
    });
});

describe('buildPaletteCss', () => {
    const css = buildPaletteCss();

    it('is what the layout renders', () => {
        expect(PALETTE_CSS).toBe(css);
    });

    it('emits exactly one html[data-palette] block per palette', () => {
        const blocks = css.match(/html\[data-palette="[^"]*"\]\{/g) ?? [];
        expect(blocks).toHaveLength(PALETTE_IDS.length);
        for (const id of PALETTE_IDS) {
            const occurrences = css.split(`html[data-palette="${id}"]{`).length - 1;
            expect(occurrences, id).toBe(1);
        }
    });

    it('declares every custom property with the registry value in every block', () => {
        for (const id of PALETTE_IDS) {
            const start = css.indexOf(`html[data-palette="${id}"]{`);
            const end = css.indexOf('}', start);
            const block = css.slice(start, end + 1);
            for (const key of EXPECTED_TOKENS) {
                expect(block, `${id}.${key}`).toContain(`${CSS_VAR_BY_TOKEN[key]}:${PALETTES[id].tokens[key]}`);
            }
        }
    });

    it('cannot break out of a <style> element', () => {
        expect(css).not.toContain('<');
        expect(css).not.toContain('>');
        expect(css).not.toMatch(/<\/style/i);
    });

    it('only contains characters a stylesheet needs', () => {
        expect(css).toMatch(/^[a-z0-9\-#:;,.(){}\[\]="\n]+$/);
    });
});
