// Read side of the news brain (NOT a 'use server' module — plain server helpers
// used by the /brain page, chat tools and the navigator job).

import {connectToDatabase} from "@/database/mongoose";
import BrainEntity, {type BrainEntityDoc} from "@/database/models/brain-entity.model";
import NewsItem from "@/database/models/news-item.model";
import {sentimentAvg} from "@/lib/brain/decay";
import {earliestSince, sinceThesisBySymbol, sinceThesisTargets, type SinceThesisLegs} from "@/lib/brain/since-thesis";
import {BENCHMARK_SYMBOL} from "@/lib/prices/config";
import {createDayMemo, remember} from "@/lib/day-memo";
import {addCalendarDays, getEasternDateString} from "@/lib/dates";
import {countPricedSymbols, getBarsFrom, getLatestBars} from "@/lib/prices/store";
import {getAllJobHealth, type JobHealth} from "@/lib/jobs/health";
import type {BrainEntitySummary, BrainEntityType} from '@/lib/brain/types';

const toEntitySummary = (e: BrainEntityDoc): BrainEntitySummary => ({
    key: e.key,
    type: e.type,
    displayName: e.displayName,
    weightFast: e.weightFast,
    weightSlow: e.weightSlow,
    sentimentFast: sentimentAvg(e.sentimentSumFast, e.weightFast),
    sentimentSlow: sentimentAvg(e.sentimentSumSlow, e.weightSlow),
    thesisSince: e.thesisSince ? new Date(e.thesisSince).getTime() : null,
    lastSeenAt: new Date(e.lastSeenAt).getTime(),
});

// Top entities per type by slow weight — the narrative leaderboard.
export const getTopEntities = async (perType = 10): Promise<Record<BrainEntityType, BrainEntitySummary[]>> => {
    await connectToDatabase();
    const result: Record<BrainEntityType, BrainEntitySummary[]> = {ticker: [], sector: [], theme: []};
    for (const type of ['ticker', 'sector', 'theme'] as const) {
        const docs = await BrainEntity.find({type}).sort({weightSlow: -1}).limit(perType);
        result[type] = docs.map(toEntitySummary);
    }
    return result;
};

// Entities with a live thesis, strongest first — the "where the market's favor is" view.
export const getActiveTheses = async (): Promise<BrainEntitySummary[]> => {
    await connectToDatabase();
    const docs = await BrainEntity.find({thesisSince: {$ne: null}}).sort({weightSlow: -1});
    return docs.map(toEntitySummary);
};

// What the evidence rows print, and the one extraction field behind the event badge. The
// article's importance is deliberately left out: nothing on the page prints it.
const EVIDENCE_PROJECTION = {
    headline: 1, source: 1, sourceType: 1, url: 1, datetime: 1, publishedDate: 1,
    'extraction.entities': 1, 'extraction.eventType': 1, 'extraction.nature': 1,
} as const;

type EvidenceDoc = {
    headline: string; source: string; sourceType: string; url: string; datetime: number; publishedDate: string;
    extraction?: {entities?: {key: string; sentiment: number; relevance: number}[]; eventType?: string; nature?: string};
};

// Recent articles mentioning an entity — the evidence drill-down.
export const getEntityEvidence = async (entityKey: string, lookbackDays = 21, limit = 20) => {
    await connectToDatabase();
    const from = getEasternDateString(new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000));
    const items = await NewsItem.find({
        'extraction.entities.key': entityKey,
        publishedDate: {$gte: from},
    }, EVIDENCE_PROJECTION).sort({publishedDate: -1, datetime: -1}).limit(limit).lean<EvidenceDoc[]>();

    return items.map((item) => {
        const mention = (item.extraction?.entities ?? []).find((m) => m.key === entityKey);
        return {
            headline: item.headline,
            source: item.source,
            sourceType: item.sourceType,
            url: item.url,
            datetime: item.datetime,
            publishedDate: item.publishedDate,
            sentiment: mention?.sentiment ?? 0,
            relevance: mention?.relevance ?? 0,
            eventType: item.extraction?.eventType ?? null,
            // How the piece is written; null on a row tagged before the label (reads as reported).
            nature: item.extraction?.nature ?? null,
        };
    });
};

