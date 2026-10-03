import {Document, model, models, Schema} from "mongoose";

// A reader's attempt at one daily puzzle in one context: as that ET day's puzzle (`day` set), or
// in the archive (`day` null). Created by the first answer or hint, closed once solved or
// revealed. The streak is the distinct days of solved rows that carry a day
// (lib/games/streak.ts) — nothing else is stored about it. Written only by
// lib/actions/games.actions.ts; read by lib/games/store.ts.
export interface PuzzleSolveDoc extends Document {
    userId: string;
    puzzleId: string;        // lib/learn/copy/puzzles id; ids are never renamed
    day: string | null;      // 'YYYY-MM-DD': the ET day it was that day's puzzle; null in the archive
    status: 'open' | 'solved' | 'revealed';
    attempts: number;        // answers checked, right and wrong (an unreadable one is not counted)
    hintsUsed: number;
    firstTryAt: Date;
    solvedAt: Date | null;
    revealedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

const PuzzleSolveSchema = new Schema<PuzzleSolveDoc>(
    {
        userId: {type: String, required: true},
        puzzleId: {type: String, required: true},
        day: {type: String, default: null},
        status: {type: String, required: true, enum: ['open', 'solved', 'revealed'], default: 'open'},
        attempts: {type: Number, required: true, default: 0},
        hintsUsed: {type: Number, required: true, default: 0},
        firstTryAt: {type: Date, required: true},
        solvedAt: {type: Date, default: null},
        revealedAt: {type: Date, default: null},
    },
    {timestamps: true},
);

// One row per puzzle per context: the day's puzzle on its day, and once more in the archive.
PuzzleSolveSchema.index({userId: 1, puzzleId: 1, day: 1}, {unique: true});
// The streak read: a reader's solved days, newest first.
PuzzleSolveSchema.index({userId: 1, status: 1, day: -1});

const PuzzleSolve = models?.PuzzleSolve || model<PuzzleSolveDoc>('PuzzleSolve', PuzzleSolveSchema);

export default PuzzleSolve;
