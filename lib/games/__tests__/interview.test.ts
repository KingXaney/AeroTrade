// Interview math mode: eighty problems of every kind, each with five distinct options of which
// exactly one is the answer — checked here by working each problem out again from its text.

import {describe, expect, it} from 'vitest';
import {INTERVIEW_QUESTIONS, KINDS, OPTION_COUNT, interviewRound, type InterviewQuestion} from '@/lib/games/interview';

// The question's value, worked out from its text alone.
const solve = (text: string): number => {
    const percent = /^([\d.]+)% of (\d+)$/.exec(text);
    if (percent) return (Number(percent[1]) * Number(percent[2])) / 100;
    const square = /^(\d+)²$/.exec(text);
    if (square) return Number(square[1]) ** 2;
    const root = /^√(\d+)$/.exec(text);
    if (root) return Math.sqrt(Number(root[1]));
    const fractions = /^(\d+)\/(\d+) \+ (\d+)\/(\d+)$/.exec(text);
    if (fractions) return Number(fractions[1]) / Number(fractions[2]) + Number(fractions[3]) / Number(fractions[4]);
    const binary = /^([\d.]+) ([+−×÷]) ([\d.]+)$/.exec(text);
    if (!binary) throw new Error(`unparsed: ${text}`);
    const [a, b] = [Number(binary[1]), Number(binary[3])];
    return {'+': a + b, '−': a - b, '×': a * b, '÷': a / b}[binary[2] as '+' | '−' | '×' | '÷'];
};

const optionValue = (option: string): number => {
    const fraction = /^(\d+)\/(\d+)$/.exec(option);
    return fraction ? Number(fraction[1]) / Number(fraction[2]) : Number(option);
};

const close = (a: number, b: number) => Math.abs(a - b) < 1e-6 * Math.max(1, Math.abs(a));

describe('interviewRound', () => {
    const rounds: InterviewQuestion[] = [1, 2, 3, 4, 5, 6, 7, 8].flatMap((seed) => interviewRound(seed));

    it('asks eighty problems, every kind in the first ones', () => {
        const round = interviewRound(42);
        expect(round).toHaveLength(INTERVIEW_QUESTIONS);
        expect(round.slice(0, KINDS.length).map((q) => q.kind)).toEqual([...KINDS]);
    });

    it('offers five distinct, positive options, exactly one of them the answer', () => {
        for (const q of rounds) {
            expect(q.options, q.text).toHaveLength(OPTION_COUNT);
            expect(new Set(q.options).size, q.text).toBe(OPTION_COUNT);
            const truth = solve(q.text);
            const matches = q.options.filter((option) => close(optionValue(option), truth));
            expect(matches, `${q.text} → ${q.options.join(', ')}`).toHaveLength(1);
            expect(close(optionValue(q.options[q.answer]), truth), q.text).toBe(true);
            for (const option of q.options) expect(optionValue(option), `${q.text}: ${option}`).toBeGreaterThan(0);
        }
    });

    it('prints numbers without float noise', () => {
        for (const q of rounds) for (const option of q.options) expect(option, q.text).toMatch(/^\d+(\.\d{1,4})?$|^\d+\/\d+$/);
    });

    it('puts the answer in every place across a round', () => {
        const places = new Set(interviewRound(9).map((q) => q.answer));
        expect(places.size).toBe(OPTION_COUNT);
    });

    it('replays the same round from the same seed', () => {
        expect(interviewRound(11)).toEqual(interviewRound(11));
        expect(interviewRound(11)).not.toEqual(interviewRound(12));
    });
});
