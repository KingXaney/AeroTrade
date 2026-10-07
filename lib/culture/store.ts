// The culture brain's reads and writes (NOT a 'use server' module): attention series kept as
// monthly maps, the items the sources bring, the brand entities the fold keeps, and the
// suggestions queue. Everything here is its own collection — never BrainEntity or NewsItem
// (invariant 3; lib/culture/__tests__/guard.test.ts holds the import graph to it).

import CultureAttention from "@/database/models/culture-attention.model";
import CultureEntity, {type CultureEntityDoc} from "@/database/models/culture-entity.model";
import CultureItem, {type CultureItemDoc, type CultureItemExtraction} from "@/database/models/culture-item.model";
import CultureSuggestion from "@/database/models/culture-suggestion.model";
import {connectToDatabase} from "@/database/mongoose";
import {sentimentAvg} from "@/lib/brain/decay";
import {CULTURE_BRANDS} from "@/lib/culture/catalog";
import {CULTURE_SUGGESTION_CAP, CULTURE_SUGGESTION_SAMPLES} from "@/lib/culture/config";
import {isCatalogName} from "@/lib/culture/mentions";
import {rollupTickers, type TickerRollup} from "@/lib/culture/rollup";
import {CULTURE_SOURCES, type AttentionPoint, type AttentionRow, type CultureCategory, type CultureEntitySummary, type CultureItemInput, type CultureItemSource, type CultureSource, type Listing} from "@/lib/culture/types";
import {addCalendarDays, getEasternDateString} from "@/lib/dates";
import {hashId, normalizeUrl} from "@/lib/text";

// ---- attention series ----

const monthOf = (date: string): string => date.slice(0, 7);
const dayOf = (date: string): string => date.slice(8, 10);

// Every row lands as one day of its brand's monthly map; a day already stored is overwritten,
// so a late or corrected value heals in place. Returns the number of documents touched.
export const writeAttentionRows = async (rows: readonly AttentionRow[]): Promise<number> => {
    if (rows.length === 0) return 0;
    await connectToDatabase();
    const byDoc = new Map<string, {brand: string; source: CultureSource; month: string; set: Record<string, number>}>();
    for (const row of rows) {
        if (!Number.isFinite(row.value)) continue;
        const month = monthOf(row.date);
        const key = `${row.brand}|${row.source}|${month}`;
        const entry = byDoc.get(key) ?? {brand: row.brand, source: row.source, month, set: {}};
        entry.set[`days.${dayOf(row.date)}`] = row.value;
        byDoc.set(key, entry);
    }
    const ops = [...byDoc.values()].map((entry) => ({
        updateOne: {
            filter: {brand: entry.brand, source: entry.source, month: entry.month},
            update: {$set: {...entry.set, updatedAt: new Date()}},
            upsert: true,
        },
    }));
    if (ops.length > 0) await CultureAttention.bulkWrite(ops, {ordered: false});
    return ops.length;
};

type LeanAttention = {brand: string; source: string; month: string; days?: Record<string, number> | Map<string, number>};

const entriesOf = (days: LeanAttention['days']): [string, number][] =>
    days instanceof Map ? [...days.entries()] : Object.entries(days ?? {});

export type SeriesBySource = Map<CultureSource, AttentionPoint[]>;

// Each brand's daily points per source over [from, to], dated and sorted.
export const getAttentionSeries = async (
    brands: readonly string[],
    {sources = [...CULTURE_SOURCES], from, to}: {sources?: readonly CultureSource[]; from: string; to: string},
): Promise<Map<string, SeriesBySource>> => {
    const out = new Map<string, SeriesBySource>();
    if (brands.length === 0 || from > to) return out;
    await connectToDatabase();
    const docs = await CultureAttention.find({
        brand: {$in: brands},
        source: {$in: sources},
        month: {$gte: monthOf(from), $lte: monthOf(to)},
    }).lean<LeanAttention[]>();
    for (const doc of docs) {
        const bySource = out.get(doc.brand) ?? new Map<CultureSource, AttentionPoint[]>();
        const points = bySource.get(doc.source as CultureSource) ?? [];
        for (const [dd, value] of entriesOf(doc.days)) {
            const date = `${doc.month}-${dd}`;
            if (date < from || date > to || typeof value !== 'number') continue;
            points.push({date, value});
        }
        bySource.set(doc.source as CultureSource, points);
        out.set(doc.brand, bySource);
    }
    for (const bySource of out.values()) {
        for (const points of bySource.values()) points.sort((a, b) => a.date.localeCompare(b.date));
    }
    return out;
};

