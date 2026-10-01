// Today's lesson, concept mode: the glossary concept today's articles in the learner's topics
// used most, with up to three of those headlines; on a day when none did, the concept of the
// day of the year. Pure and client-safe. The one TopicArticle read lives in
// lib/learn/lesson-store.ts, and it matches article terms by equality against CONCEPT_TERMS
// (app constants) — a user's keyword never becomes a RegExp here (invariant 2).

import {GLOSSARY, GLOSSARY_KEYS, conceptForTerm, type GlossaryKey} from "@/lib/learn/glossary";

export const LESSON_HEADLINES = 3;

export type LessonHeadline = {contentHash: number; headline: string; url: string; source: string; datetime: number};

// One aggregate row: a matched term, the distinct articles that matched it, their headlines.
export type TermRow = {term: string; hashes: readonly number[]; headlines: readonly LessonHeadline[]};

type ConceptCount = {key: GlossaryKey; count: number; headlines: LessonHeadline[]};

export type Lesson = {
    // 'feed' = picked from today's articles; 'day' = nothing matched, the day-of-year concept.
    mode: 'feed' | 'day';
    key: GlossaryKey;
    count: number;
    headlines: LessonHeadline[];
};

export const CONCEPT_KEYS: readonly GlossaryKey[] = GLOSSARY_KEYS.filter((key) => GLOSSARY[key].kind === 'concept');

// Every spelling a stored matchedTerm can take that names a concept: its key, its term and its
// aliases, lower-cased the way topic keywords are normalised.
export const CONCEPT_TERMS: readonly string[] = [...new Set(CONCEPT_KEYS.flatMap((key) => {
    const entry = GLOSSARY[key];
    return [entry.key, entry.term, ...entry.aliases].map((name) => name.toLowerCase());
}))].filter((name) => conceptForTerm(name) !== null);

// Syndicated copies share a headline but not a URL (the same rule the topic feeds apply).
const headlineKey = (headline: string): string => headline.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

const newestDistinct = (headlines: readonly LessonHeadline[]): LessonHeadline[] => {
    const byHash = new Map<number, LessonHeadline>();
    for (const item of headlines) byHash.set(item.contentHash, item);
    const seen = new Set<string>();
    return [...byHash.values()]
        .sort((a, b) => b.datetime - a.datetime || a.contentHash - b.contentHash)
        .filter((item) => {
            const key = headlineKey(item.headline);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .slice(0, LESSON_HEADLINES);
};

// Rows per matched term → one count per concept: 'trade war' and 'tariffs' both teach
// tariffs, and an article that matched both counts once. Most articles first, then key order.
export const termCountsFromRows = (rows: readonly TermRow[]): ConceptCount[] => {
    const byKey = new Map<GlossaryKey, {hashes: Set<number>; headlines: LessonHeadline[]}>();
    for (const row of rows) {
        const entry = conceptForTerm(row.term);
        if (!entry) continue;
        const key = entry.key as GlossaryKey;
        const bucket = byKey.get(key) ?? {hashes: new Set<number>(), headlines: []};
        row.hashes.forEach((hash) => bucket.hashes.add(hash));
        bucket.headlines.push(...row.headlines);
        byKey.set(key, bucket);
    }
    return [...byKey.entries()]
        .map(([key, bucket]) => ({key, count: bucket.hashes.size, headlines: newestDistinct(bucket.headlines)}))
        .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
};

// 1 for January 1st, read from the 'YYYY-MM-DD' string.
export const dayOfYear = (date: string): number => {
    const year = +date.slice(0, 4);
    return Math.round((Date.UTC(year, +date.slice(5, 7) - 1, +date.slice(8, 10)) - Date.UTC(year, 0, 1)) / 86_400_000) + 1;
};

// The most-used concept; ties rotate by the day so a busy week does not repeat one lesson.
// With nothing matched, the concept of the day of the year.
export const pickLesson = (counts: readonly ConceptCount[], easternDate: string, conceptKeys: readonly GlossaryKey[] = CONCEPT_KEYS): Lesson => {
    const day = dayOfYear(easternDate);
    const top = counts.filter((c) => c.count > 0 && c.count === counts[0]?.count);
    if (top.length > 0) {
        const pick = top[day % top.length];
        return {mode: 'feed', key: pick.key, count: pick.count, headlines: pick.headlines};
    }
    return {mode: 'day', key: conceptKeys[day % conceptKeys.length], count: 0, headlines: []};
};

// Stored article URLs come from feeds; only http(s) becomes a link.
export const safeArticleUrl = (url: string): string | null => {
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : null;
    } catch {
        return null;
    }
};
