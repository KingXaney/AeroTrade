'use server';

import {revalidatePath} from "next/cache";
import {z} from "zod";
import {connectToDatabase} from "@/database/mongoose";
import PuzzleSolve from "@/database/models/puzzle-solve.model";
import GameRound from "@/database/models/game-round.model";
import {getCurrentUserId} from "@/lib/auth/session";
import {takeRateLimit} from "@/lib/rate-limit";
import {getEasternDateString} from "@/lib/dates";
import {ANSWER_MAX_CHARS, checkAnswer, type AnswerCheck} from "@/lib/games/answer";
import {contextFor, progressFor, type PuzzleContext} from "@/lib/games/puzzles";
import {readGameSummary, readSolveRow, readSolvedDays} from "@/lib/games/store";
import {isNewRecord, keptRound} from "@/lib/games/rounds";
import {streakFrom, type Streak} from "@/lib/games/streak";
import type {PuzzleProgress} from "@/lib/games/types";
import {ARITHMETIC_COPY, PUZZLE_COPY} from "@/lib/learn/copy/games";

// The daily puzzle's writes. Every answer is checked here, on the server: the answer key never
// reaches the page until the puzzle is solved or revealed. Each write is one atomic update
// filtered on the row still being open, so a double click or a second tab cannot count twice.
// The reads live in lib/games/store.ts.

// Answers, hints and reveals together: generous for a person, tight for a script.
const PUZZLE_ACTIONS_PER_MINUTE = 60;

const PuzzleRef = z.object({
    puzzleId: z.string().min(1).max(80),
    // The page believed this was today's puzzle; after midnight Eastern it is not.
    daily: z.boolean().optional(),
});
const AnswerInput = PuzzleRef.extend({answer: z.string().max(ANSWER_MAX_CHARS)});

export type PuzzleActionResult =
    | {success: true; check?: AnswerCheck; progress: PuzzleProgress; streak: Streak | null}
    | {success: false; message: string};

type Begun = {userId: string; today: string; context: PuzzleContext} | {message: string};

const begin = async (puzzleId: string, daily: boolean | undefined): Promise<Begun> => {
    const userId = await getCurrentUserId();
    if (!userId) return {message: PUZZLE_COPY.notSignedIn};
    const today = getEasternDateString();
    const context = contextFor(puzzleId, today);
    if (!context) return {message: PUZZLE_COPY.notShown};
    if (daily && context.day === null) return {message: PUZZLE_COPY.notToday};
    if (!(await takeRateLimit(`games:puzzle:${userId}`, PUZZLE_ACTIONS_PER_MINUTE, 60_000))) return {message: PUZZLE_COPY.tooFast};
    return {userId, today, context};
};

const filterOf = (userId: string, context: PuzzleContext) => ({userId, puzzleId: context.puzzle.id, day: context.day});

// The row this attempt writes to, created on the first answer or hint. Two first clicks race to
// the unique index; the loser's insert fails with a duplicate key and finds the winner's row.
const ensureRow = async (userId: string, context: PuzzleContext): Promise<void> => {
    try {
        await PuzzleSolve.updateOne(
            filterOf(userId, context),
            {$setOnInsert: {status: 'open', attempts: 0, hintsUsed: 0, firstTryAt: new Date(), solvedAt: null, revealedAt: null}},
            {upsert: true},
        );
    } catch (error) {
        if ((error as {code?: number}).code !== 11000) throw error;
    }
};

const progressNow = async (userId: string, context: PuzzleContext): Promise<PuzzleProgress> =>
    progressFor(context.puzzle, await readSolveRow(userId, context.puzzle.id, context.day));

// A closed puzzle changes the streak and the cards that show it.
const revalidateGames = () => {
    revalidatePath('/');
    revalidatePath('/dashboard');
    // The hub, today's puzzle and the archive, which share the streak.
    revalidatePath('/games', 'layout');
    revalidatePath('/learn');
};

