// Is a story new, or one the run has already read under another headline? Pure. Research log R4
// (docs/research/log.md): investors over-react to a re-printed story and the move reverses
// (Tetlock 2011), so one story syndicated by five outlets is one piece of evidence about tone,
// not five. A repeat still counts as attention — people are talking — but adds no sentiment
// (REPEAT_SENTIMENT_SHARE), as a take does not (SENTIMENT_SHARE_BY_NATURE).
//
// Narrower than the paper's measure (similarity to a firm's ten prior stories): only articles
// folded in the same daily run, by headline, and only for the names the two share.

import {REPEAT_SIMILARITY} from "@/lib/brain/config";

// Words too common in headlines to say which story it is.
const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'its', 'are', 'was', 'has', 'have', 'after', 'into', 'over', 'amid', 'says', 'said', 'new']);

export const headlineTokens = (headline: string): Set<string> =>
    new Set(headline.toLowerCase().replace(/['’]s\b/g, '').split(/[^a-z0-9%]+/).filter((word) => word.length >= 2 && !STOP.has(word)));

// Jaccard similarity of the two headlines' word sets.
export const headlineSimilarity = (a: string, b: string): number => {
    const x = headlineTokens(a);
    const y = headlineTokens(b);
    if (x.size === 0 || y.size === 0) return 0;
    let shared = 0;
    for (const word of x) if (y.has(word)) shared += 1;
    return shared / (x.size + y.size - shared);
};

type FoldedArticle = {headline?: string; datetime?: number; entities: readonly {key: string}[]};

// For each article of a run, the entity keys it repeats: names it shares with an article of the
// same run published before it whose headline is at least REPEAT_SIMILARITY alike. The article
// published first keeps its tone; ties go to the order the run read them in.
export const repeatedMentions = (articles: readonly FoldedArticle[]): Set<string>[] => {
    const order = articles.map((_, index) => index)
        .sort((a, b) => (articles[a].datetime ?? 0) - (articles[b].datetime ?? 0) || a - b);
    const repeats = articles.map(() => new Set<string>());
    order.forEach((index, position) => {
        const article = articles[index];
        if (!article.headline) return;
        const keys = new Set(article.entities.map((entity) => entity.key));
        for (const earlierIndex of order.slice(0, position)) {
            const earlier = articles[earlierIndex];
            if (!earlier.headline || headlineSimilarity(article.headline, earlier.headline) < REPEAT_SIMILARITY) continue;
            for (const entity of earlier.entities) if (keys.has(entity.key)) repeats[index].add(entity.key);
        }
    });
    return repeats;
};
