// The scored games' rounds: which games keep them, which way a record runs, what a reported
// round must look like to be kept, and the shapes the pages draw from them. Pure and client-safe.
//
// A timed round (arithmetic, interview) is counted in the browser and reported when it ends, so the
// server keeps only what a person could have done: bounded counts, a real duration, known settings.
// A game of chance or skill (Kelly, market making, correlation) reports its seed and its moves, and
// the server replays it to get the score — a reported score is never taken on trust. These are
// practice records for one reader, not a leaderboard.

import {z} from "zod";
import {ArithmeticSettingsSchema, settingsKey} from "@/lib/games/arithmetic";
import {CORRELATION_ROUNDS, replayCorrelation} from "@/lib/games/correlation";
import {INTERVIEW_QUESTIONS, INTERVIEW_SECONDS} from "@/lib/games/interview";
import {MAX_FLIPS, replayKelly} from "@/lib/games/kelly";
import {ROUNDS as MARKET_ROUNDS, replayMarket} from "@/lib/games/market-making";

export const GAMES = ['arithmetic', 'interview', 'kelly', 'market-making', 'correlation'] as const;
export type GameId = (typeof GAMES)[number];

// A higher score is a record everywhere but Guess the correlation, whose score is a miss.
export const HIGHER_IS_RECORD: Record<GameId, boolean> = {arithmetic: true, interview: true, kelly: true, 'market-making': true, correlation: false};

// No one answers more than four arithmetic problems a second.
const MAX_ANSWERS_PER_SECOND = 4;
// A little slack on a round's clock for the report's own trip.
const DURATION_SLACK_MS = 5_000;

const Count = z.number().int().min(0).max(10_000);
const Seed = z.number().int().min(0).max(0xffffffff);
// A game of chance takes its time; a day is the outside of what a report may claim.
const Duration = z.number().int().min(0).max(86_400_000);

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
    z.object({
        game: z.literal('kelly'),
        seed: Seed,
        bets: z.array(z.object({side: z.enum(['heads', 'tails']), cents: z.number().int().min(1)})).min(1).max(MAX_FLIPS),
        durationMs: Duration,
    }),
    z.object({
        game: z.literal('market-making'),
        seed: Seed,
        quotes: z.array(z.object({bid: z.number().int(), ask: z.number().int()})).length(MARKET_ROUNDS),
        durationMs: Duration,
    }),
    z.object({
        game: z.literal('correlation'),
        seed: Seed,
        guesses: z.array(z.number()).length(CORRELATION_ROUNDS),
        durationMs: Duration,
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
    if (round.game === 'interview') {
        if (round.score + round.wrong > INTERVIEW_QUESTIONS) return null;
        if (round.durationMs > INTERVIEW_SECONDS * 1000 + DURATION_SLACK_MS) return null;
        return {game: 'interview', key: 'interview', score: round.score, wrong: round.wrong, durationMs: round.durationMs, detail: round.detail ?? {}};
    }
    if (round.game === 'kelly') {
        // Every bet must be one the game took: a replay that stops early means the report is not this game.
        const state = replayKelly(round.seed, round.bets);
        if (state.flips !== round.bets.length) return null;
        return {game: 'kelly', key: 'kelly', score: state.bankroll, wrong: 0, durationMs: round.durationMs,
            detail: {flips: state.flips, bust: state.ended === 'bust' ? 1 : 0, cap: state.ended === 'cap' ? 1 : 0}};
    }
    if (round.game === 'market-making') {
        const {state, pnl} = replayMarket(round.seed, round.quotes);
        if (!state.done) return null;
        return {game: 'market-making', key: 'market-making', score: pnl, wrong: 0, durationMs: round.durationMs,
            detail: {trades: state.trades.length, informed: state.trades.filter((t) => t.kind === 'informed').length, position: state.position}};
    }
    const result = replayCorrelation(round.seed, round.guesses);
    if (!result) return null;
    return {game: 'correlation', key: 'correlation', score: result.score, wrong: 0, durationMs: round.durationMs,
        detail: {close: result.close, longestRun: result.longestRun}};
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
