// The daily culture update's step bodies (NOT a 'use server' module): read every source into
// the attention series and the items, count the brands each item names, show the model a
// bounded batch, fold what it (or the alias matcher) read and what the series say, and keep
// the names it met that the catalog lacks. lib/jobs/functions/culture.ts runs these as its
// steps; lib/culture/update.ts moves the entities. Every step returns plain JSON, because on an
// Inngest replay a memoized step does not run again.

import {brandById, CULTURE_BRANDS} from "@/lib/culture/catalog";
import {
    ATTENTION_FOLD_LOOKBACK_DAYS,
    CULTURE_EXTRACTION_BATCH_SIZE,
    CULTURE_MAX_EXTRACTION_CALLS_PER_DAY,
    CULTURE_NEWS_ITEM_CAP,
    CULTURE_QUEUE_BODY_CHARS,
    FALLBACK_IMPORTANCE,
} from "@/lib/culture/config";
import {parseCultureResponse, readCultureBatch, type BatchItemRef} from "@/lib/culture/extraction";
import {attentionFoldsFor, type BrandSeries} from "@/lib/culture/features";
import {brandMentions, compileCatalog, countByBrand, isCatalogName, prioritizeQueue, type QueuedCultureItem} from "@/lib/culture/mentions";
import {buildCultureExtractionPrompt} from "@/lib/culture/prompts";
import {fetchAppStoreCharts} from "@/lib/culture/sources/appstore";
import {cultureNewsQueries, fetchCultureNews} from "@/lib/culture/sources/news";
import {fetchCultureReddit} from "@/lib/culture/sources/reddit";
import {resolveSocialAdapter} from "@/lib/culture/sources/social";
import {fetchWikipediaViews} from "@/lib/culture/sources/wikipedia";
import {fetchYouTube} from "@/lib/culture/sources/youtube";
import {
    getAttentionSeries,
    insertCultureItems,
    loadItemsForDay,
    recordSuggestions,
    setItemMentions,
    stampExtractions,
    writeAttentionRows,
    type DayItem,
} from "@/lib/culture/store";
import type {AttentionRow, CultureFold, CultureItemInput, CultureItemSource} from "@/lib/culture/types";
import {addCalendarDays} from "@/lib/dates";

// ---- sources ----

export type WikipediaOutcome = {written: number; missing: string[]; failed: string[]};

export const ingestWikipedia = async (brandIds: readonly string[], window: {from: string; to: string}, gapMs?: number): Promise<WikipediaOutcome> => {
    const brands = brandIds.map(brandById).filter((brand): brand is NonNullable<typeof brand> => Boolean(brand));
    const result = await fetchWikipediaViews(brands, window, gapMs === undefined ? {} : {gapMs});
    const written = await writeAttentionRows(result.rows);
    return {written, missing: result.missing, failed: result.failed};
};

export const ingestAppStore = async (day: string): Promise<{mapped: number; ok: boolean}> => {
    const result = await fetchAppStoreCharts(day);
    await writeAttentionRows(result.rows);
    return {mapped: result.mapped, ok: result.ok};
};

export const ingestYouTube = async (day: string, dayIndex: number): Promise<{inserted: number; ok: boolean; skipped: boolean; searches: number}> => {
    const result = await fetchYouTube({dayIndex});
    const inserted = await insertCultureItems(result.items, day);
    return {inserted, ok: result.ok, skipped: result.skipped, searches: result.searches};
};

export const ingestReddit = async (day: string): Promise<{inserted: number; skipped: boolean; subreddits: number; empty: number}> => {
    const result = await fetchCultureReddit();
    const inserted = await insertCultureItems(result.items, day);
    return {inserted, skipped: result.skipped, subreddits: result.subreddits, empty: result.empty};
};

// The news queries, in the chunks the job runs as steps.
export const newsQueryChunks = (size: number): string[][] => {
    const queries = cultureNewsQueries();
    const chunks: string[][] = [];
    for (let i = 0; i < queries.length; i += Math.max(1, size)) chunks.push(queries.slice(i, i + Math.max(1, size)));
    return chunks;
};

export const ingestNews = async (queries: readonly string[], day: string, gapMs = 1000): Promise<{inserted: number; ok: boolean; skipped: boolean}> => {
    const result = await fetchCultureNews(queries, {gapMs});
    // Items that name a catalog brand come first under the cap; the rest are where a brand the
    // catalog lacks would be met.
    const compiled = compileCatalog();
    const matched: CultureItemInput[] = [];
    const unmatched: CultureItemInput[] = [];
    for (const item of result.items) (brandMentions(item, compiled).length > 0 ? matched : unmatched).push(item);
    const inserted = await insertCultureItems([...matched, ...unmatched].slice(0, CULTURE_NEWS_ITEM_CAP), day);
    return {inserted, ok: result.ok, skipped: result.skipped};
};

export const socialAdapterId = (): string | null => resolveSocialAdapter()?.id ?? null;

