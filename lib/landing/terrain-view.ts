// How the terrain is drawn, as pure functions the three.js scene, the 2D heatmap, the legend and
// the slice share: the colour scale, the cell under a pointer, the camera presets, the easing.
// Client-safe and import-light; the sentences are lib/learn/copy/landing.ts.

import type {MomentumSurface, SurfaceCell} from "@/lib/landing/momentum-surface";

// The colour tuple and the token parser are lib/theme/css-color's, shared with the brain's graph;
// re-exported here so the terrain's callers and tests keep one import.
export {parseCssColor, type Rgb} from "@/lib/theme/css-color";
import type {Rgb} from "@/lib/theme/css-color";

// The diverging scale, symmetric about zero: teal below, magenta at zero, gold above. The
// colours themselves are the --terrain-* tokens in app/globals.css (invariant 5: no hex in a
// component), read from the document at runtime so a theme preview recolours the surface.
export const TERRAIN_STOPS = [
    {at: -1, token: '--terrain-neg'},
    {at: -0.4, token: '--terrain-low'},
    {at: 0, token: '--terrain-zero'},
    {at: 0.5, token: '--terrain-high'},
    {at: 1, token: '--terrain-pos'},
] as const;

// The five stops' colours, in TERRAIN_STOPS order.
export type TerrainScale = readonly Rgb[];

const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value));

// The colour of a normalised value s = z / zAbsMax in [−1, 1]: linear between the two stops
// around it, clamped at the ends. Not a number reads as zero.
export const colorAt = (scale: TerrainScale, s: number): Rgb => {
    const value = clamp(Number.isFinite(s) ? s : 0, -1, 1);
    for (let i = 1; i < TERRAIN_STOPS.length; i += 1) {
        if (value <= TERRAIN_STOPS[i].at) {
            const a = TERRAIN_STOPS[i - 1].at;
            const b = TERRAIN_STOPS[i].at;
            const f = (value - a) / (b - a);
            const from = scale[i - 1];
            const to = scale[i];
            return [0, 1, 2].map((c) => Math.round(from[c] + (to[c] - from[c]) * f)) as unknown as Rgb;
        }
    }
    return scale[scale.length - 1];
};

// The grid cell a raycast hit names: uv.x runs with the days (oldest at 0), uv.y with the
// lookbacks — 1 at the back of the plane, where the longest lookback sits.
export const cellFromUv = (uv: {x: number; y: number}, days: number, lookbacks: number): SurfaceCell => ({
    day: Math.round(clamp(uv.x, 0, 1) * (days - 1)),
    lookback: Math.round(clamp(uv.y, 0, 1) * (lookbacks - 1)),
});

// The plane's row (0 at the back) that holds a lookback (0 the shortest): the longest at the back.
export const rowOfLookback = (lookback: number, lookbacks: number): number => lookbacks - 1 - lookback;

// '+1.42σ', '-0.80σ', '0.00σ'.
export const formatSigma = (z: number): string => {
    const rounded = Math.round(z * 100) / 100;
    const sign = rounded > 0 ? '+' : rounded < 0 ? '-' : '';
    return `${sign}${Math.abs(rounded).toFixed(2)}σ`;
};

// The direction the camera stands in for each preset (the scene sets the distance so the whole
// surface fits the canvas). 'angle' is the plan's reference view, raised a little so a tall
// canvas is filled; 'top' reads as the heatmap; 'side' as the front row's profile.
export const CAMERA_PRESETS = {
    angle: [6, 7, 8],
    top: [0, 15, 0.01],
    side: [0, 2.5, 13],
} as const;
export type CameraPreset = keyof typeof CAMERA_PRESETS;
export const CAMERA_PRESET_IDS: readonly CameraPreset[] = ['angle', 'top', 'side'];

// Smoothstep: eases in and out, 0 → 1.
export const easeInOut = (t: number): number => {
    const x = clamp(t, 0, 1);
    return x * x * (3 - 2 * x);
};

// The legend's three ticks on the symmetric scale, as fractions of the bar and their labels.
export const legendTicks = (zAbsMax: number): {at: number; label: string}[] => [
    {at: -1, label: `-${zAbsMax.toFixed(1)}σ`},
    {at: 0, label: '0'},
    {at: 1, label: `+${zAbsMax.toFixed(1)}σ`},
];

// One opaque RGBA pixel per cell, `dates.length` wide and `lookbacks.length` tall, the longest
// lookback on the top row — the orientation of the floor texture (uv.y = 1 at the back) and of
// the 2D heatmap a browser without WebGL gets.
export const heatmapPixels = (surface: Pick<MomentumSurface, 'z' | 'zAbsMax' | 'dates' | 'lookbacks'>, scale: TerrainScale): Uint8ClampedArray => {
    const width = surface.dates.length;
    const height = surface.lookbacks.length;
    const pixels = new Uint8ClampedArray(width * height * 4);
    const max = surface.zAbsMax > 0 ? surface.zAbsMax : 1;
    for (let y = 0; y < height; y += 1) {
        const row = surface.z[rowOfLookback(y, height)];
        for (let x = 0; x < width; x += 1) {
            const [r, g, b] = colorAt(scale, row[x] / max);
            const offset = (y * width + x) * 4;
            pixels[offset] = r;
            pixels[offset + 1] = g;
            pixels[offset + 2] = b;
            pixels[offset + 3] = 255;
        }
    }
    return pixels;
};

const fixed = (value: number): string => String(Number(value.toFixed(2)));

// An SVG path for one row across `width`, zero on the middle line, ±zAbsMax at the edges.
export const slicePath = (values: readonly number[], width: number, height: number, zAbsMax: number): string => {
    if (values.length === 0) return '';
    const max = zAbsMax > 0 ? zAbsMax : 1;
    const step = values.length > 1 ? width / (values.length - 1) : 0;
    return values
        .map((z, i) => `${i === 0 ? 'M' : 'L'}${fixed(i * step)} ${fixed(height / 2 - (z / max) * (height / 2))}`)
        .join('');
};
