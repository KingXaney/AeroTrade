// The one read behind Today's lesson in concept mode. A plain server module (not 'use server').
// Bounded: one small Topic projection, then one TopicArticle aggregate over the learner's
// keyword-set hashes for today's ET date ({keywordSetHash, publishedDate} index), newest
// LESSON_ARTICLE_CAP articles at most, their matchedTerms unwound and kept only when a term
// EQUALS one of the glossary's concept spellings (CONCEPT_TERMS, app constants). A user's
// keyword is never turned into a RegExp here (invariant 2), and nothing reads the news feed.
//
// The aggregate depends on the hash set alone, so the daily digest — one run over every
// emailed learner, most of whom follow the same seeded defaults — reads it once per distinct
// set per run (readLessonForDigest) instead of once per learner.

import {cache} from "react";
import {connectToDatabase} from "@/database/mongoose";
import Topic from "@/database/models/topic.model";
import TopicArticle from "@/database/models/topic-article.model";
import {createDayMemo, remember} from "@/lib/day-memo";
import {CONCEPT_TERMS, pickLesson, termCountsFromRows, type Lesson, type TermRow} from "@/lib/learn/lesson";
import {getEasternDateString} from "@/lib/dates";

const LESSON_ARTICLE_CAP = 300;
// Per term, before concepts merge and headlines dedupe down to LESSON_HEADLINES.
const HEADLINES_PER_TERM = 8;

// The learner's distinct keyword-set hashes, ascending (a stable memo key).
const readTopicHashes = async (userId: string): Promise<number[]> => {
    const topics = await Topic.find({userId}).select('keywordSetHash').lean<{keywordSetHash: number}[]>();
    return [...new Set(topics.map((t) => t.keywordSetHash))].sort((a, b) => a - b);
};

const lessonForHashes = async (hashes: readonly number[], today: string): Promise<Lesson> => {
    if (hashes.length === 0) return pickLesson([], today);
    const rows = await TopicArticle.aggregate<TermRow>([
        {$match: {keywordSetHash: {$in: [...hashes]}, publishedDate: today}},
        {$sort: {datetime: -1}},
        {$limit: LESSON_ARTICLE_CAP},
        {$project: {_id: 0, contentHash: 1, headline: 1, url: 1, source: 1, datetime: 1, matchedTerms: 1}},
        {$unwind: '$matchedTerms'},
        {$match: {matchedTerms: {$in: [...CONCEPT_TERMS]}}},
        {$group: {
            _id: '$matchedTerms',
            hashes: {$addToSet: '$contentHash'},
            headlines: {$push: {contentHash: '$contentHash', headline: '$headline', url: '$url', source: '$source', datetime: '$datetime'}},
        }},
        {$project: {_id: 0, term: '$_id', hashes: 1, headlines: {$slice: ['$headlines', HEADLINES_PER_TERM]}}},
    ]);
    return pickLesson(termCountsFromRows(rows), today);
};

export const getTodaysLesson = cache(async (userId: string): Promise<Lesson> => {
    await connectToDatabase();
    return lessonForHashes(await readTopicHashes(userId), getEasternDateString());
});

// Kept for one digest run (the run id names the "day"), one entry per distinct hash set.
const digestMemo = createDayMemo<Lesson>(128);

export const readLessonForDigest = async (userId: string, runId: string): Promise<Lesson> => {
    await connectToDatabase();
    const today = getEasternDateString();
    const hashes = await readTopicHashes(userId);
    return remember(digestMemo, `${today}|${hashes.join(',')}`, runId, () => lessonForHashes(hashes, today));
};
