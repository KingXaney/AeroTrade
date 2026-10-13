// Apple's App Store charts: two keyless JSON feeds a day (top free, top paid), each app mapped
// to a catalog brand by its exact app name first, then its artist name. A brand's day is its
// best chart score, 101 − rank; an app the catalog does not name is ignored.

import {CULTURE_BRANDS} from "@/lib/culture/catalog";
import {APP_STORE_CHART_SIZE, cultureUserAgent} from "@/lib/culture/config";
import {contactEmail} from "@/lib/news/config";
import type {AttentionRow, CultureBrand} from "@/lib/culture/types";

export const APP_STORE_CHARTS = ['top-free', 'top-paid'] as const;
export type AppStoreChart = (typeof APP_STORE_CHARTS)[number];

const BASE = 'https://rss.marketingtools.apple.com/api/v2/us/apps';

export const appStoreUrl = (chart: AppStoreChart): string => `${BASE}/${chart}/${APP_STORE_CHART_SIZE}/apps.json`;

export type ParsedApp = {rank: number; id: string; name: string; artistName: string};

// The feed's results in chart order; a result without a name is skipped but keeps its rank.
export const parseAppStoreFeed = (json: unknown): ParsedApp[] => {
    const results = (json as {feed?: {results?: unknown[]}} | null)?.feed?.results;
    if (!Array.isArray(results)) return [];
    const apps: ParsedApp[] = [];
    results.forEach((result, index) => {
        const row = result as {id?: unknown; name?: unknown; artistName?: unknown} | null;
        if (!row || typeof row.name !== 'string') return;
        apps.push({
            rank: index + 1,
            id: typeof row.id === 'string' ? row.id : String(row.id ?? ''),
            name: row.name,
            artistName: typeof row.artistName === 'string' ? row.artistName : '',
        });
    });
    return apps;
};

// Off the chart is 0; number one is the chart's size.
export const chartScore = (rank: number | null): number =>
    rank === null || rank < 1 ? 0 : Math.max(0, APP_STORE_CHART_SIZE + 1 - rank);

export type BrandRank = {rank: number; app: string};

// Which brand each app is, by exact name then exact artist, and the best rank a brand reached.
export const mapAppsToBrands = (apps: readonly ParsedApp[], catalog: readonly CultureBrand[] = CULTURE_BRANDS): Map<string, BrandRank> => {
    const byName = new Map<string, string>();
    const byArtist = new Map<string, string>();
    for (const brand of catalog) {
        for (const name of brand.appNames ?? []) byName.set(name.toLowerCase(), brand.id);
        for (const artist of brand.appArtists ?? []) byArtist.set(artist.toLowerCase(), brand.id);
    }
    const best = new Map<string, BrandRank>();
    for (const app of apps) {
        const brand = byName.get(app.name.toLowerCase()) ?? byArtist.get(app.artistName.toLowerCase());
        if (!brand) continue;
        const known = best.get(brand);
        if (!known || app.rank < known.rank) best.set(brand, {rank: app.rank, app: app.name});
    }
    return best;
};

export type AppStoreFetch = {rows: AttentionRow[]; mapped: number; ok: boolean};

// Both charts for `day`: one row per mapped brand, its best score across the two.
export const fetchAppStoreCharts = async (
    day: string,
    catalog: readonly CultureBrand[] = CULTURE_BRANDS,
    {fetchImpl = fetch}: {fetchImpl?: typeof fetch} = {},
): Promise<AppStoreFetch> => {
    const scores = new Map<string, number>();
    let ok = true;
    for (const chart of APP_STORE_CHARTS) {
        try {
            const response = await fetchImpl(appStoreUrl(chart), {
                headers: {'User-Agent': cultureUserAgent(contactEmail()), Accept: 'application/json'},
                cache: 'no-store',
            });
            if (!response.ok) {
                ok = false;
                continue;
            }
            const ranks = mapAppsToBrands(parseAppStoreFeed(await response.json()), catalog);
            for (const [brand, {rank}] of ranks) scores.set(brand, Math.max(scores.get(brand) ?? 0, chartScore(rank)));
        } catch {
            ok = false;
        }
    }
    const rows: AttentionRow[] = [...scores].map(([brand, value]) => ({brand, source: 'appstore', date: day, value}));
    return {rows, mapped: rows.length, ok};
};
