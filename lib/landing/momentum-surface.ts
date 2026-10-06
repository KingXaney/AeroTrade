// The landing page's momentum terrain, as numbers. Pure: a surface is one session per column,
// one lookback per row, and in each cell the normalised momentum of SPY's total-return index —
// the log return over the lookback, divided by the swing that many days of recent volatility
// would produce (σ√n). A height of +2 is a move about twice what noise alone tends to give.
//
// The server read is lib/landing/surface-store.ts (bars → total-return index → here, memoised
// for the ET day), served by app/api/landing/surface, drawn by components/landing/.

import {BENCHMARK_SYMBOL} from "@/lib/prices/config";

// Roughly doubling, so evenly spaced rows are honest on a log axis: a week to a year.
export const LOOKBACKS: readonly number[] = [5, 10, 20, 40, 80, 160, 250];
// Sessions shown: about one year.
export const SURFACE_DAYS = 250;
// With less history than a full year the surface draws what it has, never under this.
export const MIN_SURFACE_DAYS = 60;
// σ_t is the sample standard deviation of the daily log returns over this trailing window —
// trailing, so no later volatility leaks into an earlier cell.
export const VOL_WINDOW = 60;
// A cell beyond this many σ is a notable move; at most this many are marked, one per day.
export const NOTABLE_SIGMA = 3;
export const NOTABLE_MAX = 3;
// Beyond this the data is wrong (an unadjusted split, a bad close), not the market.
export const MAX_PLAUSIBLE_Z = 20;

// One session: the total-return index value (what momentum is measured on) and the plain
// close (what the tooltip prints, so it matches a quote site).
export type SurfacePoint = {date: string; value: number; close: number};

// Indexes into `dates` and `lookbacks`.
export type SurfaceCell = {day: number; lookback: number};
export type NotableCell = SurfaceCell & {z: number};

// Where the sessions came from: Tiingo's adjusted closes in one payload, or the SPY bars the
// nightly price jobs store (lib/landing/surface-store.ts chooses).
export type SurfaceSource = 'tiingo' | 'stored';

export type MomentumSurface = {
    ticker: string;
    source: SurfaceSource;
    // The last session's date.
    updated: string;
    lookbacks: readonly number[];
    dates: string[];
    price: number[];
    // z[lookbackIndex][dayIndex], three decimals.
    z: number[][];
    // The largest |z| on the grid: the symmetric colour scale, so zero is always the same colour.
    zAbsMax: number;
    notable: NotableCell[];
};

const round = (value: number, digits: number): number => {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
};

// σ at every index: the sample standard deviation of the `window` log returns ending there,
// null until the window has filled.
export const rollingSigma = (logp: readonly number[], window: number): (number | null)[] => {
    const out: (number | null)[] = new Array<number | null>(logp.length).fill(null);
    if (window < 2) return out;
    for (let t = window; t < logp.length; t += 1) {
        const returns: number[] = [];
        for (let k = t - window + 1; k <= t; k += 1) returns.push(logp[k] - logp[k - 1]);
        const mean = returns.reduce((sum, r) => sum + r, 0) / window;
        const variance = returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (window - 1);
        out[t] = Math.sqrt(variance);
    }
    return out;
};

// z(t, n) = ln(P_t / P_{t−n}) / (σ_t √n), from log prices. Null when the lookback reaches before
// the series or σ_t is missing or zero.
export const normalizedMomentum = (
    logp: readonly number[],
    sigma: readonly (number | null)[],
    t: number,
    n: number,
): number | null => {
    if (t - n < 0 || t >= logp.length) return null;
    const s = sigma[t];
    if (s === null || s === undefined || !(s > 0)) return null;
    const z = (logp[t] - logp[t - n]) / (s * Math.sqrt(n));
    return Number.isFinite(z) ? z : null;
};

// The cells worth a label: beyond NOTABLE_SIGMA, the largest first, one per day (the five-day row
// feels a jump on five consecutive days; one marker says it), at most NOTABLE_MAX.
const notableCells = (z: readonly (readonly number[])[]): NotableCell[] => {
    const candidates: NotableCell[] = [];
    z.forEach((row, lookback) => row.forEach((value, day) => {
        if (Math.abs(value) > NOTABLE_SIGMA) candidates.push({day, lookback, z: value});
    }));
    candidates.sort((a, b) => Math.abs(b.z) - Math.abs(a.z) || a.day - b.day || a.lookback - b.lookback);
    const kept: NotableCell[] = [];
    for (const cell of candidates) {
        if (kept.some((other) => other.day === cell.day)) continue;
        kept.push(cell);
        if (kept.length === NOTABLE_MAX) break;
    }
    return kept;
};

// The surface over the last SURFACE_DAYS sessions of `points` (ascending), or as many as the
// history allows past the longest lookback. Null when there is too little history, a value the
// log cannot take, no swing to divide by, or a cell beyond MAX_PLAUSIBLE_Z: the page then shows its
// unavailable state rather than a wrong shape.
type BuildOptions = {ticker?: string; source?: SurfaceSource};

export const buildMomentumSurface = (points: readonly SurfacePoint[], {ticker = BENCHMARK_SYMBOL, source = 'stored'}: BuildOptions = {}): MomentumSurface | null => {
    const maxLookback = LOOKBACKS[LOOKBACKS.length - 1];
    const days = Math.min(SURFACE_DAYS, points.length - maxLookback - 1);
    if (days < MIN_SURFACE_DAYS) return null;
    if (points.some((point) => !Number.isFinite(point.value) || !(point.value > 0))) return null;

    const logp = points.map((point) => Math.log(point.value));
    const sigma = rollingSigma(logp, VOL_WINDOW);
    const start = points.length - days;

    const z: number[][] = [];
    let zAbsMax = 0;
    for (const n of LOOKBACKS) {
        const row: number[] = [];
        for (let t = start; t < points.length; t += 1) {
            const value = normalizedMomentum(logp, sigma, t, n);
            if (value === null) return null;
            const rounded = round(value, 3);
            if (Math.abs(rounded) > MAX_PLAUSIBLE_Z) return null;
            zAbsMax = Math.max(zAbsMax, Math.abs(rounded));
            row.push(rounded);
        }
        z.push(row);
    }
    if (!(zAbsMax > 0)) return null;

    const shown = points.slice(start);
    return {
        ticker,
        source,
        updated: shown[shown.length - 1].date,
        lookbacks: LOOKBACKS,
        dates: shown.map((point) => point.date),
        price: shown.map((point) => round(point.close, 2)),
        z,
        zAbsMax,
        notable: notableCells(z),
    };
};
