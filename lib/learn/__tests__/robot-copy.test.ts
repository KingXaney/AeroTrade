// The robot's tips (lib/learn/copy/robot.ts): learner-facing copy held to the 'copy' tier, and —
// since "Try it" types a tip's prompt into the chat composer — chat input held to the 'advice'
// tier like a chip. Every number a tip quotes is pinned to the constant it describes, so a ninth
// strategy or a thirteenth palette fails here, not in front of the reader.

import {describe, expect, it} from 'vitest';
import {findBanned} from '@/lib/learn/banned';
import {ROBOT_COPY, ROBOT_TIPS} from '@/lib/learn/copy/robot';
import {ASK_MAX_CHARS} from '@/lib/chat/ask';
import {COURSE_MODULES} from '@/lib/learn/course';
import {JOBS} from '@/lib/jobs/registry';
import {STRATEGIES} from '@/lib/strategies/catalog';
import {capitalize, numberWord} from '@/lib/text';
import {PALETTE_IDS} from '@/lib/theme/palettes';
import {STYLE_IDS} from '@/lib/theme/styles';

// The chips' denylist (lib/chat/__tests__/advice-voice.test.ts): a robot that names a stock tips it.
const TICKERS = /\b(NVDA|AAPL|TSLA|MSFT|SPY|AMZN|GOOGL|GOOG|META|AMD|NFLX)\b/;

const text = (id: string): string => {
    const tip = ROBOT_TIPS.find((t) => t.id === id);
    if (!tip) throw new Error(`no tip ${id}`);
    return tip.text;
};

const spoken = [
    ...ROBOT_TIPS.map((tip) => tip.text),
    ...ROBOT_TIPS.flatMap((tip) => (tip.prompt ? [tip.prompt] : [])),
];

describe('ROBOT_TIPS', () => {
    it('never advises, in a sentence, a prompt or a control', () => {
        for (const line of [...spoken, ...Object.values(ROBOT_COPY)]) {
            expect(line, line).not.toMatch(/undefined|NaN|null|\[object|Infinity/);
            expect(findBanned(line, 'copy'), line).toEqual([]);
            expect(findBanned(line, 'advice'), line).toEqual([]);
        }
    });

    it('names no ticker', () => {
        for (const line of spoken) expect(line, line).not.toMatch(TICKERS);
    });

    it('is six to ten tips with unique ids, the topic-building tip first', () => {
        expect(ROBOT_TIPS.length).toBeGreaterThanOrEqual(6);
        expect(ROBOT_TIPS.length).toBeLessThanOrEqual(10);
        const ids = ROBOT_TIPS.map((tip) => tip.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const id of ids) expect(id).toMatch(/^[a-z-]+$/);
        expect(ROBOT_TIPS[0].id).toBe('build-topics');
        expect(ROBOT_TIPS[0].prompt).toBeDefined();
    });

    it('fits a bubble and a composer', () => {
        for (const tip of ROBOT_TIPS) {
            expect(tip.text.length, tip.id).toBeLessThanOrEqual(180);
            expect(tip.text.trim(), tip.id).toBe(tip.text);
            if (tip.prompt) expect(tip.prompt.length, tip.id).toBeLessThanOrEqual(ASK_MAX_CHARS);
        }
    });

    it("quotes the app's own numbers", () => {
        expect(text('strategies')).toContain(`${capitalize(numberWord(STRATEGIES.length))} rule-based`);
        expect(text('themes')).toContain(`${numberWord(PALETTE_IDS.length)} palettes`);
        expect(text('themes')).toContain(`${numberWord(STYLE_IDS.length)} visual styles`);
        expect(text('learn-course')).toContain(
            `${numberWord(COURSE_MODULES.length)} modules of ${numberWord(COURSE_MODULES[0].lessons.length)} short lessons`);
        for (const section of COURSE_MODULES) expect(section.lessons.length).toBe(COURSE_MODULES[0].lessons.length);
        expect(text('morning-briefing')).toContain(JOBS.marketBriefing.health.schedule.replace('daily ', ''));
    });

    it('offers the existing "what\'s new" chip as a prompt, so the chat already answers it', () => {
        expect(ROBOT_TIPS.find((tip) => tip.id === 'whats-new')?.prompt).toBe("What's new in my topics?");
    });
});

describe('ROBOT_COPY', () => {
    it('names no chat, assistant or advisor in a control: the browser QA finds the launcher by those words', () => {
        for (const label of Object.values(ROBOT_COPY)) {
            expect(label, label).not.toMatch(/chat|assistant|advisor/i);
            expect(label.length).toBeGreaterThan(0);
        }
        expect(ROBOT_COPY.tryIt).toBe('Try it');
        expect(ROBOT_COPY.dismiss).toBe('Dismiss tip');
    });
});