export const submitPuzzleAnswer = async (input: unknown): Promise<PuzzleActionResult> => {
    const parsed = AnswerInput.safeParse(input);
    if (!parsed.success) return {success: false, message: PUZZLE_COPY.notShown};
    const begun = await begin(parsed.data.puzzleId, parsed.data.daily);
    if ('message' in begun) return {success: false, message: begun.message};
    const {userId, today, context} = begun;
    try {
        await connectToDatabase();
        const check = checkAnswer(context.puzzle, parsed.data.answer);
        // An answer that is not a number is not a try.
        if (check === 'unreadable') return {success: true, check, progress: await progressNow(userId, context), streak: null};
        await ensureRow(userId, context);
        const solved = check === 'correct';
        const changed = await PuzzleSolve.updateOne(
            {...filterOf(userId, context), status: 'open'},
            solved ? {$inc: {attempts: 1}, $set: {status: 'solved', solvedAt: new Date()}} : {$inc: {attempts: 1}},
        );
        const progress = await progressNow(userId, context);
        if (!(solved && changed.modifiedCount === 1)) return {success: true, check, progress, streak: null};
        revalidateGames();
        const streak = context.day ? streakFrom(await readSolvedDays(userId), today) : null;
        return {success: true, check, progress, streak};
    } catch (error) {
        console.error('Error checking a puzzle answer:', error);
        return {success: false, message: PUZZLE_COPY.notSaved};
    }
};

export const takePuzzleHint = async (input: unknown): Promise<PuzzleActionResult> => {
    const parsed = PuzzleRef.safeParse(input);
    if (!parsed.success) return {success: false, message: PUZZLE_COPY.notShown};
    const begun = await begin(parsed.data.puzzleId, parsed.data.daily);
    if ('message' in begun) return {success: false, message: begun.message};
    const {userId, context} = begun;
    try {
        await connectToDatabase();
        await ensureRow(userId, context);
        await PuzzleSolve.updateOne(
            {...filterOf(userId, context), status: 'open', hintsUsed: {$lt: context.puzzle.hints.length}},
            {$inc: {hintsUsed: 1}},
        );
        return {success: true, progress: await progressNow(userId, context), streak: null};
    } catch (error) {
        console.error('Error taking a puzzle hint:', error);
        return {success: false, message: PUZZLE_COPY.notSaved};
    }
};

// Shows the answer and the solution and closes the puzzle: a revealed day is not a solve.
export const revealPuzzleSolution = async (input: unknown): Promise<PuzzleActionResult> => {
    const parsed = PuzzleRef.safeParse(input);
    if (!parsed.success) return {success: false, message: PUZZLE_COPY.notShown};
    const begun = await begin(parsed.data.puzzleId, parsed.data.daily);
    if ('message' in begun) return {success: false, message: begun.message};
    const {userId, context} = begun;
    try {
        await connectToDatabase();
        await ensureRow(userId, context);
        const changed = await PuzzleSolve.updateOne(
            {...filterOf(userId, context), status: 'open'},
            {$set: {status: 'revealed', revealedAt: new Date()}},
        );
        if (changed.modifiedCount === 1) revalidateGames();
        return {success: true, progress: await progressNow(userId, context), streak: null};
    } catch (error) {
        console.error('Error revealing a puzzle solution:', error);
        return {success: false, message: PUZZLE_COPY.notSaved};
    }
};

// A finished round of a scored game, reported by the page that counted it. Kept only when a
// person could have played it (lib/games/rounds.keptRound); the record is read back from the rows.
const ROUNDS_PER_MINUTE = 20;

export type RoundActionResult =
    | {success: true; record: number | null; isRecord: boolean; recent: number[]}
    | {success: false; message: string};

export const recordGameRound = async (input: unknown): Promise<RoundActionResult> => {
    const userId = await getCurrentUserId();
    if (!userId) return {success: false, message: PUZZLE_COPY.notSignedIn};
    const round = keptRound(input);
    if (!round) return {success: false, message: ARITHMETIC_COPY.notKept};
    try {
        if (!(await takeRateLimit(`games:round:${userId}`, ROUNDS_PER_MINUTE, 60_000))) return {success: false, message: ARITHMETIC_COPY.tooFast};
        await connectToDatabase();
        const before = await readGameSummary(userId, round.game, round.key);
        await GameRound.create({...round, userId, day: getEasternDateString(), finishedAt: new Date()});
        const after = await readGameSummary(userId, round.game, round.key);
        revalidatePath('/games', 'layout');
        return {success: true, record: after.record, isRecord: isNewRecord(round.game, round.score, before.record), recent: after.recent};
    } catch (error) {
        console.error('Error recording a game round:', error);
        return {success: false, message: ARITHMETIC_COPY.notSaved};
    }
};
