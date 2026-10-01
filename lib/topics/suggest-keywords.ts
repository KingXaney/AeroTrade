// Keyword suggestions for the composer, derived from the topic name alone. The full
// phrase goes first because it is the most precise term; single tokens follow as
// broader fallbacks the user can keep or discard.

import {KEYWORD_MAX, normalizeKeyword} from "@/lib/news/keywords";
import type {SuggestedTopic} from "@/lib/topics/types";

const STOPWORDS = new Set([
    'a', 'an', 'the', 'of', 'in', 'on', 'at', 'and', 'or', 'for', 'to', 'vs', 'with', 'from', 'by', 'is', 'are',
    'news', 'about', 'latest', 'update', 'updates', 'today', 'daily', 'week', 'weekly', 'new', 'report', 'reports',
]);

// Tokens that would never match anything on their own (too short) are not worth offering.
const MIN_TOKEN_CHARS = 3;
const TOKEN_SEPARATORS = /[\s,;:/()[\]{}!?"'|]+/u;
const EDGE_PUNCTUATION = /^[.\-–—]+|[.\-–—]+$/g;

export const suggestKeywords = (name: string, max = 6): string[] => {
    const phrase = normalizeKeyword(name);
    if (!phrase || max <= 0) return [];

    const suggestions: string[] = [];
    if (phrase.includes(' ') && phrase.length <= KEYWORD_MAX) {
        suggestions.push(phrase);
    }

    for (const raw of phrase.split(TOKEN_SEPARATORS)) {
        const token = raw.replace(EDGE_PUNCTUATION, '');
        if (token.length < MIN_TOKEN_CHARS || token.length > KEYWORD_MAX) continue;
        if (STOPWORDS.has(token) || suggestions.includes(token)) continue;
        suggestions.push(token);
    }

    return suggestions.slice(0, max);
};

// Themes and sectors the brain is already tracking make good first topics: themes first, then
// sectors, at most `max`, each with the keywords its name suggests — a name that suggests none
// is dropped rather than offered empty.
export const brainTopicSuggestions = (
    top: {theme: readonly {displayName: string}[]; sector: readonly {displayName: string}[]},
    max: number,
): SuggestedTopic[] =>
    [...top.theme, ...top.sector]
        .slice(0, max)
        .map((e) => ({name: e.displayName, keywords: suggestKeywords(e.displayName)}))
        .filter((s) => s.keywords.length > 0);