export const getBrandSeries = async (brand: string, window: {sources?: readonly CultureSource[]; from: string; to: string}): Promise<SeriesBySource> =>
    (await getAttentionSeries([brand], window)).get(brand) ?? new Map();

// The last day each source has for any brand: the system view's freshness line.
export const getSourceFreshness = async (): Promise<Record<CultureSource, string | null>> => {
    await connectToDatabase();
    const out = Object.fromEntries(CULTURE_SOURCES.map((source) => [source, null])) as Record<CultureSource, string | null>;
    for (const source of CULTURE_SOURCES) {
        const latest = await CultureAttention.findOne({source}).sort({month: -1}).lean<LeanAttention>();
        if (!latest) continue;
        const days = entriesOf(latest.days).map(([dd]) => dd).sort();
        if (days.length > 0) out[source] = `${latest.month}-${days[days.length - 1]}`;
    }
    return out;
};

// ---- items ----

// New items only; a duplicate link (the same post read twice, the same article from two
// queries) is the expected case and is not an error. Returns what was actually new.
export const insertCultureItems = async (inputs: readonly CultureItemInput[], day: string): Promise<number> => {
    if (inputs.length === 0) return 0;
    await connectToDatabase();
    const seen = new Set<number>();
    const docs = [];
    for (const input of inputs) {
        if (!input.url || !input.title.trim() || !Number.isFinite(input.datetime)) continue;
        const contentHash = hashId(normalizeUrl(input.url));
        if (seen.has(contentHash)) continue;
        seen.add(contentHash);
        docs.push({
            contentHash,
            source: input.source,
            sourceName: input.sourceName,
            title: input.title,
            body: input.body,
            url: input.url,
            datetime: input.datetime,
            publishedDate: getEasternDateString(new Date(input.datetime * 1000)),
            day,
            ...(typeof input.score === 'number' ? {score: input.score} : {}),
            mentions: [],
        });
    }
    if (docs.length === 0) return 0;
    try {
        return (await CultureItem.insertMany(docs, {ordered: false})).length;
    } catch (error) {
        const bulkError = error as {code?: number; writeErrors?: unknown[]; insertedDocs?: unknown[]};
        if (bulkError.code !== 11000 && !bulkError.writeErrors) throw error;
        return bulkError.insertedDocs?.length ?? 0;
    }
};

export type DayItem = {
    id: string;
    contentHash: number;
    source: CultureItemSource;
    sourceName: string;
    title: string;
    body: string;
    datetime: number;
    score?: number;
    mentions: string[];
    extracted: boolean;
};

type LeanItem = Pick<CultureItemDoc, 'contentHash' | 'source' | 'sourceName' | 'title' | 'body' | 'datetime' | 'score' | 'mentions' | 'extraction'> & {_id: unknown};

const toDayItem = (doc: LeanItem): DayItem => ({
    id: String(doc._id),
    contentHash: doc.contentHash,
    source: doc.source as CultureItemSource,
    sourceName: doc.sourceName,
    title: doc.title,
    body: doc.body,
    datetime: doc.datetime,
    ...(typeof doc.score === 'number' ? {score: doc.score} : {}),
    mentions: doc.mentions ?? [],
    extracted: doc.extraction !== undefined && doc.extraction !== null,
});

export const loadItemsForDay = async (day: string): Promise<DayItem[]> => {
    await connectToDatabase();
    return (await CultureItem.find({day}).lean<LeanItem[]>()).map(toDayItem);
};

export const setItemMentions = async (updates: readonly {id: string; mentions: string[]}[]): Promise<void> => {
    if (updates.length === 0) return;
    await connectToDatabase();
    await CultureItem.bulkWrite(
        updates.map((update) => ({updateOne: {filter: {_id: update.id}, update: {$set: {mentions: update.mentions}}}})),
        {ordered: false},
    );
};

export const stampExtractions = async (stamps: readonly {id: string; extraction: CultureItemExtraction}[]): Promise<void> => {
    if (stamps.length === 0) return;
    await connectToDatabase();
    await CultureItem.bulkWrite(
        stamps.map((stamp) => ({updateOne: {filter: {_id: stamp.id}, update: {$set: {extraction: stamp.extraction}}}})),
        {ordered: false},
    );
};

export type EvidenceItem = {
    id: string;
    title: string;
    url: string;
    source: CultureItemSource;
    sourceName: string;
    datetime: number;
    publishedDate: string;
    signal: string | null;
    sentiment: number | null;
    // The other brands the item mentions.
    brands: string[];
};