// The articles the morning briefing may cite (lib/news/briefing.ts): the day's and the day
// before's tagged articles, most important first. Sorted on the extractor's importance and
// never projecting it — it orders the read, and nothing prints it. Reddit is left out: its
// importance is capped, and a briefing built on forum posts is not one. Bounded by the
// publishedDate index to two days of rows.
type BriefingDoc = {
    headline: string; source: string; url: string; datetime: number;
    extraction?: {eventType?: string; entities?: {key: string; type: string}[]};
};

const tickersOf = (doc: BriefingDoc): string[] =>
    (doc.extraction?.entities ?? []).filter((e) => e.type === 'ticker').map((e) => e.key.toUpperCase());

export const getBriefingCandidates = async (today: string, limit = 30) => {
    await connectToDatabase();
    const items = await NewsItem.find({
        publishedDate: {$gte: addCalendarDays(today, -1), $lte: today},
        'extraction.importance': {$exists: true},
        sourceType: {$ne: 'reddit'},
    }, {headline: 1, source: 1, url: 1, datetime: 1, 'extraction.eventType': 1, 'extraction.entities.key': 1, 'extraction.entities.type': 1})
        .sort({'extraction.importance': -1, datetime: -1})
        .limit(limit)
        .lean<BriefingDoc[]>();
    return items.map((item) => ({
        headline: item.headline,
        source: item.source,
        url: item.url,
        datetime: item.datetime,
        eventType: item.extraction?.eventType ?? null,
        tickers: tickersOf(item),
    }));
};

// Recent tagged articles that name any of a reader's symbols — the news page's "your holdings and
// watchlist". One read on the entities index, newest first, each row with the symbols of the
// reader's it names.
export const getNewsForSymbols = async (symbols: readonly string[], {days = 3, limit = 8}: {days?: number; limit?: number} = {}) => {
    const wanted = [...new Set(symbols.map((s) => s.toUpperCase()))];
    if (wanted.length === 0) return [];
    await connectToDatabase();
    const from = addCalendarDays(getEasternDateString(), -days);
    const items = await NewsItem.find({
        'extraction.entities': {$elemMatch: {type: 'ticker', key: {$in: wanted}}},
        publishedDate: {$gte: from},
    }, {headline: 1, source: 1, url: 1, datetime: 1, 'extraction.eventType': 1, 'extraction.entities.key': 1, 'extraction.entities.type': 1})
        .sort({publishedDate: -1, datetime: -1})
        .limit(limit)
        .lean<BriefingDoc[]>();
    const mine = new Set(wanted);
    return items.map((item) => ({
        headline: item.headline,
        source: item.source,
        url: item.url,
        datetime: item.datetime,
        eventType: item.extraction?.eventType ?? null,
        symbols: tickersOf(item).filter((t) => mine.has(t)),
    }));
};

// "since thesis" for Active Theses: the heaviest ticker theses (lib/brain/since-thesis.ts),
// read in one batch — each thesis ticker's bars from its own thesis date and SPY's from the
// earliest of them, one $or query (getBarsFrom) — then measured in memory. A second read on
// /brain, after the theses resolve, because it needs their keys and dates. The lines depend on
// no viewer, so they are memoised for the ET day per (the theses, the latest stored close of
// each symbol): one small aggregate stamps the data, a close stored later moves the stamp and is
// read, and a read taken before the morning's prices land is not pinned. A failed read hides the
// lines rather than breaking the page.
const STAMP_LOOKBACK_DAYS = 31;
const sinceMemo = createDayMemo<Record<string, SinceThesisLegs>>(16);

