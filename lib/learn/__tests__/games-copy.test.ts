// The games' sentences (lib/learn/copy/games.ts), each rendered over the inputs it meets and held
// to the 'copy' tier of the no-advice list.

import {describe, expect, it} from 'vitest';
import {findBanned} from '@/lib/learn/banned';
import {ARCHIVE_COPY, ARITHMETIC_COPY, CORRELATION_COPY, GAMES_COPY, KELLY_COPY, MARKET_COPY, PUZZLE_CATEGORY_LABEL, PUZZLE_COPY, PUZZLE_DIFFICULTY_LABEL, STREAK_COPY} from '@/lib/learn/copy/games';

const clean = (text: string) => {
    expect(text, text).not.toMatch(/undefined|NaN|null|\[object|Infinity/);
    expect(findBanned(text, 'copy'), text).toEqual([]);
};

const strings = (table: object): string[] =>
    Object.values(table).flatMap((value) => (typeof value === 'string' ? [value] : Array.isArray(value) ? value.filter((v) => typeof v === 'string') : typeof value === 'object' && value ? strings(value) : []));

describe('the games copy', () => {
    it('says every fixed line in plain words', () => {
        for (const table of [GAMES_COPY, STREAK_COPY, PUZZLE_COPY, ARCHIVE_COPY, ARITHMETIC_COPY, KELLY_COPY, MARKET_COPY, CORRELATION_COPY, PUZZLE_CATEGORY_LABEL, PUZZLE_DIFFICULTY_LABEL]) {
            for (const text of strings(table)) clean(text);
        }
    });

    it('renders every function over the inputs it meets', () => {
        for (const n of [0, 1, 2, 12, 365, 1200]) {
            [STREAK_COPY.streak(n), STREAK_COPY.longest(n), STREAK_COPY.solvedOnTheDay(n), STREAK_COPY.atRisk(n),
                STREAK_COPY.chipAria(n, true), STREAK_COPY.chipAria(n, false), PUZZLE_COPY.number(n), PUZZLE_COPY.attempts(n),
                PUZZLE_COPY.hintsLeft(n), PUZZLE_COPY.hint(n)].forEach(clean);
        }
        for (const [attempts, hints] of [[1, 0], [2, 1], [5, 3]]) clean(PUZZLE_COPY.solvedLine('Oct 3, 9:14 PM ET', attempts, hints));
        clean(STREAK_COPY.dayLabel('2026-10-03', true));
        for (const n of [0, 1, 48, 1200]) [ARITHMETIC_COPY.correct(n), ARITHMETIC_COPY.wrong(n), ARITHMETIC_COPY.record(n), ARITHMETIC_COPY.questionOf(n, 80)].forEach(clean);
        for (const seconds of [0, 0.4, 59.5, 120, 600]) [ARITHMETIC_COPY.timeLeft(seconds), ARITHMETIC_COPY.perProblem(seconds)].forEach(clean);
        for (const d of [30, 60, 120, 300, 600]) clean(ARITHMETIC_COPY.duration(d));
        clean(ARCHIVE_COPY.posted('2026-09-28'));
        for (const cents of [0, 1, 2500, 12_345, 25_000]) [KELLY_COPY.money(cents), KELLY_COPY.final(cents), KELLY_COPY.lastFlip(true, true, cents), KELLY_COPY.lastFlip(false, false, cents)].forEach(clean);
        for (const g of [0.0201, 0.0151, -Infinity]) clean(KELLY_COPY.growth(g));
        for (const n of [1, 300]) clean(KELLY_COPY.flipOf(n));
        for (const n of [-12, -1, 0, 3, 9]) [MARKET_COPY.signed(n), MARKET_COPY.fromInformed(n), MARKET_COPY.fromNoise(n), MARKET_COPY.traderBought(2, n + 14), MARKET_COPY.traderSold(3, n + 12)].forEach(clean);
        clean(MARKET_COPY.settled([6, 1, 3, 2], 12));
        clean(MARKET_COPY.believed(13.6));
        for (const n of [1, 4]) clean(MARKET_COPY.roundOf(n));
        for (const t of [0, 41, 1000]) [CORRELATION_COPY.score(t), CORRELATION_COPY.record(t)].forEach(clean);
        for (const n of [1, 10]) [CORRELATION_COPY.plotOf(n), CORRELATION_COPY.closeCount(n), CORRELATION_COPY.longestRun(n), CORRELATION_COPY.run(n), CORRELATION_COPY.plotLabel(n)].forEach(clean);
        clean(CORRELATION_COPY.reveal(-0.734, 0.06));
    });

    it('counts in words that read right at one and at many', () => {
        expect(PUZZLE_COPY.attempts(1)).toBe('1 try');
        expect(PUZZLE_COPY.attempts(2)).toBe('2 tries');
        expect(STREAK_COPY.longest(1)).toBe('Longest: 1 day');
        expect(STREAK_COPY.solvedOnTheDay(1200)).toBe('1,200 puzzles solved on the day');
        expect(PUZZLE_COPY.solvedLine('Oct 3, 9:14 PM ET', 2, 1)).toBe('Solved Oct 3, 9:14 PM ET · 2 tries · 1 hint');
        expect(PUZZLE_COPY.solvedLine('Oct 3, 9:14 PM ET', 1, 0)).toBe('Solved Oct 3, 9:14 PM ET · 1 try');
        expect(STREAK_COPY.chipAria(0, false)).toBe("Today's puzzle, not solved yet");
        expect(STREAK_COPY.weekdays).toHaveLength(7);
        expect(ARITHMETIC_COPY.timeLeft(119.2)).toBe('2:00 left');
        expect(ARITHMETIC_COPY.timeLeft(9)).toBe('0:09 left');
        expect(ARITHMETIC_COPY.timeLeft(-3)).toBe('0:00 left');
        expect(ARITHMETIC_COPY.duration(30)).toBe('30 s');
        expect(ARITHMETIC_COPY.duration(120)).toBe('2 min');
        expect(KELLY_COPY.money(2500)).toBe('$25.00');
        expect(KELLY_COPY.growth(-Infinity)).toBe('one tails ends it');
        expect(MARKET_COPY.signed(0)).toBe('0');
        expect(MARKET_COPY.signed(7)).toBe('+7');
        expect(CORRELATION_COPY.score(41)).toBe('Average miss: 0.041');
    });
});
