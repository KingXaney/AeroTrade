// The shared "fetch → match → persist" step used by the Inngest jobs and the
// first-visit fallback. Server-only (models + network), no Inngest types.

import {connectToDatabase} from "@/database/mongoose";
import NewsItem from "@/database/models/news-item.model";
import Topic from "@/database/models/topic.model";
import TopicArticle from "@/database/models/topic-article.model";
import {buildSearchQuery, fetchNewsForQuery} from "@/lib/news/adapters/search";
import {hashId, normalizeUrl} from "@/lib/news/config";
import {matchArticles, type MatchInput} from "@/lib/topics/match";
import {BRIEF_MIN_AGE_HOURS, BRIEF_MIN_NEW_ARTICLES, MATCH_CAP_PER_FETCH, MAX_ARTICLES_PER_TOPIC_PER_DAY} from "@/lib/topics/config";
import type {TopicBriefArticle} from "@/lib/topics/prompts";
import type {TopicBriefContent} from "@/lib/topics/brief";
import {getEasternDateString} from "@/lib/utils";

export type KeywordGroup = {keywordSetHash: number; keywords: string[]; exclude: string[]};
export type RefreshResult = {fetched: number; matched: number; inserted: number};

const WEB_FETCH_LIMIT = 40;

const yesterdayEastern = (): string => getEasternDateString(new Date(Date.now() - 24 * 60 * 60 * 1000));

// Keyword sets that have gone longest without a fetch come first (never fetched = first).
export const loadStaleKeywordGroups = async (limit: number): Promise<KeywordGroup[]> => {
    await connectToDatabase();
    const rows = await Topic.aggregate<{_id: number; keywords: string[]; exclude: string[]; oldest: Date | null}>([
        {$group: {_id: '$keywordSetHash', keywords: {$first: '$keywords'}, exclude: {$first: '$exclude'}, oldest: {$min: '$lastFetchedAt'}}},
        {$sort: {oldest: 1, _id: 1}},
        {$limit: limit},
    ]);
    return rows.map((r) => ({keywordSetHash: r._id, keywords: r.keywords ?? [], exclude: r.exclude ?? []}));
};

type Candidate = MatchInput & {sourceType: NewsSourceType; summary: string};

export const refreshKeywordGroup = async (group: KeywordGroup): Promise<RefreshResult> => {
    await connectToDatabase();

    const query = buildSearchQuery(group.keywords, group.exclude);
    const web = query ? await fetchNewsForQuery(query, {limit: WEB_FETCH_LIMIT}) : [];
    // The brain's own sweep is read-only input here: finance/RSS/Reddit/SEC rows from
    // yesterday and today, so market topics also see the curated sources.
    const local = await NewsItem.find({publishedDate: {$gte: yesterdayEastern()}})
        .select('headline summary url source sourceType datetime')
        .lean<{headline: string; summary: string; url: string; source: string; sourceType: NewsSourceType; datetime: number}[]>();

    const candidates: Candidate[] = [
        ...web.map((a) => ({headline: a.headline, summary: a.fullSummary ?? a.summary, url: a.url, source: a.source, datetime: a.datetime, sourceType: (a.sourceType ?? 'web') as NewsSourceType})),
        ...local.map((n) => ({headline: n.headline, summary: n.summary ?? '', url: n.url, source: n.source, datetime: n.datetime, sourceType: n.sourceType})),
    ];
    const matches = matchArticles(candidates, group.keywords, group.exclude, {cap: MATCH_CAP_PER_FETCH});

    const today = getEasternDateString();
    const todayCount = await TopicArticle.countDocuments({keywordSetHash: group.keywordSetHash, publishedDate: today});
    let todayBudget = Math.max(0, MAX_ARTICLES_PER_TOPIC_PER_DAY - todayCount);

    const seenHashes = new Set<number>();
    const seenTitles = new Set<string>();
    const ops = [];
    for (const {article, score, matchedTerms} of matches) {
        const contentHash = hashId(normalizeUrl(article.url));
        const titleKey = `${article.source}|${article.headline.toLowerCase()}`;
        if (seenHashes.has(contentHash) || seenTitles.has(titleKey)) continue;
        seenHashes.add(contentHash);
        seenTitles.add(titleKey);

        const publishedDate = getEasternDateString(new Date(article.datetime * 1000));
        if (publishedDate === today) {
            if (todayBudget <= 0) continue;
            todayBudget -= 1;
        }
        ops.push({
            updateOne: {
                filter: {keywordSetHash: group.keywordSetHash, contentHash},
                update: {
                    $setOnInsert: {
                        keywordSetHash: group.keywordSetHash,
                        contentHash,
                        headline: article.headline,
                        summary: article.summary,
                        url: article.url,
                        source: article.source,
                        sourceType: article.sourceType,
                        datetime: article.datetime,
                        publishedDate,
                        score,
                        matchedTerms,
                        createdAt: new Date(),
                    },
                },
                upsert: true,
            },
        });
    }

    const result = ops.length ? await TopicArticle.bulkWrite(ops, {ordered: false}) : null;
    await Topic.updateMany({keywordSetHash: group.keywordSetHash}, {$set: {lastFetchedAt: new Date()}});

    return {fetched: candidates.length, matched: matches.length, inserted: result?.upsertedCount ?? 0};
};