// A brand's recent items, the model's label and its sentiment toward the brand; never the
// importance (invariant 8: the number says nothing a reader can use).
export const getBrandEvidence = async (brand: string, lookbackDays: number, limit: number): Promise<EvidenceItem[]> => {
    await connectToDatabase();
    const from = addCalendarDays(getEasternDateString(), -lookbackDays);
    const docs = await CultureItem.find({mentions: brand, publishedDate: {$gte: from}})
        .sort({datetime: -1})
        .limit(limit)
        .lean<(Pick<CultureItemDoc, 'title' | 'url' | 'source' | 'sourceName' | 'datetime' | 'publishedDate' | 'mentions' | 'extraction'> & {_id: unknown})[]>();
    return docs.map((doc) => {
        const mention = doc.extraction?.entities.find((entity) => entity.key === brand);
        return {
            id: String(doc._id),
            title: doc.title,
            url: doc.url,
            source: doc.source as CultureItemSource,
            sourceName: doc.sourceName,
            datetime: doc.datetime,
            publishedDate: doc.publishedDate,
            signal: doc.extraction && doc.extraction.model !== 'alias-match' ? doc.extraction.signal : null,
            sentiment: mention ? mention.sentiment : null,
            brands: (doc.mentions ?? []).filter((key) => key !== brand),
        };
    });
};

export const countItems = async (day?: string): Promise<{total: number; labelled: number}> => {
    await connectToDatabase();
    const filter = day ? {day} : {};
    const [total, labelled] = await Promise.all([
        CultureItem.countDocuments(filter),
        CultureItem.countDocuments({...filter, 'extraction.model': {$exists: true, $ne: 'alias-match'}}),
    ]);
    return {total, labelled};
};

// ---- entities ----

type LeanSummary = Pick<CultureEntityDoc, 'key' | 'displayName' | 'category' | 'ticker' | 'listing' | 'weightFast' | 'sentimentSumFast' | 'weightSlow' | 'sentimentSumSlow' | 'thesisSince' | 'lastSeenAt'>;

export const toEntitySummary = (doc: LeanSummary): CultureEntitySummary => ({
    key: doc.key,
    displayName: doc.displayName,
    category: doc.category as CultureCategory,
    ticker: doc.ticker ?? null,
    listing: (doc.listing ?? null) as Listing | null,
    weightFast: doc.weightFast,
    weightSlow: doc.weightSlow,
    sentimentFast: sentimentAvg(doc.sentimentSumFast, doc.weightFast),
    sentimentSlow: sentimentAvg(doc.sentimentSumSlow, doc.weightSlow),
    thesisSince: doc.thesisSince ? new Date(doc.thesisSince).getTime() : null,
    lastSeenAt: new Date(doc.lastSeenAt).getTime(),
});

export const getAllCultureEntities = async (): Promise<CultureEntitySummary[]> => {
    await connectToDatabase();
    return (await CultureEntity.find({}).sort({weightSlow: -1}).lean<LeanSummary[]>()).map(toEntitySummary);
};

export const getTopCultureEntities = async (limit: number, {category}: {category?: CultureCategory} = {}): Promise<CultureEntitySummary[]> => {
    await connectToDatabase();
    const docs = await CultureEntity.find(category ? {category} : {}).sort({weightSlow: -1}).limit(limit).lean<LeanSummary[]>();
    return docs.map(toEntitySummary);
};

export const getCultureEntities = async (keys: readonly string[]): Promise<Map<string, CultureEntitySummary>> => {
    if (keys.length === 0) return new Map();
    await connectToDatabase();
    const docs = await CultureEntity.find({key: {$in: keys}}).lean<LeanSummary[]>();
    return new Map(docs.map((doc) => [doc.key, toEntitySummary(doc)]));
};

export const getCultureTheses = async (): Promise<CultureEntitySummary[]> => {
    await connectToDatabase();
    const docs = await CultureEntity.find({thesisSince: {$ne: null}}).sort({weightSlow: -1}).lean<LeanSummary[]>();
    return docs.map(toEntitySummary);
};

export const getTickerRollup = async (limit?: number): Promise<TickerRollup[]> => {
    const rollups = rollupTickers(await getAllCultureEntities(), CULTURE_BRANDS);
    return typeof limit === 'number' ? rollups.slice(0, limit) : rollups;
};

// ---- suggestions ----

const nameKeyOf = (name: string): string => name.toLowerCase().replace(/\s+/g, ' ').trim();

