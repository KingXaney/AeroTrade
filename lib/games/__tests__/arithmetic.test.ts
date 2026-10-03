// The arithmetic sprint: Zetamac's ranges, exact division, a seeded round that replays, the
// answer check, and the key a record is kept under.

import {describe, expect, it} from 'vitest';
import {mulberry32} from '@/lib/random';
import {
    ArithmeticSettingsSchema,
    ZETAMAC_DEFAULTS,
    isAnswer,
    nextProblem,
    problemStream,
    problemText,
    settingsKey,
    type ArithmeticSettings,
    type Problem,
} from '@/lib/games/arithmetic';

const sample = (settings: ArithmeticSettings, n = 5000, seed = 1): Problem[] => {
    const next = problemStream(seed, settings);
    return Array.from({length: n}, () => next());
};

describe('the default round', () => {
    const problems = sample(ZETAMAC_DEFAULTS);

    it('uses all four operations', () => {
        expect(new Set(problems.map((p) => p.op))).toEqual(new Set(['add', 'subtract', 'multiply', 'divide']));
    });

    it('keeps Zetamac\'s ranges, subtraction and division being the inverses', () => {
        for (const p of problems) {
            if (p.op === 'add') {
                expect(p.left).toBeGreaterThanOrEqual(2);
                expect(p.left).toBeLessThanOrEqual(100);
                expect(p.right).toBeGreaterThanOrEqual(2);
                expect(p.right).toBeLessThanOrEqual(100);
                expect(p.answer).toBe(p.left + p.right);
            }
            if (p.op === 'subtract') {
                expect(p.answer).toBe(p.left - p.right);
                expect(p.answer).toBeGreaterThanOrEqual(2);
                expect(p.answer).toBeLessThanOrEqual(100);
                expect(p.right).toBeLessThanOrEqual(100);
            }
            if (p.op === 'multiply') {
                expect(p.left).toBeGreaterThanOrEqual(2);
                expect(p.left).toBeLessThanOrEqual(12);
                expect(p.right).toBeLessThanOrEqual(100);
                expect(p.answer).toBe(p.left * p.right);
            }
            if (p.op === 'divide') {
                // Exact: the dividend is a product, the divisor its 2–12 factor.
                expect(p.left % p.right).toBe(0);
                expect(p.answer).toBe(p.left / p.right);
                expect(p.right).toBeGreaterThanOrEqual(2);
                expect(p.right).toBeLessThanOrEqual(12);
            }
        }
    });

    it('never repeats a problem twice in a row', () => {
        for (let i = 1; i < problems.length; i++) expect(problemText(problems[i])).not.toBe(problemText(problems[i - 1]));
    });

    it('replays the same round from the same seed, and another from another', () => {
        expect(sample(ZETAMAC_DEFAULTS, 50, 7)).toEqual(sample(ZETAMAC_DEFAULTS, 50, 7));
        expect(sample(ZETAMAC_DEFAULTS, 50, 7)).not.toEqual(sample(ZETAMAC_DEFAULTS, 50, 8));
    });
});

describe('custom settings', () => {
    it('keeps to the operations and ranges chosen', () => {
        const settings = ArithmeticSettingsSchema.parse({
            ...ZETAMAC_DEFAULTS, operations: ['multiply'], multiplyLeft: {min: 13, max: 19}, multiplyRight: {min: 13, max: 19}, duration: 60,
        });
        for (const p of sample(settings, 500)) {
            expect(p.op).toBe('multiply');
            expect(p.left).toBeGreaterThanOrEqual(13);
            expect(p.right).toBeLessThanOrEqual(19);
        }
    });

    it('refuses what cannot make a round', () => {
        const bad = [
            {...ZETAMAC_DEFAULTS, operations: []},
            {...ZETAMAC_DEFAULTS, operations: ['add', 'modulo']},
            {...ZETAMAC_DEFAULTS, addLeft: {min: 50, max: 10}},
            {...ZETAMAC_DEFAULTS, multiplyLeft: {min: 0, max: 12}},
            {...ZETAMAC_DEFAULTS, addRight: {min: 1, max: 1e9}},
            {...ZETAMAC_DEFAULTS, duration: 45},
            {...ZETAMAC_DEFAULTS, addLeft: {min: 1.5, max: 10}},
        ];
        for (const settings of bad) expect(ArithmeticSettingsSchema.safeParse(settings).success, JSON.stringify(settings)).toBe(false);
    });

    it('puts the operations in one order, however they were chosen', () => {
        expect(ArithmeticSettingsSchema.parse({...ZETAMAC_DEFAULTS, operations: ['divide', 'add']}).operations).toEqual(['add', 'divide']);
    });
});

describe('isAnswer', () => {
    const problem = nextProblem(mulberry32(3), ZETAMAC_DEFAULTS);

    it('takes the answer typed, spaces aside, and nothing else', () => {
        expect(isAnswer(problem, String(problem.answer))).toBe(true);
        expect(isAnswer(problem, ` ${problem.answer} `)).toBe(true);
        expect(isAnswer(problem, String(problem.answer + 1))).toBe(false);
        expect(isAnswer(problem, `${problem.answer}.0`)).toBe(false);
        expect(isAnswer(problem, '')).toBe(false);
        expect(isAnswer({op: 'subtract', left: 5, right: 7, answer: -2}, '-2')).toBe(true);
    });
});

describe('settingsKey', () => {
    it('names the defaults "zetamac" and spells out anything else', () => {
        expect(settingsKey(ZETAMAC_DEFAULTS)).toBe('zetamac');
        expect(settingsKey({...ZETAMAC_DEFAULTS, duration: 60})).toBe('ops=asmd;add=2-100x2-100;mul=2-12x2-100;t=60');
        expect(settingsKey({...ZETAMAC_DEFAULTS, operations: ['multiply']})).toBe('ops=m;add=2-100x2-100;mul=2-12x2-100;t=120');
    });
});