export const ingestSocial = async (day: string): Promise<{inserted: number; rows: number; adapter: string | null}> => {
    const adapter = resolveSocialAdapter();
    if (!adapter) return {inserted: 0, rows: 0, adapter: null};
    const result = await adapter.fetchDaily({day, catalog: CULTURE_BRANDS});
    const inserted = await insertCultureItems(result.items, day);
    const rows = await writeAttentionRows(result.rows);
    return {inserted, rows, adapter: adapter.id};
};

// ---- mentions and the queue ----

const ITEM_SOURCES: readonly CultureItemSource[] = ['reddit', 'news', 'youtube', 'social'];

export type MentionOutcome = {
    queue: QueuedCultureItem[];
    counts: {items: number; matched: number; brands: number};
};

// Every item of the day gets its alias matches; each brand's count per source becomes a day of
// its series; and the model's queue is the day's items in priority order, bodies cut short.
export const countMentionsAndQueue = async (day: string): Promise<MentionOutcome> => {
    const items = await loadItemsForDay(day);
    const compiled = compileCatalog();
    const matched = items.map((item) => ({...item, mentions: brandMentions(item, compiled)}));
    await setItemMentions(matched.map((item) => ({id: item.id, mentions: item.mentions})));

    const counts = countByBrand(matched);
    const rows: AttentionRow[] = [];
    for (const [brand, bySource] of counts) {
        for (const source of ITEM_SOURCES) {
            const count = bySource.get(source);
            if (count) rows.push({brand, source, date: day, value: count.count});
        }
    }
    await writeAttentionRows(rows);

    const queue = prioritizeQueue(
        matched.filter((item) => !item.extracted).map(toQueued),
        CULTURE_EXTRACTION_BATCH_SIZE * CULTURE_MAX_EXTRACTION_CALLS_PER_DAY,
    );
    return {queue, counts: {items: items.length, matched: matched.filter((item) => item.mentions.length > 0).length, brands: counts.size}};
};

const toQueued = (item: DayItem & {mentions: string[]}): QueuedCultureItem => ({
    id: item.id,
    contentHash: item.contentHash,
    source: item.source,
    sourceName: item.sourceName,
    title: item.title,
    body: item.body.slice(0, CULTURE_QUEUE_BODY_CHARS),
    mentions: item.mentions,
    ...(typeof item.score === 'number' ? {score: item.score} : {}),
    datetime: item.datetime,
});

// The day's model calls: CULTURE_EXTRACTION_BATCH_SIZE items each, at most the daily budget.
export const cultureBatches = <T>(queue: readonly T[]): T[][] => {
    const count = Math.min(Math.ceil(queue.length / CULTURE_EXTRACTION_BATCH_SIZE), CULTURE_MAX_EXTRACTION_CALLS_PER_DAY);
    return Array.from({length: count}, (_, b) => queue.slice(b * CULTURE_EXTRACTION_BATCH_SIZE, (b + 1) * CULTURE_EXTRACTION_BATCH_SIZE));
};

export type BatchPrompt = {prompt: string; refs: BatchItemRef[]; allowedIds: string[]};

// What one batch asks: the items numbered from 1, and only the brands the matcher found in them.
export const buildCultureBatchPrompt = (batch: readonly QueuedCultureItem[]): BatchPrompt => {
    const refs = batch.map((item, index) => ({n: index + 1, id: item.id, source: item.source}));
    const allowedIds = [...new Set(batch.flatMap((item) => item.mentions))];
    const brands = allowedIds.map((id) => ({id, name: brandById(id)?.name ?? id}));
    const prompt = buildCultureExtractionPrompt(
        batch.map((item, index) => ({n: index + 1, source: item.sourceName, title: item.title, body: item.body})),
        brands,
    );
    return {prompt, refs, allowedIds};
};

export type AppliedCultureBatch = {folds: CultureFold[]; ids: string[]; newBrands: {name: string; itemHash: number}[]};

// One batch's answer, read and stamped on its items; the folds and the suggested names go back
// to the job through the step's return value.
export const applyCultureBatch = async ({index, batch, text, model, now}: {
    index: number;
    batch: readonly QueuedCultureItem[];
    text: string;
    model: string;
    now: Date;
}): Promise<AppliedCultureBatch> => {
    if (!text) return {folds: [], ids: [], newBrands: []};
    const parsed = parseCultureResponse(text);
    if (!parsed) {
        console.warn(`Culture extraction batch ${index} returned invalid JSON — skipped`);
        return {folds: [], ids: [], newBrands: []};
    }
    const {refs, allowedIds} = buildCultureBatchPrompt(batch);
    const read = readCultureBatch(parsed, refs, {allowedIds: new Set(allowedIds), isCatalogName: (name) => isCatalogName(name)});
    const hashById = new Map(batch.map((item) => [item.id, item.contentHash]));
    await stampExtractions(read.map((item) => ({
        id: item.itemId,
        extraction: {
            model,
            extractedAt: now,
            importance: item.importance,
            signal: item.signal,
            entities: item.brands,
            newBrands: item.newBrands,
        },
    })));
    return {
        folds: read.filter((item) => item.brands.length > 0).map((item) => ({kind: 'item' as const, source: item.source, importance: item.importance, entities: item.brands})),
        ids: read.map((item) => item.itemId),
        newBrands: read.flatMap((item) => item.newBrands.map((name) => ({name, itemHash: hashById.get(item.itemId) ?? 0}))),
    };
};