// Names the model met that the catalog lacks: counted when known, added while the queue has
// room, and never a catalog brand under any alias.
export const recordSuggestions = async (
    names: readonly {name: string; itemHash: number}[],
    now: Date = new Date(),
): Promise<{added: number; counted: number}> => {
    const byKey = new Map<string, {name: string; hashes: number[]}>();
    for (const {name, itemHash} of names) {
        if (isCatalogName(name)) continue;
        const key = nameKeyOf(name);
        if (!key) continue;
        const entry = byKey.get(key) ?? {name, hashes: []};
        if (!entry.hashes.includes(itemHash)) entry.hashes.push(itemHash);
        byKey.set(key, entry);
    }
    if (byKey.size === 0) return {added: 0, counted: 0};
    await connectToDatabase();
    const known = new Set((await CultureSuggestion.find({nameKey: {$in: [...byKey.keys()]}}).lean<{nameKey: string}[]>()).map((doc) => doc.nameKey));
    let counted = 0;
    let added = 0;
    const ops = [];
    for (const [key, entry] of byKey) {
        if (known.has(key)) {
            counted++;
            ops.push({updateOne: {
                filter: {nameKey: key},
                update: {
                    $inc: {count: entry.hashes.length},
                    $set: {lastSeenAt: now},
                    $push: {sampleItemHashes: {$each: entry.hashes, $slice: -CULTURE_SUGGESTION_SAMPLES}},
                },
            }});
        }
    }
    const room = CULTURE_SUGGESTION_CAP - await CultureSuggestion.countDocuments({});
    for (const [key, entry] of byKey) {
        if (known.has(key) || added >= room) continue;
        added++;
        ops.push({insertOne: {document: {
            name: entry.name,
            nameKey: key,
            count: entry.hashes.length,
            firstSeenAt: now,
            lastSeenAt: now,
            sampleItemHashes: entry.hashes.slice(-CULTURE_SUGGESTION_SAMPLES),
            status: 'new' as const,
        }}});
    }
    if (ops.length > 0) await CultureSuggestion.bulkWrite(ops, {ordered: false});
    return {added, counted};
};

export type SuggestionRow = {name: string; count: number; firstSeenAt: number; lastSeenAt: number};

export const getSuggestions = async (limit: number): Promise<SuggestionRow[]> => {
    await connectToDatabase();
    const docs = await CultureSuggestion.find({status: 'new'}).sort({count: -1, lastSeenAt: -1}).limit(limit)
        .lean<{name: string; count: number; firstSeenAt: Date; lastSeenAt: Date}[]>();
    return docs.map((doc) => ({name: doc.name, count: doc.count, firstSeenAt: new Date(doc.firstSeenAt).getTime(), lastSeenAt: new Date(doc.lastSeenAt).getTime()}));
};

export const countSuggestions = async (): Promise<number> => {
    await connectToDatabase();
    return CultureSuggestion.countDocuments({status: 'new'});
};

// ---- the brain's own counts (the system view) ----

export type CultureCounts = {
    brands: number;
    listed: number;
    privateBrands: number;
    entities: number;
    theses: number;
    itemsTotal: number;
    itemsLabelled: number;
    attentionDocs: number;
    suggestions: number;
};

export const getCultureCounts = async (): Promise<CultureCounts> => {
    await connectToDatabase();
    const [entities, theses, items, attentionDocs, suggestions] = await Promise.all([
        CultureEntity.countDocuments({}),
        CultureEntity.countDocuments({thesisSince: {$ne: null}}),
        countItems(),
        CultureAttention.countDocuments({}),
        countSuggestions(),
    ]);
    const listed = CULTURE_BRANDS.filter((brand) => brand.owner !== null).length;
    return {
        brands: CULTURE_BRANDS.length,
        listed,
        privateBrands: CULTURE_BRANDS.length - listed,
        entities,
        theses,
        itemsTotal: items.total,
        itemsLabelled: items.labelled,
        attentionDocs,
        suggestions,
    };
};

// Brands whose Wikipedia series has no day inside the last `days`: a renamed article, or a
// title the catalog spells wrong — the system view's drift alarm.
export const brandsWithoutRecentViews = async (days: number, today: string = getEasternDateString()): Promise<string[]> => {
    const from = addCalendarDays(today, -days);
    const series = await getAttentionSeries(CULTURE_BRANDS.map((brand) => brand.id), {sources: ['wikipedia'], from, to: today});
    return CULTURE_BRANDS.filter((brand) => (series.get(brand.id)?.get('wikipedia')?.length ?? 0) === 0).map((brand) => brand.id);
};
