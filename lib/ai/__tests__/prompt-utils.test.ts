import {describe, expect, it} from 'vitest';
import {injectJson} from '@/lib/ai/prompt-utils';
import {buildSecondOpinionPrompt, SECOND_OPINION_PROMPT, type SecondOpinionContext} from '@/lib/brain/prompts';

describe('injectJson', () => {
    it('fills the first token with the value as JSON, at the given indent', () => {
        expect(injectJson('a {{x}} b {{x}}', '{{x}}', {k: 1})).toBe('a {\n "k": 1\n} b {{x}}');
        expect(injectJson('{{x}}', '{{x}}', [1], 2)).toBe('[\n  1\n]');
    });

    it("keeps '$&', '$`' and \"$'\" in a value literal", () => {
        const hostile = "$& $` $'";
        expect(injectJson('<{{x}}>', '{{x}}', hostile)).toBe(`<${JSON.stringify(hostile)}>`);
    });

    // lib/brain/prompts.ts keeps an unexported copy (it must stay import-free for
    // scripts/second-opinion-local.mjs); this holds the copy to the same output.
    it('fills the second-opinion prompt exactly as the brain module does', () => {
        const context: SecondOpinionContext = {
            theses: [{name: "$& thesis", type: 'theme', weightSlow: 1, sentimentSlow: 0.2, activeSinceMs: null}],
            narratives: [],
            decisions: null,
            headlines: [{headline: "$` headline $'", source: 's', kind: 'news', date: '2026-09-30'}],
        };
        let expected = injectJson(SECOND_OPINION_PROMPT, '{{theses}}', context.theses);
        expected = injectJson(expected, '{{narratives}}', context.narratives);
        expected = injectJson(expected, '{{decisions}}', context.decisions);
        expected = injectJson(expected, '{{headlines}}', context.headlines);
        expect(buildSecondOpinionPrompt(context)).toBe(expected);
    });
});
