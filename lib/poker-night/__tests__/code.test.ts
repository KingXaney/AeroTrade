// Table codes: an alphabet of 32 symbols with nothing that reads as another (no 0 O 1 I), every
// symbol equally likely from a random byte, and a code typed with spaces, dashes, lower case or a
// phone's fullwidth keyboard read back as the canonical six symbols — anything else refused.

import {describe, expect, it} from 'vitest';
import {CODE_ALPHABET, CODE_LENGTH, generateCode, isCode, normalizeCode} from '@/lib/poker-night/code';

describe('the alphabet', () => {
    it('has 32 distinct symbols and none of 0 O 1 I', () => {
        expect(CODE_ALPHABET).toHaveLength(32);
        expect(new Set(CODE_ALPHABET).size).toBe(32);
        for (const c of '0O1I') expect(CODE_ALPHABET).not.toContain(c);
        expect(CODE_ALPHABET).toMatch(/^[A-Z2-9]+$/);
        expect(CODE_LENGTH).toBe(6);
    });
});

describe('generateCode', () => {
    it('hits every symbol exactly 8 times over the 256 byte values', () => {
        const counts = new Map<string, number>();
        for (let start = 0; start < 256; start += CODE_LENGTH) {
            const code = generateCode((bytes) => bytes.map((_, i) => (start + i) % 256));
            for (const [i, c] of [...code].entries()) if (start + i < 256) counts.set(c, (counts.get(c) ?? 0) + 1);
        }
        expect(counts.size).toBe(32);
        for (const n of counts.values()) expect(n).toBe(8);
    });

    it('draws six symbols of the alphabet from Web Crypto by default', () => {
        for (let i = 0; i < 200; i++) {
            const code = generateCode();
            expect(isCode(code)).toBe(true);
            expect(normalizeCode(code)).toBe(code);
        }
    });
});

describe('normalizeCode', () => {
    it('reads a code as people type it', () => {
        expect(normalizeCode(' k7q-xm4 ')).toBe('K7QXM4');
        expect(normalizeCode('K7Q XM4')).toBe('K7QXM4');
        expect(normalizeCode('k7qxm4')).toBe('K7QXM4');
        // A dash of any width, and a phone's fullwidth letters and digits, which fold to ASCII.
        expect(normalizeCode(`K7Q${String.fromCodePoint(0x2013)}XM4`)).toBe('K7QXM4');
        expect(normalizeCode('ＫＱ７ＸＭ４')).toBe('KQ7XM4');
    });

    it('refuses anything that is not six symbols of the alphabet', () => {
        for (const raw of ['K7QXM', 'K7QXM4A', 'K7QXM0', 'K7QXMO', 'K7QXM1', 'K7QXMI', '０K7QXM', 'K7Q_XM4', 'K7Q.XM4', '', '   ', 'К7QXM4']) {
            expect(normalizeCode(raw), raw).toBeNull();
        }
        expect(normalizeCode(null)).toBeNull();
        expect(normalizeCode(123456)).toBeNull();
        expect(normalizeCode('K'.repeat(65))).toBeNull();
    });
});
