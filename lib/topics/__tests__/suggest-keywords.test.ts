import {describe, expect, it} from 'vitest';
import {suggestKeywords} from '@/lib/topics/suggest-keywords';

describe('suggestKeywords', () => {
    it('offers the full phrase first, then non-stopword tokens', () => {
        expect(suggestKeywords('Fed rate decisions')).toEqual(['fed rate decisions', 'fed', 'rate', 'decisions']);
    });

    it('drops stopwords and short tokens', () => {
        expect(suggestKeywords('News about the AI chips')).toEqual(['news about the ai chips', 'chips']);
    });

    it('caps the number of suggestions and handles empty input', () => {
        expect(suggestKeywords('one two three four five six seven', 3)).toHaveLength(3);
        expect(suggestKeywords('')).toEqual([]);
    });
});
