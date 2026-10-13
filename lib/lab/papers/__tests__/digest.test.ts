import {describe, expect, it} from 'vitest';
import {findBanned} from '@/lib/learn/banned';
import {DIGEST_MAX_BULLETS} from '@/lib/lab/papers/config';
import type {LabPaper} from '@/lib/lab/papers/day';
import {parseLabDigest} from '@/lib/lab/papers/digest';
import {buildLabDigestPrompt, LAB_DIGEST_PROMPT, toPromptPapers} from '@/lib/lab/papers/prompts';

const paper = (id: string, track: LabPaper['track']): LabPaper =>
    ({id, title: `A paper on ${track}`, abstract: 'x'.repeat(900), authors: ['A'], categories: ['cs.LG'], primary: 'cs.LG', track, published: '2026-10-13T00:00:00Z', source: 'arxiv', upvotes: null});

describe('the lab digest', () => {
    it('keeps bullets that cite papers it was shown, drops the rest, and clamps the text', () => {
        const text = JSON.stringify({
            headline: 'A day of ' + 'long '.repeat(60) + 'words',
            bullets: [
                {text: 'Cited twice.', papers: [1, 2, 2, 9]},
                {text: 'Cites nothing.', papers: []},
                {text: 'Cites outside.', papers: [7]},
                {text: '', papers: [1]},
                {text: 'A take: you should buy NVDA on this.', papers: [1]},
                {text: 'Fine, with code names like best-of-n and optimal control.', papers: [3]},
            ],
        });
        const digest = parseLabDigest(text, 3);
        expect(digest).not.toBeNull();
        expect(digest!.bullets).toEqual([
            {text: 'Cited twice.', papers: [0, 1]},
            {text: 'Fine, with code names like best-of-n and optimal control.', papers: [2]},
        ]);
        expect(digest!.headline.length).toBeLessThanOrEqual(140);
    });

    it('reads a fenced answer, caps the bullets, and is null when nothing cites', () => {
        const many = {headline: 'h', bullets: Array.from({length: 10}, (_, i) => ({text: `Point ${i}`, papers: [1]}))};
        expect(parseLabDigest('```json\n' + JSON.stringify(many) + '\n```', 1)!.bullets).toHaveLength(DIGEST_MAX_BULLETS);
        expect(parseLabDigest('{"headline": "", "bullets": []}', 3)).toBeNull();
        expect(parseLabDigest('not json', 3)).toBeNull();
        expect(parseLabDigest('', 3)).toBeNull();
        expect(parseLabDigest('[1,2]', 3)).toBeNull();
    });

    it('shows the model numbered papers with field, category, title and a bounded abstract, and no id or link', () => {
        const papers = [paper('2610.00001', 'cv'), paper('2610.00002', 'quant')];
        const shown = toPromptPapers(papers);
        expect(shown.map((p) => [p.n, p.field, p.category])).toEqual([[1, 'computer vision', 'cs.LG'], [2, 'quantitative finance', 'cs.LG']]);
        expect(shown[0].abstract.length).toBe(600);
        const prompt = buildLabDigestPrompt(papers);
        expect(prompt).not.toMatch(/2610\.0000|http|{{papers}}/);
        expect(prompt).toMatch(/"n": 1/);
    });

    // A prompt is held to the advice tier like every prompt; its prohibitions are stripped first.
    it('is a prompt free of advice', () => {
        expect(findBanned(LAB_DIGEST_PROMPT, 'advice')).toEqual([]);
    });
});
