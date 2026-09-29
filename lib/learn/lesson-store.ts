// The one read behind Today's lesson in concept mode. A plain server module (not 'use server').
// Bounded: one small Topic projection, then one TopicArticle aggregate over the learner's
// keyword-set hashes for today's ET date ({keywordSetHash, publishedDate} index), newest
// LESSON_ARTICLE_CAP articles at most, their matchedTerms unwound and kept only when a term
// EQUALS one of the glossary's concept spellings (CONCEPT_TERMS, app constants). A user's
// keyword is never turned into a RegExp here (invariant 2), and nothing reads the news feed.

import {cache} from "react";
import {connectToDatabase} from "@/database/mongoose";
import Topic from "@/database/models/topic.model";
import TopicArticle from "@/database/models/topic-article.model";
import {CONCEPT_TERMS, pickLesson, termCountsFromRows, type Lesson, type TermRow} from "@/lib/learn/lesson";
import {getEasternDateString} from "@/lib/utils";

export const LESSON_ARTICLE_CAP = 300;
// Per term, before concepts merge and headlines dedupe down to LESSON_HEADLINES.
const HEADLINES_PER_TERM = 8;

export const getTodaysLesson = cache(async (userId: string): Promise<Lesson> => {
    await connectToDatabase();
    const today = getEasternDateString();
    const topics = await Topic.find({userId}).select('keywordSetHash').lean<{keywordSetHash: number}[]>();
    const hashes = [...new Set(topics.map((t) => t.keywordSetHash))];
    if (hashes.length === 0) return pickLesson([], today);

    const rows = await TopicArticle.aggregate<TermRow>([
        {$match: {keywordSetHash: {$in: hashes}, publishedDate: today}},
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
});
