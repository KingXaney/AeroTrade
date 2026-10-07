// Every sentence of the landing page's momentum terrain (components/landing/MomentumTerrain):
// the hero's 3D surface of SPY momentum. Held to the 'copy' tier of lib/learn/banned.ts like the
// rest of the front door (lib/learn/copy/landing.ts); the numbers it prints are the surface's own
// — a date, a lookback, a σ, a close — never a claim. Kept apart from the page's copy so the
// client component that draws the terrain bundles these lines and nothing else.

import type {GlossaryKey} from "@/lib/learn/glossary";
import {formatSigma, type CameraPreset} from "@/lib/landing/terrain-view";
import {shortDate} from "@/lib/learn/copy/portfolio";

// The terms the terrain's one "What these mean" lists, in order. Its lead paragraph
// (TERRAIN_COPY.method) says how the surface is laid out, and nothing a definition already says
// (lib/learn/__tests__/panel-method.test.ts).
export const TERRAIN_TERMS: readonly GlossaryKey[] = ['normalized-momentum', 'lookback', 'volatility'];

export const TERRAIN_COPY = {
    eyebrow: 'S&P 500 momentum, the last year',
    // Under the canvas: the three axes. `days` is how many sessions the surface shows.
    caption: (days: number): string =>
        `Left to right, the last ${days} sessions. Front to back, lookbacks from 5 to 250 days. Height and colour, normalised momentum of SPY's total return.`,
    hint: 'Drag to turn, hover a point for its date. Zoom with + and −, a pinch, or the wheel once you have grabbed the surface.',
    hintTouch: 'Tap a point for its date; + and − zoom.',
    zoomLabel: 'Zoom',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    loading: 'Drawing the last year of SPY…',
    unavailable: 'The terrain draws once the nightly price jobs have stored a year of SPY closes.',
    flat: 'Drawn flat: this browser has no WebGL.',
    // "Updated Oct 6, 2026"
    updated: (date: string): string => `Updated ${shortDate(date, true)}`,
    // Under the canvas, by where the sessions came from (MomentumSurface.source).
    source: {
        tiingo: 'SPY daily closes from Tiingo, adjusted for dividends and splits. Not a forecast.',
        stored: "SPY closes with dividends reinvested, from the app's own price history. Not a forecast.",
    },
    // Tiingo asks to be named where its data is shown; the credit links to it.
    tiingoCredit: 'Data via Tiingo',
    tiingoHref: 'https://www.tiingo.com',
    // The canvas's accessible name: what it is, when, and the one number a reader would ask for.
    ariaLabel: ({updated, days, z20}: {updated: string; days: number; z20: number}): string =>
        `SPY momentum surface over the last ${days} sessions, updated ${shortDate(updated, true)}: 20-day momentum ${formatSigma(z20)}.`,
    tooltip: {
        date: (date: string): string => shortDate(date, true),
        lookback: (n: number): string => `${n}-day lookback`,
        close: (price: number): string => `SPY close $${price.toFixed(2)}`,
    },
    cameraLabel: 'Camera',
    presets: {angle: 'Angle', top: 'Top', side: 'Side'} as const satisfies Record<CameraPreset, string>,
    flatten: 'Flatten',
    raise: 'Raise',
    legend: {below: 'below zero', above: 'above zero'},
    // A story marker on one of the year's largest moves: "Apr 4: -3.21σ over 5 days".
    notable: ({date, lookback, z}: {date: string; lookback: number; z: number}): string => `${shortDate(date)}: ${formatSigma(z)} over ${lookback} days`,
    sliceHeading: (lookback: number): string => `The ${lookback}-day row, session by session`,
    sliceHint: 'The row under the pointer; the dot is the session under it.',
    method: "Each row is one lookback and each column one session; a cell's height is the normalised momentum of SPY's total return over that lookback, ending on that session. Teal sits below zero and gold above it, and the floor repeats the colours as a flat map of the same grid.",
} as const;
