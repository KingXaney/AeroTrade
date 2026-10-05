// The daily brief's model half, pure: what the model is shown, what is kept of what it wrote, and
// what is mailed when it wrote nothing usable.
//
// The morning briefing's pattern (lib/news/briefing.ts): the model sees numbered articles — a
// headline, the outlet's own summary, the outlet, the kind of source and which of the reader's
// symbols it is about — and no links. It answers in JSON and cites articles by number. Its answer
// is untrusted (invariant 4): parsed, clamped field by field, every citation checked against the
// list it was shown, and a bullet or story left citing nothing is dropped. The links in the email
// are the cited articles' own, never anything the model wrote.

import {z} from 'zod';
import {citedIndices, cleanText, stripFences} from '@/lib/ai/cited';
import type {MarketNewsArticle, NewsSourceType} from '@/lib/news/types';

export const DIGEST_MAX_BULLETS = 5;
export const DIGEST_MAX_STORIES = 8;
export const DIGEST_SOURCES_PER_ITEM = 3;
export const DIGEST_FALLBACK_STORIES = 6;
const HEADLINE_MAX = 140;
const BULLET_MAX = 260;
const TITLE_MAX = 140;
const SUMMARY_MAX = 360;
const WHY_MAX = 200;
// What the model is shown of each article.
const PROMPT_HEADLINE_MAX = 240;
const PROMPT_SUMMARY_MAX = 400;
const OUTLET_MAX = 80;

export type DigestArticle = Pick<MarketNewsArticle, 'headline' | 'summary' | 'source' | 'url'> & {
    related?: string;
    sourceType?: NewsSourceType;
};

export type DigestSource = {headline: string; source: string; url: string; kind: NewsSourceType; symbols: string[]};
export type DigestPoint = {text: string; sources: DigestSource[]};
export type DigestStory = {title: string; summary: string; why: string; sources: DigestSource[]};
export type DigestSummary = {headline: string; bullets: DigestPoint[]; stories: DigestStory[]; fallback: boolean};

export type DigestPromptArticle = {n: number; headline: string; summary: string; source: string; kind: NewsSourceType; symbols: string[]};

const kindOf = (article: DigestArticle): NewsSourceType => article.sourceType ?? 'finance';

// The reader's own symbols an article is about: Finnhub's `related` field, which names the
// symbol its company news was fetched for, and a $CASHTAG in the headline. Nothing else counts —
// a bare capitalised word ("AI", "IT") is too often not a ticker.
export const articleSymbols = (article: Pick<DigestArticle, 'related' | 'headline'>, readerSymbols: readonly string[]): string[] => {
    const mine = new Set(readerSymbols.map((s) => s.toUpperCase()));
    const named = new Set<string>();
    for (const part of String(article.related ?? '').split(/[\s,;]+/)) {
        const symbol = part.trim().toUpperCase();
        if (mine.has(symbol)) named.add(symbol);
    }
    for (const match of String(article.headline ?? '').matchAll(/\$([A-Za-z][A-Za-z0-9.-]{0,9})/g)) {
        const symbol = match[1].toUpperCase();
        if (mine.has(symbol)) named.add(symbol);
    }
    return [...named];
};

export const toDigestPromptArticles = (articles: readonly DigestArticle[], readerSymbols: readonly string[]): DigestPromptArticle[] =>
    articles.map((article, i) => ({
        n: i + 1,
        headline: cleanText(article.headline, PROMPT_HEADLINE_MAX),
        summary: cleanText(article.summary, PROMPT_SUMMARY_MAX),
        source: cleanText(article.source, OUTLET_MAX),
        kind: kindOf(article),
        symbols: articleSymbols(article, readerSymbols),
    }));

const toSource = (article: DigestArticle, readerSymbols: readonly string[]): DigestSource => ({
    headline: cleanText(article.headline, PROMPT_HEADLINE_MAX),
    source: cleanText(article.source, OUTLET_MAX),
    url: String(article.url ?? ''),
    kind: kindOf(article),
    symbols: articleSymbols(article, readerSymbols),
});

// Loose on purpose: the shape is checked here, the limits are applied by hand below, so an
// over-long answer is trimmed rather than thrown away whole.
const itemSchema = z.object({articles: z.array(z.unknown()).optional()}).passthrough();
const answerSchema = z.object({
    headline: z.unknown().optional(),
    bullets: z.array(itemSchema).optional(),
    stories: z.array(itemSchema).optional(),
});

export const parseDigestSummary = (text: string, articles: readonly DigestArticle[], readerSymbols: readonly string[]): DigestSummary | null => {
    const cleaned = stripFences(text);
    if (!cleaned) return null;

    let answer: z.infer<typeof answerSchema>;
    try {
        const parsed = answerSchema.safeParse(JSON.parse(cleaned));
        if (!parsed.success) return null;
        answer = parsed.data;
    } catch {
        return null;
    }

    const sourcesOf = (numbers: unknown): DigestSource[] =>
        citedIndices(numbers, articles.length, DIGEST_SOURCES_PER_ITEM).map((i) => toSource(articles[i], readerSymbols));

    const bullets: DigestPoint[] = [];
    for (const item of answer.bullets ?? []) {
        const body = cleanText((item as {text?: unknown}).text, BULLET_MAX);
        const sources = sourcesOf(item.articles);
        if (!body || sources.length === 0) continue;
        bullets.push({text: body, sources});
        if (bullets.length >= DIGEST_MAX_BULLETS) break;
    }

    const stories: DigestStory[] = [];
    for (const item of answer.stories ?? []) {
        const title = cleanText((item as {title?: unknown}).title, TITLE_MAX);
        const summary = cleanText((item as {summary?: unknown}).summary, SUMMARY_MAX);
        const why = cleanText((item as {why?: unknown}).why, WHY_MAX);
        const sources = sourcesOf(item.articles);
        if (!title || !summary || sources.length === 0) continue;
        stories.push({title, summary, why, sources});
        if (stories.length >= DIGEST_MAX_STORIES) break;
    }

    if (bullets.length === 0 && stories.length === 0) return null;
    return {headline: cleanText(answer.headline, HEADLINE_MAX), bullets, stories, fallback: false};
};

// The first `count` sentences of an outlet's own summary.
const firstSentences = (text: string, count: number): string =>
    cleanText(text, 2000).split(/(?<=[.!?])\s+/).slice(0, count).join(' ');

// When the model wrote nothing usable (a refusal, an outage, a 429 that outlasted every retry):
// the leading articles as their outlets wrote them — the reader's own stocks first — so the
// reader still gets the day's news with its links instead of no email at all.
export const fallbackDigestSummary = (articles: readonly DigestArticle[], readerSymbols: readonly string[]): DigestSummary => {
    const usable = articles.filter((article) => cleanText(article.headline, TITLE_MAX));
    const mineFirst = [
        ...usable.filter((article) => articleSymbols(article, readerSymbols).length > 0),
        ...usable.filter((article) => articleSymbols(article, readerSymbols).length === 0),
    ];
    const stories = mineFirst.slice(0, DIGEST_FALLBACK_STORIES).map((article): DigestStory => ({
        title: cleanText(article.headline, TITLE_MAX),
        summary: cleanText(firstSentences(String(article.summary ?? ''), 2), SUMMARY_MAX),
        why: '',
        sources: [toSource(article, readerSymbols)],
    }));
    return {headline: '', bullets: [], stories, fallback: true};
};
