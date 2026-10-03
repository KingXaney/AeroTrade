// Guess the correlation: ten scatter plots of fifty points each, and you guess how correlated each
// one is. Pure and client-safe. The points come from the seed alone — a bivariate normal with a
// correlation drawn between −0.95 and 0.95 — and the truth you are scored against is the sample
// correlation r of the fifty points drawn, which is what the picture actually shows.

import {mulberry32} from "@/lib/random";

export const CORRELATION_ROUNDS = 10;
export const POINTS = 50;
export const RHO_LIMIT = 0.95;
// A guess this close counts as close; a run is consecutive close guesses within one game.
export const CLOSE = 0.05;

export type Point = {x: number; y: number};
export type Scatter = {rho: number; points: Point[]; r: number};

const normal = (random: () => number): number => {
    const u = Math.max(random(), 1e-12);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
};

// Pearson's r of the points.
export const sampleCorrelation = (points: readonly Point[]): number => {
    const n = points.length;
    const mx = points.reduce((s, p) => s + p.x, 0) / n;
    const my = points.reduce((s, p) => s + p.y, 0) / n;
    let sxy = 0;
    let sxx = 0;
    let syy = 0;
    for (const {x, y} of points) {
        sxy += (x - mx) * (y - my);
        sxx += (x - mx) ** 2;
        syy += (y - my) ** 2;
    }
    return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0;
};

export const scattersFor = (seed: number, rounds = CORRELATION_ROUNDS): Scatter[] => {
    const random = mulberry32(seed);
    return Array.from({length: rounds}, () => {
        const rho = (random() * 2 - 1) * RHO_LIMIT;
        const points = Array.from({length: POINTS}, () => {
            const x = normal(random);
            const z = normal(random);
            return {x, y: rho * x + Math.sqrt(1 - rho * rho) * z};
        });
        return {rho, points, r: sampleCorrelation(points)};
    });
};

// A guess on the slider: −1 to 1 in steps of 0.01.
export const isValidGuess = (guess: number): boolean =>
    Number.isFinite(guess) && guess >= -1 && guess <= 1 && Math.abs(Math.round(guess * 100) - guess * 100) < 1e-6;

export type CorrelationResult = {
    errors: number[];
    // The mean absolute error, in thousandths: the game's score, lower being the record.
    score: number;
    close: number;
    longestRun: number;
};

export const scoreGuesses = (scatters: readonly Scatter[], guesses: readonly number[]): CorrelationResult => {
    const errors = guesses.map((guess, i) => Math.abs(guess - scatters[i].r));
    let run = 0;
    let longestRun = 0;
    for (const error of errors) {
        run = error <= CLOSE ? run + 1 : 0;
        longestRun = Math.max(longestRun, run);
    }
    const mean = errors.reduce((s, e) => s + e, 0) / Math.max(1, errors.length);
    return {errors, score: Math.round(mean * 1000), close: errors.filter((e) => e <= CLOSE).length, longestRun};
};

export const replayCorrelation = (seed: number, guesses: readonly number[]): CorrelationResult | null => {
    if (guesses.length !== CORRELATION_ROUNDS || !guesses.every(isValidGuess)) return null;
    return scoreGuesses(scattersFor(seed), guesses);
};
