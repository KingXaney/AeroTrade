// The games' sentences (lib/learn/copy/games.ts), each rendered over the inputs it meets and held
// to the 'copy' tier of the no-advice list.

import {describe, expect, it} from 'vitest';
import {findBanned} from '@/lib/learn/banned';
import {ARCHIVE_COPY, GAMES_COPY, PUZZLE_CATEGORY_LABEL, PUZZLE_COPY, PUZZLE_DIFFICULTY_LABEL, STREAK_COPY} from '@/lib/learn/copy/games';

const clean = (text: string) => {
    expect(text, text).not.toMatch(/undefined|NaN|null|\[object|Infinity/);
    expect(findBanned(text, 'copy'), text).toEqual([]);
};

const strings = (table: object): string[] =>
    Object.values(table).flatMap((value) => (typeof value === 'string' ? [value] : Array.isArray(value) ? value.filter((v) => typeof v === 'string') : typeof value === 'object' && value ? strings(value) : []));

describe('the games copy', () => {
    it('says every fixed line in plain words', () => {
        for (const table of [GAMES_COPY, STREAK_COPY, PUZZLE_COPY, ARCHIVE_COPY, PUZZLE_CATEGORY_LABEL, PUZZLE_DIFFICULTY_LABEL]) {
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
        clean(ARCHIVE_COPY.posted('2026-09-28'));
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
    });
});
