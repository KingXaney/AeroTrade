import {describe, expect, it} from 'vitest';
import {
    CAMERA_PRESETS,
    cellFromUv,
    colorAt,
    easeInOut,
    heatmapPixels,
    legendTicks,
    parseCssColor,
    rowOfLookback,
    formatSigma,
    slicePath,
    TERRAIN_STOPS,
    type TerrainScale,
} from '@/lib/landing/terrain-view';
import type {MomentumSurface} from '@/lib/landing/momentum-surface';

const SCALE: TerrainScale = [[0, 0, 0], [50, 50, 50], [100, 100, 100], [150, 150, 150], [200, 200, 200]];

describe('parseCssColor', () => {
    it('reads the hex and rgb() forms a computed custom property can take', () => {
        expect(parseCssColor('#4fb3c8')).toEqual([79, 179, 200]);
        expect(parseCssColor('#abc')).toEqual([170, 187, 204]);
        expect(parseCssColor(' #FFF ')).toEqual([255, 255, 255]);
        expect(parseCssColor('rgb(1, 2, 3)')).toEqual([1, 2, 3]);
        expect(parseCssColor('rgba(1,2,3,0.5)')).toEqual([1, 2, 3]);
    });

    it('gives nothing for anything else, so a caller falls back', () => {
        expect(parseCssColor('')).toBeNull();
        expect(parseCssColor('color-mix(in srgb, red 50%, blue)')).toBeNull();
        expect(parseCssColor('#12')).toBeNull();
        expect(parseCssColor('rgb(1, 2)')).toBeNull();
    });
});

describe('colorAt', () => {
    it('is the five stops at their positions, symmetric about zero', () => {
        expect(TERRAIN_STOPS.map((stop) => stop.at)).toEqual([-1, -0.4, 0, 0.5, 1]);
        expect(TERRAIN_STOPS.map((stop) => stop.token)).toEqual(['--terrain-neg', '--terrain-low', '--terrain-zero', '--terrain-high', '--terrain-pos']);
        expect(colorAt(SCALE, -1)).toEqual([0, 0, 0]);
        expect(colorAt(SCALE, -0.4)).toEqual([50, 50, 50]);
        expect(colorAt(SCALE, 0)).toEqual([100, 100, 100]);
        expect(colorAt(SCALE, 0.5)).toEqual([150, 150, 150]);
        expect(colorAt(SCALE, 1)).toEqual([200, 200, 200]);
    });

    it('interpolates between stops and clamps outside them', () => {
        expect(colorAt(SCALE, -0.7)).toEqual([25, 25, 25]);
        expect(colorAt(SCALE, 0.25)).toEqual([125, 125, 125]);
        expect(colorAt(SCALE, 7)).toEqual([200, 200, 200]);
        expect(colorAt(SCALE, -7)).toEqual([0, 0, 0]);
        expect(colorAt(SCALE, Number.NaN)).toEqual([100, 100, 100]);
    });
});

describe('the grid under the pointer', () => {
    it('maps a hit\'s uv to a day and a lookback, the longest lookback at the back (uv.y = 1)', () => {
        expect(cellFromUv({x: 0, y: 1}, 250, 7)).toEqual({day: 0, lookback: 6});
        expect(cellFromUv({x: 1, y: 0}, 250, 7)).toEqual({day: 249, lookback: 0});
        expect(cellFromUv({x: 0.5, y: 0.5}, 250, 7)).toEqual({day: 125, lookback: 3});
        expect(cellFromUv({x: 1.2, y: -0.3}, 250, 7)).toEqual({day: 249, lookback: 0});
    });

    it('puts the longest lookback in the geometry\'s first row', () => {
        expect(rowOfLookback(6, 7)).toBe(0);
        expect(rowOfLookback(0, 7)).toBe(6);
    });
});

describe('formatSigma', () => {
    it('signs and rounds to two decimals, with the sigma', () => {
        expect(formatSigma(1.4249)).toBe('+1.42σ');
        expect(formatSigma(-0.8)).toBe('-0.80σ');
        expect(formatSigma(0)).toBe('0.00σ');
        expect(formatSigma(-0.001)).toBe('0.00σ');
    });
});

describe('camera and motion', () => {
    it('names the three presets with a position each', () => {
        expect(Object.keys(CAMERA_PRESETS)).toEqual(['angle', 'top', 'side']);
        for (const position of Object.values(CAMERA_PRESETS)) {
            expect(position).toHaveLength(3);
            expect(position[1]).toBeGreaterThan(0);
        }
    });

    it('eases from 0 to 1, through the middle, never going back', () => {
        expect(easeInOut(0)).toBe(0);
        expect(easeInOut(1)).toBe(1);
        expect(easeInOut(0.5)).toBeCloseTo(0.5, 12);
        let last = -1;
        for (let t = 0; t <= 1; t += 0.05) {
            const v = easeInOut(t);
            expect(v).toBeGreaterThanOrEqual(last);
            last = v;
        }
        expect(easeInOut(2)).toBe(1);
        expect(easeInOut(-1)).toBe(0);
    });
});

describe('legendTicks', () => {
    it('labels both ends and zero on the symmetric scale', () => {
        expect(legendTicks(1.5)).toEqual([
            {at: -1, label: '-1.5σ'},
            {at: 0, label: '0'},
            {at: 1, label: '+1.5σ'},
        ]);
        expect(legendTicks(2.345).map((tick) => tick.label)).toEqual(['-2.3σ', '0', '+2.3σ']);
    });
});

const tiny: MomentumSurface = {
    ticker: 'SPY',
    source: 'stored',
    updated: '2026-10-06',
    lookbacks: [5, 10],
    dates: ['2026-10-02', '2026-10-05', '2026-10-06'],
    price: [1, 2, 3],
    z: [[-2, 0, 2], [1, -1, 0]],
    zAbsMax: 2,
    notable: [],
};

describe('heatmapPixels', () => {
    it('paints one opaque pixel per cell, the longest lookback on the top row', () => {
        const pixels = heatmapPixels(tiny, SCALE);
        expect(pixels).toHaveLength(3 * 2 * 4);
        // Top row = lookback 10 (index 1): z = 1, −1, 0 of a 2 scale → s = 0.5 (the fourth stop),
        // −0.5 (five sixths of the way from the first stop to the second), 0.
        expect([...pixels.slice(0, 4)]).toEqual([150, 150, 150, 255]);
        expect([...pixels.slice(4, 8)]).toEqual([42, 42, 42, 255]);
        expect([...pixels.slice(8, 12)]).toEqual([100, 100, 100, 255]);
        // Bottom row = lookback 5 (index 0): z = −2, 0, 2.
        expect([...pixels.slice(12, 16)]).toEqual([0, 0, 0, 255]);
        expect([...pixels.slice(16, 20)]).toEqual([100, 100, 100, 255]);
        expect([...pixels.slice(20, 24)]).toEqual([200, 200, 200, 255]);
    });
});

describe('slicePath', () => {
    it('draws a row across the width with zero on the middle line', () => {
        expect(slicePath([0, 2, -2], 200, 100, 2)).toBe('M0 50L100 0L200 100');
        expect(slicePath([1], 200, 100, 2)).toBe('M0 25');
        expect(slicePath([], 200, 100, 2)).toBe('');
    });
});
