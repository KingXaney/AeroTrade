// Keyword matching for followed topics. User input only ever becomes a regex through
// escapeRegExp, so a keyword is always a literal and the work stays linear in the
// (capped) text length.

import {MATCH_CAP_PER_FETCH, MAX_MATCH_TEXT_CHARS} from "@/lib/topics/config";

// Regex metacharacters must be escaped so symbols like BRK.B match literally.
export const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Unicode-aware whole-word boundary. \b only knows ASCII word characters, so it would
// let 'ai' match inside 'said' in accented text and never match a CJK term at all.
// '$' is excluded from the leading boundary so a cashtag is its own token: the term
// '$nvda' matches '$NVDA', while a bare 'nvda' does not fire on the cashtag.
export const termPattern = (term: string): RegExp =>
    new RegExp(`(^|[^\\p{L}\\p{N}$])${escapeRegExp(term)}(?=$|[^\\p{L}\\p{N}])`, 'iu');

export const countHits = (text: string, pattern: RegExp): number => {
    const global = pattern.global ? pattern : new RegExp(pattern.source, `${pattern.flags}g`);
    return (text.match(global) ?? []).length;
};

export const HEADLINE_WEIGHT = 3;
export const SUMMARY_WEIGHT = 1;
// A long summary that repeats the term should not outrank a headline mention.
export const SUMMARY_HITS_CAP = 5;

export type MatchInput = {
    headline: string;
    summary: string;
    url: string;
    source: string;
    datetime: number;
    sourceType?: string;
};

export type MatchResult<T> = {article: T; score: number; matchedTerms: string[]};

type Scored = {score: number; matchedTerms: string[]};
type CompiledTerm = {term: string; pattern: RegExp};

const compileTerms = (terms: string[]): CompiledTerm[] =>
    terms
        .map((term) => String(term ?? '').trim())
        .filter(Boolean)
        .map((term) => ({term, pattern: termPattern(term)}));

const clip = (value: string): string => String(value ?? '').slice(0, MAX_MATCH_TEXT_CHARS);

const scoreCompiled = (article: MatchInput, include: CompiledTerm[], exclude: CompiledTerm[]): Scored | null => {
    const headline = clip(article.headline);
    const summary = clip(article.summary);

    const haystack = `${headline}\n${summary}`;
    for (const {pattern} of exclude) {
        if (pattern.test(haystack)) return null;
    }

    let score = 0;
    const matchedTerms: string[] = [];
    for (const {term, pattern} of include) {
        const headlineHits = countHits(headline, pattern);
        const summaryHits = Math.min(countHits(summary, pattern), SUMMARY_HITS_CAP);
        if (headlineHits + summaryHits === 0) continue;
        matchedTerms.push(term);
        score += headlineHits * HEADLINE_WEIGHT + summaryHits * SUMMARY_WEIGHT;
    }

    return matchedTerms.length > 0 ? {score, matchedTerms} : null;
};

export const scoreArticle = (article: MatchInput, keywords: string[], exclude: string[]): Scored | null =>
    scoreCompiled(article, compileTerms(keywords), compileTerms(exclude));

export const matchArticles = <T extends MatchInput>(
    articles: T[],
    keywords: string[],
    exclude: string[],
    {cap = MATCH_CAP_PER_FETCH}: {cap?: number} = {},
): MatchResult<T>[] => {
    const include = compileTerms(keywords);
    const veto = compileTerms(exclude);

    const results: MatchResult<T>[] = [];
    for (const article of articles) {
        const scored = scoreCompiled(article, include, veto);
        if (scored) results.push({article, ...scored});
    }

    results.sort((a, b) => b.score - a.score || b.article.datetime - a.article.datetime);
    return results.slice(0, Math.max(0, cap));
};
