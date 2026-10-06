import {describe, expect, it} from 'vitest';
import {
    buildMomentumSurface,
    LOOKBACKS,
    MAX_PLAUSIBLE_Z,
    MIN_SURFACE_DAYS,
    NOTABLE_MAX,
    NOTABLE_SIGMA,
    normalizedMomentum,
    rollingSigma,
    SURFACE_DAYS,
    VOL_WINDOW,
    type SurfacePoint,
} from '@/lib/landing/momentum-surface';

// Weekday labels from a Monday, as many as asked for.
const sessions = (count: number): string[] => {
    const out: string[] = [];
    const d = new Date(Date.UTC(2024, 0, 1));
    while (out.length < count) {
        const day = d.getUTCDay();
        if (day !== 0 && day !== 6) out.push(d.toISOString().slice(0, 10));
        d.setUTCDate(d.getUTCDate() + 1);
    }
    return out;
};

// A deterministic, wobbly series with a small drift: enough variety that σ is never zero. The
// close is deliberately not the index value, so a test can tell which one a field printed.
const series = (count: number, shock?: {at: number; size: number}): SurfacePoint[] => {
    const dates = sessions(count);
    let value = 100;
    return dates.map((date, k) => {
        if (k > 0) {
            // Fast sinusoids: their partial sums stay bounded, so no ordinary cell reaches 3σ.
            let r = 0.004 * Math.sin(k * 1.3) + 0.0003 + 0.0025 * Math.cos(k * 0.7);
            if (shock && k === shock.at) r += shock.size;
            value *= Math.exp(r);
        }
        return {date, value, close: value * 0.98};
    });
};

const sampleStd = (xs: number[]): number => {
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    return Math.sqrt(xs.reduce((a, x) => a + (x - mean) ** 2, 0) / (xs.length - 1));
};

const expectedZ = (points: readonly SurfacePoint[], t: number, n: number): number => {
    const logp = points.map((p) => Math.log(p.value));
    const returns = Array.from({length: VOL_WINDOW}, (_, i) => logp[t - VOL_WINDOW + 1 + i] - logp[t - VOL_WINDOW + i]);
    return Math.round(((logp[t] - logp[t - n]) / (sampleStd(returns) * Math.sqrt(n))) * 1000) / 1000;
};

describe('the lookbacks', () => {
    it('roughly double from a week to a year, so even rows are honest on a log axis', () => {
        expect(LOOKBACKS).toEqual([5, 10, 20, 40, 80, 160, 250]);
        expect(SURFACE_DAYS).toBe(250);
        expect(VOL_WINDOW).toBe(60);
    });
});

describe('rollingSigma', () => {
    it('is the sample standard deviation of the last `window` log returns, null before the window fills', () => {
        const logp = [0, 0.01, 0, 0.01, 0, 0.01];
        const sigma = rollingSigma(logp, 4);
        expect(sigma.slice(0, 4)).toEqual([null, null, null, null]);
        // Returns +.01, −.01, +.01, −.01: mean 0, variance 4·1e-4 / 3.
        expect(sigma[4]).toBeCloseTo(Math.sqrt(4e-4 / 3), 12);
        expect(sigma[5]).toBeCloseTo(Math.sqrt(4e-4 / 3), 12);
    });

    it('is zero for a flat series', () => {
        expect(rollingSigma([0, 0.01, 0.02, 0.03, 0.04, 0.05], 4)[5]).toBeCloseTo(0, 12);
    });
});

describe('normalizedMomentum', () => {
    it('divides the log return over n days by σ√n', () => {
        const logp = [0, 0.1, 0.2, 0.3, 0.4];
        const sigma = [null, null, null, 0.05, 0.05];
        expect(normalizedMomentum(logp, sigma, 4, 2)).toBeCloseTo(0.2 / (0.05 * Math.SQRT2), 12);
    });

    it('is null when the lookback reaches before the series, or σ is missing or zero', () => {
        const logp = [0, 0.1, 0.2];
        expect(normalizedMomentum(logp, [null, 0.1, 0.1], 2, 3)).toBeNull();
        expect(normalizedMomentum(logp, [null, null, null], 2, 1)).toBeNull();
        expect(normalizedMomentum(logp, [null, 0, 0], 2, 1)).toBeNull();
    });
});

