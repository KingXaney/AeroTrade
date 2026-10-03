// The arithmetic sprint, Zetamac-style: as many problems as you can in a set time, each one
// moving on the moment the typed answer is right. Pure and client-safe; a round is seeded, so a
// test (and the QA suite's fake clock) can replay one exactly.
//
// The defaults are Zetamac's: addition of two numbers from 2 to 100, subtraction as addition in
// reverse, multiplication of 2–12 by 2–100, division as multiplication in reverse, two minutes.
// A record is kept per settings key, so a round on easier settings never stands beside one on the
// defaults.

import {z} from "zod";
import {mulberry32} from "@/lib/random";

export const OPERATIONS = ['add', 'subtract', 'multiply', 'divide'] as const;
export type Operation = (typeof OPERATIONS)[number];

export const DURATIONS = [30, 60, 120, 300, 600] as const;
export type Duration = (typeof DURATIONS)[number];

// The largest operand a custom range may name: big enough for practice, small enough that every
// answer stays a plain integer.
export const OPERAND_MAX = 10_000;

const RangeSchema = z.object({min: z.number().int().min(0).max(OPERAND_MAX), max: z.number().int().min(0).max(OPERAND_MAX)})
    .refine((range) => range.min <= range.max, {message: 'min must not exceed max'});

export const ArithmeticSettingsSchema = z.object({
    operations: z.array(z.enum(OPERATIONS)).min(1).max(4)
        .transform((ops) => OPERATIONS.filter((op) => ops.includes(op))),
    addLeft: RangeSchema,
    addRight: RangeSchema,
    // Division divides by the left factor, so it may not include zero.
    multiplyLeft: RangeSchema.refine((range) => range.min >= 1, {message: 'a divisor of zero'}),
    multiplyRight: RangeSchema,
    duration: z.literal(DURATIONS),
});

export type ArithmeticSettings = z.infer<typeof ArithmeticSettingsSchema>;

export const ZETAMAC_DEFAULTS: ArithmeticSettings = {
    operations: ['add', 'subtract', 'multiply', 'divide'],
    addLeft: {min: 2, max: 100},
    addRight: {min: 2, max: 100},
    multiplyLeft: {min: 2, max: 12},
    multiplyRight: {min: 2, max: 100},
    duration: 120,
};

export type Problem = {op: Operation; left: number; right: number; answer: number};

export const SYMBOL: Record<Operation, string> = {add: '+', subtract: '−', multiply: '×', divide: '÷'};

export const problemText = (problem: Problem): string => `${problem.left} ${SYMBOL[problem.op]} ${problem.right}`;

const between = (random: () => number, range: {min: number; max: number}) =>
    range.min + Math.floor(random() * (range.max - range.min + 1));

export const nextProblem = (random: () => number, settings: ArithmeticSettings): Problem => {
    const op = settings.operations[Math.floor(random() * settings.operations.length)];
    if (op === 'add' || op === 'subtract') {
        const a = between(random, settings.addLeft);
        const b = between(random, settings.addRight);
        return op === 'add' ? {op, left: a, right: b, answer: a + b} : {op, left: a + b, right: a, answer: b};
    }
    const a = between(random, settings.multiplyLeft);
    const b = between(random, settings.multiplyRight);
    return op === 'multiply' ? {op, left: a, right: b, answer: a * b} : {op, left: a * b, right: a, answer: b};
};

// A round's i-th problem, from its seed alone: the same seed, settings and place give the same
// problem, so a round replays exactly and a reducer can draw it purely. It is never the problem
// just before it.
export const problemAt = (seed: number, settings: ArithmeticSettings, index: number, previous: Problem | null): Problem => {
    const random = mulberry32((seed + Math.imul(index + 1, 0x9e3779b1)) >>> 0);
    for (let tries = 0; ; tries++) {
        const problem = nextProblem(random, settings);
        if (!previous || problemText(problem) !== problemText(previous) || tries > 20) return problem;
    }
};

// The round's problems one after another, for a caller that keeps no index.
export const problemStream = (seed: number, settings: ArithmeticSettings): (() => Problem) => {
    let index = 0;
    let previous: Problem | null = null;
    return () => {
        previous = problemAt(seed, settings, index++, previous);
        return previous;
    };
};

// Whether the typed text is the answer: digits only, an optional minus, surrounding spaces ignored.
export const isAnswer = (problem: Problem, typed: string): boolean => {
    const text = typed.trim();
    return /^-?\d{1,9}$/.test(text) && Number(text) === problem.answer;
};

const rangeKey = (range: {min: number; max: number}) => `${range.min}-${range.max}`;

// The key a record is kept under: "zetamac" for the defaults, else every setting spelled out.
const spell = (settings: ArithmeticSettings): string => [
    `ops=${settings.operations.map((op) => op[0]).join('')}`,
    `add=${rangeKey(settings.addLeft)}x${rangeKey(settings.addRight)}`,
    `mul=${rangeKey(settings.multiplyLeft)}x${rangeKey(settings.multiplyRight)}`,
    `t=${settings.duration}`,
].join(';');

export const settingsKey = (settings: ArithmeticSettings): string => {
    const spelled = spell(settings);
    return spelled === spell(ZETAMAC_DEFAULTS) ? 'zetamac' : spelled;
};
