// resolve.ts is the trust boundary between cookies / stored documents / action payloads and the
// <html> attributes, so its contract — whitelist everything, never throw — is asserted here
// rather than described in a comment.

import {describe, expect, it} from 'vitest';

import {PALETTE_IDS} from '@/lib/theme/palettes';
import {
    DEFAULT_THEME,
    THEME_COOKIE,
    THEME_COOKIE_MAX_AGE,
    decodeThemeCookie,
    encodeThemeCookie,
    isPaletteId,
    isThemeInput,
    modeOfTheme,
    resolveTheme,
    themeEquals,
    type Theme,
} from '@/lib/theme/resolve';

const GARBAGE: unknown[] = [undefined, null, 0, 1, true, 'nord', '', [], () => undefined, Symbol('x'), BigInt(12)];

// The five visual styles a theme had before the app kept one look. Written out here, apart from
// the private list in resolve.ts, as the record of what a v1 cookie, an old document or an old
// tab can still carry.
const OLD_STYLES = ['minimal', 'futuristic', 'liquid-glass', 'brutalist', 'soft'];

describe('DEFAULT_THEME', () => {
    it('is the first palette with motion enabled, and holds nothing else', () => {
        expect(DEFAULT_THEME).toEqual({palette: PALETTE_IDS[0], reduceMotion: false});
        expect(DEFAULT_THEME.palette).toBe('quiet-cyber');
        expect(Object.keys(DEFAULT_THEME).sort()).toEqual(['palette', 'reduceMotion']);
    });
});

describe('isPaletteId', () => {
    it('accepts every registered id and nothing else', () => {
        for (const id of PALETTE_IDS) {
            expect(isPaletteId(id), id).toBe(true);
        }
        expect(isPaletteId('QUIET-CYBER')).toBe(false);
        expect(isPaletteId('quiet-cyber ')).toBe(false);
        expect(isPaletteId('')).toBe(false);
        expect(isPaletteId(null)).toBe(false);
        expect(isPaletteId({toString: () => 'nord'})).toBe(false);
    });
});

describe('resolveTheme', () => {
    it('returns the default for anything that is not an object', () => {
        for (const input of GARBAGE) {
            expect(resolveTheme(input)).toEqual(DEFAULT_THEME);
        }
    });

    it('returns a fresh object, never the shared default', () => {
        const resolved = resolveTheme(null);
        expect(resolved).not.toBe(DEFAULT_THEME);
        resolved.palette = 'nord';
        expect(DEFAULT_THEME.palette).toBe('quiet-cyber');
    });

    it('accepts a full valid theme unchanged', () => {
        const theme: Theme = {palette: 'rose-pine', reduceMotion: true};
        expect(resolveTheme(theme)).toEqual(theme);
    });

    it('fills missing fields from the default and keeps valid ones', () => {
        expect(resolveTheme({})).toEqual(DEFAULT_THEME);
        expect(resolveTheme({palette: 'nord'})).toEqual({palette: 'nord', reduceMotion: false});
        expect(resolveTheme({reduceMotion: true})).toEqual({palette: 'quiet-cyber', reduceMotion: true});
    });

    // A document saved before the one look, and a tab still running that build, carry a style.
    it('ignores a stored or posted style: it is no field of a theme, and no error', () => {
        for (const style of [...OLD_STYLES, 'evil', '"><script>', '', 42, null, {value: 'soft'}, ['soft']]) {
            const resolved = resolveTheme({palette: 'nord', style, reduceMotion: true});
            expect(resolved, String(style)).toEqual({palette: 'nord', reduceMotion: true});
            expect(Object.keys(resolved).sort(), String(style)).toEqual(['palette', 'reduceMotion']);
        }
        // A style alone changes nothing about the default.
        expect(resolveTheme({style: 'brutalist'})).toEqual(DEFAULT_THEME);
    });

    it('replaces an unknown palette without touching the motion choice', () => {
        expect(resolveTheme({palette: 'evil', reduceMotion: true})).toEqual({palette: 'quiet-cyber', reduceMotion: true});
        expect(resolveTheme({palette: '"><script>', reduceMotion: false})).toEqual(DEFAULT_THEME);
    });

    it('only treats a literal boolean true as reduced motion', () => {
        for (const value of ['true', 1, {}, [], 'yes', null, undefined, 0, false]) {
            expect(resolveTheme({reduceMotion: value}).reduceMotion, String(value)).toBe(false);
        }
        expect(resolveTheme({reduceMotion: true}).reduceMotion).toBe(true);
    });

    it('drops unknown keys and never lifts values out of nested objects', () => {
        const resolved = resolveTheme({palette: 'nord', extra: 'x', nested: {palette: 'dracula', reduceMotion: true}});
        expect(Object.keys(resolved).sort()).toEqual(['palette', 'reduceMotion']);
        expect(resolved).toEqual({palette: 'nord', reduceMotion: false});
        expect('extra' in resolved).toBe(false);
        expect(resolveTheme({palette: {value: 'nord'}})).toEqual(DEFAULT_THEME);
    });

    it('never throws on wrong-typed field values', () => {
        expect(() => resolveTheme({palette: {}, style: [], reduceMotion: () => true})).not.toThrow();
        expect(resolveTheme({palette: {}, style: [], reduceMotion: () => true})).toEqual(DEFAULT_THEME);
    });
});

