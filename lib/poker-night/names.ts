// Display names at a poker night table, and the table's own name: the only text players type that
// others see, so the only thing to moderate. Pure and client-safe (the join card previews a name
// with the same rules).
//
// cleanName keeps what is visible: Unicode NFC; every control, format, private-use, unassigned and
// lone-surrogate code point dropped, and the blanks that draw nothing; runs of whitespace one space;
// at most 16 graphemes and 48 UTF-16 units (which bounds a grapheme stacked with combining marks).
// nameKey is what two names are compared by, so "Ana" and "АNA" (a Cyrillic А) or "Bill" and "BiII"
// are one name at a table. A name is never built into a regex (invariant 2) and renders as text
// inside <bdi>.

import {TABLE_LIMITS} from '@/lib/poker-night/config';

export const NAME_MAX_GRAPHEMES = 16;
export const NAME_MAX_UNITS = 48;
export const TABLE_NAME_MAX_UNITS = TABLE_LIMITS.tableName;

// Names nobody may take as they are: they read as the table, the app or the viewer.
export const RESERVED = ['host', 'dealer', 'aerotrade', 'admin', 'moderator', 'system', 'you'] as const;

// Line breaks and tabs separate words. Every other invisible character goes, by whole Unicode
// categories rather than a list, so no code point a list forgot can pass one name off as another:
// controls (Cc); format characters (Cf: the soft hyphen, the Arabic letter mark, zero-width spaces
// and joiners, the bidi embeddings, overrides and isolates, word joiners and invisible operators,
// the byte-order mark, the interlinear annotation marks, the tag characters, the musical, shorthand
// and Egyptian format controls); private use (Co); unassigned code points (Cn); lone surrogates
// (Cs). So do the few that draw nothing under a visible category: the combining grapheme joiner,
// the Khmer and Mongolian invisibles, the Hangul fillers, the Braille blank and the musical null
// notehead.
const BREAKS = /[\t\n\v\f\r\u{85}\u{2028}\u{2029}]/gu;
const INVISIBLE = /[\p{Cc}\p{Cf}\p{Co}\p{Cn}\p{Cs}\u{34F}\u{115F}\u{1160}\u{17B4}\u{17B5}\u{180B}-\u{180F}\u{2800}\u{3164}\u{FFA0}\u{1D159}]/gu;
const VISIBLE = /[\p{L}\p{N}\p{S}\p{P}]/u;

const graphemes = (text: string): string[] => {
    if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
        return Array.from(new Intl.Segmenter('en', {granularity: 'grapheme'}).segment(text), (s) => s.segment);
    }
    return Array.from(text);
};

// The longest run of whole graphemes from the start within both caps.
const fit = (parts: readonly string[], maxGraphemes: number, maxUnits: number): string => {
    let out = '';
    for (let i = 0; i < parts.length && i < maxGraphemes; i++) {
        if (out.length + parts[i].length > maxUnits) break;
        out += parts[i];
    }
    return out;
};

const clean = (raw: unknown, maxGraphemes: number, maxUnits: number): string | null => {
    if (typeof raw !== 'string') return null;
    const text = raw.normalize('NFC').replace(BREAKS, ' ').replace(INVISIBLE, '').replace(/\s+/gu, ' ').trim();
    const kept = fit(graphemes(text), maxGraphemes, maxUnits).trim();
    return kept && VISIBLE.test(kept) ? kept : null;
};

// A player's name as typed, made safe to show; null when nothing visible is left (the table then
// uses the avatar's face name).
export const cleanName = (raw: unknown): string | null => clean(raw, NAME_MAX_GRAPHEMES, NAME_MAX_UNITS);

// The table's name under the same rules, at most 40 units; null when nothing visible is left.
export const cleanTableName = (raw: unknown): string | null => clean(raw, TABLE_NAME_MAX_UNITS, TABLE_NAME_MAX_UNITS);

// Letters that look like Latin ones, folded to them before the comparison: Cyrillic and Greek
// look-alikes in both cases, and the strokes that pass for an l (I, i, 1, |) and the zero for an o.
const CONFUSABLES: Readonly<Record<string, string>> = {
    // Cyrillic
    'А': 'a', 'а': 'a', 'В': 'b', 'в': 'b', 'Е': 'e', 'е': 'e', 'К': 'k', 'к': 'k', 'М': 'm', 'м': 'm', 'Н': 'h', 'н': 'h',
    'О': 'o', 'о': 'o', 'Р': 'p', 'р': 'p', 'С': 'c', 'с': 'c', 'Т': 't', 'т': 't', 'У': 'y', 'у': 'y', 'Х': 'x', 'х': 'x',
    'І': 'l', 'і': 'l', 'Ј': 'j', 'ј': 'j', 'Ѕ': 's', 'ѕ': 's', 'Ӏ': 'l', 'ӏ': 'l', 'ԁ': 'd', 'ԛ': 'q', 'ԝ': 'w', 'һ': 'h',
    // Greek
    'Α': 'a', 'α': 'a', 'Β': 'b', 'Ε': 'e', 'ε': 'e', 'Ζ': 'z', 'Η': 'h', 'Ι': 'l', 'ι': 'l', 'Κ': 'k', 'κ': 'k', 'Μ': 'm',
    'Ν': 'n', 'ν': 'v', 'Ο': 'o', 'ο': 'o', 'Ρ': 'p', 'ρ': 'p', 'Τ': 't', 'τ': 't', 'Υ': 'y', 'υ': 'u', 'Χ': 'x', 'χ': 'x',
    // Latin strokes and rounds
    'I': 'l', 'i': 'l', 'ı': 'l', '1': 'l', '|': 'l', '0': 'o', 'ɡ': 'g',
};

// What a name is compared by: compatibility forms folded (fullwidth letters, ligatures), accents
// dropped, look-alikes folded, lower case, no spaces.
export const nameKey = (name: string): string =>
    Array.from(name.normalize('NFKC').normalize('NFD').replace(/\p{M}/gu, ''), (ch) => CONFUSABLES[ch] ?? ch)
        .join('')
        .toLowerCase()
        .replace(/\s+/gu, '');

export const RESERVED_KEYS: ReadonlySet<string> = new Set(RESERVED.map(nameKey));

export const isReservedName = (name: string): boolean => RESERVED_KEYS.has(nameKey(name));

// The name, or the first of "Name 2", "Name 3"… whose key no one at the table holds and that is
// not reserved, trimmed so the number still fits the caps.
export const uniqueName = (name: string, takenKeys: ReadonlySet<string>): string => {
    const free = (candidate: string) => {
        const key = nameKey(candidate);
        return !takenKeys.has(key) && !RESERVED_KEYS.has(key);
    };
    if (free(name)) return name;
    const parts = graphemes(name);
    for (let n = 2; n <= takenKeys.size + RESERVED.length + 2; n++) {
        const suffix = ` ${n}`;
        const base = fit(parts, NAME_MAX_GRAPHEMES - suffix.length, NAME_MAX_UNITS - suffix.length).trim();
        const candidate = `${base}${suffix}`;
        if (free(candidate)) return candidate;
    }
    // Unreachable: there are more numbers than taken keys.
    return name;
};
