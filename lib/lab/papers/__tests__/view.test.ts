import {describe, expect, it} from 'vitest';
import {arxivIdOf, isArxivId, paperLinks} from '@/lib/lab/papers/links';
import type {LabDayStored} from '@/lib/lab/papers/day';
import {shapePapersView} from '@/lib/lab/papers/view';

const stored: LabDayStored = {
    day: '2026-10-13',
    fetchedAt: '2026-10-13T10:20:00Z',
    counts: {listed: 3, hf: 1, novel: 3, kept: 3},
    papers: [
        {id: '2610.00001', title: 'Vision', abstract: 'A.', authors: ['A', 'B', 'C', 'D', 'E'], categories: ['cs.CV'], primary: 'cs.CV', track: 'cv', published: '2026-10-13T00:00:00Z', source: 'both', upvotes: 12},
        {id: '2610.00002', title: 'Quant', abstract: '', authors: ['Q'], categories: ['q-fin.PM'], primary: 'q-fin.PM', track: 'quant', published: '2026-10-13T00:00:00Z', source: 'arxiv', upvotes: null},
        {id: '2610.00003', title: 'Learning', abstract: 'L.', authors: [], categories: [], primary: '', track: 'ml', published: '', source: 'hf', upvotes: 3},
    ],
    digest: {headline: 'Three papers', model: 'm', writtenAt: '2026-10-13T10:21:00Z', bullets: [{text: 'One and three.', papers: [0, 2]}, {text: 'Out of range.', papers: [9]}]},
};

describe('the papers view', () => {
    it('groups by track in track order, numbers papers as the digest cites them, cuts the authors and builds the links from the id', () => {
        const view = shapePapersView(stored, '2026-10-13');
        expect(view.stale).toBe(false);
        expect(view.tracks.map((t) => [t.track, t.papers.map((p) => p.n)])).toEqual([['cv', [1]], ['ml', [3]], ['quant', [2]]]);
        const vision = view.tracks[0].papers[0];
        expect(vision.authors).toEqual(['A', 'B', 'C']);
        expect(vision.moreAuthors).toBe(2);
        expect(vision.links).toEqual({abs: 'https://arxiv.org/abs/2610.00001', hf: 'https://huggingface.co/papers/2610.00001'});
        expect(view.tracks[2].papers[0].links.hf).toBeNull();
    });

    it('resolves each citation to its paper and drops a bullet left with none; a day before today is stale', () => {
        const view = shapePapersView(stored, '2026-10-14');
        expect(view.stale).toBe(true);
        expect(view.digest?.bullets).toEqual([{text: 'One and three.', refs: [{n: 1, id: '2610.00001', title: 'Vision'}, {n: 3, id: '2610.00003', title: 'Learning'}]}]);
        expect(shapePapersView({...stored, digest: null}, '2026-10-13').digest).toBeNull();
        expect(shapePapersView({...stored, digest: {...stored.digest!, bullets: [{text: 'x', papers: [9]}]}}, '2026-10-13').digest).toBeNull();
    });

    it('reads an arXiv id out of its addresses and nothing else', () => {
        expect(arxivIdOf('http://arxiv.org/abs/2610.13947v1')).toBe('2610.13947');
        expect(arxivIdOf('2610.13947v2')).toBe('2610.13947');
        expect(arxivIdOf('2610.13947')).toBe('2610.13947');
        expect(arxivIdOf('2610.139475')).toBeNull();
        expect(arxivIdOf('cs/0101001')).toBeNull();
        expect(arxivIdOf('')).toBeNull();
        expect(isArxivId('2610.13947')).toBe(true);
        expect(isArxivId('2610.13947v1')).toBe(false);
        expect(paperLinks('2610.13947').pdf).toBe('https://arxiv.org/pdf/2610.13947');
    });
});
