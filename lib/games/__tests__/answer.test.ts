// Reading a typed answer: one answer in every notation a reader may use, decimals for a fraction
// held to three significant figures, an estimate held to its tolerance, and nothing that is not
// a number.

import {describe, expect, it} from 'vitest';
import {ANSWER_MAX_CHARS, checkAnswer, parseAnswer} from '@/lib/games/answer';

const check = (answer: string, input: string, tolerance?: number) => checkAnswer({answer, tolerance}, input);

describe('parseAnswer', () => {
    it('reads integers, decimals, fractions, percents, exponents and grouped thousands', () => {
        expect(parseAnswer('42')?.exact).toEqual({n: 42, d: 1});
        expect(parseAnswer('0.25')?.exact).toEqual({n: 1, d: 4});
        expect(parseAnswer('.5')?.exact).toEqual({n: 1, d: 2});
        expect(parseAnswer('2/6')?.exact).toEqual({n: 1, d: 3});
        expect(parseAnswer('25%')?.exact).toEqual({n: 1, d: 4});
        expect(parseAnswer('2.5e3')?.exact).toEqual({n: 2500, d: 1});
        expect(parseAnswer('31,536,000')?.value).toBe(31_536_000);
        expect(parseAnswer('$1,967.15')?.value).toBeCloseTo(1967.15, 10);
        expect(parseAnswer(' 3 / 8 ')?.value).toBe(0.375);
    });

    it('reads a sign, including the minus the app prints', () => {
        expect(parseAnswer('-3')?.value).toBe(-3);
        expect(parseAnswer('−3')?.value).toBe(-3);
        expect(parseAnswer('+5')?.value).toBe(5);
        expect(parseAnswer('-$2')?.value).toBe(-2);
    });

    it('counts the places and significant figures typed', () => {
        expect(parseAnswer('0.333')).toMatchObject({decimals: 3, significant: 3});
        expect(parseAnswer('33.3%')).toMatchObject({decimals: 3, significant: 3});
        expect(parseAnswer('0.0278')).toMatchObject({decimals: 4, significant: 3});
        expect(parseAnswer('1/3')).toMatchObject({decimals: Infinity, significant: Infinity});
    });

    it('reads nothing that is not a number', () => {
        for (const junk of ['', ' ', 'half', '1/0', '1,00', '1..2', '1/2/3', '--1', 'e5', '0x10', '1/2.5', 'Infinity', 'NaN', '1e999']) {
            expect(parseAnswer(junk), junk).toBeNull();
        }
        expect(parseAnswer('1'.repeat(ANSWER_MAX_CHARS + 1))).toBeNull();
        expect(parseAnswer(undefined as unknown as string)).toBeNull();
    });
});

describe('checkAnswer', () => {
    it('takes one exact answer in any notation', () => {
        for (const input of ['1/4', '0.25', '25%', '2/8', '0.250', ' 1/4 ']) expect(check('1/4', input), input).toBe('correct');
        for (const input of ['45', '45.0', '4.5e1']) expect(check('45', input), input).toBe('correct');
    });

    it('takes a decimal for a fraction with no short one, to three significant figures', () => {
        expect(check('1/3', '0.333')).toBe('correct');
        expect(check('1/3', '33.3%')).toBe('correct');
        expect(check('1/3', '0.3333')).toBe('correct');
        expect(check('161/36', '4.47')).toBe('correct');
        expect(check('1/52', '0.0192')).toBe('correct');
        // Rounded right, but too short to tell 1/3 from its neighbours.
        expect(check('1/3', '0.33')).toBe('close');
        expect(check('1/3', '0.3')).toBe('close');
        // Three figures, rounded wrong.
        expect(check('1/3', '0.334')).toBe('close');
    });

    it('says close only within a percent, and wrong beyond', () => {
        expect(check('42', '41')).toBe('wrong');
        expect(check('1/6', '1/5')).toBe('wrong');
        expect(check('1000', '1009')).toBe('close');
    });

    it('holds an estimate to its tolerance, and calls three tolerances away close', () => {
        expect(check('11.9', '12', 0.5)).toBe('correct');
        expect(check('11.9', '11.4', 0.5)).toBe('correct');
        expect(check('11.9', '13', 0.5)).toBe('close');
        expect(check('11.9', '14', 0.5)).toBe('wrong');
        expect(check('1967.15', '$1,967', 1)).toBe('correct');
    });

    it('cannot read what is not a number, and refuses an unreadable key', () => {
        expect(check('1/2', 'half')).toBe('unreadable');
        expect(check('1/2', '')).toBe('unreadable');
        expect(() => check('one half', '1/2')).toThrow();
    });
});
