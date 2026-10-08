// Where things sit on the table: a spot for every seat for 2 to 9 seats, on a wide table
// (landscape) and a tall one (portrait), with the viewer always at the bottom centre — slot 0 —
// and the others clockwise on screen from there (bottom left, left, top, right, bottom right: the
// order the action moves). Pure and client-safe; the seat ring places each plate from these spots
// and the animations take their flight paths from them (CSS custom properties, never a script
// animation).
//
// A spot is a percentage of the seat layer's box, 0..100 each way. A plate is centred on its spot
// inside the box shrunk by half a plate on every side (spotToPx), so a plate at 0 or 100 still sits
// wholly inside; layout.test.ts holds every count's plates apart at a phone's and a laptop's size.

import {TABLE_LIMITS} from '@/lib/poker-night/config';

export type Orientation = 'landscape' | 'portrait';
export type Density = 'compact' | 'comfortable';
export type Spot = {x: number; y: number};
export type Side = 'top' | 'bottom' | 'left' | 'right';
export type SeatSpot = Spot & {slot: number; side: Side};
export type Box = {w: number; h: number};

export const SEAT_COUNTS = Array.from({length: TABLE_LIMITS.seats.max - TABLE_LIMITS.seats.min + 1}, (_, i) => TABLE_LIMITS.seats.min + i);

// A box taller than it is wide (with a little slack) is a phone held upright.
export const orientationFor = (w: number, h: number): Orientation => (h > w * 1.1 ? 'portrait' : 'landscape');
// A box under 500 px on its short side gets the compact plates.
export const densityFor = (w: number, h: number): Density => (Math.min(w, h) < 500 ? 'compact' : 'comfortable');

// A seat plate's size, by density: the avatar, the name and the stack.
export const PLATE: Record<Density, Box> = {compact: {w: 76, h: 56}, comfortable: {w: 136, h: 72}};

const s = (x: number, y: number): Spot => ({x, y});

// Hand-tuned per seat count; slot 0 first, then clockwise on screen.
export const SEAT_SLOTS: Record<Orientation, Record<number, readonly Spot[]>> = {
    landscape: {
        2: [s(50, 100), s(50, 0)],
        3: [s(50, 100), s(12, 18), s(88, 18)],
        4: [s(50, 100), s(3, 50), s(50, 0), s(97, 50)],
        5: [s(50, 100), s(4, 62), s(28, 2), s(72, 2), s(96, 62)],
        6: [s(50, 100), s(4, 72), s(12, 8), s(50, 0), s(88, 8), s(96, 72)],
        7: [s(50, 100), s(16, 96), s(3, 40), s(30, 2), s(70, 2), s(97, 40), s(84, 96)],
        8: [s(50, 100), s(20, 96), s(3, 58), s(14, 6), s(50, 0), s(86, 6), s(97, 58), s(80, 96)],
        9: [s(50, 100), s(24, 96), s(4, 68), s(6, 26), s(30, 2), s(70, 2), s(94, 26), s(96, 68), s(76, 96)],
    },
    portrait: {
        2: [s(50, 100), s(50, 0)],
        3: [s(50, 100), s(10, 12), s(90, 12)],
        4: [s(50, 100), s(5, 50), s(50, 0), s(95, 50)],
        5: [s(50, 100), s(6, 62), s(22, 4), s(78, 4), s(94, 62)],
        6: [s(50, 100), s(6, 70), s(6, 26), s(50, 2), s(94, 26), s(94, 70)],
        7: [s(50, 100), s(6, 74), s(6, 40), s(28, 4), s(72, 4), s(94, 40), s(94, 74)],
        8: [s(50, 100), s(8, 80), s(5, 50), s(12, 14), s(50, 0), s(88, 14), s(95, 50), s(92, 80)],
        9: [s(50, 100), s(10, 84), s(5, 58), s(5, 32), s(24, 6), s(76, 6), s(95, 32), s(95, 58), s(90, 84)],
    },
};

