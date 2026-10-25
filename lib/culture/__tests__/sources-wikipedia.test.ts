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

describe('fetchWikipediaViews under the rate limit', () => {
    const okFor = (article: string) => respond(200, payload(article, [['2026-09-01', 5]]));
    const refused = (retryAfter?: string): Response =>
        new Response('Too many requests', {status: 429, headers: retryAfter ? {'Retry-After': retryAfter} : {}});

    it('waits what a refusal asks, once, then asks again', async () => {
        const waits: number[] = [];
        let first = true;
        const fetchImpl = (async (url: string | URL | Request) => {
            if (String(url).includes('/Busy/') && first) {
                first = false;
                return refused('2');
            }
            return okFor('Busy');
        }) as unknown as typeof fetch;
        const result = await fetchWikipediaViews([brand('busy', ['Busy'])], {from: '2026-09-01', to: '2026-09-01'},
            {fetchImpl, gapMs: 0, sleepImpl: async (ms) => { waits.push(ms); }});
        expect(waits).toEqual([2000]);
        expect(result.rows).toEqual([{brand: 'busy', source: 'wikipedia', date: '2026-09-01', value: 5}]);
        expect(result.failed).toEqual([]);
    });

    it('waits five seconds when a refusal names no wait, and never longer than the cap', async () => {
        const waits: number[] = [];
        const answers = [refused(), okFor('A'), refused('120'), okFor('B')];
        const fetchImpl = (async () => answers.shift()!) as unknown as typeof fetch;
        await fetchWikipediaViews([brand('a', ['A']), brand('b', ['B'])], {from: '2026-09-01', to: '2026-09-01'},
            {fetchImpl, gapMs: 0, sleepImpl: async (ms) => { waits.push(ms); }});
        expect(waits).toEqual([5000, 10_000]);
    });

    it('marks a title refused twice as failed', async () => {
        const fetchImpl = (async (url: string | URL | Request) => (String(url).includes('/Busy/') ? refused('1') : okFor('Ok'))) as unknown as typeof fetch;
        const result = await fetchWikipediaViews([brand('busy', ['Busy']), brand('fine', ['Ok'])], {from: '2026-09-01', to: '2026-09-01'},
            {fetchImpl, gapMs: 0, sleepImpl: async () => {}});
        expect(result.failed).toEqual(['Busy']);
        expect(result.rows.map((r) => r.brand)).toEqual(['fine']);
    });

    it('stops asking after three refusals in a row; the rest are left for the next run', async () => {
        const calls: string[] = [];
        const fetchImpl = (async (url: string | URL | Request) => {
            calls.push(String(url));
            return refused('1');
        }) as unknown as typeof fetch;
        const result = await fetchWikipediaViews(['a', 'b', 'c', 'd', 'e'].map((id) => brand(id, [id.toUpperCase()])), {from: '2026-09-01', to: '2026-09-01'},
            {fetchImpl, gapMs: 0, sleepImpl: async () => {}});
        // Each of the first three asked twice (the retry), the last two never.
        expect(calls).toHaveLength(6);
        expect(result.failed).toEqual(['A', 'B', 'C', 'D', 'E']);
        expect(result.rows).toEqual([]);
    });

    it('asks nothing more once its time is spent', async () => {
        let now = 0;
        const calls: string[] = [];
        const fetchImpl = (async (url: string | URL | Request) => {
            calls.push(String(url));
            now += 20_000;
            return okFor('X');
        }) as unknown as typeof fetch;
        const result = await fetchWikipediaViews(['a', 'b', 'c', 'd'].map((id) => brand(id, [id.toUpperCase()])), {from: '2026-09-01', to: '2026-09-01'},
            {fetchImpl, gapMs: 0, sleepImpl: async () => {}, nowImpl: () => now, budgetMs: 45_000});
        // 0, 20 and 40 seconds in it asks; at 60 the budget is spent.
        expect(calls).toHaveLength(3);
        expect(result.rows.map((r) => r.brand)).toEqual(['a', 'b', 'c']);
        expect(result.failed).toEqual(['D']);
    });

    it('names the site in the User-Agent, as Wikimedia asks of a bot', async () => {
        let agent = '';
        const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
            agent = String((init?.headers as Record<string, string>)['User-Agent']);
            return okFor('Ok');
        }) as unknown as typeof fetch;
        await fetchWikipediaViews([brand('ok', ['Ok'])], {from: '2026-09-01', to: '2026-09-01'}, {fetchImpl, gapMs: 0});
        expect(agent).toMatch(/^AeroTrade\/1\.0 \(https:\/\/aerotrading\.vercel\.app; culture brain; contact .+\)$/);
    });
});
