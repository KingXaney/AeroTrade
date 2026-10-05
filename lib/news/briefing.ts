// The market briefing's pure half: what the model is shown, and what is kept of what it wrote.
//
// The model sees numbered articles and answers with text plus the numbers it drew on. Its output
// is untrusted (invariant 4): parsed as JSON, clamped field by field, and every citation checked
// against the list it was given — a number outside the list is dropped, and a bullet or story
// left citing nothing is dropped with it, since a claim with no article behind it is exactly
// what a briefing must not print. The model never supplies a link; the links are the cited
// articles' own. The text is rendered as text nodes, never as HTML or markdown.

import {z} from 'zod';
import {citedIndices, cleanText as clean, stripFences} from '@/lib/ai/cited';

export const BRIEFING_MAX_BULLETS = 5;
export const BRIEFING_MAX_STORIES = 8;
const HEADLINE_MAX = 140;
const BULLET_MAX = 260;
const TITLE_MAX = 140;
const SUMMARY_MAX = 320;
const SOURCES_PER_ITEM = 4;

// One article the briefing may cite, as the brain stored it.
export type BriefingArticle = {
    headline: string;
    source: string;
    url: string;
    datetime: number;          // unix seconds
    eventType: string | null;  // the extractor's label
    tickers: string[];         // ticker entities the extractor found
};

export type BriefingSource = {headline: string; source: string; url: string; datetime: number};
export type BriefingPoint = {text: string; sources: BriefingSource[]};
export type BriefingStory = {title: string; summary: string; eventType: string; tickers: string[]; sources: BriefingSource[]};
export type MarketBriefingContent = {headline: string; bullets: BriefingPoint[]; stories: BriefingStory[]};

// What a page holds: the content plus when and for which day it was written.
export type MarketBriefingView = MarketBriefingContent & {date: string; generatedAt: number};

// What the model is handed: a number to cite, and no link to repeat.
export type BriefingPromptArticle = {n: number; headline: string; source: string; kind: string};

export const toPromptArticles = (articles: readonly BriefingArticle[]): BriefingPromptArticle[] =>
    articles.map((a, i) => ({n: i + 1, headline: a.headline, source: a.source, kind: a.eventType ?? 'other'}));

// Loose on purpose: the shape is checked here, the limits are applied by hand below, so an
// over-long answer is trimmed rather than thrown away whole.
const itemSchema = z.object({articles: z.array(z.unknown()).optional()}).passthrough();
const answerSchema = z.object({
    headline: z.unknown().optional(),
    bullets: z.array(itemSchema).optional(),
    stories: z.array(itemSchema).optional(),
});

// The cited articles, in the order cited, each once: 1-based numbers into `articles`.
const cited = (numbers: unknown, articles: readonly BriefingArticle[]): BriefingArticle[] =>
    citedIndices(numbers, articles.length, SOURCES_PER_ITEM).map((i) => articles[i]);

const toSource = (a: BriefingArticle): BriefingSource => ({headline: a.headline, source: a.source, url: a.url, datetime: a.datetime});

export const parseBriefingText = (text: string, articles: readonly BriefingArticle[]): MarketBriefingContent | null => {
    const cleaned = stripFences(String(text ?? ''));
    if (!cleaned) return null;

    let answer: z.infer<typeof answerSchema>;
    try {
        const parsed = answerSchema.safeParse(JSON.parse(cleaned));
        if (!parsed.success) return null;
        answer = parsed.data;
    } catch {
        return null;
    }

    const bullets: BriefingPoint[] = [];
    for (const item of answer.bullets ?? []) {
        const body = clean((item as {text?: unknown}).text, BULLET_MAX);
        const sources = cited(item.articles, articles);
        if (!body || sources.length === 0) continue;
        bullets.push({text: body, sources: sources.map(toSource)});
        if (bullets.length >= BRIEFING_MAX_BULLETS) break;
    }

    const stories: BriefingStory[] = [];
    for (const item of answer.stories ?? []) {
        const title = clean((item as {title?: unknown}).title, TITLE_MAX);
        const summary = clean((item as {summary?: unknown}).summary, SUMMARY_MAX);
        const sources = cited(item.articles, articles);
        if (!title || !summary || sources.length === 0) continue;
        stories.push({
            title,
            summary,
            eventType: sources[0].eventType ?? '',
            tickers: [...new Set(sources.flatMap((a) => a.tickers))],
            sources: sources.map(toSource),
        });
        if (stories.length >= BRIEFING_MAX_STORIES) break;
    }

    // A briefing is its bullets: with none that stand on an article there is nothing to show.
    if (bullets.length === 0) return null;
    return {headline: clean(answer.headline, HEADLINE_MAX), bullets, stories};
};

// The tickers a briefing's stories name that the reader holds or watches, in the briefing's order.
export const briefingTouches = (briefing: Pick<MarketBriefingContent, 'stories'>, symbols: readonly string[]): string[] => {
    const mine = new Set(symbols.map((s) => s.toUpperCase()));
    return [...new Set(briefing.stories.flatMap((s) => s.tickers.map((t) => t.toUpperCase())))].filter((t) => mine.has(t));
};