// --- Daily briefs ---

const BRIEF_ARTICLES = 12;

export type BriefCandidate = {
    keywordSetHash: number;
    name: string;                 // the first topic's name; users sharing a keyword set share the brief
    articles: TopicBriefArticle[];
    articleHashes: number[];
};

const briefCutoff = () => new Date(Date.now() - BRIEF_MIN_AGE_HOURS * 60 * 60 * 1000);
const needsBrief = {$or: [{brief: {$exists: false}}, {'brief.generatedAt': {$lte: briefCutoff()}}]};

// Keyword sets whose brief is missing or stale AND that gained enough articles since.
export const loadBriefCandidates = async (limit: number): Promise<BriefCandidate[]> => {
    await connectToDatabase();
    const topics = await Topic.find(needsBrief)
        .select('name keywordSetHash brief')
        .sort({'brief.generatedAt': 1})
        .limit(limit * 4)
        .lean<{name: string; keywordSetHash: number; brief?: {generatedAt: Date}}[]>();

    const byHash = new Map<number, {name: string; sinceSec: number}>();
    for (const t of topics) {
        if (byHash.has(t.keywordSetHash)) continue;
        const sinceSec = t.brief?.generatedAt ? Math.floor(new Date(t.brief.generatedAt).getTime() / 1000) : 0;
        byHash.set(t.keywordSetHash, {name: t.name, sinceSec});
    }

    const out: BriefCandidate[] = [];
    for (const [keywordSetHash, {name, sinceSec}] of byHash) {
        if (out.length >= limit) break;
        const fresh = await TopicArticle.countDocuments({keywordSetHash, datetime: {$gt: sinceSec}});
        if (fresh < BRIEF_MIN_NEW_ARTICLES) continue;
        const docs = await TopicArticle.find({keywordSetHash})
            .sort({datetime: -1})
            .limit(BRIEF_ARTICLES)
            .select('headline source datetime contentHash')
            .lean<{headline: string; source: string; datetime: number; contentHash: number}[]>();
        out.push({
            keywordSetHash,
            name,
            articles: docs.map((d) => ({headline: d.headline, source: d.source ?? '', publishedAt: getEasternDateString(new Date(d.datetime * 1000))})),
            articleHashes: docs.map((d) => d.contentHash),
        });
    }
    return out;
};

// Writes the brief to every topic sharing the keyword set that still lacks a fresh one.
export const saveTopicBrief = async (
    keywordSetHash: number,
    content: TopicBriefContent,
    articleHashes: number[],
    model: string,
): Promise<number> => {
    await connectToDatabase();
    const result = await Topic.updateMany(
        {keywordSetHash, $or: [{brief: {$exists: false}}, {'brief.generatedAt': {$lte: briefCutoff()}}]},
        {$set: {brief: {summary: content.summary, bullets: content.bullets, date: getEasternDateString(), generatedAt: new Date(), articleHashes, model}}},
    );
    return result.modifiedCount;
};
