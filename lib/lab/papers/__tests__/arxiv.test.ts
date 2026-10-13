import {readFileSync} from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {arxivIdListUrl, arxivListingUrl, parseArxivAtom} from '@/lib/lab/papers/arxiv';

const fixture = (name: string) => readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');

describe('the arXiv reader', () => {
    it('reads a listing: ids without their version, titles, abstracts, authors, categories and the primary', () => {
        const listing = parseArxivAtom(fixture('arxiv-listing.xml'));
        expect(listing.status).toBe('ok');
        if (listing.status !== 'ok') return;
        expect(listing.total).toBeGreaterThan(1000);
        expect(listing.entries).toHaveLength(3);
        const first = listing.entries[0];
        expect(first.id).toBe('2610.13947');
        expect(first.title).toMatch(/^Towards Physically Grounded Articulated 3D Assets/);
        expect(first.abstract).toMatch(/^In this paper, we study physically grounded/);
        expect(first.abstract).not.toMatch(/\n/);
        expect(first.authors.slice(0, 2)).toEqual(['Xudong Cai', 'Ruijie Zhu']);
        expect(first.categories).toContain('cs.CV');
        expect(first.primary).toBe('cs.CV');
        expect(first.published).toBe('2026-10-09T17:59:41Z');
        // Nothing from the feed's links is kept.
        expect(JSON.stringify(listing)).not.toMatch(/http/);
    });

    it('reads arXiv\'s error entry as an error, an empty feed as no entries, and junk as an error', () => {
        expect(parseArxivAtom(fixture('arxiv-error.xml'))).toEqual({status: 'error', message: 'incorrect id format for bad'});
        const empty = parseArxivAtom('<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><id>x</id><opensearch:totalResults xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/">0</opensearch:totalResults></feed>');
        expect(empty).toEqual({status: 'ok', entries: [], total: 0});
        expect(parseArxivAtom('').status).toBe('error');
        expect(parseArxivAtom('{"not": "xml"}').status).toBe('error');
    });

    it('reads one entry as one, not as a missing array', () => {
        const one = parseArxivAtom(`<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom" xmlns:arxiv="http://arxiv.org/schemas/atom"><entry><id>http://arxiv.org/abs/2610.00001v2</id><title>One   paper</title><summary>  Spaced
  out  </summary><author><name>Solo Author</name></author><category term="q-fin.PM"/><arxiv:primary_category term="q-fin.PM"/><published>2026-10-10T00:00:00Z</published></entry></feed>`);
        expect(one).toEqual({status: 'ok', total: null, entries: [{id: '2610.00001', title: 'One paper', abstract: 'Spaced out', authors: ['Solo Author'], categories: ['q-fin.PM'], primary: 'q-fin.PM', published: '2026-10-10T00:00:00Z', updated: ''}]});
    });

    it('builds the listing and id-list addresses on export.arxiv.org', () => {
        expect(arxivListingUrl(['cs.LG', 'stat.ML'], 60)).toBe('https://export.arxiv.org/api/query?search_query=cat:cs.LG+OR+cat:stat.ML&sortBy=submittedDate&sortOrder=descending&max_results=60');
        expect(arxivIdListUrl(['2610.00001', '2610.00002'])).toBe('https://export.arxiv.org/api/query?id_list=2610.00001,2610.00002&max_results=2');
    });
});
