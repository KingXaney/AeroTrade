// Every prompt, chip and tool description speaks in a descriptive voice: it explains what
// a figure measures and never tells the user what to do with a stock. One shared list
// (lib/learn/banned.ts) is the rule; this test is the enforcement.
//
// SECOND_OPINION_SYSTEM is deliberately not in the corpus: lib/brain/__tests__ pins its
// text, and its rules are phrased as prohibitions the shared list already ignores.

import {describe, expect, it} from 'vitest';
import {advisorSystemPrompt} from '@/lib/chat/system-prompt';
import {TOOL_DESCRIPTIONS} from '@/lib/chat/tool-copy';
import {OWNER_CHAT_TOOLS} from '@/lib/chat/types';
import {CHAT_SUGGESTIONS, CHAT_USAGE_COPY, CHAT_WELCOME_MESSAGE, OWNER_CHAT_SUGGESTIONS, chatSuggestionsFor} from '@/lib/learn/copy/chat';
import {DAILY_DIGEST_PROMPT, PERSONALIZED_WELCOME_EMAIL_PROMPT} from '@/lib/email/prompts';
import {RATIONALE_PROMPT} from '@/lib/navigator/prompts';
import {MARKET_BRIEFING_PROMPT} from '@/lib/news/prompts';
import {findBanned} from '@/lib/learn/banned';

// Bumped when a tool is added; the Record type already forces the copy to exist.
const TOOL_COUNT = 18;

// A denylist of real symbols, not a bare uppercase regex: "AI chips" is a topic, not a
// ticker.
const TICKERS = /\b(NVDA|AAPL|TSLA|MSFT|SPY|AMZN|GOOGL|GOOG|META|AMD|NFLX)\b/;

// The owner's prompt names the tools over the brains and the strategies; everyone else's does not.
const OWNER_PROMPT = advisorSystemPrompt({owner: true});
const PUBLIC_PROMPT = advisorSystemPrompt({owner: false});
const PROMPTS: [string, string][] = [['owner prompt', OWNER_PROMPT], ['public prompt', PUBLIC_PROMPT]];
const ALL_CHIPS = [...CHAT_SUGGESTIONS, ...OWNER_CHAT_SUGGESTIONS];

const corpus: [string, string][] = [
    ...PROMPTS,
    ['CHAT_WELCOME_MESSAGE', CHAT_WELCOME_MESSAGE],
    ...ALL_CHIPS.map((chip, i): [string, string] => [`chip ${i}`, chip]),
    ...Object.entries(TOOL_DESCRIPTIONS).map(([name, text]): [string, string] => [`tool ${name}`, text]),
    ['PERSONALIZED_WELCOME_EMAIL_PROMPT', PERSONALIZED_WELCOME_EMAIL_PROMPT],
    ['DAILY_DIGEST_PROMPT', DAILY_DIGEST_PROMPT],
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
        for (const [name, prompt] of PROMPTS) {
            expect(prompt, name).toContain('This is not licensed financial advice — markets carry real risk.');
            expect(prompt, name).toContain('Never predict future prices');
            expect(prompt, name).not.toMatch(/recommend/i);
        }
    });

    it('offers no ticker and no verdict in a suggestion chip', () => {
        for (const chip of ALL_CHIPS) {
            expect(chip, chip).not.toMatch(TICKERS);
            expect(findBanned(chip, 'copy'), chip).toEqual([]);
        }
        expect(CHAT_SUGGESTIONS).toContain("What's new in my topics?");
    });

    it("offers the brains' and the strategies' chips to the owner alone", () => {
        expect(chatSuggestionsFor({owner: true})).toEqual(ALL_CHIPS);
        expect(chatSuggestionsFor({owner: false})).toEqual(CHAT_SUGGESTIONS);
        for (const chip of CHAT_SUGGESTIONS) expect(chip, chip).not.toMatch(/strateg|brain|navigator|culture/i);
    });

    it('keeps the usage caption descriptive and unlike the error copy', () => {
        const samples = [
            CHAT_USAGE_COPY.day(42, 60), CHAT_USAGE_COPY.day(0, 60), CHAT_USAGE_COPY.shared(180, 200), CHAT_USAGE_COPY.shared(0, 200),
            CHAT_USAGE_COPY.hour(0), CHAT_USAGE_COPY.hour(12), CHAT_USAGE_COPY.resets('2h 10m'),
        ];
        for (const text of samples) {
            expect(findBanned(text, 'copy'), text).toEqual([]);
            expect(text, text).not.toMatch(/undefined|NaN|null|Infinity/);
            // qa-chat and qa-chat-tutor find the error box by this copy; the caption must never read like it.
            expect(text, text).not.toMatch(/connection|couldn.t finish|unavailable|a lot of messages|shared budget/i);
        }
        expect(CHAT_USAGE_COPY.day(42, 60)).toBe('42 of 60 messages left today');
        expect(CHAT_USAGE_COPY.shared(180, 200)).toBe('180 of 200 shared');
        expect(CHAT_USAGE_COPY.hour(5)).toBe('5 left this hour');
        expect(CHAT_USAGE_COPY.resets('2h 10m')).toBe('resets in 2h 10m');
    });

    it("names every tool in the owner's prompt, and the brains' and strategies' in no one else's", () => {
        const ownerOnly = new Set<string>(OWNER_CHAT_TOOLS);
        for (const name of Object.keys(TOOL_DESCRIPTIONS)) {
            expect(OWNER_PROMPT, name).toContain(`**${name}**`);
            if (ownerOnly.has(name)) expect(PUBLIC_PROMPT, name).not.toContain(name);
            else expect(PUBLIC_PROMPT, name).toContain(`**${name}**`);
        }
        for (const section of ['# Quant strategies', '# Culture brain']) {
            expect(OWNER_PROMPT, section).toContain(section);
            expect(PUBLIC_PROMPT, section).not.toContain(section);
        }
        expect(PUBLIC_PROMPT).not.toMatch(/navigator|strateg|culture brain/i);
    });

    it('defines terms only through explainTerm, and admits a missing entry', () => {
        for (const [name, prompt] of PROMPTS) {
            const tutoring = prompt.slice(prompt.indexOf('# Tutoring'));
            expect(tutoring, name).toContain('explainTerm');
            expect(tutoring, name).toMatch(/the app has no entry/i);
        }
    });

    it('gives every tool a description', () => {
        expect(Object.keys(TOOL_DESCRIPTIONS)).toHaveLength(TOOL_COUNT);
        for (const [name, text] of Object.entries(TOOL_DESCRIPTIONS)) {
            expect(text.length, name).toBeGreaterThan(20);
        }
    });
});
