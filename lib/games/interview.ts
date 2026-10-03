// Interview math mode: 80 multiple-choice problems in 8 minutes, the format of the mental-maths
// tests trading firms set — large sums, products, quotients, decimals, fractions, percentages,
// squares and roots, each with five options. Pure and client-safe; a round is seeded.
//
// The four wrong options sit near the answer, as a slip would land: a digit off, a place off, a
// near fraction. None ever equals the answer, and none repeats another.

import {mulberry32} from "@/lib/random";

export const INTERVIEW_QUESTIONS = 80;
export const INTERVIEW_SECONDS = 480;
export const OPTION_COUNT = 5;

export const KINDS = ['add', 'subtract', 'multiply', 'divide', 'decimal', 'fraction', 'percent', 'square', 'root'] as const;
export type InterviewKind = (typeof KINDS)[number];

export type InterviewQuestion = {
    kind: InterviewKind;
    text: string;
    options: string[];
    // Index into options.
    answer: number;
};

type Value = {n: number; d: number};

const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));
const frac = (n: number, d: number): Value => {
    const g = gcd(n, d) || 1;
    return {n: n / g, d: d / g};
};
const value = (v: Value) => v.n / v.d;

// A decimal without float noise: at most four places, trailing zeros dropped.
export const formatNumber = (x: number): string => {
    const rounded = Math.round(x * 10_000) / 10_000;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
};
const formatFraction = (v: Value): string => (v.d === 1 ? String(v.n) : `${v.n}/${v.d}`);

const between = (random: () => number, min: number, max: number) => min + Math.floor(random() * (max - min + 1));
const pick = <T>(random: () => number, items: readonly T[]): T => items[Math.floor(random() * items.length)];

type Draft = {kind: InterviewKind; text: string; answer: Value; asFraction?: boolean};

const draft = (random: () => number, kind: InterviewKind): Draft => {
    switch (kind) {
        case 'add': {
            const a = between(random, 1000, 9999);
            const b = between(random, 100, 9999);
            return {kind, text: `${a} + ${b}`, answer: frac(a + b, 1)};
        }
        case 'subtract': {
            const a = between(random, 2000, 9999);
            const b = between(random, 100, a - 1);
            return {kind, text: `${a} − ${b}`, answer: frac(a - b, 1)};
        }
        case 'multiply': {
            const twoByTwo = random() < 0.6;
            const a = twoByTwo ? between(random, 12, 99) : between(random, 101, 999);
            const b = twoByTwo ? between(random, 12, 99) : between(random, 3, 9);
            return {kind, text: `${a} × ${b}`, answer: frac(a * b, 1)};
        }
        case 'divide': {
            const d = between(random, 3, 25);
            const q = between(random, 12, 400);
            return {kind, text: `${d * q} ÷ ${d}`, answer: frac(q, 1)};
        }
        case 'decimal': {
            const a = between(random, 11, 99);
            const b = between(random, 2, 19);
            // a/100 × b/10, exact in thousandths.
            return {kind, text: `${formatNumber(a / 100)} × ${formatNumber(b / 10)}`, answer: frac(a * b, 1000)};
        }
        case 'fraction': {
            const dens = [2, 3, 4, 5, 6, 8, 10, 12] as const;
            const b = pick(random, dens);
            const d = pick(random, dens);
            const a = between(random, 1, b - 1);
            const c = between(random, 1, d - 1);
            return {kind, text: `${a}/${b} + ${c}/${d}`, answer: frac(a * d + c * b, b * d), asFraction: true};
        }
        case 'percent': {
            const p = pick(random, [5, 10, 12.5, 15, 20, 25, 30, 35, 40, 45, 60, 75] as const);
            const n = 8 * between(random, 5, 120);
            return {kind, text: `${p}% of ${n}`, answer: frac(Math.round(p * n * 10), 1000)};
        }
        case 'square': {
            const n = between(random, 13, 49);
            return {kind, text: `${n}²`, answer: frac(n * n, 1)};
        }
        case 'root': {
            const n = between(random, 13, 59);
            return {kind, text: `√${n * n}`, answer: frac(n, 1)};
        }
    }
};

// Near misses, as a slip would land: a unit, a ten, a hundred off; a place off; two digits swapped.
const nearMisses = (random: () => number, answer: Value, asFraction: boolean): Value[] => {
    if (asFraction) {
        const {n, d} = answer;
        return [frac(n + 1, d), frac(Math.max(1, n - 1), d), frac(n, d + 1), frac(n + d, d * 2), frac(n * 2, d + 1), frac(n + 2, d)];
    }
    const x = value(answer);
    const isWhole = Number.isInteger(x);
    const step = isWhole ? 1 : 10 ** -Math.min(4, (formatNumber(x).split('.')[1] ?? '').length);
    const digits = String(Math.round(Math.abs(x) / step));
    const swapped = digits.length >= 2
        ? Number(`${digits.slice(0, -2)}${digits.at(-1)}${digits.at(-2)}`) * step
        : x + step;
    const candidates = [x + step, x - step, x + 10 * step, x - 10 * step, x * 10, x / 10, swapped, x + 2 * step, x + 100 * step];
    // A seeded shuffle so the same misses do not always come in the same order.
    for (let i = candidates.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    return candidates.map((c) => frac(Math.round(c * 10_000), 10_000));
};

const optionText = (v: Value, asFraction: boolean) => (asFraction ? formatFraction(v) : formatNumber(value(v)));

export const buildQuestion = (random: () => number, kind: InterviewKind): InterviewQuestion => {
    const q = draft(random, kind);
    const asFraction = q.asFraction === true;
    const right = optionText(q.answer, asFraction);
    const options = [right];
    for (const miss of nearMisses(random, q.answer, asFraction)) {
        if (options.length === OPTION_COUNT) break;
        const text = optionText(miss, asFraction);
        // Never the answer under another spelling, never a repeat, never negative.
        if (value(miss) <= 0 || options.includes(text) || Math.abs(value(miss) - value(q.answer)) < 1e-9) continue;
        options.push(text);
    }
    for (let extra = 3; options.length < OPTION_COUNT; extra++) {
        const text = optionText(frac(Math.round((value(q.answer) + extra) * 10_000), 10_000), asFraction);
        if (!options.includes(text)) options.push(text);
    }
    for (let i = options.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [options[i], options[j]] = [options[j], options[i]];
    }
    return {kind, text: q.text, options, answer: options.indexOf(right)};
};

// A round: every kind in turn, then at random, all from one seed.
export const interviewRound = (seed: number, count = INTERVIEW_QUESTIONS): InterviewQuestion[] => {
    const random = mulberry32(seed);
    return Array.from({length: count}, (_, i) => buildQuestion(random, i < KINDS.length ? KINDS[i] : pick(random, KINDS)));
};
