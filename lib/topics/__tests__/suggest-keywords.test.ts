import {describe, expect, it} from 'vitest';
import {brainTopicSuggestions, suggestKeywords} from '@/lib/topics/suggest-keywords';

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

describe('brainTopicSuggestions', () => {
    const entity = (displayName: string) => ({displayName});

    it('offers themes before sectors, capped, each with its suggested keywords', () => {
        const top = {theme: [entity('AI chips'), entity('Rate cuts')], sector: [entity('Energy')]};
        expect(brainTopicSuggestions(top, 2)).toEqual([
            {name: 'AI chips', keywords: suggestKeywords('AI chips')},
            {name: 'Rate cuts', keywords: suggestKeywords('Rate cuts')},
        ]);
        expect(brainTopicSuggestions(top, 6).map((s) => s.name)).toEqual(['AI chips', 'Rate cuts', 'Energy']);
    });

    it('drops a name that suggests no keyword', () => {
        expect(brainTopicSuggestions({theme: [entity('')], sector: [entity('Utilities')]}, 6).map((s) => s.name)).toEqual(['Utilities']);
    });
});
