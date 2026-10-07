import {describe, expect, it} from 'vitest';
import {fetchWikipediaViews, parseWikipediaResponse, wikipediaUrlFor} from '@/lib/culture/sources/wikipedia';
import type {CultureBrand} from '@/lib/culture/types';

const brand = (id: string, wikipedia: string[]): CultureBrand =>
    ({id, name: id, category: 'drinks', aliases: [id], owner: null, wikipedia});

const payload = (article: string, days: [string, number][]) => ({
    items: days.map(([date, views]) => ({project: 'en.wikipedia', article, granularity: 'daily', timestamp: `${date.replace(/-/g, '')}00`, access: 'all-access', agent: 'user', views})),
});

const respond = (status: number, body?: unknown): Response =>
    new Response(body === undefined ? '' : JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}});

describe('wikipediaUrlFor', () => {
    it('names the article as the API wants it, dates compacted', () => {
        expect(wikipediaUrlFor('Celsius_Holdings', '2026-09-01', '2026-09-30'))
            .toBe('https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/Celsius_Holdings/daily/20260901/20260930');
        expect(wikipediaUrlFor("Lay's", '2026-09-01', '2026-09-30')).toContain("/Lay's/daily/");
        expect(wikipediaUrlFor('Nike,_Inc.', '2026-09-01', '2026-09-30')).toContain('/Nike%2C_Inc./daily/');
        expect(wikipediaUrlFor('Disney+', '2026-09-01', '2026-09-30')).toContain('/Disney%2B/daily/');
    });
});

describe('parseWikipediaResponse', () => {
    it('reads timestamps as dates and skips what is not a day of views', () => {
        expect(parseWikipediaResponse(payload('X', [['2026-09-01', 312], ['2026-09-02', 298]]))).toEqual([
            {date: '2026-09-01', value: 312},
            {date: '2026-09-02', value: 298},
        ]);
        expect(parseWikipediaResponse({items: [{timestamp: 'nope', views: 1}, {timestamp: '2026090100', views: 'many'}, null]})).toEqual([]);
        expect(parseWikipediaResponse(null)).toEqual([]);
        expect(parseWikipediaResponse({})).toEqual([]);
    });
});

describe('fetchWikipediaViews', () => {
    it('sums a brand over its titles, marks a missing title, and spaces nothing out in tests', async () => {
        const calls: string[] = [];
        const fetchImpl = (async (url: string | URL | Request) => {
            const u = String(url);
            calls.push(u);
            if (u.includes('/Nintendo_Switch/')) return respond(200, payload('Nintendo_Switch', [['2026-09-01', 100], ['2026-09-02', 110]]));
            if (u.includes('/Nintendo_Switch_2/')) return respond(200, payload('Nintendo_Switch_2', [['2026-09-01', 50]]));
            if (u.includes('/Gone/')) return respond(404, {type: 'not_found'});
            return respond(200, payload('Crocs', [['2026-09-01', 7]]));
        }) as unknown as typeof fetch;

        const result = await fetchWikipediaViews(
            [brand('nintendo-switch', ['Nintendo_Switch', 'Nintendo_Switch_2']), brand('gone', ['Gone']), brand('crocs', ['Crocs'])],
            {from: '2026-09-01', to: '2026-09-02'},
            {fetchImpl, gapMs: 0},
        );
        expect(result.rows).toEqual([
            {brand: 'nintendo-switch', source: 'wikipedia', date: '2026-09-01', value: 150},
            {brand: 'nintendo-switch', source: 'wikipedia', date: '2026-09-02', value: 110},
            {brand: 'crocs', source: 'wikipedia', date: '2026-09-01', value: 7},
        ]);
        expect(result.missing).toEqual(['Gone']);
        expect(result.failed).toEqual([]);
        expect(calls).toHaveLength(4);
    });

    it('writes no rows for a brand whose title failed, and never throws', async () => {
        const fetchImpl = (async (url: string | URL | Request) => {
            const u = String(url);
            if (u.includes('/Flaky/')) throw new Error('network');
            if (u.includes('/Busy/')) return respond(503);
            return respond(200, payload('Ok', [['2026-09-01', 1]]));
        }) as unknown as typeof fetch;
        const result = await fetchWikipediaViews(
            [brand('two-titles', ['Ok', 'Flaky']), brand('busy', ['Busy']), brand('fine', ['Ok'])],
            {from: '2026-09-01', to: '2026-09-01'},
            {fetchImpl, gapMs: 0},
        );
        expect(result.rows.map((r) => r.brand)).toEqual(['fine']);
        expect(result.failed).toEqual(['Flaky', 'Busy']);
    });

    it("never asks for a day before the API's first", async () => {
        const calls: string[] = [];
        const fetchImpl = (async (url: string | URL | Request) => {
            calls.push(String(url));
            return respond(200, payload('Ok', []));
        }) as unknown as typeof fetch;
        await fetchWikipediaViews([brand('ok', ['Ok'])], {from: '2010-01-01', to: '2026-09-01'}, {fetchImpl, gapMs: 0});
        expect(calls[0]).toContain('/daily/20150701/20260901');
    });
});
