// The daily brain update's pipeline (NOT a 'use server' module): ingest news with wide caps,
// persist the articles, batch-extract entities and sentiment with the model (schema-validated:
// deterministic code decides everything downstream), guard against hallucinated tickers.
// lib/jobs/functions/brain.ts runs these as its steps; lib/brain/update.ts folds the result
// into the entity graph.

import {connectToDatabase} from "@/database/mongoose";
import NewsItem from "@/database/models/news-item.model";
import BrainEntity from "@/database/models/brain-entity.model";
import {getAggregatedNews} from "@/lib/news/aggregate";
import {BRAIN_SOURCE_CAPS, BRAIN_TOTAL_CAP} from "@/lib/news/config";
import {hashId, normalizeUrl} from "@/lib/text";
import {getEasternDateString} from "@/lib/dates";
import {getQuote, searchStocks} from "@/lib/prices/finnhub";
import {injectJson} from "@/lib/ai/prompt-utils";
import {getTopEntities, getTopVerifiedTickers} from "@/lib/brain/store";
import {type ArticleFold} from "@/lib/brain/update";
import {parseExtractionResponse, sanitizeExtraction} from "@/lib/brain/extraction";
import {EXTRACTION_PROMPT} from "@/lib/brain/prompts";
import {
    EXTRACTION_BATCH_SIZE,
    MAX_EXTRACTION_CALLS_PER_DAY,
    NEW_TICKER_VERIFY_BUDGET,
    THEME_REUSE_LIST_SIZE,
    UNEXTRACTED_PICKUP_LIMIT,
} from "@/lib/brain/config";
import {ALWAYS_ELIGIBLE_SYMBOLS} from "@/lib/navigator/config";

// The targeted sweep reads news for this many of the brain's top verified tickers.
const TARGETED_SYMBOL_LIMIT = 10;

// Ingest: one general sweep + one targeted at what the brain already tracks. Returns how many
// articles were new.
export const fetchAndPersistNews = async (): Promise<number> => {
    await connectToDatabase();
    const topTickers = await getTopVerifiedTickers(TARGETED_SYMBOL_LIMIT);
    const [general, targeted] = await Promise.all([
        getAggregatedNews({mode: 'general', caps: BRAIN_SOURCE_CAPS, totalCap: BRAIN_TOTAL_CAP}),
        topTickers.length > 0
            ? getAggregatedNews({symbols: topTickers, mode: 'personalized', caps: BRAIN_SOURCE_CAPS, totalCap: BRAIN_TOTAL_CAP})
            : Promise.resolve([]),
    ]);

    const seen = new Set<number>();
    const docs = [];
    for (const article of [...general, ...targeted]) {
        const contentHash = hashId(normalizeUrl(article.url));
        if (seen.has(contentHash)) continue;
        seen.add(contentHash);
        docs.push({
            contentHash,
            headline: article.headline,
            summary: article.fullSummary || article.summary,
            source: article.source,
            sourceType: article.sourceType ?? 'finance',
            url: article.url,
            datetime: article.datetime,
            publishedDate: getEasternDateString(new Date(article.datetime * 1000)),
            category: article.category,
            related: article.related,
        });
    }
    try {
        const inserted = await NewsItem.insertMany(docs, {ordered: false});
        return inserted.length;
    } catch (error) {
        // Duplicate contentHash rows (already ingested) are expected — everything
        // else in a bulk-write error still inserted the non-duplicates.
        const bulkError = error as {code?: number; writeErrors?: unknown[]; insertedDocs?: unknown[]};
        if (bulkError.code !== 11000 && !bulkError.writeErrors) throw error;
        // Report what was actually new, not how many were offered: most of a
        // sweep is already-seen articles, so docs.length overstates ingest badly.
        return bulkError.insertedDocs?.length ?? 0;
    }
};

// One queued article as the job memoizes it between steps (plain JSON).
type QueuedArticle = {
    id: string;
    headline: string;
    summary: string;
    related: string;
    source: string;
    sourceType: string;
};

type ExtractionQueue = {articles: QueuedArticle[]; activeThemes: string[]};

// Extraction queue: newest unextracted articles first, hard daily budget.
export const loadExtractionQueue = async (): Promise<ExtractionQueue> => {
    await connectToDatabase();
    const limit = EXTRACTION_BATCH_SIZE * MAX_EXTRACTION_CALLS_PER_DAY + UNEXTRACTED_PICKUP_LIMIT;
    const items = await NewsItem.find({extraction: {$exists: false}})
        .sort({createdAt: -1})
        .limit(limit)
        .lean();
    // Bare names, not stored 'theme:'-prefixed keys — the extractor's sanitizer
    // prefixes them itself; passing prefixed keys would fork 'theme:theme-*' entities.
    const activeThemes = (await getTopEntities(THEME_REUSE_LIST_SIZE)).theme.map((t) => t.key.replace(/^theme:/, ''));
    return {
        articles: items.map((i) => ({
            id: String(i._id),
            headline: i.headline,
            summary: i.summary,
            related: i.related,
            source: i.source,
            sourceType: i.sourceType,
        })),
        activeThemes,
    };
};

