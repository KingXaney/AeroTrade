// Where the seats sit: a spot for every slot of every table from 2 to 9 seats, wide and tall, each
// inside the box, the viewer's slot at the bottom centre; no two plates overlapping on a phone held
// upright (375×560), a laptop (1280×640) and a few sizes around them; every seat drawn once whoever
// is watching; and the bet line, the dealer button and a flight's offset worked out from the spots.

import {describe, expect, it} from 'vitest';
import {TABLE_LIMITS} from '@/lib/poker-night/config';
import {
    betSpot, buttonSpot, CENTRE, densityFor, flight, orientationFor, PLATE, platesOverlap, SEAT_COUNTS, SEAT_SLOTS, seatSpots, spotForSeat, spotToPx, visualSlot,
    type Orientation,
} from '@/lib/poker-night/layout';

const ORIENTATIONS: Orientation[] = ['landscape', 'portrait'];

describe('the slots', () => {
    it('cover every seat count the table allows, in both orientations', () => {
        expect(SEAT_COUNTS).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
        expect(SEAT_COUNTS[0]).toBe(TABLE_LIMITS.seats.min);
        expect(SEAT_COUNTS[SEAT_COUNTS.length - 1]).toBe(TABLE_LIMITS.seats.max);
        for (const o of ORIENTATIONS) for (const n of SEAT_COUNTS) {
            const spots = seatSpots(n, o);
            expect(spots, `${o} ${n}`).toHaveLength(n);
            expect(spots[0]).toMatchObject({x: 50, y: 100, slot: 0, side: 'bottom'});
            for (const spot of spots) {
                expect(spot.x).toBeGreaterThanOrEqual(0);
                expect(spot.x).toBeLessThanOrEqual(100);
                expect(spot.y).toBeGreaterThanOrEqual(0);
                expect(spot.y).toBeLessThanOrEqual(100);
            }
            expect(new Set(spots.map((p) => `${p.x},${p.y}`)).size).toBe(n);
        }
    });

    it('go clockwise on screen from the bottom: left side first, then the top, then the right', () => {
        for (const o of ORIENTATIONS) for (const n of SEAT_COUNTS.filter((k) => k >= 3)) {
            const spots = SEAT_SLOTS[o][n];
            // Angles round the centre, clockwise on screen from straight down, rise slot by slot.
            const angle = (p: {x: number; y: number}) => {
                const a = Math.atan2(-(p.x - 50), p.y - 50);
                return a < 0 ? a + 2 * Math.PI : a;
            };
            const angles = spots.map(angle);
            for (let k = 1; k < n; k++) expect(angles[k], `${o} ${n} slot ${k}`).toBeGreaterThan(angles[k - 1]);
        }
    });

    it('keep every plate apart at a phone\'s and a laptop\'s size', () => {
        const boxes = [{w: 375, h: 560}, {w: 1280, h: 640}, {w: 320, h: 480}, {w: 390, h: 600}, {w: 1440, h: 700}, {w: 812, h: 340}, {w: 1024, h: 600}];
        for (const box of boxes) {
            const o = orientationFor(box.w, box.h);
            const plate = PLATE[densityFor(box.w, box.h)];
            for (const n of SEAT_COUNTS) {
                const centres = seatSpots(n, o).map((spot) => spotToPx(spot, box, plate));
                for (let i = 0; i < n; i++) {
                    const c = centres[i];
                    expect(c.x - plate.w / 2).toBeGreaterThanOrEqual(0);
                    expect(c.x + plate.w / 2).toBeLessThanOrEqual(box.w + 1e-9);
                    expect(c.y - plate.h / 2).toBeGreaterThanOrEqual(0);
                    expect(c.y + plate.h / 2).toBeLessThanOrEqual(box.h + 1e-9);
                    for (let j = i + 1; j < n; j++) expect(platesOverlap(c, centres[j], plate), `${box.w}×${box.h} ${o} ${n}: ${i} and ${j}`).toBe(false);
                }
            }
        }
    });

    it('reads a phone held upright as portrait and compact, a laptop as landscape and comfortable', () => {
        expect(orientationFor(375, 560)).toBe('portrait');
        expect(densityFor(375, 560)).toBe('compact');
        expect(orientationFor(1280, 640)).toBe('landscape');
        expect(densityFor(1280, 640)).toBe('comfortable');
        expect(orientationFor(600, 640)).toBe('landscape');
    });
});

describe('turning the table to the viewer', () => {
    it('puts the viewer\'s seat in slot 0 and draws every seat once', () => {
        for (const n of SEAT_COUNTS) for (const mine of [null, ...Array.from({length: n}, (_, i) => i)]) {
            const slots = Array.from({length: n}, (_, seat) => visualSlot(seat, mine, n));
            expect(new Set(slots).size).toBe(n);
            expect(Math.min(...slots)).toBe(0);
            expect(Math.max(...slots)).toBe(n - 1);
            expect(visualSlot(mine ?? 0, mine, n)).toBe(0);
            // The seat after the viewer's is the next slot clockwise.
            expect(visualSlot(((mine ?? 0) + 1) % n, mine, n)).toBe(1 % n);
        }
        expect(spotForSeat(3, 3, 6, 'portrait')).toMatchObject({x: 50, y: 100, slot: 0});
    });
});

describe('spots around a seat', () => {
    it('puts the bet line and the button between the plate and the middle', () => {
        const bottom = {x: 50, y: 100};
        expect(betSpot(bottom)).toEqual({x: 50, y: 100 - 0.36 * 50});
        const button = buttonSpot(bottom);
        expect(button.y).toBeCloseTo(100 - 0.22 * 50);
        expect(button.x).not.toBe(50);
        expect(betSpot(CENTRE)).toEqual(CENTRE);
    });

    it('measures a flight in pixels', () => {
        expect(flight({x: 50, y: 100}, {x: 50, y: 50}, {w: 400, h: 600})).toEqual({dx: 0, dy: -300});
        expect(flight({x: 0, y: 0}, {x: 100, y: 100}, {w: 400, h: 600}, {w: 100, h: 50})).toEqual({dx: 300, dy: 550});
    });
});
