import {describe, expect, it} from 'vitest';
import {parseBriefText} from '@/lib/topics/brief';

describe('parseBriefText', () => {
    it('parses fenced and bare JSON', () => {
        const fenced = '```json\n{"summary": "Rates held.", "bullets": ["FOMC held at 5.25%"]}\n```';
        expect(parseBriefText(fenced)).toEqual({summary: 'Rates held.', bullets: ['FOMC held at 5.25%']});
        expect(parseBriefText('{"summary":"Quiet day","bullets":[]}')).toEqual({summary: 'Quiet day', bullets: []});
    });

    it('recovers usable parts from over-long output', () => {
        const parsed = parseBriefText(JSON.stringify({summary: 'x'.repeat(700), bullets: ['a', 'b', 'c', 'd', 'e', 42]}));
        expect(parsed?.summary.length).toBe(600);
        expect(parsed?.bullets).toEqual(['a', 'b', 'c', 'd']);
    });

    it('falls back to plain text and never returns HTML-bearing structures', () => {
        expect(parseBriefText('Markets were calm. <b>bold</b>')).toEqual({summary: 'Markets were calm. <b>bold</b>', bullets: []});
    });

    it('returns null for empty output', () => {
        expect(parseBriefText('')).toBeNull();
        expect(parseBriefText('   ```json ``` ')).toBeNull();
    });
});
