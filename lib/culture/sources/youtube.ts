// YouTube's most-popular chart through the official Data API: fifty videos for one quota unit
// a day, each an item the alias matcher and the model read. The per-brand search rotation
// costs a hundred units a search and runs only when CULTURE_YOUTUBE_SEARCH_PER_DAY says so.
// Without YOUTUBE_API_KEY the source is skipped and the run says so.

import {CULTURE_BRANDS} from "@/lib/culture/catalog";
import {CULTURE_ITEM_BODY_CHARS, YOUTUBE_CHART_SIZE} from "@/lib/culture/config";
import type {CultureBrand, CultureItemInput} from "@/lib/culture/types";

const API = 'https://www.googleapis.com/youtube/v3';

type YouTubeEnv = Readonly<Record<string, string | undefined>>;

export const youtubeConfigured = (env: YouTubeEnv = process.env): boolean => Boolean(env.YOUTUBE_API_KEY?.trim());

// How many per-brand searches a day the env allows (0, the default, means none).
export const youtubeSearchesPerDay = (env: YouTubeEnv = process.env): number => {
    const raw = Number(env.CULTURE_YOUTUBE_SEARCH_PER_DAY ?? 0);
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
};

export const youtubeChartUrl = (key: string): string =>
    `${API}/videos?part=snippet,statistics&chart=mostPopular&regionCode=US&maxResults=${YOUTUBE_CHART_SIZE}&key=${encodeURIComponent(key)}`;

export const youtubeSearchUrl = (key: string, query: string, publishedAfter: string): string =>
    `${API}/search?part=snippet&type=video&order=viewCount&regionCode=US&maxResults=10&q=${encodeURIComponent(query)}&publishedAfter=${encodeURIComponent(publishedAfter)}&key=${encodeURIComponent(key)}`;

export type ParsedVideo = {
    id: string;
    title: string;
    description: string;
    channel: string;
    publishedAt: number;   // unix seconds
    views: number;
    position: number;
};

const parseIso = (value: unknown): number => {
    const ms = typeof value === 'string' ? Date.parse(value) : Number.NaN;
    return Number.isFinite(ms) ? Math.floor(ms / 1000) : 0;
};

// A videos.list or search.list answer as videos; an item without an id or a title is skipped.
export const parseYouTubeVideos = (json: unknown): ParsedVideo[] => {
    const items = (json as {items?: unknown[]} | null)?.items;
    if (!Array.isArray(items)) return [];
    const videos: ParsedVideo[] = [];
    items.forEach((item, index) => {
        const row = item as {id?: unknown; snippet?: Record<string, unknown>; statistics?: Record<string, unknown>} | null;
        const rawId = row?.id;
        const id = typeof rawId === 'string' ? rawId : (rawId as {videoId?: unknown} | undefined)?.videoId;
        const snippet = row?.snippet;
        if (typeof id !== 'string' || !id || !snippet || typeof snippet.title !== 'string') return;
        const views = Number(row?.statistics?.viewCount ?? 0);
        videos.push({
            id,
            title: snippet.title,
            description: typeof snippet.description === 'string' ? snippet.description : '',
            channel: typeof snippet.channelTitle === 'string' ? snippet.channelTitle : '',
            publishedAt: parseIso(snippet.publishedAt),
            views: Number.isFinite(views) ? views : 0,
            position: index + 1,
        });
    });
    return videos;
};

export const toYouTubeItems = (videos: readonly ParsedVideo[]): CultureItemInput[] =>
    videos.map((video) => ({
        source: 'youtube',
        sourceName: video.channel,
        title: video.title,
        body: video.description.replace(/\s+/g, ' ').trim().slice(0, CULTURE_ITEM_BODY_CHARS),
        url: `https://www.youtube.com/watch?v=${video.id}`,
        datetime: video.publishedAt,
        score: video.views,
    }));

// The brands searched on a given day: those with a query, in catalog order, rotating by the
// day so every brand comes round in catalog.length / perDay days.
export const youtubeSearchRotation = (brands: readonly CultureBrand[], dayIndex: number, perDay: number): CultureBrand[] => {
    const searchable = brands.filter((brand) => brand.youtubeQuery);
    if (perDay <= 0 || searchable.length === 0) return [];
    const start = ((dayIndex % searchable.length) + searchable.length) % searchable.length;
    return Array.from({length: Math.min(perDay, searchable.length)}, (_, i) => searchable[(start + i) % searchable.length]);
};

export type YouTubeFetch = {items: CultureItemInput[]; ok: boolean; skipped: boolean; searches: number};

type FetchOptions = {fetchImpl?: typeof fetch; env?: YouTubeEnv; dayIndex?: number; catalog?: readonly CultureBrand[]; publishedAfter?: string};

export const fetchYouTube = async ({
    fetchImpl = fetch,
    env = process.env,
    dayIndex = 0,
    catalog = CULTURE_BRANDS,
    publishedAfter,
}: FetchOptions = {}): Promise<YouTubeFetch> => {
    if (!youtubeConfigured(env)) return {items: [], ok: true, skipped: true, searches: 0};
    const key = env.YOUTUBE_API_KEY as string;
    const items: CultureItemInput[] = [];
    let ok = true;
    const read = async (url: string): Promise<void> => {
        try {
            const response = await fetchImpl(url, {cache: 'no-store'});
            if (!response.ok) {
                ok = false;
                return;
            }
            items.push(...toYouTubeItems(parseYouTubeVideos(await response.json())));
        } catch {
            ok = false;
        }
    };
    await read(youtubeChartUrl(key));
    const rotation = youtubeSearchRotation(catalog, dayIndex, youtubeSearchesPerDay(env));
    const since = publishedAfter ?? new Date(Date.now() - 7 * 86_400_000).toISOString();
    for (const brand of rotation) await read(youtubeSearchUrl(key, brand.youtubeQuery as string, since));
    return {items, ok, skipped: false, searches: rotation.length};
};