describe('isThemeInput', () => {
    it('accepts a palette and a boolean, the two fields a theme has', () => {
        for (const palette of PALETTE_IDS) {
            expect(isThemeInput({palette, reduceMotion: false}), palette).toBe(true);
            expect(isThemeInput({palette, reduceMotion: true}), palette).toBe(true);
        }
    });

    // setAppearance answers "Invalid theme" to whatever this refuses. A tab opened before the one
    // look still posts the style it had: that save lands, without the style.
    it('accepts what a tab from before the one look posts, and the style is dropped on the way in', () => {
        for (const style of OLD_STYLES) {
            const posted = {palette: 'nord', style, reduceMotion: true};
            expect(isThemeInput(posted), style).toBe(true);
            expect(resolveTheme(posted), style).toEqual({palette: 'nord', reduceMotion: true});
        }
        expect(isThemeInput({palette: 'paper', style: 'evil', extra: 1, reduceMotion: false})).toBe(true);
    });

    it('refuses anything whose palette or motion is not a valid choice', () => {
        for (const input of GARBAGE) {
            expect(isThemeInput(input)).toBe(false);
        }
        expect(isThemeInput({})).toBe(false);
        expect(isThemeInput({palette: 'nord'})).toBe(false);
        expect(isThemeInput({reduceMotion: true})).toBe(false);
        expect(isThemeInput({palette: 'evil', reduceMotion: true})).toBe(false);
        expect(isThemeInput({palette: 'Nord', reduceMotion: true})).toBe(false);
        // A style is no stand-in for a palette.
        expect(isThemeInput({style: 'soft', reduceMotion: true})).toBe(false);
        for (const reduceMotion of ['true', 'false', 1, 0, null, undefined, {}, []]) {
            expect(isThemeInput({palette: 'nord', reduceMotion}), String(reduceMotion)).toBe(false);
        }
    });
});

