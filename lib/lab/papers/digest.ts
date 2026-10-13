// What is kept of the digest the model wrote (invariant 4): parsed as JSON, clamped field by
// field, every citation checked against the papers it was shown — a bullet left citing nothing
// is dropped, and so is one that reads as a trading instruction (the 'lab' tier of the
// no-advice list). Rendered as text nodes, never as HTML or markdown. Pure.

import {z} from "zod";
import {citedIndices, cleanText, stripFences} from "@/lib/ai/cited";
import {findBanned} from "@/lib/learn/banned";
import {DIGEST_BULLET_MAX, DIGEST_HEADLINE_MAX, DIGEST_MAX_BULLETS, PAPERS_PER_BULLET} from "@/lib/lab/papers/config";
import type {LabDigest, LabDigestBullet} from "@/lib/lab/papers/day";

const answerSchema = z.object({
    headline: z.unknown().optional(),
    bullets: z.array(z.object({text: z.unknown().optional(), papers: z.unknown().optional()})).optional(),
});

export const parseLabDigest = (text: string, paperCount: number): LabDigest | null => {
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
    const bullets: LabDigestBullet[] = [];
    for (const item of answer.bullets ?? []) {
        const body = cleanText(item.text, DIGEST_BULLET_MAX);
        const papers = citedIndices(item.papers, paperCount, PAPERS_PER_BULLET);
        if (!body || papers.length === 0 || findBanned(body, 'lab').length > 0) continue;
        bullets.push({text: body, papers});
        if (bullets.length >= DIGEST_MAX_BULLETS) break;
    }
    if (bullets.length === 0) return null;
    const headline = cleanText(answer.headline, DIGEST_HEADLINE_MAX);
    return {headline: findBanned(headline, 'lab').length > 0 ? '' : headline, bullets};
};
