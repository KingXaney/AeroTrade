// Canonical forms for topic names and the topic input schema. Keywords normalise through
// lib/news/keywords, so everything the matcher, the query builder and the shared keyword-set
// hash see is the same term the /news feed searches for.

import {z} from 'zod';
import {hashId} from "@/lib/text";
import {MAX_EXCLUDES, NAME_MAX, NAME_MIN} from "@/lib/topics/config";
import {KEYWORD_MAX, KEYWORD_MIN, MAX_KEYWORDS, normalizeKeywordList} from "@/lib/news/keywords";

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
