import {describe, expect, it} from 'vitest';
import type {ArxivEntry} from '@/lib/lab/papers/arxiv';
import {PAPERS_PER_TRACK} from '@/lib/lab/papers/config';
import {assembleDay, isNovel, mergePapers, rankTrack, trackFor, withinDays} from '@/lib/lab/papers/day';
import type {HfPaper} from '@/lib/lab/papers/hf';

const TODAY = '2026-10-13';
const entry = (id: string, primary: string, published = `${TODAY}T01:00:00Z`, categories = [primary]): ArxivEntry =>
    ({id, title: `Paper ${id}`, abstract: `About ${id}.`, authors: ['A'], categories, primary, published, updated: published});
const hf = (id: string, upvotes: number, published = `${TODAY}T00:00:00.000Z`): HfPaper =>
    ({id, title: `HF ${id}`, abstract: `Abstract ${id}.`, authors: ['B'], upvotes, published});

describe('a day of papers', () => {
    it('places a paper by its primary category first, then any category, and leaves the rest out', () => {
        expect(trackFor('cs.CV', ['cs.CV', 'cs.LG'])).toBe('cv');
        expect(trackFor('cs.CL', ['cs.CL'])).toBe('ml');
        expect(trackFor('q-fin.ST', ['q-fin.ST', 'stat.ML'])).toBe('quant');
        expect(trackFor('math.OC', ['math.OC', 'cs.LG'])).toBe('ml');
        expect(trackFor('math.OC', ['math.OC'])).toBeNull();
    });

    it('counts a paper as new within a week and never when already stored', () => {
        expect(withinDays(`2026-10-06T12:00:00Z`, TODAY, 7)).toBe(true);
        expect(withinDays(`2026-10-05T23:59:59Z`, TODAY, 7)).toBe(false);
        expect(withinDays('', TODAY, 7)).toBe(false);
        expect(isNovel({id: 'x', published: `${TODAY}T00:00:00Z`}, new Set(['x']), TODAY)).toBe(false);
        expect(isNovel({id: 'x', published: `${TODAY}T00:00:00Z`}, new Set(), TODAY)).toBe(true);
    });

    it('merges by id: arXiv gives the categories, Hugging Face the upvotes, and a paper with no arXiv row lands in machine learning', () => {
        const merged = mergePapers({arxiv: [entry('2610.00001', 'cs.CV')], hf: [hf('2610.00001', 40), hf('2610.00002', 9)], metadata: [entry('2610.00003', 'cs.LG')]});
        expect(merged.map((p) => [p.id, p.track, p.source, p.upvotes])).toEqual([
            ['2610.00001', 'cv', 'both', 40],
            ['2610.00003', 'ml', 'arxiv', null],
            ['2610.00002', 'ml', 'hf', 9],
        ]);
        expect(JSON.stringify(merged)).not.toMatch(/http/);
    });

    it('ranks upvotes first, then recency, then the id', () => {
        const ranked = rankTrack(mergePapers({
            arxiv: [entry('2610.00003', 'cs.LG', '2026-10-12T00:00:00Z'), entry('2610.00002', 'cs.LG', '2026-10-13T00:00:00Z'), entry('2610.00001', 'cs.LG', '2026-10-13T00:00:00Z')],
            hf: [hf('2610.00003', 5)], metadata: [],
        }));
        expect(ranked.map((p) => p.id)).toEqual(['2610.00003', '2610.00001', '2610.00002']);
    });

    it('keeps at most twelve new papers a track, in track order, and counts what it saw', () => {
        const arxiv = [
            ...Array.from({length: 15}, (_, i) => entry(`2610.1${String(i).padStart(4, '0')}`, 'cs.CV')),
            entry('2610.20001', 'cs.LG'),
            entry('2610.30001', 'q-fin.PM'),
            entry('2610.30002', 'q-fin.PM', '2026-09-01T00:00:00Z'),   // too old
            entry('2610.30003', 'q-fin.PM'),                            // seen
        ];
        const day = assembleDay({today: TODAY, arxiv, hf: [hf('2610.20001', 3)], metadata: [], seenIds: new Set(['2610.30003'])});
        expect(day.day).toBe(TODAY);
        expect(day.papers.filter((p) => p.track === 'cv')).toHaveLength(PAPERS_PER_TRACK);
        expect(day.papers.map((p) => p.track)).toEqual([...Array(12).fill('cv'), 'ml', 'quant']);
        expect(day.papers.find((p) => p.id === '2610.20001')).toMatchObject({source: 'both', upvotes: 3});
        expect(day.counts).toEqual({listed: 19, hf: 1, novel: 17, kept: 14});
        expect(JSON.stringify(day)).not.toMatch(/http/);
    });
});