// A squat box: one too narrow for the landscape slots (the stage draws it with the portrait ones) yet
// clearly wider than it is tall — a phone on its side, the dock in its own column (364 × 224 on a
// 568 × 320 phone, 442 × 279 on a 667 × 375 one, 548 × 280 on an 844 × 390 one). Eight seats there
// keep two plates to a side column, the bottom row's corners and one seat at the top, so the status
// flag hanging under a plate ("Offline", "All in", "Waiting for chips") clears the plate under it, the
// cards before it and its own flag on every seat (lib/poker-night/stage.flagRoom; stage.test holds
// it). Seven and nine keep the portrait slots, whose turned-up hands, pots and banner find room
// where no squat placement leaves them all; where a status has none under its plate there, the
// plate carries it (stage.flagsOnPlate).
export const SQUAT_RATIO = 1.3;
export const isSquat = (box: Box, narrow: boolean): boolean => narrow && box.w >= box.h * SQUAT_RATIO;

export const SQUAT_SLOTS: Record<number, readonly Spot[]> = {
    8: [s(50, 100), s(8, 100), s(0, 54), s(0, 14), s(50, 0), s(100, 14), s(100, 54), s(92, 100)],
};

const sideOf = (spot: Spot): Side => (spot.y >= 85 ? 'bottom' : spot.y <= 15 ? 'top' : spot.x < 50 ? 'left' : 'right');

const clampCount = (n: number): number => Math.min(TABLE_LIMITS.seats.max, Math.max(TABLE_LIMITS.seats.min, Math.round(n)));

// Every slot's spot for a table of n seats; on a squat box (isSquat) the squat slots where a count
// has them.
export const seatSpots = (n: number, orientation: Orientation, squat = false): SeatSpot[] =>
    ((squat ? SQUAT_SLOTS[clampCount(n)] : undefined) ?? SEAT_SLOTS[orientation][clampCount(n)]).map((spot, slot) => ({...spot, slot, side: sideOf(spot)}));

// The slot a seat is drawn in: turned so the viewer's own seat is slot 0 (a watcher sees seat 0
// there). A bijection on 0..n−1 for any viewer.
export const visualSlot = (seat: number, mySeat: number | null, n: number): number => (((seat - (mySeat ?? 0)) % n) + n) % n;

// Seat i's spot, for a viewer in mySeat.
export const spotForSeat = (seat: number, mySeat: number | null, n: number, orientation: Orientation): SeatSpot =>
    seatSpots(n, orientation)[visualSlot(seat, mySeat, n)];

const lerp = (from: Spot, to: Spot, k: number): Spot => ({x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k});

// The middle of the felt, where the board lies, and the pot just above it.
export const CENTRE: Spot = {x: 50, y: 50};
export const POT_SPOT: Spot = {x: 50, y: 36};

// Where a seat's bet line sits: part of the way from its plate toward the middle.
export const betSpot = (spot: Spot, k = 0.36): Spot => lerp(spot, CENTRE, k);

// Where the dealer button sits: a little in from the plate and to one side of the bet line.
export const buttonSpot = (spot: Spot, k = 0.22, sideways = 6): Spot => {
    const p = lerp(spot, CENTRE, k);
    const dx = CENTRE.x - spot.x;
    const dy = CENTRE.y - spot.y;
    const len = Math.hypot(dx, dy) || 1;
    // A quarter turn clockwise from the direction to the middle.
    return {x: p.x - (dy / len) * sideways, y: p.y + (dx / len) * sideways};
};

// A spot's centre in pixels inside a box, for a plate of the given size: the box shrunk by half a
// plate on every side, so the plate stays inside. With no plate, the spot as a plain percentage.
export const spotToPx = (spot: Spot, box: Box, plate: Box = {w: 0, h: 0}): {x: number; y: number} => ({
    x: plate.w / 2 + (spot.x / 100) * Math.max(0, box.w - plate.w),
    y: plate.h / 2 + (spot.y / 100) * Math.max(0, box.h - plate.h),
});

// The pixel offset from one spot to another: a flight's --pn-dx / --pn-dy.
export const flight = (from: Spot, to: Spot, box: Box, plate?: Box): {dx: number; dy: number} => {
    const a = spotToPx(from, box, plate);
    const b = spotToPx(to, box, plate);
    return {dx: Math.round(b.x - a.x), dy: Math.round(b.y - a.y)};
};

// Two plates' rectangles overlap (centres in px, one plate size).
export const platesOverlap = (a: {x: number; y: number}, b: {x: number; y: number}, plate: Box): boolean =>
    Math.abs(a.x - b.x) < plate.w && Math.abs(a.y - b.y) < plate.h;
