// The daily puzzle's schedule: which puzzle is shown on an ET day, which ones the archive holds,
// and what of a puzzle the page may print before it is solved. Pure, but server-only in use: it
// reads the bank (lib/learn/copy/puzzles), whose answers never reach a client bundle.
//
// Everyone gets the same puzzle on the same ET day: day 1 is PUZZLES_START_DATE, and the days
// walk PUZZLE_SCHEDULE, cycling when it runs out. A puzzle's number ("#12") is its day's count,
// so it keeps growing through the cycles. A solve row stores its own puzzle id and day
// (database/models/puzzle-solve.model.ts), so no streak or record ever depends on this order.

import {calendarDaysBetween, addCalendarDays} from "@/lib/dates";
import {PUZZLE_BANK, PUZZLE_SCHEDULE, type PuzzleCopy} from "@/lib/learn/copy/puzzles";
import type {PuzzleProgress, PuzzleStatus, PuzzleView} from "@/lib/games/types";

export type Puzzle = PuzzleCopy;

// A Monday a week before launch, so the archive opens with six puzzles to catch up on.
export const PUZZLES_START_DATE = '2026-09-28';

const BY_ID: ReadonlyMap<string, Puzzle> = new Map(PUZZLE_BANK.map((puzzle) => [puzzle.id, puzzle]));

// The schedule as puzzles; an id the bank lacks is dropped here and fails the bank test.
export const SCHEDULED: readonly Puzzle[] = PUZZLE_SCHEDULE.flatMap((id) => BY_ID.get(id) ?? []);

const SLOT: ReadonlyMap<string, number> = new Map(SCHEDULED.map((puzzle, index) => [puzzle.id, index]));

export const puzzleById = (id: unknown): Puzzle | null =>
    typeof id === 'string' ? BY_ID.get(id) ?? null : null;

export type DailyPuzzle = {puzzle: Puzzle; number: number; day: string};

// The puzzle shown on an ET day; null before the first one.
export const dailyPuzzleFor = (day: string): DailyPuzzle | null => {
    const index = calendarDaysBetween(PUZZLES_START_DATE, day);
    if (index < 0 || SCHEDULED.length === 0) return null;
    return {puzzle: SCHEDULED[index % SCHEDULED.length], number: index + 1, day};
};

// How many of the schedule's puzzles have been shown by `today`.
const shownCount = (today: string): number =>
    Math.max(0, Math.min(SCHEDULED.length, calendarDaysBetween(PUZZLES_START_DATE, today) + 1));

// A puzzle can be played once its first day has come: today's, or one in the archive.
export const isShown = (id: string, today: string): boolean => {
    const slot = SLOT.get(id);
    return slot !== undefined && slot < shownCount(today);
};

export type ArchiveEntry = {puzzle: Puzzle; number: number; firstDay: string};

// Every puzzle shown so far, newest first, numbered by its first day.
export const archiveFor = (today: string): ArchiveEntry[] =>
    SCHEDULED.slice(0, shownCount(today))
        .map((puzzle, index) => ({puzzle, number: index + 1, firstDay: addCalendarDays(PUZZLES_START_DATE, index)}))
        .reverse();

// What a page may print of a puzzle before it is solved: no answer, no solution, no hints.
export const puzzleView = (puzzle: Puzzle, number: number): PuzzleView => ({
    id: puzzle.id,
    number,
    title: puzzle.title,
    category: puzzle.category,
    difficulty: puzzle.difficulty,
    prompt: puzzle.prompt,
    ...(puzzle.unit ? {unit: puzzle.unit} : {}),
    ...(puzzle.tolerance !== undefined ? {estimate: true as const} : {}),
    hintCount: puzzle.hints.length,
});

// A puzzle's own first number: the archive's numbering, which today's puzzle may exceed once the
// schedule has cycled.
export const firstNumberOf = (id: string): number | null => {
    const slot = SLOT.get(id);
    return slot === undefined ? null : slot + 1;
};

// Which context an attempt belongs to: today's puzzle (counted for today's streak) or the
// archive. Null for a puzzle that is unknown or not shown yet.
export type PuzzleContext = {puzzle: Puzzle; day: string | null; number: number};

export const contextFor = (puzzleId: unknown, today: string): PuzzleContext | null => {
    const puzzle = puzzleById(puzzleId);
    if (!puzzle || !isShown(puzzle.id, today)) return null;
    const daily = dailyPuzzleFor(today);
    if (daily && daily.puzzle.id === puzzle.id) return {puzzle, day: today, number: daily.number};
    return {puzzle, day: null, number: firstNumberOf(puzzle.id) ?? 0};
};

// A stored attempt, as much of it as the page needs.
export type SolveRow = {
    puzzleId: string;
    day: string | null;
    status: PuzzleStatus;
    attempts: number;
    hintsUsed: number;
    solvedAt: Date | null;
};

// What the page shows of the reader's progress: the hints taken so far, and the answer and
// solution only once the puzzle is solved or revealed.
export const progressFor = (puzzle: Puzzle, row: SolveRow | null): PuzzleProgress => {
    const closed = row?.status === 'solved' || row?.status === 'revealed';
    return {
        status: row?.status ?? null,
        attempts: row?.attempts ?? 0,
        hints: puzzle.hints.slice(0, Math.max(0, Math.min(row?.hintsUsed ?? 0, puzzle.hints.length))),
        solvedAt: row?.solvedAt ? row.solvedAt.toISOString() : null,
        answer: closed ? puzzle.answer : null,
        solution: closed ? puzzle.solution : null,
    };
};

export type ArchiveRow = {
    id: string;
    number: number;
    title: string;
    category: Puzzle['category'];
    difficulty: Puzzle['difficulty'];
    firstDay: string;
    // Solved anywhere wins over revealed, revealed over open; null when never tried.
    status: PuzzleStatus | null;
    // Solved on the day it was the daily puzzle.
    solvedOnItsDay: boolean;
    solvedAt: string | null;
    attempts: number;
    hintsUsed: number;
};

const RANK: Record<PuzzleStatus, number> = {solved: 3, revealed: 2, open: 1};

// The archive list: every puzzle shown so far, newest first, with the reader's furthest
// progress on it in any context.
export const archiveRows = (today: string, rows: readonly SolveRow[]): ArchiveRow[] => {
    const byPuzzle = new Map<string, SolveRow[]>();
    for (const row of rows) byPuzzle.set(row.puzzleId, [...(byPuzzle.get(row.puzzleId) ?? []), row]);
    return archiveFor(today).map(({puzzle, number, firstDay}) => {
        const mine = byPuzzle.get(puzzle.id) ?? [];
        // The furthest status, and of two solves the earlier.
        const solvedTime = (row: SolveRow) => row.solvedAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const lead = [...mine].sort((a, b) => RANK[b.status] - RANK[a.status] || solvedTime(a) - solvedTime(b))[0];
        return {
            id: puzzle.id,
            number,
            title: puzzle.title,
            category: puzzle.category,
            difficulty: puzzle.difficulty,
            firstDay,
            status: lead?.status ?? null,
            solvedOnItsDay: mine.some((row) => row.status === 'solved' && row.day !== null),
            solvedAt: lead?.status === 'solved' && lead.solvedAt ? lead.solvedAt.toISOString() : null,
            attempts: lead?.attempts ?? 0,
            hintsUsed: lead?.hintsUsed ?? 0,
        };
    });
};
