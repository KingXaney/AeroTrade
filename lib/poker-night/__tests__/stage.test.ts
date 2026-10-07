// The table's stage in pixels: for every seat count, viewer and box from a 320 px phone to a wide
// desktop, every plate, bet line, dealer button, the board and the pot inside the box and clear of
// one another; the board's cards as large as the room allows (and readable on a phone); the felt
// under the plates' centres; a narrow box always on the portrait slots; a flight's offset; and the
// pot's pills kept to one row.

import {describe, expect, it} from 'vitest';
import {PLATE, SEAT_COUNTS, spotToPx} from '@/lib/poker-night/layout';
import {
    BOARD_CARD_MAX, CARD_RATIO, fitFor, insideBox, NARROW_STAGE, offset, overlaps, PLATE_SIZE, POT_PILL, potPillsShown, stageLayout, stageOrientation, TIGHT_BELOW,
    type Rect, type Stage,
} from '@/lib/poker-night/stage';

// Phones held upright (the box left between the top bar and the dock), a phone on its side (the
// dock in a column), tablets and desktops.
const PHONES = [{w: 320, h: 340}, {w: 320, h: 384}, {w: 320, h: 420}, {w: 320, h: 600}, {w: 360, h: 390}, {w: 360, h: 480}, {w: 375, h: 469}, {w: 390, h: 630}, {w: 414, h: 700}];
const WIDE = [{w: 592, h: 327}, {w: 700, h: 300}, {w: 768, h: 800}, {w: 1024, h: 560}, {w: 1280, h: 600}, {w: 1440, h: 700}, {w: 1920, h: 900}];
const BOXES = [...PHONES, ...WIDE];

const rectsOf = (s: Stage): {name: string; r: Rect}[] => [
    ...s.seats.flatMap((p) => [
        {name: `plate ${p.seat}`, r: {...p.plate, ...s.plateSize}},
        {name: `bet ${p.seat}`, r: {...p.bet, ...s.betSize}},
        {name: `button ${p.seat}`, r: {...p.button, w: s.buttonSize, h: s.buttonSize}},
    ]),
    {name: 'board', r: s.board},
    ...(s.potOnBoard ? [] : [{name: 'pot', r: s.pot}]),
];

