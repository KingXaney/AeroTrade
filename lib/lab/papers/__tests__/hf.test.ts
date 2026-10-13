import {readFileSync} from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {hfDailyPapersUrl, hfDatesFor, parseHfDailyPapers} from '@/lib/lab/papers/hf';

const fixture = JSON.parse(readFileSync(path.join(__dirname, 'fixtures', 'hf-daily.json'), 'utf8'));

describe('the Hugging Face reader', () => {
    it('reads the day\'s papers item by item: ids, titles, abstracts, authors, upvotes; drops what it cannot read; keeps one row per id', () => {
        const papers = parseHfDailyPapers(fixture);
        // Three real items, a malformed one, an old-style id, and a duplicate of the first with fewer upvotes.
        expect(papers).toHaveLength(3);
        expect(papers[0]).toMatchObject({id: '2610.12374', title: 'AgentGarten: Code Worlds for Evolving Agents', upvotes: 259});
        expect(papers[0].authors.length).toBeGreaterThan(0);
        expect(papers[0].published).toMatch(/^2026-10-0/);
        expect(papers.every((p) => /^\d{4}\.\d{4,5}$/.test(p.id))).toBe(true);
        expect(JSON.stringify(papers)).not.toMatch(/http/);
    });

    it('reads anything but a list as nothing', () => {
        expect(parseHfDailyPapers(null)).toEqual([]);
        expect(parseHfDailyPapers({papers: []})).toEqual([]);
        expect(parseHfDailyPapers([null, 1, 'x'])).toEqual([]);
    });

    it('asks for the previous weekday and today: a Monday reads Friday and Monday', () => {
        expect(hfDatesFor('2026-10-13')).toEqual(['2026-10-12', '2026-10-13']);   // Tuesday
        expect(hfDatesFor('2026-10-12')).toEqual(['2026-10-09', '2026-10-12']);   // Monday
        expect(hfDailyPapersUrl('2026-10-09')).toBe('https://huggingface.co/api/daily_papers?date=2026-10-09');
    });
});
