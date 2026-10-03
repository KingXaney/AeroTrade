// The scored games' rounds: which games keep them, which way a record runs, what a reported
// round must look like to be kept, and the shapes the pages draw from them. Pure and client-safe.
//
// A round is counted in the browser and reported when it ends, so the server keeps only what a
// person could have done: bounded counts, a real duration, known settings. These are practice
// records for one reader, not a leaderboard.

import {z} from "zod";
import {ArithmeticSettingsSchema, settingsKey} from "@/lib/games/arithmetic";
import {INTERVIEW_QUESTIONS, INTERVIEW_SECONDS} from "@/lib/games/interview";

export const GAMES = ['arithmetic', 'interview'] as const;
export type GameId = (typeof GAMES)[number];

// A higher score is a record in every game so far.
export const HIGHER_IS_RECORD: Record<GameId, boolean> = {arithmetic: true, interview: true};

// No one answers more than four arithmetic problems a second.
const MAX_ANSWERS_PER_SECOND = 4;
// A little slack on a round's clock for the report's own trip.
const DURATION_SLACK_MS = 5_000;

const Count = z.number().int().min(0).max(10_000);

export const RoundInputSchema = z.discriminatedUnion('game', [
    z.object({
        game: z.literal('arithmetic'),
        settings: ArithmeticSettingsSchema,
        score: Count,
        wrong: Count,
        durationMs: z.number().int().min(0),
        detail: z.object({add: Count, subtract: Count, multiply: Count, divide: Count}),
    }),
    z.object({
        game: z.literal('interview'),
        score: z.number().int().min(0).max(INTERVIEW_QUESTIONS),
        wrong: z.number().int().min(0).max(INTERVIEW_QUESTIONS),
        durationMs: z.number().int().min(0),
        detail: z.record(z.string().max(20), Count).optional(),
    }),
]);

export type RoundInput = z.infer<typeof RoundInputSchema>;

export type KeptRound = {game: GameId; key: string; score: number; wrong: number; durationMs: number; detail: Record<string, number>};

// The round as it is kept, or null when it could not have happened.
export const keptRound = (input: unknown): KeptRound | null => {
    const parsed = RoundInputSchema.safeParse(input);
    if (!parsed.success) return null;
    const round = parsed.data;
    if (round.game === 'arithmetic') {
        const limitMs = round.settings.duration * 1000;
        if (round.durationMs > limitMs + DURATION_SLACK_MS) return null;
        if (round.score > round.settings.duration * MAX_ANSWERS_PER_SECOND) return null;
        const perOp = round.detail.add + round.detail.subtract + round.detail.multiply + round.detail.divide;
        if (perOp !== round.score) return null;
        return {game: 'arithmetic', key: settingsKey(round.settings), score: round.score, wrong: round.wrong, durationMs: round.durationMs, detail: round.detail};
    }
    if (round.score + round.wrong > INTERVIEW_QUESTIONS) return null;
    if (round.durationMs > INTERVIEW_SECONDS * 1000 + DURATION_SLACK_MS) return null;
    return {game: 'interview', key: 'interview', score: round.score, wrong: round.wrong, durationMs: round.durationMs, detail: round.detail ?? {}};
};

// A reader's record among their scores; null before the first round.
export const recordOf = (game: GameId, scores: readonly number[]): number | null => {
    if (scores.length === 0) return null;
    return HIGHER_IS_RECORD[game] ? Math.max(...scores) : Math.min(...scores);
};

export const isNewRecord = (game: GameId, score: number, record: number | null): boolean =>
    record === null || (HIGHER_IS_RECORD[game] ? score > record : score < record);

// A sparkline's points for the last rounds, oldest first, scaled into a width × height box.
export const sparkline = (scores: readonly number[], width: number, height: number): string => {
    if (scores.length < 2) return '';
    const lo = Math.min(...scores);
    const hi = Math.max(...scores);
    const span = hi - lo || 1;
    return scores
        .map((score, i) => `${((i / (scores.length - 1)) * width).toFixed(1)},${(height - ((score - lo) / span) * height).toFixed(1)}`)
        .join(' ');
};
