// Canonical forms for topic names and keywords. Everything the matcher, the query
// builder and the shared keyword-set hash see goes through here, so two users typing
// "Fed Rate" and " fed rate " share one fetch and one article set.

import {z} from 'zod';
import {hashId} from "@/lib/news/config";
import {KEYWORD_MAX, KEYWORD_MIN, MAX_EXCLUDES, MAX_KEYWORDS, NAME_MAX, NAME_MIN} from "@/lib/topics/config";

const SURROUNDING_QUOTES = /^["'“”‘’]+|["'“”‘’]+$/g;

export const normalizeKeyword = (raw: string): string =>
    String(raw ?? '')
        .normalize('NFKC')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase()
        .replace(SURROUNDING_QUOTES, '')
        .replace(/^-+/, '')   // a leading '-' is the exclusion syntax, never part of a term
        .trim();

// Normalised, length-checked, case-insensitively deduped, sorted, capped.
export const normalizeKeywordList = (raw: string[], max: number): string[] => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of raw ?? []) {
        const term = normalizeKeyword(item);
        if (term.length < KEYWORD_MIN || term.length > KEYWORD_MAX || seen.has(term)) continue;
        seen.add(term);
        out.push(term);
    }
    return out.sort().slice(0, Math.max(0, max));
};

export const slugify = (name: string): string => {
    const slug = String(name ?? '')
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 64)
        .replace(/-+$/, '');
    return slug || 'topic';
};

// Exclusions change both the query and the match result, so they are part of the identity.
export const keywordSetHash = (keywords: string[], exclude: string[]): number =>
    hashId(JSON.stringify({k: [...keywords].sort(), x: [...exclude].sort()}));

export const topicInputSchema = z.object({
    name: z.string().trim()
        .min(NAME_MIN, {error: `Give it a name (${NAME_MIN}–${NAME_MAX} characters)`})
        .max(NAME_MAX, {error: `Give it a name (${NAME_MIN}–${NAME_MAX} characters)`}),
    keywords: z.array(
        z.string().trim()
            .min(KEYWORD_MIN, {error: `Keywords need at least ${KEYWORD_MIN} characters`})
            .max(KEYWORD_MAX, {error: `Keywords can be at most ${KEYWORD_MAX} characters`}),
    ).max(MAX_KEYWORDS, {error: `Up to ${MAX_KEYWORDS} keywords, ${KEYWORD_MAX} characters each`}).default([]),
    exclude: z.array(
        z.string().trim().min(1).max(KEYWORD_MAX, {error: `Exclusions can be at most ${KEYWORD_MAX} characters`}),
    ).max(MAX_EXCLUDES, {error: `Up to ${MAX_EXCLUDES} exclusions`}).default([]),
    color: z.string().regex(/^#[0-9a-f]{6}$/i, {error: 'Colour must be a hex value'}).optional(),
});

export type TopicInput = z.infer<typeof topicInputSchema>;

// The name alone is a usable keyword when the user gives none. Null means nothing
// survived normalisation, which the caller reports instead of storing an empty set.
export const deriveKeywords = (input: TopicInput): {keywords: string[]; exclude: string[]} | null => {
    const keywords = normalizeKeywordList(input.keywords.length > 0 ? input.keywords : [input.name], MAX_KEYWORDS);
    if (keywords.length === 0) return null;
    const exclude = normalizeKeywordList(input.exclude, MAX_EXCLUDES).filter((term) => !keywords.includes(term));
    return {keywords, exclude};
};

export const formatIssue = (error: z.ZodError): string => error.issues[0]?.message ?? 'Invalid input';
