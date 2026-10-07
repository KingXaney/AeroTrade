import {describe, expect, it} from 'vitest';
import {APP_STORE_CHART_SIZE} from '@/lib/culture/config';
import {appStoreUrl, chartScore, fetchAppStoreCharts, mapAppsToBrands, parseAppStoreFeed} from '@/lib/culture/sources/appstore';
import type {CultureBrand} from '@/lib/culture/types';

const brand = (id: string, extra: Partial<CultureBrand>): CultureBrand =>
    ({id, name: id, category: 'apps', aliases: [id], owner: null, wikipedia: [id], ...extra});

const CATALOG: readonly CultureBrand[] = [
    brand('tiktok', {appArtists: ['TikTok Ltd.'], appNames: ['TikTok']}),
    brand('mcdonalds', {appNames: ["McDonald's"]}),
    brand('temu', {appArtists: ['Temu']}),
    brand('threads', {appNames: ['Threads']}),
    brand('instagram', {appArtists: ['Instagram, Inc.'], appNames: ['Instagram']}),
];

const feed = (apps: [string, string][]) => ({
    feed: {updated: 'Wed, 7 Oct 2026 02:19:16 +0000', results: apps.map(([name, artistName], i) => ({id: String(i), name, artistName, genres: [], url: ''}))},
});

describe('appStoreUrl and chartScore', () => {
    it('reads the US chart at the configured size', () => {
        expect(appStoreUrl('top-free')).toBe(`https://rss.marketingtools.apple.com/api/v2/us/apps/top-free/${APP_STORE_CHART_SIZE}/apps.json`);
    });

    it('scores number one highest and off the chart zero', () => {
        expect(chartScore(1)).toBe(APP_STORE_CHART_SIZE);
        expect(chartScore(APP_STORE_CHART_SIZE)).toBe(1);
        expect(chartScore(null)).toBe(0);
        expect(chartScore(0)).toBe(0);
        expect(chartScore(APP_STORE_CHART_SIZE + 5)).toBe(0);
    });
});

describe('parseAppStoreFeed', () => {
    it('keeps chart order as rank and skips a result without a name', () => {
        const apps = parseAppStoreFeed({feed: {results: [{id: '1', name: 'A', artistName: 'X'}, {id: '2'}, {id: '3', name: 'C', artistName: 'Z'}]}});
        expect(apps).toEqual([{rank: 1, id: '1', name: 'A', artistName: 'X'}, {rank: 3, id: '3', name: 'C', artistName: 'Z'}]);
        expect(parseAppStoreFeed(null)).toEqual([]);
        expect(parseAppStoreFeed({feed: {}})).toEqual([]);
    });
});

describe('mapAppsToBrands', () => {
    it('maps by exact app name first, then by artist, keeping the best rank per brand', () => {
        const apps = parseAppStoreFeed(feed([
            ['Threads', 'Instagram, Inc.'],
            ['TikTok Pro - Events', 'TikTok Ltd.'],
            ['Instagram', 'Instagram, Inc.'],
            ["McDonald's", "McDonald's USA"],
            ['TikTok', 'TikTok Ltd.'],
            ['Temu: Shop Like a Billionaire', 'Temu'],
            ['Unknown app', 'Unknown Co'],
        ]));
        const mapped = mapAppsToBrands(apps, CATALOG);
        expect(mapped.get('threads')).toEqual({rank: 1, app: 'Threads'});
        expect(mapped.get('tiktok')).toEqual({rank: 2, app: 'TikTok Pro - Events'});
        expect(mapped.get('instagram')).toEqual({rank: 3, app: 'Instagram'});
        expect(mapped.get('mcdonalds')).toEqual({rank: 4, app: "McDonald's"});
        expect(mapped.get('temu')).toEqual({rank: 6, app: 'Temu: Shop Like a Billionaire'});
        expect(mapped.size).toBe(5);
    });

    it('matches regardless of case', () => {
        const mapped = mapAppsToBrands(parseAppStoreFeed(feed([['TIKTOK', 'tiktok ltd.']])), CATALOG);
        expect(mapped.get('tiktok')?.rank).toBe(1);
    });
});

describe('fetchAppStoreCharts', () => {
    it('takes the best score across both charts and reports a failed chart without throwing', async () => {
        const fetchImpl = (async (url: string | URL | Request) => {
            const u = String(url);
            if (u.includes('top-free')) return new Response(JSON.stringify(feed([['Threads', 'Instagram, Inc.'], ['TikTok', 'TikTok Ltd.']])), {status: 200});
            return new Response(JSON.stringify(feed([['TikTok', 'TikTok Ltd.']])), {status: 200});
        }) as unknown as typeof fetch;
        const result = await fetchAppStoreCharts('2026-10-06', CATALOG, {fetchImpl});
        expect(result.ok).toBe(true);
        expect(result.mapped).toBe(2);
        expect(result.rows).toEqual(expect.arrayContaining([
            {brand: 'threads', source: 'appstore', date: '2026-10-06', value: APP_STORE_CHART_SIZE},
            {brand: 'tiktok', source: 'appstore', date: '2026-10-06', value: APP_STORE_CHART_SIZE},
        ]));

        const flaky = (async (url: string | URL | Request) => {
            if (String(url).includes('top-paid')) throw new Error('down');
            return new Response(JSON.stringify(feed([['Threads', 'Instagram, Inc.']])), {status: 200});
        }) as unknown as typeof fetch;
        const partial = await fetchAppStoreCharts('2026-10-06', CATALOG, {fetchImpl: flaky});
        expect(partial.ok).toBe(false);
        expect(partial.rows).toHaveLength(1);
    });
});
