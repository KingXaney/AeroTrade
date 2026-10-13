// Hugging Face's daily papers: the list's address for a day and the reading of its JSON. Items
// are read one by one with a loose object schema (zod strips what it is not told about), so one
// odd item never drops the day. A paper is its arXiv id; the list's links are not kept.

import {z} from "zod";
import {ABSTRACT_STORED_MAX, AUTHORS_MAX, TITLE_MAX} from "@/lib/lab/papers/config";
import {arxivIdOf} from "@/lib/lab/papers/links";
import {addCalendarDays} from "@/lib/dates";

export type HfPaper = {id: string; title: string; abstract: string; authors: string[]; upvotes: number; published: string};

export const hfDailyPapersUrl = (date: string): string => `https://huggingface.co/api/daily_papers?date=${date}`;

const paperSchema = z.object({
    id: z.string(),
    title: z.string(),
    summary: z.string().optional(),
    authors: z.array(z.object({name: z.string().optional()})).optional(),
    upvotes: z.number().optional(),
    publishedAt: z.string().optional(),
});
const itemSchema = z.object({paper: paperSchema, publishedAt: z.string().optional()});

const clean = (value: string | undefined, max: number): string => (value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

export const parseHfDailyPapers = (json: unknown): HfPaper[] => {
    if (!Array.isArray(json)) return [];
    const byId = new Map<string, HfPaper>();
    for (const raw of json) {
        const parsed = itemSchema.safeParse(raw);
        if (!parsed.success) continue;
        const {paper} = parsed.data;
        const id = arxivIdOf(paper.id);
        const title = clean(paper.title, TITLE_MAX);
        if (!id || !title) continue;
        const upvotes = Math.max(0, Math.floor(Number.isFinite(paper.upvotes) ? (paper.upvotes as number) : 0));
        const next: HfPaper = {
            id,
            title,
            abstract: clean(paper.summary, ABSTRACT_STORED_MAX),
            authors: (paper.authors ?? []).map((a) => clean(a.name, 80)).filter(Boolean).slice(0, AUTHORS_MAX),
            upvotes,
            published: clean(paper.publishedAt ?? parsed.data.publishedAt, 40),
        };
        const seen = byId.get(id);
        if (!seen || seen.upvotes < upvotes) byId.set(id, next);
    }
    return [...byId.values()];
};

// The days a morning run reads: the previous weekday's list, which is complete, and today's,
// which is filling in. Weekends publish nothing, so a Monday reads Friday and Monday.
export const hfDatesFor = (today: string): string[] => {
    let previous = addCalendarDays(today, -1);
    for (let i = 0; i < 3; i += 1) {
        const weekday = new Date(`${previous}T12:00:00Z`).getUTCDay();
        if (weekday !== 0 && weekday !== 6) break;
        previous = addCalendarDays(previous, -1);
    }
    return previous === today ? [today] : [previous, today];
};
