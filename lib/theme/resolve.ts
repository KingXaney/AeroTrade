// The only path from untrusted input (cookie, database document, action payload)
// to the <html> attributes and the palette stylesheet. Every field is whitelisted
// against the registry and nothing here throws, so a tampered cookie or a stale
// preference document degrades to the default theme rather than to an error page
// or an injected selector.

import {PALETTE_IDS, modeOf, type PaletteId, type PaletteMode} from '@/lib/theme/palettes';

// A theme is a palette and the Reduce motion choice. The app has one look, so there is no visual
// style to choose: the `style` an old document, cookie or open tab still carries is no field of
// a theme, and everything below reads past it.
export type Theme = {
    palette: PaletteId;
    reduceMotion: boolean;
};

export const DEFAULT_THEME: Theme = {palette: 'quiet-cyber', reduceMotion: false};

export const THEME_COOKIE = 'aero-theme';

export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

// What encodeThemeCookie writes: v2:<palette>:<0|1>.
const COOKIE_VERSION = 'v2';

// Written 2026-11-22. Until the app kept one look a theme also had one of five visual styles,
// and the cookie was v1:<palette>:<style>:<0|1>. Those cookies are still read — the style
// dropped, the palette and the motion choice kept. The root layout, the cookie's only parser,
// cannot set a cookie, so a v1 cookie stays as it is until its reader saves a theme or signs in
// again; read as junk, it would put a reader on Nord with motion reduced back on the default
// for the first page they open, and for every page that never syncs the cookie with the
// account (the landing and auth pages, a poker night table, the office). These are the five
// ids v1 ever wrote; any other third part was never a v1 cookie. A cookie lives one year from
// its last write (THEME_COOKIE_MAX_AGE), so once the deploy that carries this has been live
// for a year no v1 cookie is left: delete this list and the v1 branch of decodeThemeCookie then.
const V1_COOKIE_VERSION = 'v1';
const V1_STYLES: readonly string[] = ['minimal', 'futuristic', 'liquid-glass', 'brutalist', 'soft'];

export function isPaletteId(value: unknown): value is PaletteId {
    return typeof value === 'string' && (PALETTE_IDS as readonly string[]).includes(value);
}

// Per-field: a document with one bad field keeps its other choice. Only a literal
// boolean true counts for reduceMotion so 'true', 1 and {} cannot sneak through. Only the two
// keys are read, so whatever else the input carries — a stored `style` among it — is dropped.
export function resolveTheme(input: unknown): Theme {
    if (typeof input !== 'object' || input === null) {
        return {...DEFAULT_THEME};
    }
    const raw = input as Record<string, unknown>;
    return {
        palette: isPaletteId(raw.palette) ? raw.palette : DEFAULT_THEME.palette,
        reduceMotion: raw.reduceMotion === true,
    };
}

// What a save accepts (lib/actions/appearance.actions.ts setAppearance): both fields present and
// valid, so a save never fills a missing choice with the default. Other keys are allowed and
// resolveTheme drops them — a tab opened before the one look posts the style it had, and that
// save lands without it instead of being answered "Invalid theme".
export function isThemeInput(input: unknown): input is Theme {
    if (typeof input !== 'object' || input === null) {
        return false;
    }
    const raw = input as Record<string, unknown>;
    return isPaletteId(raw.palette) && typeof raw.reduceMotion === 'boolean';
}

export function encodeThemeCookie(theme: Theme): string {
    // Re-resolve so a caller that cast an unchecked object cannot write junk.
    const safe = resolveTheme(theme);
    return `${COOKIE_VERSION}:${safe.palette}:${safe.reduceMotion ? '1' : '0'}`;
}

// Whole-value: a cookie is exactly what encodeThemeCookie writes, or exactly what it wrote as
// v1, or it is ignored. Partial recovery would let a malformed cookie pin a half-applied theme.
export function decodeThemeCookie(value?: string | null): Theme {
    if (typeof value !== 'string') {
        return {...DEFAULT_THEME};
    }
    const parts = value.split(':');
    let palette: string;
    let motion: string;
    if (parts.length === 3 && parts[0] === COOKIE_VERSION) {
        [, palette, motion] = parts;
    } else if (parts.length === 4 && parts[0] === V1_COOKIE_VERSION && V1_STYLES.includes(parts[2])) {
        [, palette, , motion] = parts;
    } else {
        return {...DEFAULT_THEME};
    }
    if (!isPaletteId(palette) || (motion !== '0' && motion !== '1')) {
        return {...DEFAULT_THEME};
    }
    return {palette, reduceMotion: motion === '1'};
}

export function themeEquals(a: Theme, b: Theme): boolean {
    return a.palette === b.palette && a.reduceMotion === b.reduceMotion;
}

export function modeOfTheme(theme: Theme): PaletteMode {
    return modeOf(theme.palette);
}
