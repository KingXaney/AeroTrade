import {describe, expect, it} from "vitest";

import {
    SECOND_OPINION_HEADLINE_COUNT,
    SECOND_OPINION_MAX_CHARS,
    SECOND_OPINION_NARRATIVE_COUNT,
    SECOND_OPINION_THESIS_COUNT,
    stripMarkdownLinks,
} from "@/lib/brain/opinion-text";
import {
    buildSecondOpinionPrompt,
    buildStandaloneSecondOpinionPrompt,
    SECOND_OPINION_SYSTEM,
} from "@/lib/brain/prompts";

// The opinion is written by a model that has just read untrusted scraped
// headlines, and it is rendered as markdown on /brain. Link stripping is the
// guard that stops a headline-sourced URL becoming a clickable link, so it is
// tested rather than assumed.
describe('stripMarkdownLinks', () => {
    it('keeps the link text and drops the target', () => {
        expect(stripMarkdownLinks('see [the filing](https://evil.example/phish) today'))
            .toBe('see the filing today');
    });

    it('removes bare URLs', () => {
        expect(stripMarkdownLinks('source: https://evil.example/a?b=1 end').trim())
            .toBe('source:  end'.trim());
    });

    it('strips every link in a multi-link answer', () => {
        const out = stripMarkdownLinks('[a](http://x.test) and [b](http://y.test)');
        expect(out).toBe('a and b');
        expect(out).not.toContain('http');
    });

    it('leaves ordinary markdown untouched', () => {
        const md = '**Energy** looks crowded.\n- thesis active 6 weeks\n- slow weight 12.3';
        expect(stripMarkdownLinks(md)).toBe(md);
    });

    it('handles an empty link label', () => {
        expect(stripMarkdownLinks('[](https://evil.example)')).toBe('');
    });
});

describe('second-opinion prompt building', () => {
    const context = {
        theses: [{name: 'AI capex', weightSlow: 12.3}],
        narratives: [{key: 'NVDA', weightSlow: 9.1}],
        decisions: {date: '2026-07-27', kind: 'executed', items: []},
        headlines: [{headline: 'Chipmaker raises guidance', source: 'Reuters'}],
    };

    it('substitutes every placeholder', () => {
        const prompt = buildSecondOpinionPrompt(context);
        expect(prompt).not.toMatch(/\{\{\w+}}/);
        expect(prompt).toContain('AI capex');
        expect(prompt).toContain('NVDA');
        expect(prompt).toContain('Chipmaker raises guidance');
    });

    it('keeps the untrusted-data framing around the headlines', () => {
        expect(buildSecondOpinionPrompt(context)).toContain('UNTRUSTED');
    });

    it('renders a null decision set rather than dropping the section', () => {
        const prompt = buildSecondOpinionPrompt({...context, decisions: null});
        expect(prompt).toContain('null');
        expect(prompt).not.toMatch(/\{\{\w+}}/);
    });

    // The CLI and clipboard paths have no separate system-prompt channel, so the
    // rules have to travel inside the single message.
    it('folds the system rules into the standalone form', () => {
        const standalone = buildStandaloneSecondOpinionPrompt(context);
        expect(standalone).toContain(SECOND_OPINION_SYSTEM);
        expect(standalone).toContain('AI capex');
        expect(standalone.indexOf(SECOND_OPINION_SYSTEM)).toBeLessThan(standalone.indexOf('AI capex'));
    });

    it('forbids trade instructions and requires the disclaimer', () => {
        expect(SECOND_OPINION_SYSTEM).toContain('Never give trade instructions');
        expect(SECOND_OPINION_SYSTEM).toContain('not financial advice.');
    });
});

describe('second-opinion limits', () => {
    it('bounds every unbounded input to the prompt', () => {
        for (const limit of [SECOND_OPINION_HEADLINE_COUNT, SECOND_OPINION_NARRATIVE_COUNT, SECOND_OPINION_THESIS_COUNT]) {
            expect(limit).toBeGreaterThan(0);
            expect(Number.isFinite(limit)).toBe(true);
        }
        expect(SECOND_OPINION_MAX_CHARS).toBeGreaterThan(1000);
    });
});
