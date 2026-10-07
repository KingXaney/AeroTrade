// Display names: what cleanName keeps (visible text, NFC, one space between words, 16 graphemes
// and 48 units at most, never half a surrogate pair or half an emoji) and drops (controls,
// zero-width and bidi characters, invisible fillers); the key two names are compared by, which
// folds case, accents, fullwidth forms and look-alike letters; the reserved names; and the number a
// clashing name takes. Invisible characters are built from code points here, never typed.

import {describe, expect, it} from 'vitest';
import {
    cleanName, cleanTableName, isReservedName, NAME_MAX_GRAPHEMES, NAME_MAX_UNITS, nameKey, RESERVED, TABLE_NAME_MAX_UNITS, uniqueName,
} from '@/lib/poker-night/names';

const ch = (...points: number[]) => String.fromCodePoint(...points);
const graphemeCount = (text: string) => Array.from(new Intl.Segmenter('en', {granularity: 'grapheme'}).segment(text)).length;

describe('cleanName', () => {
    it('keeps an ordinary name as it is', () => {
        expect(cleanName('Ana')).toBe('Ana');
        expect(cleanName('  Ana   María ')).toBe('Ana María');
        expect(cleanName('李小龙')).toBe('李小龙');
        expect(cleanName('Sam 🃏')).toBe('Sam 🃏');
    });

    it('turns line breaks and tabs into spaces and drops every other control', () => {
        expect(cleanName('Ana\nBen')).toBe('Ana Ben');
        expect(cleanName('Ana\tBen')).toBe('Ana Ben');
        expect(cleanName(`A${ch(0)}n${ch(7)}a${ch(0x7f)}${ch(0x9b)}`)).toBe('Ana');
        expect(cleanName(`Ana${ch(0x2028)}Ben`)).toBe('Ana Ben');
    });

    it('drops zero-width, bidi and invisible characters', () => {
        const invisible = [0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069,
            0x2060, 0xfeff, 0x00ad, 0x061c, 0x115f, 0x1160, 0x3164, 0xffa0, 0x034f, 0x180e, 0xe0041];
        for (const point of invisible) expect(cleanName(`An${ch(point)}a`), point.toString(16)).toBe('Ana');
        // A name that is nothing but invisible characters is no name.
        expect(cleanName(invisible.map((p) => ch(p)).join(''))).toBeNull();
        // A right-to-left override cannot flip what follows the name.
        expect(cleanName(`${ch(0x202e)}moc.evil`)).toBe('moc.evil');
    });

    it('drops whole invisible categories, so no blank a list forgot passes a name off as another', () => {
        // Format controls no list named (musical, shorthand, Egyptian), private use, unassigned code
        // points, a lone surrogate, and the blanks drawn under visible categories (the Braille blank,
        // the musical null notehead).
        const blanks = [0x1d173, 0x1d17a, 0x1bca0, 0x1bca3, 0x13430, 0x1343f, 0xe000, 0xf8ff, 0x10fffd, 0x0378, 0xfffe, 0x2800, 0x1d159];
        for (const point of blanks) expect(cleanName(`An${ch(point)}a`), point.toString(16)).toBe('Ana');
        expect(cleanName(`An${String.fromCharCode(0xd800)}a`)).toBe('Ana');
        expect(cleanName(blanks.map((p) => ch(p)).join(''))).toBeNull();
        expect(cleanName(ch(0x2800))).toBeNull();
        // A reserved name, or a name someone holds, with a blank on the end is that name.
        for (const point of [0x2800, 0x1d173, 0x1bca0, 0x13430]) {
            const name = cleanName(`Dealer${ch(point)}`)!;
            expect(name, point.toString(16)).toBe('Dealer');
            expect(isReservedName(name)).toBe(true);
        }
        expect(uniqueName(cleanName(`Ana${ch(0x2800)}`)!, new Set([nameKey('Ana')]))).toBe('Ana 2');
        expect(cleanTableName(`Fri${ch(0x2800)}day${ch(0x1d17a)}`)).toBe('Friday');
        // What draws stays: an emoji's variation selector, accents, other scripts.
        expect(cleanName(`Sam ${ch(0x2764, 0xfe0f)}`)).toBe(`Sam ${ch(0x2764, 0xfe0f)}`);
        expect(cleanName('Zoë 李')).toBe('Zoë 李');
    });

    it('is null when nothing visible is left', () => {
        for (const raw of ['', '   ', '\n\t', ch(0x3164, 0x3164), ch(0x0301, 0x0301)]) expect(cleanName(raw), JSON.stringify(raw)).toBeNull();
        expect(cleanName(undefined)).toBeNull();
        expect(cleanName(42)).toBeNull();
    });

    it('composes to NFC', () => {
        const decomposed = `Jose${ch(0x0301)}`;
        expect(cleanName(decomposed)).toBe('José');
        expect(cleanName(decomposed)).toHaveLength(4);
    });

    it('keeps at most 16 graphemes without splitting one', () => {
        expect(cleanName('abcdefghijklmnopqrstuvwxyz')).toBe('abcdefghijklmnop');
        const family = ch(0x1f468, 0x200d, 0x1f469, 0x200d, 0x1f467);
        // Zero-width joiners go, so a joined emoji falls apart into its people — never into halves.
        expect(cleanName(family)).toBe(ch(0x1f468, 0x1f469, 0x1f467));
        const cards = '🃏'.repeat(20);
        const kept = cleanName(cards)!;
        expect(graphemeCount(kept)).toBe(NAME_MAX_GRAPHEMES);
        expect(kept).toBe('🃏'.repeat(16));
        // Flags are two code points each and stay whole.
        const flags = cleanName(ch(0x1f1eb, 0x1f1f7).repeat(20))!;
        expect(flags.length % 4).toBe(0);
        expect(graphemeCount(flags)).toBeLessThanOrEqual(NAME_MAX_GRAPHEMES);
    });

    it('keeps at most 48 UTF-16 units, so stacked marks cannot grow a name', () => {
        const zalgo = `a${ch(0x0301).repeat(60)}bc`;
        const kept = cleanName(zalgo);
        // The first grapheme is 61 units: it cannot fit, so nothing is kept.
        expect(kept).toBeNull();
        const heavy = cleanName(`${'é'.repeat(10)}${`a${ch(0x0301, 0x0302, 0x0303, 0x0304, 0x0305)}`.repeat(10)}`)!;
        expect(heavy.length).toBeLessThanOrEqual(NAME_MAX_UNITS);
        expect(NAME_MAX_UNITS).toBe(48);
    });
});

