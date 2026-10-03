// The daily puzzles: every answer key checked another way (puzzle-checks.ts), every sentence held
// to the 'copy' tier of the no-advice list, the schedule pinned so a reorder cannot move puzzles
// between days already shown, and the day arithmetic that picks today's puzzle.

import {describe, expect, it} from 'vitest';
import {findBanned} from '@/lib/learn/banned';
import {checkAnswer, parseAnswer} from '@/lib/games/answer';
import {fnv1a, mulberry32} from '@/lib/random';
import {addCalendarDays} from '@/lib/dates';
import {PUZZLE_BANK, PUZZLE_SCHEDULE} from '@/lib/learn/copy/puzzles';
import {PUZZLES_START_DATE, SCHEDULED, archiveFor, archiveRows, contextFor, dailyPuzzleFor, firstNumberOf, isShown, progressFor, puzzleById, puzzleView, type SolveRow} from '@/lib/games/puzzles';
import {PUZZLE_CHECKS} from '@/lib/games/__tests__/puzzle-checks';

const clean = (text: string, where: string) => {
    expect(text, where).not.toMatch(/undefined|NaN|null|\[object|Infinity/);
    expect(findBanned(text, 'copy'), `${where}: ${text}`).toEqual([]);
};

describe('the puzzle bank', () => {
    it('gives every puzzle an id of its own, fit for a URL', () => {
        const ids = PUZZLE_BANK.map((p) => p.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
        expect(PUZZLE_BANK.length).toBeGreaterThanOrEqual(60);
    });

    it('schedules every puzzle exactly once', () => {
        expect([...PUZZLE_SCHEDULE].sort()).toEqual(PUZZLE_BANK.map((p) => p.id).sort());
        expect(SCHEDULED.map((p) => p.id)).toEqual([...PUZZLE_SCHEDULE]);
    });

    it('keeps the first sixty days in their order: new puzzles are appended, never inserted', () => {
        // A reorder moves puzzles between days already shown. If this fails, put the order back
        // and add the new puzzle at the end of PUZZLE_SCHEDULE.
        expect(fnv1a(PUZZLE_SCHEDULE.slice(0, 60).join(','))).toBe(SCHEDULE_HASH);
    });

    it('writes a prompt, one to three hints and a solution, in plain words', () => {
        for (const puzzle of PUZZLE_BANK) {
            expect(puzzle.prompt.length, puzzle.id).toBeGreaterThanOrEqual(1);
            expect(puzzle.prompt.length, puzzle.id).toBeLessThanOrEqual(3);
            expect(puzzle.hints.length, puzzle.id).toBeGreaterThanOrEqual(1);
            expect(puzzle.hints.length, puzzle.id).toBeLessThanOrEqual(3);
            expect(puzzle.solution.length, puzzle.id).toBeGreaterThanOrEqual(1);
            expect([1, 2, 3], puzzle.id).toContain(puzzle.difficulty);
            for (const text of [puzzle.title, ...puzzle.prompt, ...puzzle.hints, ...puzzle.solution, puzzle.unit ?? '']) clean(text, puzzle.id);
        }
    });

    it('states every answer in a notation a reader can type, and accepts it back', () => {
        for (const puzzle of PUZZLE_BANK) {
            expect(parseAnswer(puzzle.answer), puzzle.id).not.toBeNull();
            expect(checkAnswer(puzzle, puzzle.answer), puzzle.id).toBe('correct');
            if (puzzle.tolerance !== undefined) expect(puzzle.tolerance, puzzle.id).toBeGreaterThan(0);
        }
    });
});

describe('every answer key, checked another way', () => {
    it('has a check for every puzzle', () => {
        expect(Object.keys(PUZZLE_CHECKS).sort()).toEqual(PUZZLE_BANK.map((p) => p.id).sort());
    });

    it.each(PUZZLE_BANK.map((p) => [p.id, p] as const))('%s', (id, puzzle) => {
        const stated = parseAnswer(puzzle.answer)?.value ?? NaN;
        const check = PUZZLE_CHECKS[id];
        if (check.kind === 'exact') {
            const value = check.value();
            const allowed = puzzle.tolerance ?? (check.within ?? 1e-9) * Math.max(1, Math.abs(stated));
            expect(Math.abs(value - stated), `${id}: computed ${value}, stated ${stated}`).toBeLessThanOrEqual(allowed);
            return;
        }
        // A simulation: the stated answer must sit within five standard errors of the mean.
        const random = mulberry32(fnv1a(id));
        const trials = check.trials ?? 200_000;
        let sum = 0;
        let squares = 0;
        for (let i = 0; i < trials; i++) {
            const x = check.trial(random);
            sum += x;
            squares += x * x;
        }
        const mean = sum / trials;
        const se = Math.sqrt(Math.max(squares / trials - mean * mean, 0) / trials);
        expect(Math.abs(mean - stated), `${id}: simulated ${mean} ± ${se}, stated ${stated}`).toBeLessThanOrEqual(5 * se + (puzzle.tolerance ?? 0) + 1e-9);
    }, 20_000);
});

describe('the schedule', () => {
    it('shows puzzle #1 on the first day and moves one a day', () => {
        expect(dailyPuzzleFor(addCalendarDays(PUZZLES_START_DATE, -1))).toBeNull();
        const first = dailyPuzzleFor(PUZZLES_START_DATE);
        expect(first?.number).toBe(1);
        expect(first?.puzzle.id).toBe(PUZZLE_SCHEDULE[0]);
        const tenth = dailyPuzzleFor(addCalendarDays(PUZZLES_START_DATE, 9));
        expect(tenth?.number).toBe(10);
        expect(tenth?.puzzle.id).toBe(PUZZLE_SCHEDULE[9]);
    });

    it('cycles through the bank when it runs out, the number still counting days', () => {
        const n = SCHEDULED.length;
        const again = dailyPuzzleFor(addCalendarDays(PUZZLES_START_DATE, n));
        expect(again?.puzzle.id).toBe(PUZZLE_SCHEDULE[0]);
        expect(again?.number).toBe(n + 1);
        expect(firstNumberOf(PUZZLE_SCHEDULE[0])).toBe(1);
        expect(firstNumberOf('no-such-puzzle')).toBeNull();
    });

    it('opens the archive to the puzzles already shown, newest first', () => {
        const today = addCalendarDays(PUZZLES_START_DATE, 6);
        const archive = archiveFor(today);
        expect(archive.map((e) => e.number)).toEqual([7, 6, 5, 4, 3, 2, 1]);
        expect(archive[0].puzzle.id).toBe(dailyPuzzleFor(today)?.puzzle.id);
        expect(archive.at(-1)?.firstDay).toBe(PUZZLES_START_DATE);
        expect(isShown(PUZZLE_SCHEDULE[6], today)).toBe(true);
        expect(isShown(PUZZLE_SCHEDULE[7], today)).toBe(false);
        expect(isShown('no-such-puzzle', today)).toBe(false);
        expect(archiveFor(addCalendarDays(PUZZLES_START_DATE, -3))).toEqual([]);
        expect(archiveFor(addCalendarDays(PUZZLES_START_DATE, 10_000))).toHaveLength(SCHEDULED.length);
    });

    it('looks a puzzle up only by a real id', () => {
        expect(puzzleById(PUZZLE_SCHEDULE[0])?.id).toBe(PUZZLE_SCHEDULE[0]);
        for (const junk of ['nope', '', undefined, null, 42, {id: 'bat-and-ball'}]) expect(puzzleById(junk)).toBeNull();
    });

    it('prints no answer, solution or hint before the reader asks', () => {
        for (const puzzle of PUZZLE_BANK) {
            const view = puzzleView(puzzle, 3);
            const text = JSON.stringify(view);
            expect(Object.keys(view).sort(), puzzle.id).toEqual(
                ['category', 'difficulty', 'hintCount', 'id', 'number', 'prompt', 'title', ...(puzzle.unit ? ['unit'] : []), ...(puzzle.tolerance !== undefined ? ['estimate'] : [])].sort());
            for (const secret of [...puzzle.solution, ...puzzle.hints]) expect(text).not.toContain(secret);
            expect(view.hintCount).toBe(puzzle.hints.length);
        }
    });
});

describe('an attempt and what it shows', () => {
    const today = addCalendarDays(PUZZLES_START_DATE, 6);
    const todays = PUZZLE_SCHEDULE[6];
    const older = PUZZLE_SCHEDULE[2];
    const row = (over: Partial<SolveRow>): SolveRow =>
        ({puzzleId: todays, day: today, status: 'open', attempts: 0, hintsUsed: 0, solvedAt: null, ...over});

    it('counts today\'s puzzle for today, an older one in the archive, and refuses the rest', () => {
        expect(contextFor(todays, today)).toMatchObject({day: today, number: 7});
        expect(contextFor(older, today)).toMatchObject({day: null, number: 3});
        expect(contextFor(PUZZLE_SCHEDULE[7], today)).toBeNull();
        expect(contextFor('no-such-puzzle', today)).toBeNull();
        expect(contextFor(undefined, today)).toBeNull();
    });

    it('shows the hints taken, and the answer only once closed', () => {
        const puzzle = puzzleById(todays);
        if (!puzzle) throw new Error(todays);
        expect(progressFor(puzzle, null)).toEqual({status: null, attempts: 0, hints: [], solvedAt: null, answer: null, solution: null});
        const open = progressFor(puzzle, row({attempts: 2, hintsUsed: 1}));
        expect(open).toMatchObject({status: 'open', attempts: 2, hints: puzzle.hints.slice(0, 1), answer: null, solution: null});
        expect(progressFor(puzzle, row({hintsUsed: 99})).hints).toEqual(puzzle.hints);
        const solvedAt = new Date('2026-10-04T21:14:00Z');
        expect(progressFor(puzzle, row({status: 'solved', attempts: 2, solvedAt}))).toMatchObject({
            status: 'solved', answer: puzzle.answer, solution: puzzle.solution, solvedAt: solvedAt.toISOString(),
        });
        expect(progressFor(puzzle, row({status: 'revealed'}))).toMatchObject({status: 'revealed', answer: puzzle.answer, solvedAt: null});
    });

    it('lists the archive with each puzzle\'s furthest progress in any context', () => {
        const rows = archiveRows(today, [
            row({puzzleId: older, day: null, status: 'open', attempts: 1}),
            row({puzzleId: older, day: addCalendarDays(PUZZLES_START_DATE, 2), status: 'solved', attempts: 3, solvedAt: new Date('2026-09-30T15:00:00Z')}),
            row({puzzleId: PUZZLE_SCHEDULE[1], day: null, status: 'revealed'}),
        ]);
        expect(rows.map((r) => r.number)).toEqual([7, 6, 5, 4, 3, 2, 1]);
        const third = rows.find((r) => r.id === older);
        expect(third).toMatchObject({status: 'solved', solvedOnItsDay: true, attempts: 3, solvedAt: '2026-09-30T15:00:00.000Z'});
        expect(rows.find((r) => r.id === PUZZLE_SCHEDULE[1])).toMatchObject({status: 'revealed', solvedOnItsDay: false, solvedAt: null});
        expect(rows.find((r) => r.id === todays)).toMatchObject({status: null, attempts: 0});
    });
});

// fnv1a of the first sixty scheduled ids, comma-joined.
const SCHEDULE_HASH = 243654224;
