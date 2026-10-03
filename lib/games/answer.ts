// A puzzle answer as a reader types it: "42", "0.25", "1/4", "25%", "2.5e3", "$1,967.15". Pure and
// import-free. The patterns are fixed — the reader's text is only ever tested against them,
// never made into one (invariant 2).
//
// An exact answer is compared as a fraction, so 0.25, 1/4 and 25% are one answer. A decimal for
// a fraction that has no short decimal (1/3) is accepted when it is the answer rounded to the
// places typed, with at least three significant figures. An answer with a tolerance (an
// estimate) accepts anything within it.

export type Fraction = {n: number; d: number};

export type ParsedAnswer = {
    value: number;
    // The exact fraction the text names, when its numerator and denominator stay safe integers.
    exact: Fraction | null;
    // Digits after the decimal point once a percent is folded in ("33.3%" is 0.333: three).
    decimals: number;
    // Significant figures typed; Infinity for a fraction ("1/3" is exact).
    significant: number;
};

export type AnswerSpec = {
    // The canonical answer, in the same notation a reader may type ("1/6", "14.7", "31536000").
    answer: string;
    // Accept anything within this absolute distance (an estimate).
    tolerance?: number;
};

export type AnswerCheck = 'correct' | 'close' | 'wrong' | 'unreadable';

// Longer than this is not an answer.
export const ANSWER_MAX_CHARS = 40;

const FRACTION = /^(-?)(\d{1,15})\/(\d{1,15})$/;
const DECIMAL = /^(-?)(\d*)(?:\.(\d*))?(?:e([+-]?\d{1,3}))?$/i;
const GROUPED = /^-?\d{1,3}(,\d{3})+(\.\d+)?$/;

const gcd = (a: number, b: number): number => {
    let x = Math.abs(a);
    let y = Math.abs(b);
    while (y) [x, y] = [y, x % y];
    return x;
};

const reduce = (n: number, d: number): Fraction | null => {
    if (!Number.isSafeInteger(n) || !Number.isSafeInteger(d) || d === 0) return null;
    const sign = d < 0 ? -1 : 1;
    const g = gcd(n, d) || 1;
    return {n: (sign * n) / g, d: (sign * d) / g};
};

const significantFigures = (digits: string): number => {
    const trimmed = digits.replace(/^0+/, '');
    return trimmed.length;
};

export const parseAnswer = (input: string): ParsedAnswer | null => {
    if (typeof input !== 'string' || input.length > ANSWER_MAX_CHARS) return null;
    // The app prints a minus as U+2212; a reader may paste one back.
    let text = input.trim().replace(/\s+/g, '').replace(/−/g, '-');
    if (text.startsWith('+')) text = text.slice(1);
    if (text.startsWith('$')) text = text.slice(1);
    else if (text.startsWith('-$')) text = `-${text.slice(2)}`;
    let percent = false;
    if (text.endsWith('%')) {
        percent = true;
        text = text.slice(0, -1);
    }
    if (GROUPED.test(text)) text = text.replace(/,/g, '');
    if (!text) return null;

    const fraction = FRACTION.exec(text);
    if (fraction) {
        const sign = fraction[1] === '-' ? -1 : 1;
        const n = sign * Number(fraction[2]);
        const d = Number(fraction[3]) * (percent ? 100 : 1);
        const exact = reduce(n, d);
        if (!exact || d === 0) return null;
        return {value: n / d, exact, decimals: Infinity, significant: Infinity};
    }

    const decimal = DECIMAL.exec(text);
    if (!decimal) return null;
    const [, minus, whole = '', frac = '', exponentText] = decimal;
    if (!whole && !frac) return null;
    const exponent = (exponentText ? Number(exponentText) : 0) - (percent ? 2 : 0);
    const digits = `${whole}${frac}`;
    const value = Number(`${minus}${whole || '0'}.${frac || '0'}e${exponent}`);
    if (!Number.isFinite(value)) return null;
    // value = ±digits × 10^(exponent − frac.length), exactly, while the digits stay safe.
    const scale = exponent - frac.length;
    const mantissa = Number(digits || '0') * (minus === '-' ? -1 : 1);
    let exact: Fraction | null = null;
    if (digits.length <= 15 && Math.abs(scale) <= 15) {
        exact = scale >= 0 ? reduce(mantissa * 10 ** scale, 1) : reduce(mantissa, 10 ** -scale);
    }
    return {value, exact, decimals: Math.max(0, -scale), significant: significantFigures(digits)};
};

const sameFraction = (a: Fraction, b: Fraction): boolean => a.n === b.n && a.d === b.d;

// Whether `guess` is `target` rounded to the places the reader typed.
const roundsTo = (guess: ParsedAnswer, target: number): boolean => {
    if (!Number.isFinite(guess.decimals)) return false;
    const unit = 10 ** -guess.decimals;
    return Math.abs(guess.value - target) <= unit / 2 + Math.abs(target) * 1e-12;
};

export const checkAnswer = (spec: AnswerSpec, input: string): AnswerCheck => {
    const target = parseAnswer(spec.answer);
    if (!target) throw new Error(`unreadable answer key: ${spec.answer}`);
    const guess = parseAnswer(input);
    if (!guess) return 'unreadable';

    if (spec.tolerance !== undefined) {
        if (Math.abs(guess.value - target.value) <= spec.tolerance + 1e-12) return 'correct';
        return Math.abs(guess.value - target.value) <= spec.tolerance * 3 ? 'close' : 'wrong';
    }
    if (guess.exact && target.exact && sameFraction(guess.exact, target.exact)) return 'correct';
    if (roundsTo(guess, target.value)) return guess.significant >= 3 ? 'correct' : 'close';
    const scale = Math.max(Math.abs(target.value), 1e-9);
    return Math.abs(guess.value - target.value) / scale <= 0.01 ? 'close' : 'wrong';
};
