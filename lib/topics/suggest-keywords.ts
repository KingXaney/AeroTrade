// Keyword suggestions for the composer, derived from the topic name alone. The full
// phrase goes first because it is the most precise term; single tokens follow as
// broader fallbacks the user can keep or discard.

import {KEYWORD_MAX} from "@/lib/topics/config";
import {normalizeKeyword} from "@/lib/topics/normalize";

export const STOPWORDS = new Set([
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
