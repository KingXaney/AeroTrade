import {describe, expect, it} from 'vitest';
import {capitalize, escapeRegExp, hashId, normalizeUrl, numberWord} from '@/lib/text';

describe('escapeRegExp', () => {
    it('escapes every regex metacharacter, so user text matches only itself', () => {
        expect(escapeRegExp('a.b*c')).toBe('a\\.b\\*c');
        expect(escapeRegExp('BRK.B')).toBe('BRK\\.B');
        const meta = '.*+?^${}()|[]\\';
        expect(new RegExp(`^${escapeRegExp(meta)}$`).test(meta)).toBe(true);
    });
});

describe('normalizeUrl', () => {
    it('drops case, the query string and trailing slashes', () => {
        expect(normalizeUrl('https://Example.com/Story/?utm_source=x')).toBe('https://example.com/story');
        expect(normalizeUrl('https://example.com/a//')).toBe('https://example.com/a');
    });
});

describe('hashId', () => {
    it('is a stable unsigned 32-bit djb2 hash', () => {
        expect(hashId('')).toBe(5381);
        expect(hashId('a')).toBe(177670);
        const id = hashId('https://example.com/story');
        expect(id).toBe(hashId('https://example.com/story'));
        expect(Number.isInteger(id) && id >= 0 && id < 2 ** 32).toBe(true);
    });
});

describe('numberWord', () => {
    it('spells a whole count under a hundred and leaves anything else as digits', () => {
        expect([0, 1, 8, 11, 12, 19, 20, 40, 42, 99].map(numberWord))
            .toEqual(['zero', 'one', 'eight', 'eleven', 'twelve', 'nineteen', 'twenty', 'forty', 'forty-two', 'ninety-nine']);
        expect([100, 2.5, -1].map(numberWord)).toEqual(['100', '2.5', '-1']);
        expect(capitalize(numberWord(8))).toBe('Eight');
    });
});