// Every item of the day the model never read folds through its alias matches alone, at a flat
// importance and no sentiment, so a day without model calls still moves the graph.
export const foldUnextractedItems = async (day: string, now: Date): Promise<{folds: CultureFold[]; stamped: number}> => {
    const items = (await loadItemsForDay(day)).filter((item) => !item.extracted && item.mentions.length > 0);
    await stampExtractions(items.map((item) => ({
        id: item.id,
        extraction: {
            model: 'alias-match',
            extractedAt: now,
            importance: FALLBACK_IMPORTANCE,
            signal: 'other',
            entities: item.mentions.map((key) => ({key, sentiment: 0, relevance: 1})),
            newBrands: [],
        },
    })));
    return {
        folds: items.map((item) => ({kind: 'item' as const, source: item.source, importance: FALLBACK_IMPORTANCE, entities: item.mentions.map((key) => ({key, sentiment: 0, relevance: 1}))})),
        stamped: items.length,
    };
};

// The day's attention surprises from the stored series, as folds.
export const computeAttentionFolds = async (asOf: string): Promise<{folds: CultureFold[]; brandsWithSignal: number}> => {
    const ids = CULTURE_BRANDS.map((brand) => brand.id);
    const series = await getAttentionSeries(ids, {sources: ['wikipedia', 'appstore'], from: addCalendarDays(asOf, -ATTENTION_FOLD_LOOKBACK_DAYS), to: asOf});
    const byBrand = new Map<string, BrandSeries>();
    for (const id of ids) {
        const bySource = series.get(id);
        byBrand.set(id, {wikipedia: bySource?.get('wikipedia') ?? [], appstore: bySource?.get('appstore') ?? []});
    }
    const folds = attentionFoldsFor(byBrand, asOf);
    return {folds, brandsWithSignal: new Set(folds.flatMap((fold) => fold.entities.map((entity) => entity.key))).size};
};

export const recordNewBrands = async (names: readonly {name: string; itemHash: number}[], now: Date): Promise<{added: number; counted: number}> =>
    recordSuggestions(names, now);

// ---- the summary line the status strip shows ----

export type CultureRunParts = {
    wikipedia: {written: number; missing: number; failed: number};
    appstore: {mapped: number; ok: boolean};
    youtube: {inserted: number; skipped: boolean; ok: boolean};
    reddit: {inserted: number; skipped: boolean};
    news: {inserted: number; skipped: boolean; ok: boolean};
    social: {inserted: number; adapter: string | null};
    items: number;
    matched: number;
    extracted: number;
    aliasFolded: number;
    attentionFolded: number;
    entitiesTouched: number;
    deleted: number;
    suggestions: {added: number; counted: number};
    quotaHit: boolean;
    // No model key at all: nothing was labelled, everything folded by alias.
    modelOff?: boolean;
};

export const describeCultureRun = (p: CultureRunParts): string => {
    const sources = [
        `wikipedia ${p.wikipedia.written} docs${p.wikipedia.missing ? `, ${p.wikipedia.missing} titles missing` : ''}${p.wikipedia.failed ? `, ${p.wikipedia.failed} failed` : ''}`,
        `app store ${p.appstore.ok ? `${p.appstore.mapped} brands` : 'failed'}`,
        `youtube ${p.youtube.skipped ? 'skipped (no key)' : p.youtube.ok ? `${p.youtube.inserted} new` : 'failed'}`,
        `reddit ${p.reddit.skipped ? 'skipped (no app)' : `${p.reddit.inserted} new`}`,
        `news ${p.news.skipped ? 'off' : p.news.ok ? `${p.news.inserted} new` : `${p.news.inserted} new, a query failed`}`,
        ...(p.social.adapter ? [`${p.social.adapter} ${p.social.inserted} new`] : []),
    ].join('; ');
    const reading = `${p.items} items today, ${p.matched} naming a brand, ${p.extracted} labelled by the model, ${p.aliasFolded} by alias${p.modelOff ? ' (no model key: alias folds only)' : p.quotaHit ? " (the model's daily quota ran out)" : ''}`;
    return `Culture brain updated: ${sources}. ${reading}; ${p.attentionFolded} attention surprises; ${p.entitiesTouched} brands touched, ${p.deleted} pruned; suggestions +${p.suggestions.added}/${p.suggestions.counted}`;
};