export const getSinceThesis = async (theses: readonly BrainEntitySummary[]): Promise<Record<string, SinceThesisLegs>> => {
    const targets = sinceThesisTargets(theses);
    const earliest = earliestSince(targets);
    if (earliest === null) return {};
    try {
        const today = getEasternDateString();
        const symbols = [...new Set([...targets.map((t) => t.symbol.toUpperCase()), BENCHMARK_SYMBOL])];
        const latest = await getLatestBars(symbols, {since: addCalendarDays(today, -STAMP_LOOKBACK_DAYS), onOrBefore: today});
        const key = [
            targets.map((t) => `${t.symbol}@${t.since}`).join(','),
            symbols.map((symbol) => {
                const bar = latest.get(symbol);
                return bar ? `${symbol}:${bar.date}:${bar.close}` : `${symbol}:-`;
            }).join(','),
        ].join('|');
        return await remember(sinceMemo, key, today, async () => {
            const bars = await getBarsFrom([...targets.map((t) => ({symbol: t.symbol, from: t.since})), {symbol: BENCHMARK_SYMBOL, from: earliest}]);
            return sinceThesisBySymbol(targets, bars, bars.get(BENCHMARK_SYMBOL) ?? []);
        });
    } catch (error) {
        console.error('Error reading since-thesis returns:', error);
        return {};
    }
};

// Graph payload for the /brain SVG: top entities + the links among them.
export const getBrainGraph = async (nodeLimit = 20) => {
    await connectToDatabase();
    const docs = await BrainEntity.find({}).sort({weightSlow: -1}).limit(nodeLimit);
    const keys = new Set(docs.map((d) => d.key));
    const nodes = docs.map(toEntitySummary);
    const edges: {source: string; target: string; weight: number}[] = [];
    const seen = new Set<string>();
    for (const doc of docs) {
        for (const link of doc.links ?? []) {
            if (!keys.has(link.key)) continue;
            const pair = [doc.key, link.key].sort().join('|');
            if (seen.has(pair)) continue;
            seen.add(pair);
            edges.push({source: doc.key, target: link.key, weight: link.weight});
        }
    }
    return {nodes, edges};
};

// Compact digest for the chat tool + rationale prompt: top narratives with sentiment.
export const getBrainDigestData = async (limit = 8) => {
    await connectToDatabase();
    const docs = await BrainEntity.find({}).sort({weightSlow: -1}).limit(limit);
    return docs.map((d) => {
        const s = toEntitySummary(d);
        return {
            key: s.key,
            type: s.type,
            displayName: s.displayName,
            weightSlow: Number(s.weightSlow.toFixed(2)),
            sentimentSlow: Number(s.sentimentSlow.toFixed(2)),
            thesisActive: s.thesisSince !== null,
        };
    });
};

// System-health snapshot for the /brain status strip: live pipeline counters plus
// each background job's last completion stamp (lib/jobs/health.ts).
export type BrainSystemStatus = {
    articlesTotal: number;
    articlesLast24h: number;
    articlesExtracted: number;
    // Ingested but not yet tagged. A backlog that keeps growing means the daily
    // extraction budget — not the ingest caps — is what limits how much the brain reads.
    articlesUnextracted: number;
    entityCount: number;
    thesisCount: number;
    pricedSymbols: number;
    jobs: JobHealth[];
};

export const getBrainSystemStatus = async (): Promise<BrainSystemStatus> => {
    await connectToDatabase();
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [articlesTotal, articlesLast24h, articlesExtracted, entityCount, thesisCount, pricedSymbols, jobs] = await Promise.all([
        NewsItem.countDocuments({}),
        NewsItem.countDocuments({createdAt: {$gte: dayAgo}}),
        NewsItem.countDocuments({extraction: {$exists: true}}),
        BrainEntity.countDocuments({}),
        BrainEntity.countDocuments({thesisSince: {$ne: null}}),
        countPricedSymbols(),
        getAllJobHealth(),
    ]);
    return {
        articlesTotal,
        articlesLast24h,
        articlesExtracted,
        // Derived, not queried: {extraction: {$exists: false}} is an unindexed scan
        // and this page is rendered on every visit.
        articlesUnextracted: articlesTotal - articlesExtracted,
        entityCount,
        thesisCount,
        pricedSymbols,
        jobs,
    };
};

// Ticker keys the brain currently trusts, by slow weight (feeds the tracked-symbol set).
export const getTopVerifiedTickers = async (limit = 25): Promise<string[]> => {
    await connectToDatabase();
    const docs = await BrainEntity.find({type: 'ticker', verified: true})
        .sort({weightSlow: -1})
        .limit(limit)
        .lean();
    return docs.map((d) => d.key);
};
