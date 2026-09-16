import {describe, expect, it} from 'vitest';
import {
    deriveKeywords,
    formatIssue,
    keywordSetHash,
    normalizeKeyword,
    normalizeKeywordList,
    slugify,
    topicInputSchema,
} from '@/lib/topics/normalize';

describe('normalizeKeyword', () => {
    it('trims, lowercases and collapses whitespace', () => {
        expect(normalizeKeyword('  Fed   Rate ')).toBe('fed rate');
    });

    it('strips surrounding quotes and a leading exclusion dash', () => {
        expect(normalizeKeyword('"AI chips"')).toBe('ai chips');
        expect(normalizeKeyword('“nvidia”')).toBe('nvidia');
        expect(normalizeKeyword('-crypto')).toBe('crypto');
    });

    it('applies NFKC so full-width text folds to ASCII', () => {
        expect(normalizeKeyword('ＡＩ')).toBe('ai');
    });
});

describe('normalizeKeywordList', () => {
    it('dedupes case-insensitively, sorts and caps', () => {
        expect(normalizeKeywordList(['Tesla', 'tesla', 'byd', 'EV sales'], 8)).toEqual(['byd', 'ev sales', 'tesla']);
        expect(normalizeKeywordList(['cc', 'bb', 'aa'], 2)).toEqual(['aa', 'bb']);
    });

    it('drops terms outside the length limits', () => {
        expect(normalizeKeywordList(['a', 'ab', 'x'.repeat(41)], 8)).toEqual(['ab']);
    });
});

describe('slugify', () => {
    it('produces URL-safe slugs', () => {
        expect(slugify('Fed rate decisions')).toBe('fed-rate-decisions');
        expect(slugify('  Oil & Energy!! ')).toBe('oil-energy');
        expect(slugify('Café Société')).toBe('cafe-societe');
    });

    it('never returns an empty slug and caps the length', () => {
        expect(slugify('!!!')).toBe('topic');
        expect(slugify('a'.repeat(100)).length).toBeLessThanOrEqual(64);
    });
});

describe('keywordSetHash', () => {
    it('is order-independent for the same set', () => {
        expect(keywordSetHash(['a', 'b'], [])).toBe(keywordSetHash(['b', 'a'], []));
    });

    it('changes when exclusions change', () => {
        expect(keywordSetHash(['a'], [])).not.toBe(keywordSetHash(['a'], ['b']));
    });
});

describe('topicInputSchema + deriveKeywords', () => {
    it('falls back to the name when no keywords are given', () => {
        const parsed = topicInputSchema.parse({name: 'AI chips'});
        expect(deriveKeywords(parsed)).toEqual({keywords: ['ai chips'], exclude: []});
    });

    it('removes exclusions that duplicate an include term', () => {
        const parsed = topicInputSchema.parse({name: 'Chips', keywords: ['nvidia', 'amd'], exclude: ['NVIDIA', 'intel']});
        expect(deriveKeywords(parsed)).toEqual({keywords: ['amd', 'nvidia'], exclude: ['intel']});
    });

    it('returns null when nothing usable survives normalisation', () => {
        // '--' passes the length check but normalises to nothing (leading dashes are syntax).
        expect(deriveKeywords({name: 'ok', keywords: ['--'], exclude: []})).toBeNull();
    });

    it('rejects too many keywords and over-long names with readable messages', () => {
        const many = topicInputSchema.safeParse({name: 'ok', keywords: Array.from({length: 9}, (_, i) => `kw${i}`)});
        expect(many.success).toBe(false);
        if (!many.success) expect(formatIssue(many.error)).toMatch(/Up to 8 keywords/);

        const long = topicInputSchema.safeParse({name: 'n'.repeat(61)});
        expect(long.success).toBe(false);
        if (!long.success) expect(formatIssue(long.error)).toMatch(/2–60 characters/);
    });

    it('rejects a malformed colour', () => {
        expect(topicInputSchema.safeParse({name: 'ok', color: 'red'}).success).toBe(false);
        expect(topicInputSchema.safeParse({name: 'ok', color: '#7DF4FF'}).success).toBe(true);
    });
});
