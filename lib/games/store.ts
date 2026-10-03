// The games' server reads, by user id. A plain module, not 'use server': every caller derives
// the id from the session. The shaping is pure — lib/games/puzzles.ts and lib/games/streak.ts —
// and each read here is bounded and indexed (database/models/puzzle-solve.model.ts).

import {connectToDatabase} from "@/database/mongoose";
import PuzzleSolve from "@/database/models/puzzle-solve.model";
import {getEasternDateString} from "@/lib/dates";
import {streakFrom, type Streak} from "@/lib/games/streak";
import {
    archiveRows,
    contextFor,
    dailyPuzzleFor,
    progressFor,
    puzzleView,
    type ArchiveRow,
    type SolveRow,
} from "@/lib/games/puzzles";
import type {PuzzleProgress, PuzzleView} from "@/lib/games/types";

// More solved days than anyone can have yet; the streak and the 12-week grid need far fewer.
export const STREAK_READ_LIMIT = 5000;
// A reader has at most two rows per puzzle: its day, and the archive.
const ROWS_READ_LIMIT = 5000;

const ROW_FIELDS = {_id: 0, puzzleId: 1, day: 1, status: 1, attempts: 1, hintsUsed: 1, solvedAt: 1} as const;

export const readSolvedDays = async (userId: string): Promise<string[]> => {
    await connectToDatabase();
    const rows = await PuzzleSolve.find({userId, status: 'solved', day: {$type: 'string'}})
        .sort({day: -1})
        .limit(STREAK_READ_LIMIT)
        .select({_id: 0, day: 1})
        .lean<{day: string}[]>();
    return rows.map((row) => row.day);
};

export const readStreak = async (userId: string, today: string = getEasternDateString()): Promise<Streak> =>
    streakFrom(await readSolvedDays(userId), today);

export const readSolveRow = async (userId: string, puzzleId: string, day: string | null): Promise<SolveRow | null> => {
    await connectToDatabase();
    return PuzzleSolve.findOne({userId, puzzleId, day}).select(ROW_FIELDS).lean<SolveRow | null>();
};

export type PuzzlePageView = {
    puzzle: PuzzleView;
    // Set for today's puzzle: the ET day its solve counts toward.
    day: string | null;
    progress: PuzzleProgress;
    streak: Streak;
};

// Today's puzzle with the reader's progress on it; null before the first puzzle day.
export const getTodaysPuzzle = async (userId: string): Promise<PuzzlePageView | null> => {
    const today = getEasternDateString();
    const daily = dailyPuzzleFor(today);
    if (!daily) return null;
    const [row, days] = await Promise.all([readSolveRow(userId, daily.puzzle.id, today), readSolvedDays(userId)]);
    return {puzzle: puzzleView(daily.puzzle, daily.number), day: today, progress: progressFor(daily.puzzle, row), streak: streakFrom(days, today)};
};

// An archive puzzle. Its own archive attempt shows; with none yet, a solve or reveal from the
// day it was the daily puzzle shows as closed. Null when the id is not a puzzle shown so far.
export const getArchivePuzzle = async (userId: string, puzzleId: string): Promise<PuzzlePageView | null> => {
    const today = getEasternDateString();
    const context = contextFor(puzzleId, today);
    if (!context) return null;
    await connectToDatabase();
    const [rows, days] = await Promise.all([
        PuzzleSolve.find({userId, puzzleId: context.puzzle.id}).select(ROW_FIELDS).limit(10).lean<SolveRow[]>(),
        readSolvedDays(userId),
    ]);
    const own = rows.find((row) => row.day === context.day) ?? null;
    const closedEarlier = rows.find((row) => row.day !== context.day && row.status !== 'open') ?? null;
    return {
        puzzle: puzzleView(context.puzzle, context.number),
        day: context.day,
        progress: progressFor(context.puzzle, own ?? closedEarlier),
        streak: streakFrom(days, today),
    };
};

export const getPuzzleArchive = async (userId: string): Promise<ArchiveRow[]> => {
    await connectToDatabase();
    const rows = await PuzzleSolve.find({userId}).select(ROW_FIELDS).limit(ROWS_READ_LIMIT).lean<SolveRow[]>();
    return archiveRows(getEasternDateString(), rows);
};

// The one card the Learn › Today panel, the dashboard widget and the games hub share: today's
// puzzle, how far the reader got with it, and the streak.
export type DailyPuzzleCardView = {
    puzzle: Pick<PuzzleView, 'id' | 'number' | 'title' | 'category' | 'difficulty'> | null;
    status: PuzzleProgress['status'];
    streak: Streak;
};

export const getDailyPuzzleCard = async (userId: string): Promise<DailyPuzzleCardView> => {
    const view = await getTodaysPuzzle(userId);
    if (!view) return {puzzle: null, status: null, streak: await readStreak(userId)};
    const {id, number, title, category, difficulty} = view.puzzle;
    return {puzzle: {id, number, title, category, difficulty}, status: view.progress.status, streak: view.streak};
};