describe('buildMomentumSurface', () => {
    const points = series(600);
    const surface = buildMomentumSurface(points);

    it('is one row per lookback over the last 250 sessions, dated by the last close', () => {
        expect(surface).not.toBeNull();
        if (!surface) return;
        expect(surface.ticker).toBe('SPY');
        expect(surface.source).toBe('stored');
        expect(surface.lookbacks).toEqual(LOOKBACKS);
        expect(surface.dates).toHaveLength(SURFACE_DAYS);
        expect(surface.dates).toEqual(points.slice(-SURFACE_DAYS).map((p) => p.date));
        expect(surface.updated).toBe(points[points.length - 1].date);
        expect(surface.z).toHaveLength(LOOKBACKS.length);
        for (const row of surface.z) expect(row).toHaveLength(SURFACE_DAYS);
    });

    it('names another ticker and source when told', () => {
        const other = buildMomentumSurface(points, {ticker: 'VOO', source: 'tiingo'});
        expect(other?.ticker).toBe('VOO');
        expect(other?.source).toBe('tiingo');
    });

    it('prints the plain close as the price, to the cent', () => {
        if (!surface) return;
        expect(surface.price).toHaveLength(SURFACE_DAYS);
        expect(surface.price[SURFACE_DAYS - 1]).toBe(Math.round(points[points.length - 1].close * 100) / 100);
        expect(surface.price[0]).toBe(Math.round(points[points.length - SURFACE_DAYS].close * 100) / 100);
    });

    it('computes z(t, n) = ln(P_t / P_t−n) / (σ_t √n) on the total-return index, to three decimals', () => {
        if (!surface) return;
        const last = points.length - 1;
        const first = points.length - SURFACE_DAYS;
        expect(surface.z[2][SURFACE_DAYS - 1]).toBe(expectedZ(points, last, 20));
        expect(surface.z[0][SURFACE_DAYS - 1]).toBe(expectedZ(points, last, 5));
        expect(surface.z[6][0]).toBe(expectedZ(points, first, 250));
        expect(surface.z[3][100]).toBe(expectedZ(points, first + 100, 40));
    });

    it('states the symmetric colour scale as the largest |z| on the grid', () => {
        if (!surface) return;
        const max = Math.max(...surface.z.flat().map(Math.abs));
        expect(surface.zAbsMax).toBe(max);
        expect(surface.zAbsMax).toBeGreaterThan(0);
        expect(surface.zAbsMax).toBeLessThanOrEqual(MAX_PLAUSIBLE_Z);
    });

    it('draws fewer sessions when the history is shorter, never under the minimum', () => {
        const maxLookback = LOOKBACKS[LOOKBACKS.length - 1];
        const shorter = buildMomentumSurface(series(400));
        expect(shorter?.dates).toHaveLength(400 - maxLookback - 1);
        expect(shorter?.z[0]).toHaveLength(400 - maxLookback - 1);
        expect(buildMomentumSurface(series(maxLookback + 1 + MIN_SURFACE_DAYS))?.dates).toHaveLength(MIN_SURFACE_DAYS);
        expect(buildMomentumSurface(series(maxLookback + MIN_SURFACE_DAYS))).toBeNull();
        expect(buildMomentumSurface([])).toBeNull();
    });

    it('refuses a series it cannot take a log of, or one with no swing at all', () => {
        const broken = series(600).map((p, i) => (i === 10 ? {...p, value: 0} : p));
        expect(buildMomentumSurface(broken)).toBeNull();
        const flat = sessions(600).map((date) => ({date, value: 100, close: 98}));
        expect(buildMomentumSurface(flat)).toBeNull();
    });

    it('lists the year\'s notable cells: |z| beyond the threshold, one per day, largest first, at most three', () => {
        expect(surface?.notable).toEqual([]);
        // A one-day jump of 25% on session 570 of 600: day 220 of the 250 shown, felt by the
        // five-day row on that day and the four after it.
        const shocked = buildMomentumSurface(series(600, {at: 570, size: 0.25}));
        expect(shocked).not.toBeNull();
        if (!shocked) return;
        expect(shocked.z[0][220]).toBeGreaterThan(NOTABLE_SIGMA);
        const candidates = shocked.z.flatMap((row, lookback) => row.flatMap((z, day) => (Math.abs(z) > NOTABLE_SIGMA ? [{day, lookback, z}] : [])));
        candidates.sort((a, b) => Math.abs(b.z) - Math.abs(a.z) || a.day - b.day || a.lookback - b.lookback);
        const expected: typeof candidates = [];
        for (const cell of candidates) {
            if (expected.some((kept) => kept.day === cell.day)) continue;
            expected.push(cell);
            if (expected.length === NOTABLE_MAX) break;
        }
        expect(expected.length).toBe(NOTABLE_MAX);
        expect(shocked.notable).toEqual(expected);
        for (const cell of shocked.notable) expect(cell.lookback).toBe(0);
    });

    it('refuses an implausible surface rather than drawing a cliff', () => {
        // A ×4.5 jump 200 sessions before the last shown day: outside every σ window the year
        // sees, inside every 250-day lookback, so the long row reads far beyond 20σ.
        const absurd = buildMomentumSurface(series(600, {at: 400, size: 1.5}));
        expect(absurd).toBeNull();
    });
});
