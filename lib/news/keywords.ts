// The canonical form of a keyword and the limits a keyword list is held to. Followed topics
// and the /news feed's keywords both search the news by these terms, so both normalise
// through here: two users typing "Fed Rate" and " fed rate " share one fetch and one article
// set. Pure and client-safe.

export const KEYWORD_MIN = 2;
export const KEYWORD_MAX = 40;
// A topic's keywords and the feed's keyword slots alike.
export const MAX_KEYWORDS = 8;

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