describe('cleanTableName', () => {
    it('holds a table name to 40 units under the same rules', () => {
        expect(cleanTableName("  Sam's   poker night  ")).toBe("Sam's poker night");
        expect(cleanTableName('x'.repeat(60))).toBe('x'.repeat(TABLE_NAME_MAX_UNITS));
        expect(cleanTableName(`Fri${ch(0x202e)}day`)).toBe('Friday');
        expect(cleanTableName(ch(0x200b))).toBeNull();
        expect(TABLE_NAME_MAX_UNITS).toBe(40);
    });
});

describe('nameKey', () => {
    it('folds case, spaces, accents and fullwidth forms', () => {
        expect(nameKey('Ana María')).toBe(nameKey('anamaria'));
        expect(nameKey('ＡＮＡ')).toBe(nameKey('ana'));
        expect(nameKey('Zoë')).toBe(nameKey('Zoe'));
    });

    it('folds look-alike letters, so a Cyrillic а dedupes against a Latin a', () => {
        expect(nameKey('Аnа')).toBe(nameKey('Ana'));
        expect(nameKey('Sаm')).toBe(nameKey('Sam'));
        expect(nameKey('ΡΑΜ')).toBe(nameKey('PAM'));
        expect(nameKey('BiII')).toBe(nameKey('Bill'));
        expect(nameKey('B0B')).toBe(nameKey('Bob'));
        expect(nameKey('Ana')).not.toBe(nameKey('Ann'));
    });
});

describe('reserved names and uniqueName', () => {
    it('reserves the table\'s own words in every disguise', () => {
        expect(RESERVED).toEqual(['host', 'dealer', 'aerotrade', 'admin', 'moderator', 'system', 'you']);
        for (const name of ['Host', 'HOST', 'host', 'Hоst', 'Dealer', 'AeroTrade', 'ADMIN', 'Admin', 'You', 'Mоderator', 'System']) {
            expect(isReservedName(name), name).toBe(true);
        }
        expect(isReservedName('Hostess')).toBe(false);
    });

    it('keeps a free name and numbers a taken or reserved one', () => {
        const taken = new Set(['Ana', 'Ana 2', 'Ben'].map(nameKey));
        expect(uniqueName('Cleo', taken)).toBe('Cleo');
        expect(uniqueName('Ana', taken)).toBe('Ana 3');
        expect(uniqueName('ANA', taken)).toBe('ANA 3');
        expect(uniqueName('Аna', taken)).toBe('Аna 3');
        expect(uniqueName('Host', new Set())).toBe('Host 2');
        expect(uniqueName('You', new Set())).toBe('You 2');
    });

    it('trims a long name so its number still fits', () => {
        const long = 'abcdefghijklmnop';
        const name = uniqueName(long, new Set([nameKey(long)]));
        expect(name).toBe('abcdefghijklmn 2');
        expect(graphemeCount(name)).toBeLessThanOrEqual(NAME_MAX_GRAPHEMES);
        const emoji = '🃏'.repeat(16);
        const numbered = uniqueName(emoji, new Set([nameKey(emoji)]));
        expect(numbered.endsWith(' 2')).toBe(true);
        expect(numbered.length).toBeLessThanOrEqual(NAME_MAX_UNITS);
        expect(graphemeCount(numbered)).toBeLessThanOrEqual(NAME_MAX_GRAPHEMES);
    });
});
