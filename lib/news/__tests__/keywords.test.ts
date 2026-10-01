// The canonical keyword: what followed topics and the /news feed both search for.

import {describe, expect, it} from 'vitest';
import {normalizeKeyword, normalizeKeywordList} from '@/lib/news/keywords';

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