describe('the stage', () => {
    it('keeps everything inside the box and apart, for every table and viewer', () => {
        for (const box of BOXES) for (const n of SEAT_COUNTS) for (const mine of [null, 0, n - 1]) {
            const s = stageLayout(box, n, mine);
            const rects = rectsOf(s);
            for (const {name, r} of rects) expect(insideBox(r, box), `${box.w}×${box.h} ${n} seats: ${name}`).toBe(true);
            for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
                expect(overlaps(rects[i].r, rects[j].r), `${box.w}×${box.h} ${n} seats, viewer ${mine}: ${rects[i].name} and ${rects[j].name}`).toBe(false);
            }
        }
    });

    it('deals the board as large as the room allows: full size on a roomy box, readable on any phone', () => {
        for (const box of BOXES) for (const n of SEAT_COUNTS) {
            const s = stageLayout(box, n, 0);
            expect(s.board.card.w, `${box.w}×${box.h} ${n}`).toBeGreaterThanOrEqual(18);
            expect(s.board.card.w).toBeLessThanOrEqual(BOARD_CARD_MAX[s.fit]);
            expect(s.board.card.h).toBe(Math.round(s.board.card.w * CARD_RATIO));
            expect(s.board.w).toBe(5 * s.board.card.w + 4 * s.board.gap);
        }
        for (const box of [{w: 390, h: 630}, {w: 414, h: 700}, ...WIDE]) for (const n of SEAT_COUNTS) {
            expect(stageLayout(box, n, 0).board.card.w, `${box.w}×${box.h} ${n}`).toBeGreaterThanOrEqual(BOARD_CARD_MAX[fitFor(box)] - 2);
        }
        // A phone the size of most: the cards stay above 30 px wide even at nine seats.
        for (const n of SEAT_COUNTS) expect(stageLayout({w: 375, h: 469}, n, 0).board.card.w).toBeGreaterThanOrEqual(30);
    });

    it('finds the pot its own place everywhere but the smallest boxes', () => {
        for (const box of [{w: 390, h: 630}, {w: 414, h: 700}, {w: 375, h: 469}, ...WIDE]) for (const n of SEAT_COUNTS) {
            expect(stageLayout(box, n, 0).potOnBoard, `${box.w}×${box.h} ${n}`).toBe(false);
        }
    });

    it('lays the felt under the plates\' centres, so every plate straddles its rail', () => {
        for (const box of BOXES) {
            const s = stageLayout(box, 6, 0);
            expect(s.felt).toEqual({left: s.plateSize.w / 2, top: s.plateSize.h / 2, width: box.w - s.plateSize.w, height: box.h - s.plateSize.h});
            for (const p of s.seats) {
                expect(p.plate.x).toBeGreaterThanOrEqual(s.felt.left - 1e-9);
                expect(p.plate.x).toBeLessThanOrEqual(s.felt.left + s.felt.width + 1e-9);
                expect(p.plate.y).toBeGreaterThanOrEqual(s.felt.top - 1e-9);
                expect(p.plate.y).toBeLessThanOrEqual(s.felt.top + s.felt.height + 1e-9);
            }
        }
    });

    it('puts the viewer at the bottom centre and every seat on a slot of its own', () => {
        for (const n of SEAT_COUNTS) for (const mine of [0, 3 % n, n - 1]) {
            const s = stageLayout({w: 390, h: 630}, n, mine);
            expect(s.seats[mine].slot).toBe(0);
            expect(s.seats[mine].plate.x).toBeCloseTo(195, 6);
            expect(new Set(s.seats.map((p) => p.slot)).size).toBe(n);
            expect(s.seats.map((p) => p.seat)).toEqual(Array.from({length: n}, (_, i) => i));
        }
    });

    it('turns a narrow box to the portrait slots and a small one tight', () => {
        expect(stageOrientation({w: NARROW_STAGE - 1, h: 200})).toBe('portrait');
        expect(stageOrientation({w: 1280, h: 600})).toBe('landscape');
        expect(stageOrientation({w: 700, h: 900})).toBe('portrait');
        expect(fitFor({w: 320, h: TIGHT_BELOW - 1})).toBe('tight');
        expect(fitFor({w: 320, h: TIGHT_BELOW})).toBe('compact');
        expect(fitFor({w: 1280, h: 600})).toBe('comfortable');
        expect(PLATE_SIZE.compact).toEqual(PLATE.compact);
        expect(PLATE_SIZE.comfortable).toEqual(PLATE.comfortable);
        expect(PLATE_SIZE.tight.w).toBeLessThanOrEqual(PLATE.compact.w);
        expect(PLATE_SIZE.tight.h).toBeLessThanOrEqual(PLATE.compact.h);
    });

    it('places plates where layout says, for the stage\'s own plate size', () => {
        const box = {w: 1280, h: 600};
        const s = stageLayout(box, 9, 0);
        for (const p of s.seats) expect(p.plate).toEqual(spotToPx(p.spot, box, s.plateSize));
    });
});

describe('a flight', () => {
    it('is the start as seen from where the element is drawn, in whole pixels', () => {
        expect(offset({x: 10, y: 20}, {x: 110, y: 70})).toEqual({dx: -100, dy: -50});
        expect(offset({x: 10.4, y: 20.6}, {x: 0, y: 0})).toEqual({dx: 10, dy: 21});
    });
});

describe("the pot's pills", () => {
    const more = (from: number) => `${7 - from} more side pots: 9,999`;
    const labels = ['Main pot 4,640', 'Side pot 1: 1,820', 'Side pot 2: 1,560', 'Side pot 3: 1,300', 'Side pot 4: 1,040', 'Side pot 5: 780', 'Side pot 6: 520'];

    it('gives every pot a pill when the row holds them all', () => {
        expect(potPillsShown(['Pot 1,200'], 50, more)).toBe(1);
        expect(potPillsShown(labels.slice(0, 2), 400, more)).toBe(2);
        expect(potPillsShown(labels, 2000, more)).toBe(7);
    });

    it('gathers the side pots past what fits into one more pill, never dropping the main pot', () => {
        const shown = potPillsShown(labels, 420, more);
        expect(shown).toBeGreaterThanOrEqual(1);
        expect(shown).toBeLessThan(7);
        const width = (label: string, first: boolean) => label.length * POT_PILL.char + POT_PILL.pad + (first ? POT_PILL.chips : 0);
        const used = labels.slice(0, shown).reduce((s, l, i) => s + width(l, i === 0), 0) + width(more(shown), false) + POT_PILL.gap * shown;
        expect(used).toBeLessThanOrEqual(420);
        expect(potPillsShown(labels, 10, more)).toBe(1);
    });
});
