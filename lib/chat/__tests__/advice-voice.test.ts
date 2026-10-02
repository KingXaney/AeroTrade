// Every prompt, chip and tool description speaks in a descriptive voice: it explains what
// a figure measures and never tells the user what to do with a stock. One shared list
// (lib/learn/banned.ts) is the rule; this test is the enforcement.
//
// SECOND_OPINION_SYSTEM is deliberately not in the corpus: lib/brain/__tests__ pins its
// text, and its rules are phrased as prohibitions the shared list already ignores.

import {describe, expect, it} from 'vitest';
import {ADVISOR_SYSTEM_PROMPT} from '@/lib/chat/system-prompt';
import {TOOL_DESCRIPTIONS} from '@/lib/chat/tool-copy';
import {CHAT_SUGGESTIONS, CHAT_WELCOME_MESSAGE} from '@/lib/learn/copy/chat';
import {NEWS_SUMMARY_EMAIL_PROMPT, PERSONALIZED_WELCOME_EMAIL_PROMPT} from '@/lib/email/prompts';
import {RATIONALE_PROMPT} from '@/lib/navigator/prompts';
import {MARKET_BRIEFING_PROMPT} from '@/lib/news/prompts';
import {findBanned} from '@/lib/learn/banned';

// Bumped when a tool is added; the Record type already forces the copy to exist.
const TOOL_COUNT = 17;

// A denylist of real symbols, not a bare uppercase regex: "AI chips" is a topic, not a
// ticker.
const TICKERS = /\b(NVDA|AAPL|TSLA|MSFT|SPY|AMZN|GOOGL|GOOG|META|AMD|NFLX)\b/;

const corpus: [string, string][] = [
    ['ADVISOR_SYSTEM_PROMPT', ADVISOR_SYSTEM_PROMPT],
    ['CHAT_WELCOME_MESSAGE', CHAT_WELCOME_MESSAGE],
    ...CHAT_SUGGESTIONS.map((chip, i): [string, string] => [`chip ${i}`, chip]),
    ...Object.entries(TOOL_DESCRIPTIONS).map(([name, text]): [string, string] => [`tool ${name}`, text]),
    ['PERSONALIZED_WELCOME_EMAIL_PROMPT', PERSONALIZED_WELCOME_EMAIL_PROMPT],
    ['NEWS_SUMMARY_EMAIL_PROMPT', NEWS_SUMMARY_EMAIL_PROMPT],
    ['RATIONALE_PROMPT', RATIONALE_PROMPT],
    ['MARKET_BRIEFING_PROMPT', MARKET_BRIEFING_PROMPT],
];

describe('advice voice', () => {
    it('finds no advice in any prompt, chip or tool description', () => {
        for (const [name, text] of corpus) {
            expect(findBanned(text, 'advice'), name).toEqual([]);
        }
    });

    it('keeps the disclaimer and the no-prediction rule in the advisor prompt', () => {
        expect(ADVISOR_SYSTEM_PROMPT).toContain('This is not licensed financial advice — markets carry real risk.');
        expect(ADVISOR_SYSTEM_PROMPT).toContain('Never predict future prices');
        expect(ADVISOR_SYSTEM_PROMPT).not.toMatch(/recommend/i);
    });

    it('offers no ticker and no verdict in a suggestion chip', () => {
        for (const chip of CHAT_SUGGESTIONS) {
            expect(chip, chip).not.toMatch(TICKERS);
            expect(findBanned(chip, 'copy'), chip).toEqual([]);
        }
        expect(CHAT_SUGGESTIONS).toContain("What's new in my topics?");
    });

    it('names every tool in the advisor prompt', () => {
        for (const name of Object.keys(TOOL_DESCRIPTIONS)) {
            expect(ADVISOR_SYSTEM_PROMPT, name).toContain(`**${name}**`);
        }
    });

    it('defines terms only through explainTerm, and admits a missing entry', () => {
        const tutoring = ADVISOR_SYSTEM_PROMPT.slice(ADVISOR_SYSTEM_PROMPT.indexOf('# Tutoring'));
        expect(tutoring).toContain('explainTerm');
        expect(tutoring).toMatch(/the app has no entry/i);
    });

    it('gives every tool a description', () => {
        expect(Object.keys(TOOL_DESCRIPTIONS)).toHaveLength(TOOL_COUNT);
        for (const [name, text] of Object.entries(TOOL_DESCRIPTIONS)) {
            expect(text.length, name).toBeGreaterThan(20);
        }
    });
});
