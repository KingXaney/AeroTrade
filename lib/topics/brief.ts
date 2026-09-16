// Parses the model's daily-brief output. Models wrap JSON in fences or add prose
// despite instructions, so the parser recovers what it can and always yields
// plain text — never HTML or markdown that could reach the page or the email.

import {z} from 'zod';

const SUMMARY_MAX = 600;
const BULLET_MAX = 240;
const BULLETS_MAX = 4;

export const briefSchema = z.object({
    summary: z.string().trim().min(1).max(SUMMARY_MAX),
    bullets: z.array(z.string().trim().min(1).max(BULLET_MAX)).max(BULLETS_MAX).default([]),
});

export type TopicBriefContent = z.infer<typeof briefSchema>;

const stripFences = (text: string): string =>
    text.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();

const clampBullets = (value: unknown): string[] =>
    Array.isArray(value)
        ? value
            .filter((b): b is string => typeof b === 'string')
            .map((b) => b.trim().slice(0, BULLET_MAX))
            .filter(Boolean)
            .slice(0, BULLETS_MAX)
        : [];

export const parseBriefText = (text: string): TopicBriefContent | null => {
    const cleaned = stripFences(String(text ?? ''));
    if (!cleaned) return null;

    try {
        const parsed: unknown = JSON.parse(cleaned);
        const strict = briefSchema.safeParse(parsed);
        if (strict.success) return strict.data;
        // Over-long or over-many fields: keep the usable parts rather than the raw JSON.
        if (parsed && typeof parsed === 'object' && typeof (parsed as {summary?: unknown}).summary === 'string') {
            const summary = ((parsed as {summary: string}).summary).trim().slice(0, SUMMARY_MAX);
            if (summary) return {summary, bullets: clampBullets((parsed as {bullets?: unknown}).bullets)};
        }
    } catch {
        // Not JSON at all — fall through to plain text.
    }
    return {summary: cleaned.slice(0, SUMMARY_MAX), bullets: []};
};