describe('cookie', () => {
    it('has the agreed name and a one-year max age', () => {
        expect(THEME_COOKIE).toBe('aero-theme');
        expect(THEME_COOKIE_MAX_AGE).toBe(31_536_000);
    });

    it('encodes as v2:<palette>:<0|1>', () => {
        expect(encodeThemeCookie(DEFAULT_THEME)).toBe('v2:quiet-cyber:0');
        expect(encodeThemeCookie({palette: 'nord', reduceMotion: true})).toBe('v2:nord:1');
    });

    it('sanitises an unchecked object before writing it', () => {
        const forged = {palette: 'x:y', reduceMotion: true} as unknown as Theme;
        expect(encodeThemeCookie(forged)).toBe('v2:quiet-cyber:1');
        // A style on the object never reaches the value.
        const old = {palette: 'nord', style: 'brutalist', reduceMotion: false} as unknown as Theme;
        expect(encodeThemeCookie(old)).toBe('v2:nord:0');
    });

    it('decodes what it writes', () => {
        expect(decodeThemeCookie('v2:quiet-cyber:0')).toEqual(DEFAULT_THEME);
        expect(decodeThemeCookie('v2:nord:1')).toEqual({palette: 'nord', reduceMotion: true});
    });

    it('round-trips every palette with motion on and off', () => {
        for (const palette of PALETTE_IDS) {
            for (const reduceMotion of [false, true]) {
                const theme: Theme = {palette, reduceMotion};
                const value = encodeThemeCookie(theme);
                expect(value.split(':')).toHaveLength(3);
                expect(decodeThemeCookie(value)).toEqual(theme);
            }
        }
    });

    // v1 was v1:<palette>:<style>:<0|1>. A cookie lives a year from its last write and nothing
    // rewrites one until its reader saves a theme again, so every shape v1 wrote is still read:
    // the style is dropped, the palette and the motion choice are kept.
    it('still reads every cookie v1 wrote, keeping its palette and its motion', () => {
        expect(decodeThemeCookie('v1:nord:brutalist:1')).toEqual({palette: 'nord', reduceMotion: true});
        expect(decodeThemeCookie('v1:quiet-cyber:minimal:0')).toEqual(DEFAULT_THEME);
        expect(decodeThemeCookie('v1:paper:liquid-glass:0')).toEqual({palette: 'paper', reduceMotion: false});
        for (const palette of PALETTE_IDS) {
            for (const style of OLD_STYLES) {
                for (const reduceMotion of [false, true]) {
                    const value = `v1:${palette}:${style}:${reduceMotion ? '1' : '0'}`;
                    const decoded = decodeThemeCookie(value);
                    expect(decoded, value).toEqual({palette, reduceMotion});
                    expect(Object.keys(decoded).sort(), value).toEqual(['palette', 'reduceMotion']);
                }
            }
        }
    });

    it('falls back to the default for anything it did not write itself', () => {
        const bad = [
            undefined,
            null,
            '',
            // v1: a wrong part count, version, palette, style or motion.
            'v1',
            'v1:',
            'v1:nord',
            'v1:nord:soft',
            'v1:nord:1',
            'v1:nord:soft:1:extra',
            'v0:nord:soft:1',
            'V1:nord:soft:1',
            'v1:evil:soft:0',
            'v1:nord:evil:0',
            'v1:nord::0',
            'v1:nord:Soft:0',
            'v1:nord:constructor:0',
            'v1:nord:__proto__:1',
            'v1:nord:soft:2',
            'v1:nord:soft:true',
            'v1:nord:soft:',
            'v1:Nord:soft:1',
            'v1: nord:soft:1',
            'v1:nord:soft:1 ',
            // v2: the same, and a v1 body under v2's name.
            'v2',
            'v2:',
            'v2:nord',
            'v2:nord:',
            'v2:nord:soft:1',
            'v2:nord:1:extra',
            'v3:nord:1',
            'V2:nord:1',
            'v2:evil:0',
            'v2:Nord:1',
            'v2:nord:2',
            'v2:nord:true',
            'v2: nord:1',
            'v2:nord:1 ',
            ' v2:nord:1',
            '"><script>alert(1)</script>',
            'v1:quiet-cyber"]{}html[data-x="1:minimal:0',
            'v2:quiet-cyber"]{}html[data-x="1:0',
        ];
        for (const value of bad) {
            expect(decodeThemeCookie(value), String(value)).toEqual(DEFAULT_THEME);
        }
    });

    it('returns a fresh object from decode as well', () => {
        expect(decodeThemeCookie(null)).not.toBe(DEFAULT_THEME);
        expect(decodeThemeCookie('v2:nord:1')).not.toBe(decodeThemeCookie('v2:nord:1'));
    });
});

describe('themeEquals', () => {
    it('compares the two fields, and nothing else an object carries', () => {
        const a: Theme = {palette: 'nord', reduceMotion: false};
        expect(themeEquals(a, {...a})).toBe(true);
        expect(themeEquals(a, {...a, palette: 'dracula'})).toBe(false);
        expect(themeEquals(a, {...a, reduceMotion: true})).toBe(false);
        // Two themes that differ only in a style an old document carried are the same theme.
        const old = {...a, style: 'brutalist'} as unknown as Theme;
        expect(themeEquals(a, old)).toBe(true);
    });
});

describe('modeOfTheme', () => {
    it('follows the palette', () => {
        expect(modeOfTheme(DEFAULT_THEME)).toBe('dark');
        expect(modeOfTheme({palette: 'paper', reduceMotion: false})).toBe('light');
        expect(modeOfTheme({palette: 'arctic', reduceMotion: true})).toBe('light');
    });
});