// The day's model calls: EXTRACTION_BATCH_SIZE articles each, at most MAX_EXTRACTION_CALLS_PER_DAY.
export const extractionBatches = <T>(articles: readonly T[]): T[][] => {
    const batchCount = Math.min(
        Math.ceil(articles.length / EXTRACTION_BATCH_SIZE),
        MAX_EXTRACTION_CALLS_PER_DAY,
    );
    return Array.from({length: batchCount}, (_, b) => articles.slice(b * EXTRACTION_BATCH_SIZE, (b + 1) * EXTRACTION_BATCH_SIZE));
};

export const buildExtractionPrompt = (batch: readonly QueuedArticle[], activeThemes: readonly string[]): string =>
    injectJson(
        injectJson(EXTRACTION_PROMPT, '{{articles}}', batch),
        '{{activeThemes}}', activeThemes,
    );

type AppliedBatch = {folds: ArticleFold[]; ids: string[]};

// One batch's model answer, sanitized and stamped on its articles. Returns the folds instead of
// writing them anywhere else: the job must carry fold data through the step's RETURN value,
// because on an Inngest replay memoized steps don't re-execute their callbacks.
export const applyExtractionBatch = async ({index, batch, text, model, activeThemes}: {
    index: number;
    batch: readonly QueuedArticle[];
    text: string;
    model: string;
    activeThemes: string[];
}): Promise<AppliedBatch> => {
    if (!text) return {folds: [], ids: []};

    const parsed = parseExtractionResponse(text);
    if (!parsed) {
        console.warn(`Extraction batch ${index} returned invalid JSON — skipped`);
        return {folds: [], ids: []};
    }

    await connectToDatabase();
    const sourceTypeById = new Map(batch.map((a) => [a.id, a.sourceType]));
    const batchFolds: ArticleFold[] = [];
    const batchIds: string[] = [];
    for (const article of parsed.articles) {
        // Consume-once: hallucinated ids AND duplicate ids in one response are skipped.
        const sourceType = sourceTypeById.get(article.id);
        if (sourceType === undefined) continue;
        sourceTypeById.delete(article.id);
        const clean = sanitizeExtraction(article, sourceType, activeThemes);
        if (clean.entities.length === 0) continue;
        await NewsItem.updateOne(
            {_id: clean.id},
            {$set: {extraction: {
                eventType: clean.eventType,
                importance: clean.importance,
                entities: clean.entities,
                // The model that actually tagged this article, not a
                // constant — otherwise the record lies after any tier
                // change and there is no way to tell afterwards whether
                // a better model produced a better brain.
                model,
                extractedAt: new Date(),
            }}},
        );
        batchFolds.push({importance: clean.importance, entities: clean.entities});
        batchIds.push(clean.id);
    }
    return {folds: batchFolds, ids: batchIds};
};

// Ticker hallucination guard: unknown tickers must resolve via Finnhub before
// they can ever become tradable. 'related' symbols came from Finnhub already.
export const verifyNewTickers = async (folds: readonly ArticleFold[], articles: readonly QueuedArticle[]): Promise<string[]> => {
    await connectToDatabase();
    const mentioned = new Set<string>();
    for (const fold of folds) {
        for (const e of fold.entities) {
            if (e.type === 'ticker') mentioned.add(e.key);
        }
    }
    const relatedSet = new Set(
        articles.flatMap((a) => a.related.split(',').map((s: string) => s.trim().toUpperCase()).filter(Boolean)),
    );
    const known = new Set(
        (await BrainEntity.find({type: 'ticker', verified: true}).lean()).map((d) => d.key),
    );

    const verified: string[] = [];
    let budget = NEW_TICKER_VERIFY_BUDGET;
    for (const ticker of mentioned) {
        if (known.has(ticker) || ALWAYS_ELIGIBLE_SYMBOLS.includes(ticker) || relatedSet.has(ticker)) {
            verified.push(ticker);
            continue;
        }
        if (budget <= 0) continue;   // stays unverified — never tradable, harmless
        budget--;
        try {
            const [hits, quote] = await Promise.all([searchStocks(ticker), getQuote(ticker)]);
            const exact = hits.some((h) => h.symbol.toUpperCase() === ticker);
            if (exact && typeof quote.c === 'number' && quote.c > 0) verified.push(ticker);
        } catch (error) {
            console.warn(`Ticker verification failed for ${ticker}:`, error);
        }
    }
    return verified;
};
