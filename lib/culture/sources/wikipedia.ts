// Wikipedia pageviews: the objective attention clock. One keyless request per article title
// for a date range, from the Wikimedia REST API (daily data since July 2015, complete for a day
// by ~06:00 UTC the next). A brand's views are the sum over its titles. Nothing here throws to
// a caller: a title that does not exist is `missing`, a request that fails is `failed`, and a
// brand with a failed title writes no rows this run — the next run's lookback heals the gap.

import {CULTURE_BRANDS} from "@/lib/culture/catalog";
import {reportLimit, responseSignal} from "@/lib/limits/report";
import {
    cultureUserAgent,
    WIKI_DATA_START,
    WIKIPEDIA_REFUSALS_TO_STOP,
    WIKIPEDIA_REQUEST_GAP_MS,
    WIKIPEDIA_RETRY_DEFAULT_MS,
    WIKIPEDIA_RETRY_MAX_MS,
    WIKIPEDIA_STEP_BUDGET_MS,
} from "@/lib/culture/config";
import {contactEmail} from "@/lib/news/config";
import type {AttentionPoint, AttentionRow, CultureBrand} from "@/lib/culture/types";

const API = 'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user';

const compact = (date: string): string => date.replace(/-/g, '');

export const wikipediaUrlFor = (title: string, from: string, to: string): string =>
    `${API}/${encodeURIComponent(title)}/daily/${compact(from)}/${compact(to)}`;

// The API's items, as dated points; a malformed item is skipped.
export const parseWikipediaResponse = (json: unknown): AttentionPoint[] => {
    const items = (json as {items?: unknown[]} | null)?.items;
    if (!Array.isArray(items)) return [];
    const points: AttentionPoint[] = [];
    for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        const row = item as {timestamp?: unknown; views?: unknown};
        if (typeof row.timestamp !== 'string' || !/^\d{8}/.test(row.timestamp)) continue;
        if (typeof row.views !== 'number' || !Number.isFinite(row.views)) continue;
        const ts = row.timestamp;
        points.push({date: `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}`, value: row.views});
    }
    return points;
};

type FetchOptions = {
    fetchImpl?: typeof fetch;
    gapMs?: number;
    // Seams for the tests: the waits, the clock and the step's time budget.
    sleepImpl?: (ms: number) => Promise<void>;
    nowImpl?: () => number;
    budgetMs?: number;
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

type TitleResult = {status: 'ok'; points: AttentionPoint[]} | {status: 'missing'} | {status: 'failed'; refused: boolean};

// What a refusal asks to wait: its Retry-After in seconds, else Wikimedia's five seconds, capped.
export const retryWaitMs = (header: string | null): number => {
    const seconds = header === null ? NaN : Number(header);
    const ms = Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : WIKIPEDIA_RETRY_DEFAULT_MS;
    return Math.min(ms, WIKIPEDIA_RETRY_MAX_MS);
};

const request = (title: string, from: string, to: string, fetchImpl: typeof fetch): Promise<Response> =>
    fetchImpl(wikipediaUrlFor(title, from, to), {
        headers: {'User-Agent': cultureUserAgent(contactEmail()), Accept: 'application/json'},
        cache: 'no-store',
    });

// One title: a refusal is asked again once, after the wait it names; only a request that still
// fails is filed against the tracker, since a retry that lands lost nothing.
const fetchTitle = async (title: string, from: string, to: string, fetchImpl: typeof fetch, sleepImpl: (ms: number) => Promise<void>): Promise<TitleResult> => {
    try {
        let response = await request(title, from, to, fetchImpl);
        if (response.status === 429) {
            await sleepImpl(retryWaitMs(response.headers.get('Retry-After')));
            response = await request(title, from, to, fetchImpl);
        }
        if (response.status === 404) return {status: 'missing'};
        if (!response.ok) {
            await reportLimit('wikipedia', await responseSignal(response, `pageviews ${title}`));
            return {status: 'failed', refused: response.status === 429};
        }
        return {status: 'ok', points: parseWikipediaResponse(await response.json())};
    } catch {
        return {status: 'failed', refused: false};
    }
};

export type WikipediaFetch = {rows: AttentionRow[]; missing: string[]; failed: string[]};

// Every brand's views over [from, to], one request per title, spaced apart. `from` never
// precedes the API's first day. Three refusals in a row, or the step's budget spent, end the
// asking: every title not yet asked is failed, for the next run's lookback to heal.
export const fetchWikipediaViews = async (
    brands: readonly CultureBrand[] = CULTURE_BRANDS,
    {from, to}: {from: string; to: string},
    {fetchImpl = fetch, gapMs = WIKIPEDIA_REQUEST_GAP_MS, sleepImpl = sleep, nowImpl = Date.now, budgetMs = WIKIPEDIA_STEP_BUDGET_MS}: FetchOptions = {},
): Promise<WikipediaFetch> => {
    const start = from < WIKI_DATA_START ? WIKI_DATA_START : from;
    const startedAt = nowImpl();
    const rows: AttentionRow[] = [];
    const missing: string[] = [];
    const failed: string[] = [];
    let first = true;
    let refusals = 0;
    for (const brand of brands) {
        const byDate = new Map<string, number>();
        let brandFailed = false;
        for (const title of brand.wikipedia) {
            if (refusals >= WIKIPEDIA_REFUSALS_TO_STOP || nowImpl() - startedAt >= budgetMs) {
                failed.push(title);
                brandFailed = true;
                continue;
            }
            if (!first && gapMs > 0) await sleepImpl(gapMs);
            first = false;
            const result = await fetchTitle(title, start, to, fetchImpl, sleepImpl);
            if (result.status === 'missing') {
                refusals = 0;
                missing.push(title);
                continue;
            }
            if (result.status === 'failed') {
                refusals = result.refused ? refusals + 1 : 0;
                failed.push(title);
                brandFailed = true;
                continue;
            }
            refusals = 0;
            for (const point of result.points) byDate.set(point.date, (byDate.get(point.date) ?? 0) + point.value);
        }
        if (brandFailed) continue;
        for (const [date, value] of byDate) rows.push({brand: brand.id, source: 'wikipedia', date, value});
    }
    return {rows, missing, failed};
};
