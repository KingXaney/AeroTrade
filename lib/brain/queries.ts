// Read side of the news brain (NOT a 'use server' module — plain server helpers
// used by the /brain page, chat tools and the navigator job).

import {connectToDatabase} from "@/database/mongoose";
import BrainEntity, {type BrainEntityDoc} from "@/database/models/brain-entity.model";
import NewsItem from "@/database/models/news-item.model";
import JobRun from "@/database/models/job-run.model";
import PriceBar from "@/database/models/price-bar.model";
import {getEasternDateString} from "@/lib/utils";

const safeAvg = (sum: number, weight: number): number => (Math.abs(weight) < 1e-9 ? 0 : sum / weight);

export const toEntitySummary = (e: BrainEntityDoc): BrainEntitySummary => ({
    key: e.key,
    type: e.type,
    displayName: e.displayName,
    weightFast: e.weightFast,
    weightSlow: e.weightSlow,
    sentimentFast: safeAvg(e.sentimentSumFast, e.weightFast),
    sentimentSlow: safeAvg(e.sentimentSumSlow, e.weightSlow),
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

// Recent articles mentioning an entity — the evidence drill-down.
export const getEntityEvidence = async (entityKey: string, lookbackDays = 21, limit = 20) => {
    await connectToDatabase();
    const from = getEasternDateString(new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000));
    const items = await NewsItem.find({
        'extraction.entities.key': entityKey,
        publishedDate: {$gte: from},
    }).sort({publishedDate: -1, datetime: -1}).limit(limit).lean();

    return items.map((item) => {
        const mention = (item.extraction?.entities ?? []).find((m: {key: string}) => m.key === entityKey);
        return {
            headline: item.headline,
            source: item.source,
            sourceType: item.sourceType,
            url: item.url,
            datetime: item.datetime,
            publishedDate: item.publishedDate,
            sentiment: mention?.sentiment ?? 0,
            relevance: mention?.relevance ?? 0,
        };
    });
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
// each background job's last completion stamp. Health is derived from staleness —
// a crashed or never-wired job stops refreshing its stamp.
export type JobHealth = {
    jobId: string;
    label: string;
    schedule: string;
    lastRunAt: number | null;     // epoch ms
    lastMessage: string | null;
    staleAfterHours: number;
};

export type BrainSystemStatus = {
    articlesTotal: number;
    articlesLast24h: number;
    articlesExtracted: number;
    entityCount: number;
    thesisCount: number;
    pricedSymbols: number;
    jobs: JobHealth[];
};

// Cadence-aware staleness: daily jobs get slack for one miss; snapshots skip
// weekends (so Monday morning is ~66h after Friday's run); the navigator is weekly.
const JOB_DEFINITIONS: Array<Omit<JobHealth, 'lastRunAt' | 'lastMessage'>> = [
    {jobId: 'daily-brain-update', label: 'Brain update', schedule: 'daily 07:30 ET', staleAfterHours: 30},
    {jobId: 'daily-news-summary', label: 'News email', schedule: 'daily 12:00 ET', staleAfterHours: 30},
    {jobId: 'daily-account-snapshots', label: 'Account snapshots', schedule: 'weekdays 16:10 ET', staleAfterHours: 80},
    {jobId: 'ai-navigator-weekly', label: 'AI navigator (weekly)', schedule: 'Mondays 10:00 ET', staleAfterHours: 8 * 24},
    {jobId: 'ai-navigator-bootstrap', label: 'AI run (manual/enroll)', schedule: 'on demand', staleAfterHours: Number.POSITIVE_INFINITY},
];

export const getBrainSystemStatus = async (): Promise<BrainSystemStatus> => {
    await connectToDatabase();
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [articlesTotal, articlesLast24h, articlesExtracted, entityCount, thesisCount, pricedSymbols, runs] = await Promise.all([
        NewsItem.countDocuments({}),
        NewsItem.countDocuments({createdAt: {$gte: dayAgo}}),
        NewsItem.countDocuments({extraction: {$exists: true}}),
        BrainEntity.countDocuments({}),
        BrainEntity.countDocuments({thesisSince: {$ne: null}}),
        PriceBar.distinct('symbol').then((symbols) => symbols.length),
        JobRun.find({}).lean(),
    ]);
    const runByJob = new Map(runs.map((r) => [r.jobId, r]));

    return {
        articlesTotal,
        articlesLast24h,
        articlesExtracted,
        entityCount,
        thesisCount,
        pricedSymbols,
        jobs: JOB_DEFINITIONS.map((def) => {
            const run = runByJob.get(def.jobId);
            return {
                ...def,
                lastRunAt: run ? new Date(run.lastRunAt).getTime() : null,
                lastMessage: run?.lastMessage ?? null,
            };
        }),
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
