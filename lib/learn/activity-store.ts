// The one streak's reads (NOT a 'use server' module): the days a reader did something on their
// Learn list — a lab session or a manual tick (LabEvent), a daily puzzle solved on its day
// (PuzzleSolve), a kept round of a game (GameRound) — each one bounded and indexed, joined by the
// pure lib/learn/activity.ts and counted by lib/games/streak.streakFrom. Home's chip, the games
// hub, the puzzle page, the daily-puzzle widget and the Lab all read readActivityStreak, so no
// surface keeps a streak of its own. Reads the models directly, so lib/games/store and
// lib/lab/store may both import it without a cycle.

import {cache} from "react";
import GameRound from "@/database/models/game-round.model";
import LabEvent from "@/database/models/lab-event.model";
import PuzzleSolve from "@/database/models/puzzle-solve.model";
import {connectToDatabase} from "@/database/mongoose";
import {getEasternDateString} from "@/lib/dates";
import {streakFrom, type Streak} from "@/lib/games/streak";
import {activityDays} from "@/lib/learn/activity";

// More days than anyone can have yet; the streak and the 12-week grid need far fewer.
export const STREAK_READ_LIMIT = 5000;

export const readSolvedDays = async (userId: string): Promise<string[]> => {
    await connectToDatabase();
    const rows = await PuzzleSolve.find({userId, status: 'solved', day: {$type: 'string'}})
        .sort({day: -1})
        .limit(STREAK_READ_LIMIT)
        .select({_id: 0, day: 1})
        .lean<{day: string}[]>();
    return rows.map((row) => row.day);
};

// The distinct days with a kept round of any game.
export const readRoundDays = async (userId: string): Promise<string[]> => {
    await connectToDatabase();
    const days = await GameRound.distinct('day', {userId});
    return (days as unknown[]).filter((day): day is string => typeof day === 'string');
};

// The games with a kept round on one day (lib/games/rounds GameId).
export const readGamesPlayedOn = async (userId: string, day: string): Promise<string[]> => {
    await connectToDatabase();
    const games = await GameRound.distinct('game', {userId, day});
    return (games as unknown[]).filter((game): game is string => typeof game === 'string');
};

const readEventDays = async (userId: string, kind: 'session' | 'todo'): Promise<string[]> => {
    await connectToDatabase();
    const rows = await LabEvent.find({userId, kind}).select('day').sort({day: -1}).limit(STREAK_READ_LIMIT).lean<{day: string}[]>();
    return rows.map((row) => row.day);
};

export const readActivityStreak = cache(async (userId: string, today: string = getEasternDateString()): Promise<Streak> => {
    const [sessionDays, solvedDays, roundDays, tickedDays] = await Promise.all([
        readEventDays(userId, 'session'),
        readSolvedDays(userId),
        readRoundDays(userId),
        readEventDays(userId, 'todo'),
    ]);
    return streakFrom(activityDays({sessionDays, solvedDays, roundDays, tickedDays}), today);
});
