// The table's stage in pixels: for every seat count, viewer and box from a 320 px phone to a wide
// desktop, every plate, bet line, dealer button, the board and the pot inside the box and clear of
// one another; the board's cards as large as the room allows (and readable on a phone); the felt
// under the plates' centres; a narrow box always on the portrait slots; a flight's offset; the pots'
// pills — one pot to four — on the felt, clear of every card, plate, bet line out, winner's "+N" and
// the dealer button, moving only when something lands where they are, and inside the box with
// nothing on the board, a plate or a card where nine seats leave no room; and the winner's banner and
// the line under it clear of every plate, turned-up hand, the dealer button, the board, the pots and
// the "+N", on the phones (upright and on their side) and the desktop the QA drives; and a plate's
// menu opening toward the middle of the table.

import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {describe, expect, it, vi} from 'vitest';
import {BANK_COPY, FELT_COPY, HAND_COPY, TABLE_COPY} from '@/lib/learn/copy/poker-night';
import {CHIP_COLUMNS} from '@/lib/poker-night/chips';
import {PLATE, SEAT_COUNTS, spotToPx} from '@/lib/poker-night/layout';
import {
    AMOUNT_PX, AVATAR_PX, avatarCentre, BANNER, bannerObstacles, bannerPlan, BET, betLineSize, BLIND_MARK, blindRect, BOARD_CARD_MAX, BOARD_CARD_MIN, BOARD_GAP, BOARD_LABEL, BOARD_ROW_GAP,
    BOARD_SIDE_GAP, boardAnchor, boardBlock, BOARDS_SHEET_CARD, CARD_RATIO, CASCADE_STEP, CHIP_PX, FELT_RAIL, INDEX_BAND, MULTI_BOARD_MIN,
    feltSpan, fitFor, FLAG_PX, flagRect, flagRoom, flagsOnPlate, handsMeet, insideBox, menuSide, MINI_CARD_PX, MONO_EM, NARROW_STAGE, offset, openSeatPx, overlaps, pieceRect, PLATE_PAD_X, PLATE_SIZE, POT_CLEAR, POT_PILL, POT_PILL_H,
    potCentre, potLayouts, potObstacles, potPillWidth, potPlan, PULSE, resultBannerPlan, SEAT_CARDS_OVER, seatCardsRect, SHOWN_CARD_PX, SHOWN_OFF, SHOWN_STEP, shownHandRect, shownHandWidth, stageLayout, stageOrientation,
    TABLE_TOP_ROOM, textWidth, TIGHT_BELOW, WIN_POP, winPopRect, wrappedLines,
    type BannerPlan, type BannerSeen, type BannerText, type BetOut, type Fit, type PotNow, type PotPlan, type PotSeen, type Rect, type SeatMarks, type Stage, type WinPop,
} from '@/lib/poker-night/stage';

// Its sweeps run thousands of layouts or hands: ample on a laptop, slower on a CI runner.
vi.setConfig({testTimeout: 60_000});

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

describe("a seat's status flag", () => {
    const css = readFileSync(fileURLToPath(new URL('../../../app/globals.css', import.meta.url)), 'utf8');
    // Every seat taken, the viewer at seat 0; Triple T's throw-away: three cards face down before every
    // other plate, the blinds at seats 1 and 2, "Discarding…" under every plate.
    const throwAway = (s: Stage): SeatMarks[] => s.seats.map((p) => ({seat: p.seat, open: false, backs: p.seat === 0 ? 0 : 3, blind: p.seat === 1 || p.seat === 2, flag: TABLE_COPY.discarding}));
    const drawn = (s: Stage, m: SeatMarks): Rect[] => [
        {...s.seats[m.seat].plate, ...s.plateSize},
        ...(m.backs > 0 ? [seatCardsRect(s.seats[m.seat], s, m.backs)] : []),
        ...(m.blind ? [blindRect(s.seats[m.seat], s)] : []),
    ];

    it('hangs where it clears every other plate, the cards face down before it, its blind\'s mark and its flag — else the plate carries the status', () => {
        for (const box of [...BOXES, ...Object.values(POT_BOXES).flat(), ...Object.values(SIDEWAYS)]) for (const n of SEAT_COUNTS) {
            const s = stageLayout(box, n, 0);
            const marks = throwAway(s);
            const hangs = marks.filter((m) => flagRoom(s, m.seat, TABLE_COPY.discarding, marks));
            for (const m of hangs) {
                const flag = flagRect(s.seats[m.seat], s, TABLE_COPY.discarding);
                for (const o of marks) {
                    if (o.seat === m.seat) continue;
                    const theirs = [...drawn(s, o), ...(hangs.includes(o) ? [flagRect(s.seats[o.seat], s, TABLE_COPY.discarding)] : [])];
                    for (const r of theirs) expect(overlaps(flag, r), `${box.w}×${box.h} ${n} seats: seat ${m.seat}'s flag over seat ${o.seat}`).toBe(false);
                }
            }
            // Where there is room — a phone held upright, the desktop — every flag hangs.
            if (box.h >= box.w || fitFor(box) === 'comfortable') expect(hangs.length, `${box.w}×${box.h} ${n} seats`).toBe(n);
        }
        // The smallest phone on its side at nine seats (the portrait slots, three to a side column): the
        // side columns' flags meet the plates under them.
        const crowded = stageLayout(SIDEWAYS['568 × 320'], 9, 0);
        expect(throwAway(crowded).filter((m) => !flagRoom(crowded, m.seat, TABLE_COPY.discarding, throwAway(crowded))).length).toBeGreaterThan(0);
        // An open seat's ring is all that stands there.
        const four = throwAway(crowded).map((m) => (m.seat % 2 === 1 ? {...m, open: true, backs: 0, blind: false, flag: null} : m));
        for (const m of four.filter((x) => !x.open)) {
            if (!flagRoom(crowded, m.seat, TABLE_COPY.discarding, four)) continue;
            const flag = flagRect(crowded.seats[m.seat], crowded, TABLE_COPY.discarding);
            for (const o of four.filter((x) => x.open)) {
                const ring = openSeatPx(crowded);
                expect(overlaps(flag, {...crowded.seats[o.seat].plate, w: ring, h: ring})).toBe(false);
            }
        }
    });

    // Every word a plate hangs, the widest first.
    const WORDS = [TABLE_COPY.awaitingChips, TABLE_COPY.presence.hidden, TABLE_COPY.noChipsFlag, TABLE_COPY.status.busted, TABLE_COPY.status['sitting-out'],
        TABLE_COPY.presence.offline, TABLE_COPY.status['all-in'], TABLE_COPY.status.folded, TABLE_COPY.status.waiting, TABLE_COPY.status.leaving];
    // Every seat taken, `backs` face down before every plate but the viewer's, the blinds after button `b`.
    const marksOf = (s: Stage, mine: number | null, word: string, backs: number, b: number): SeatMarks[] => {
        const n = s.seats.length;
        return s.seats.map((p) => ({seat: p.seat, open: false, backs: p.seat === mine ? 0 : backs, blind: p.seat === (b + 1) % n || p.seat === (b + 2) % n, flag: word}));
    };
    const SQUAT_BOXES = [...Object.values(SIDEWAYS), {w: 548, h: 280}];

    it('hangs every word under every plate at eight seats on a phone on its side (the squat slots, two to a side column)', () => {
        for (const box of SQUAT_BOXES) for (const mine of [0, null]) {
            const s = stageLayout(box, 8, mine);
            // Two to a side column: the plates apart by a flag's drop and more.
            const columns = s.seats.filter((p) => p.spot.x === 0);
            expect(columns, `${box.w}×${box.h}`).toHaveLength(2);
            for (const word of WORDS) for (const backs of [2, 3, 4]) for (let b = 0; b < 8; b++) {
                const marks = marksOf(s, mine, word, backs, b);
                for (const m of marks) expect(flagRoom(s, m.seat, word, marks), `${box.w}×${box.h}, viewer ${mine}, "${word}", ${backs} backs, button ${b}: seat ${m.seat}`).toBe(true);
                expect(flagsOnPlate(s, marks).size).toBe(0);
            }
        }
        // Not a phone on its side: the portrait and landscape slots as they were.
        expect(stageLayout({w: 548, h: 600}, 8, 0).seats[1].spot).toMatchObject({x: 8, y: 80});
        expect(stageLayout({w: 548, h: 280}, 8, 0).seats[1].spot).toMatchObject({x: 8, y: 100});
        expect(stageLayout({w: 562, h: 294}, 8, 0).seats[1].spot).toMatchObject({x: 20, y: 96});
    });

    it('goes on the plate where it has no room under it (stage.flagsOnPlate): every word that hangs clears everything round it, at every size, seat count and word', () => {
        let carried = 0;
        for (const box of [...BOXES, ...Object.values(POT_BOXES).flat(), ...SQUAT_BOXES]) for (const n of SEAT_COUNTS) for (const mine of [0, null]) {
            const s = stageLayout(box, n, mine);
            for (const word of [WORDS[0], TABLE_COPY.presence.offline, TABLE_COPY.status.folded]) for (const backs of [2, 4]) {
                const marks = marksOf(s, mine, word, backs, 0);
                const onPlate = flagsOnPlate(s, marks);
                carried += onPlate.size;
                const hangs = marks.filter((m) => !onPlate.has(m.seat));
                for (const m of hangs) {
                    const flag = flagRect(s.seats[m.seat], s, word);
                    for (const o of marks) {
                        if (o.seat === m.seat) continue;
                        for (const r of [...drawn(s, o), ...(onPlate.has(o.seat) ? [] : [flagRect(s.seats[o.seat], s, word)])]) {
                            expect(overlaps(flag, r), `${box.w}×${box.h} ${n} seats, viewer ${mine}, "${word}": seat ${m.seat}'s flag over seat ${o.seat}`).toBe(false);
                        }
                    }
                }
                // Where there is room — a phone held upright, the desktop — every short word hangs (the
                // widest, "Waiting for chips", may meet a crowded column's next plate on a 320 px phone).
                if ((box.h >= box.w || fitFor(box) === 'comfortable') && word !== WORDS[0]) expect(onPlate.size, `${box.w}×${box.h} ${n} seats, "${word}"`).toBe(0);
            }
        }
        // Nine seats on the smallest phone on its side: the side columns' plates carry theirs.
        const nine = stageLayout(SIDEWAYS['568 × 320'], 9, 0);
        expect(flagsOnPlate(nine, marksOf(nine, 0, TABLE_COPY.presence.offline, 2, 0)).size).toBeGreaterThan(0);
        expect(carried).toBeGreaterThan(0);
        // An open seat, or a seat with no word, carries nothing.
        const open = marksOf(nine, 0, TABLE_COPY.presence.offline, 2, 0).map((m) => (m.seat % 2 ? {...m, open: true, flag: null} : {...m, flag: m.seat === 2 ? null : m.flag}));
        const carriedOpen = flagsOnPlate(nine, open);
        for (const m of open) if (m.open || m.flag === null) expect(carriedOpen.has(m.seat)).toBe(false);
        // The stylesheet: the word in the stack's place, the name beside the avatar.
        expect(css).toContain('.pn-seat[data-status-on="plate"] .pn-plate { grid-template-areas: "avatar name" "stack stack"; }');
        expect(css).toMatch(/\.pn-plate-status \{[^}]*text-overflow: ellipsis;[^}]*\}/);
    });

    it('is as wide as its words, 6 px a side inside the widest border, never more than 28 px wider than the plate', () => {
        const s = stageLayout({w: 378, h: 617}, 6, 0);
        const p = s.seats[3];
        const r = flagRect(p, s, TABLE_COPY.discarding);
        expect(r.w).toBe(textWidth(TABLE_COPY.discarding, FLAG_PX[s.fit], true) + 2 * (6 + BANNER.border));
        expect(flagRect(p, s, 'A very long status a plate never says').w).toBe(s.plateSize.w + 28);
        expect(r.y - r.h / 2).toBeCloseTo(p.plate.y + s.plateSize.h / 2 - 0.45 * 15, 6);
        expect(css.match(/\.pn-plate-flag \{[^}]*\}/)?.[0]).toMatch(/translate: -50% 55%;[\s\S]*max-width: calc\(var\(--pn-plate-w\) \+ 28px\);[\s\S]*padding: 0 6px;[\s\S]*font-size: 11px;[\s\S]*line-height: 15px;/);
        expect(css).toContain('[data-pn-fit="tight"] :is(.pn-plate-flag, .pn-blind, .pn-open-seat) { font-size: 10px; }');
        expect(css).toContain('.pn-seat[data-pn-mark="discarding"] .pn-plate { outline: 2px dashed var(--pn-on-felt-soft); outline-offset: 1px; }');
    });
});

describe('a flight', () => {
    it('is the start as seen from where the element is drawn, in whole pixels', () => {
        expect(offset({x: 10, y: 20}, {x: 110, y: 70})).toEqual({dx: -100, dy: -50});
        expect(offset({x: 10.4, y: 20.6}, {x: 0, y: 0})).toEqual({dx: 10, dy: 21});
    });
});

// ── the pots ──

// The seat layer at the sizes the QA drives — 390 × 844, 375 × 667 and 320 × 568 phones upright (a
// seated player's, under the dock's cards, then a watcher's), 844 × 390 on its side (the dock in its
// own column, 562 × 294) and a 1440 × 900 desktop — and a little either side.
const POT_BOXES: Record<string, {w: number; h: number}[]> = {
    '390 × 844': [{w: 378, h: 590}, {w: 378, h: 617}, {w: 378, h: 650}, {w: 378, h: 727}],
    '375 × 667': [{w: 363, h: 420}, {w: 363, h: 440}, {w: 363, h: 470}, {w: 363, h: 550}],
    '320 × 568': [{w: 308, h: 340}, {w: 308, h: 352}, {w: 308, h: 384}, {w: 308, h: 451}],
    '844 × 390': [{w: 548, h: 280}, {w: 562, h: 294}, {w: 574, h: 300}],
    '1440 × 900': [{w: 1428, h: 680}, {w: 1428, h: 705}, {w: 1428, h: 740}],
};
// Smaller phones on their side, the dock in its column: 667 × 375, 640 × 360 and the smallest,
// 568 × 320, where nine seats crowd the felt.
const SIDEWAYS: Record<string, {w: number; h: number}> = {'667 × 375': {w: 442, h: 279}, '640 × 360': {w: 423, h: 264}, '568 × 320': {w: 364, h: 224}};
// One pot to four (five players all in for different stacks), the amounts' words as wide as a table
// makes them.
const POTS: number[][] = [[1_200], [600, 1_350], [600, 1_350, 3_700], [4_640, 12_820, 31_560, 1_250_000]];
const potsOf = (amounts: readonly number[]) => amounts.map((amount, pot) => ({pot, amount}));
const pillRects = (plan: PotPlan) => plan.pills.map((p) => ({name: `pill "${p.label}"`, r: p as Rect}));
// The widest bet line a table draws (three columns of chips, six figures) and the widest "+N".
const WIDE_BET = 119_800;
const WIDE_WIN = 1_250_000;

// What shows now: nothing yet; a third of the seats' bet lines out at their widest, every other one
// all in; or every hand but the viewer's turned up and two winners' "+N", the viewer's own seat's (or
// seat 0's) and the last seat's.
const NOWS = ['quiet', 'bets out', 'showdown'] as const;
const nowOf = (s: Stage, mine: number | null, kind: (typeof NOWS)[number]): PotNow => {
    const seated = s.seats.map((p) => p.seat);
    if (kind === 'quiet') return {shown: [], bets: [], pops: []};
    if (kind === 'bets out') return {shown: [], bets: seated.filter((seat) => seat % 3 === 1).map((seat) => ({seat, amount: WIDE_BET, allIn: seat % 2 === 0})), pops: []};
    return {shown: seated.filter((seat) => seat !== mine), bets: [], pops: [{seat: mine ?? 0, amount: WIDE_WIN}, {seat: seated.length - 1, amount: 95_400}]};
};

// Every seat taken and every hand but the viewer's reserved, as the table reserves them, the bet lines
// while there is a hand and none once there is not, with each of NOWS; and the table half empty.
// `handSize`: the cards a turned-up hand shows — two, or PLO's four.
const potSeens = (s: Stage, n: number, mine: number | null, handSize = 2): {name: string; seen: PotSeen}[] => {
    const seated = s.seats.map((p) => p.seat);
    const half = seated.filter((seat) => seat % 2 === 0);
    const out: {name: string; seen: PotSeen}[] = [];
    for (let button = 0; button < n; button++) {
        for (const kind of NOWS) {
            out.push({name: `full, button ${button}, ${kind}`, seen: {open: [], shown: seated.filter((seat) => seat !== mine), button, bets: seated, now: nowOf(s, mine, kind), handSize}});
        }
        out.push({name: `full, button ${button}, no hand`, seen: {open: [], shown: seated.filter((seat) => seat !== mine), button, bets: [], handSize}});
    }
    out.push({name: 'half', seen: {open: seated.filter((seat) => seat % 2 === 1), shown: half.filter((seat) => seat !== mine), button: 0, bets: half, handSize}});
    return out;
};

// Whether a pill lies on the felt inside its rail.
const onFelt = (s: Stage, r: Rect): boolean => {
    const span = feltSpan(s, r.y - r.h / 2, r.h);
    return span !== null && r.x - r.w / 2 >= span[0] - 0.5 && r.x + r.w / 2 <= span[1] + 0.5;
};

// A plan: inside the box, its pills apart, every pot in exactly one pill, each pill the plan's
// height; clear of everything it says it keeps clear of by the room it says it keeps (less a pixel
// either side of the rounding), on the felt when it says so.
const expectPotPlan = (s: Stage, amounts: readonly number[], seen: PotSeen, label: string): PotPlan => {
    const plan = potPlan(s, potsOf(amounts), seen)!;
    const pills = pillRects(plan);
    const avoid = plan.keeps === 'least' ? [] : potObstacles(s, seen, plan.keeps);
    expect(plan.clear, label).toBe(plan.keeps !== 'least');
    for (const {name, r} of pills) {
        expect(insideBox(r, s.box), `${label}: ${name} inside`).toBe(true);
        const hit = avoid.findIndex((o) => overlaps(r, o, plan.room - 1));
        expect(hit, `${label}: ${name} over obstacle ${hit} (keeps ${plan.keeps}, room ${plan.room})`).toBe(-1);
        expect(r.h).toBe(POT_PILL_H);
        if (plan.felt) expect(onFelt(s, r), `${label}: ${name} on the felt`).toBe(true);
    }
    for (let i = 0; i < pills.length; i++) for (let j = i + 1; j < pills.length; j++) {
        expect(overlaps(pills[i].r, pills[j].r), `${label}: ${pills[i].name} and ${pills[j].name}`).toBe(false);
    }
    // Every pot in exactly one pill.
    expect(plan.pills.flatMap((p) => p.pots).sort((a, b) => a - b), label).toEqual(amounts.map((_, i) => i));
    return plan;
};

describe('the pots', () => {
    for (const [size, boxes] of Object.entries(POT_BOXES)) for (const handSize of [2, 4]) {
        it(`clears every card, plate, bet line out, "+N" and the dealer button, on the felt, at ${size}, every seat count, one pot to four, every button, hands of ${handSize}`, () => {
            for (const box of boxes) for (const n of SEAT_COUNTS) for (const mine of [0, null]) {
                const s = stageLayout(box, n, mine, 1, {handSize});
                for (const {name, seen} of potSeens(s, n, mine, handSize)) for (const amounts of POTS) {
                    const label = `${box.w}×${box.h} ${n} seats, viewer ${mine}, ${name}, ${amounts.length} pots`;
                    const plan = expectPotPlan(s, amounts, seen, label);
                    // Never over what shows now — but for a winner's "+N" rising for a second and a half
                    // where nothing on the felt clears it — and always on the felt.
                    expect(seen.now?.pops.length ? ['all', 'hands', 'now', 'still'] : ['all', 'hands', 'now'], label).toContain(plan.keeps);
                    expect(plan.felt, label).toBe(true);
                    // On the desktop, clear of every bet line that may yet show too.
                    if (size === '1440 × 900') expect(plan.keeps, label).toBe('all');
                }
            }
        }, 60_000);
    }

    for (const [size, box] of Object.entries(SIDEWAYS)) for (const handSize of [2, 4]) {
        it(`stays inside the box and clear where it can at ${size}, every seat count, one pot to four, every button, hands of ${handSize}`, () => {
            for (const n of SEAT_COUNTS) for (const mine of [0, null]) {
                const s = stageLayout(box, n, mine, 1, {handSize});
                const lit = {x: s.board.x, y: s.board.y - 4, w: s.board.w + 4, h: s.board.h + 8};
                for (const {name, seen} of potSeens(s, n, mine, handSize)) for (const amounts of POTS) {
                    const label = `${box.w}×${box.h} ${n} seats, viewer ${mine}, ${name}, ${amounts.length} pots`;
                    const plan = expectPotPlan(s, amounts, seen, label);
                    if (size !== '568 × 320') expect(plan.clear, label).toBe(true);
                    if (plan.clear) continue;
                    // Nowhere clear: one pill, never over the board, a plate, a face-down pair or the
                    // dealer button.
                    expect(plan.pills.length, label).toBe(1);
                    const r = plan.pills[0];
                    const button = seen.button === null ? null : s.seats[seen.button].button;
                    expect(overlaps(r, lit), `${label}: over the board`).toBe(false);
                    for (const p of s.seats) {
                        expect(overlaps(r, {...p.plate, ...s.plateSize}), `${label}: over plate ${p.seat}`).toBe(false);
                        expect(overlaps(r, seatCardsRect(p, s)), `${label}: over seat ${p.seat}'s pair`).toBe(false);
                    }
                    if (button) expect(overlaps(r, {...button, w: s.buttonSize, h: s.buttonSize}), `${label}: over the button`).toBe(false);
                }
            }
        }, 60_000);
    }

    it('finds nine seats at 568 × 320 room on the screen for every pot — never the row of every pot across the board', () => {
        // The adversarial check's table: nine watched, four pots on the turn, then eight paid out with
        // every hand turned up.
        const s = stageLayout(SIDEWAYS['568 × 320'], 9, null);
        const seated = s.seats.map((p) => p.seat);
        const turn = expectPotPlan(s, [13_500, 36_000, 122_150, 60_000], {open: [], shown: seated, button: 0, bets: seated, now: nowOf(s, null, 'quiet')}, 'turn');
        expect(turn.clear).toBe(true);
        const bets: PotNow = {shown: [], bets: [1, 2, 3].map((seat) => ({seat, amount: 20_000, allIn: false})), pops: []};
        expectPotPlan(s, [13_500, 36_000, 122_150, 60_000], {open: [], shown: seated, button: 0, bets: seated, now: bets}, 'turn, bets out');
        const paid = [13_500, 36_000, 122_150, 226_800, 181_250, 122_000, 75_900, 95_400];
        const payout = expectPotPlan(s, paid, {open: [], shown: seated, button: 0, bets: seated, now: {shown: seated, bets: [], pops: [{seat: 0, amount: 579_700}]}}, 'payout');
        expect(payout.pills.length).toBe(1);
    });

    it('keeps clear of the bet lines out at the size they are drawn, where the checker found a pill over one', () => {
        const bets: PotNow = {shown: [], bets: [1, 2, 3].map((seat) => ({seat, amount: 20_000, allIn: false})), pops: []};
        for (const [box, mine] of [[{w: 308, h: 350}, 0], [{w: 308, h: 451}, null], [{w: 442, h: 279}, 0], [{w: 442, h: 279}, null], [{w: 378, h: 727}, null]] as const) {
            const s = stageLayout(box, 9, mine);
            const seated = s.seats.map((p) => p.seat);
            const seen: PotSeen = {open: [], shown: seated.filter((seat) => seat !== mine), button: 0, bets: seated, now: bets};
            const plan = expectPotPlan(s, [13_500, 36_000, 122_150, 60_000], seen, `${box.w}×${box.h}`);
            expect(plan.clear).toBe(true);
            for (const b of bets.bets) {
                const line = {...s.seats[b.seat].bet, ...betLineSize(s.fit, b.amount, b.allIn)};
                for (const {name, r} of pillRects(plan)) expect(overlaps(r, line), `${box.w}×${box.h}: ${name} over bet line ${b.seat}`).toBe(false);
            }
        }
    });

    it('moves a pill only when something lands where it is', () => {
        for (const box of [{w: 308, h: 350}, {w: 363, h: 438}, {w: 442, h: 279}, {w: 562, h: 294}]) for (const n of [4, 6, 9]) for (const mine of [0, null]) {
            const s = stageLayout(box, n, mine);
            const seated = s.seats.map((p) => p.seat);
            for (const amounts of POTS) {
                const seen: PotSeen = {open: [], shown: seated.filter((seat) => seat !== mine), button: 0, bets: seated, now: nowOf(s, mine, 'quiet')};
                const before = potPlan(s, potsOf(amounts), seen)!;
                for (const seat of seated) for (const allIn of [false, true]) {
                    const out: BetOut = {seat, amount: WIDE_BET, allIn};
                    const after = potPlan(s, potsOf(amounts), {...seen, now: {shown: [], bets: [out], pops: []}})!;
                    const line = {...s.seats[seat].bet, ...betLineSize(s.fit, out.amount, allIn)};
                    const label = `${box.w}×${box.h} ${n} seats, viewer ${mine}, ${amounts.length} pots, a bet line out at seat ${seat}${allIn ? ', all in' : ''}`;
                    // Where the pots are: the rows' box, which a plan keeps clear whole.
                    if (!overlaps(before.box, line, POT_CLEAR + 1)) expect(after, label).toEqual(before);
                    else if (after.clear) for (const p of after.pills) expect(overlaps(p, line, after.room - 1), label).toBe(false);
                }
            }
        }
    }, 60_000);

    it('keeps the winner\'s banner and the line under it clear of the pots it pays out and of the winners\' "+N", at every size', () => {
        const text: BannerText = {winners: TEXTS.split, note: TABLE_COPY.nextHandIn(99)};
        for (const boxes of Object.values(POT_BOXES)) for (const box of boxes) for (const n of SEAT_COUNTS) for (const mine of [0, null]) {
            const s = stageLayout(box, n, mine);
            const seated = s.seats.map((p) => p.seat);
            const shown = seated.filter((seat) => seat !== mine);
            for (const amounts of POTS) for (const button of [0, n - 1]) {
                const pops: WinPop[] = [{seat: mine ?? 0, amount: amounts.reduce((a, b) => a + b, 0)}];
                const pots = potPlan(s, potsOf(amounts), {open: [], shown, button, bets: seated, now: {shown, bets: [], pops}})!;
                const label = `${box.w}×${box.h} ${n} seats, viewer ${mine}, ${amounts.length} pots, button ${button}`;
                // Nine seats on the smallest phone held upright with every hand turned up: the side seats'
                // hands sit beside their plates (none over another plate), and the banner sits where the pot
                // was, flagged, as it does where nothing has room.
                if (box.w <= 308 && box.h <= 352 && n === 9) {
                    const crowded = bannerPlan(s, text, {open: [], shown, button, pots: pots.pills, pops});
                    expect(insideBox(pieceRect(crowded.banner), s.box), label).toBe(true);
                    continue;
                }
                const plan = expectClear(s, text, {open: [], shown, button, pots: pots.pills, pops}, label);
                for (const piece of piecesOf(plan)) for (const pill of pots.pills) {
                    expect(overlaps(piece.r, pill), `${label}: ${piece.name} over "${pill.label}"`).toBe(false);
                }
                for (const pop of pops) {
                    const rise = winPopRect(s.seats[pop.seat], s, shown.includes(pop.seat), pop.amount);
                    for (const piece of piecesOf(plan)) expect(overlaps(piece.r, rise), `${label}: ${piece.name} over the "+N"`).toBe(false);
                    for (const pill of pots.pills) expect(overlaps(pill, rise), `${label}: "${pill.label}" over the "+N"`).toBe(false);
                }
            }
        }
    }, 60_000);

    it('names every pot in full, in one row, where there is room, the chips on the main pot', () => {
        for (const n of SEAT_COUNTS) {
            const s = stageLayout({w: 1428, h: 705}, n, 0);
            const seated = s.seats.map((p) => p.seat);
            const plan = potPlan(s, potsOf(POTS[3]), {open: [], shown: seated.slice(1), button: 0, bets: seated})!;
            expect([plan.variant, plan.rows, plan.keeps], `${n}`).toEqual(['full', 1, 'all']);
            expect(plan.pills.map((p) => p.label)).toEqual([
                TABLE_COPY.mainPot(4_640), TABLE_COPY.sidePot(1, 12_820), TABLE_COPY.sidePot(2, 31_560), TABLE_COPY.sidePot(3, 1_250_000),
            ]);
            expect(plan.pills.map((p) => p.chips)).toEqual([true, false, false, false]);
            // Over the board, just clear of its lit cards, centred on it.
            expect(plan.box.y + plan.box.h / 2).toBeLessThanOrEqual(s.board.y - s.board.h / 2);
            expect(plan.box.x).toBe(Math.round(s.board.x));
        }
        const one = potPlan(stageLayout({w: 378, h: 617}, 4, 0), potsOf([1_200]), {open: [], shown: [1, 2, 3], button: 0, bets: [0, 1, 2, 3]})!;
        expect(one.pills.map((p) => [p.label, p.chips])).toEqual([[TABLE_COPY.pot(1_200), true]]);
    });

    it('turns to short words, then rows, then gathers the side pots, on a crowded small phone — every pot in one pill only last', () => {
        const s = stageLayout({w: 308, h: 352}, 9, 0);
        const seated = s.seats.map((p) => p.seat);
        const seen: PotSeen = {open: [], shown: seated.slice(1), button: 0, bets: []};
        const variants = POTS.map((amounts) => potPlan(s, potsOf(amounts), seen)!.variant);
        expect(variants[0]).not.toBe('total');
        expect(variants.slice(1).some((v) => v !== 'full')).toBe(true);
        // On a roomy phone, a pot's own pill for every pot.
        const roomy = stageLayout({w: 378, h: 617}, 6, 0);
        for (const amounts of POTS) {
            const plan = potPlan(roomy, potsOf(amounts), {open: [], shown: [1, 2, 3, 4, 5], button: 0, bets: [0, 1, 2, 3, 4, 5]})!;
            expect(['full', 'short']).toContain(plan.variant);
            expect(plan.pills.length).toBe(amounts.length);
        }
    });

    it('lays out every pot\'s words in the order it tries them', () => {
        const layouts = potLayouts(potsOf([600, 1_350, 3_700, 900]));
        expect(layouts.map((l) => `${l.variant}${l.rows.length}`)).toEqual(['full1', 'short1', 'short1', 'short2', 'short3', 'short4', 'gathered1', 'gathered2', 'gathered1', 'gathered2', 'total1']);
        expect(layouts[0].rows[0].map((p) => p.label)).toEqual([TABLE_COPY.mainPot(600), TABLE_COPY.sidePot(1, 1_350), TABLE_COPY.sidePot(2, 3_700), TABLE_COPY.sidePot(3, 900)]);
        expect(layouts[1].rows[0].map((p) => p.label)).toEqual([FELT_COPY.mainPot(600), FELT_COPY.sidePot(1, 1_350), FELT_COPY.sidePot(2, 3_700), FELT_COPY.sidePot(3, 900)]);
        expect(layouts[1].rows[0][0].chips && !layouts[2].rows[0][0].chips).toBe(true);
        // Rows as even as they go, the first the longer.
        expect(layouts[4].rows.map((r) => r.length)).toEqual([2, 1, 1]);
        // The side pots past the first two, then past the main pot, in one pill; then every pot in one.
        expect(layouts[6].rows[0].map((p) => [p.label, p.pots, p.amount])).toEqual([
            [FELT_COPY.mainPot(600), [0], 600], [FELT_COPY.sidePot(1, 1_350), [1], 1_350], [FELT_COPY.morePots(2, 4_600), [2, 3], 4_600],
        ]);
        expect(layouts[8].rows[0].map((p) => p.pots)).toEqual([[0], [1, 2, 3]]);
        expect(layouts[10].rows[0].map((p) => [p.label, p.pots, p.amount])).toEqual([[FELT_COPY.allPots(4, 6_550), [0, 1, 2, 3], 6_550]]);
        for (const l of layouts) {
            expect(l.h).toBe(l.rows.length * POT_PILL_H + (l.rows.length - 1) * POT_PILL.gap);
            for (const row of l.rows) for (const p of row) expect(potPillWidth(p.label, p.chips)).toBeLessThanOrEqual(l.w);
        }
        expect(potLayouts(potsOf([1_200])).map((l) => l.rows[0].map((p) => [p.label, p.chips]))).toEqual([[[TABLE_COPY.pot(1_200), true]], [[TABLE_COPY.pot(1_200), false]]]);
        expect(potPlan(stageLayout({w: 378, h: 617}, 4, 0), potsOf([0, 0]), {open: [], shown: [], button: null, bets: []})).toBeNull();
    });

    it('sends each pot\'s chips from its own pill, a gathered pot\'s from the pill it shares', () => {
        const plan = potPlan(stageLayout({w: 1428, h: 705}, 6, 0), potsOf([600, 1_350, 3_700]), {open: [], shown: [1, 2, 3, 4, 5], button: 0, bets: []})!;
        for (const pill of plan.pills) expect(potCentre(plan, pill.pots[0])).toEqual({x: pill.x, y: pill.y});
        expect(potCentre(plan, 9)).toEqual({x: plan.box.x, y: plan.box.y});
        const s = stageLayout({w: 308, h: 352}, 9, 0);
        const gathered = potPlan(s, potsOf(POTS[3]), {open: [], shown: s.seats.slice(1).map((p) => p.seat), button: 0, bets: []})!;
        for (let pot = 0; pot < 4; pot++) {
            const pill = gathered.pills.find((p) => p.pots.includes(pot))!;
            expect(potCentre(gathered, pot)).toEqual({x: pill.x, y: pill.y});
        }
    });

    it('sizes a pill\'s words no narrower than Inter draws them at 11 px bold', () => {
        // As the table draws them: 70.6, 90.2, 50.4, 66.0, 125.4 and 91.3 px.
        for (const [text, drawn] of [['Main pot 600', 70.6], ['Side pot 2: 3,700', 90.2], ['Main 600', 50.4], ['Side 1: 1,350', 66], ['3 more side pots: 5,050', 125.4], ['WWW MMM 888', 91.3]] as const) {
            expect(textWidth(text, POT_PILL.px, true), text).toBeGreaterThanOrEqual(drawn);
        }
    });

    it('sizes a bet line as ChipStack draws it, an all-in\'s pulse round it, and a winner\'s "+N" as it rises', () => {
        // 20,000: a column of four chips beside six mono figures; 119,800: three columns, the tallest of
        // four 25,000s; an all-in 11 px more a side, 7 more over and under.
        expect(betLineSize('tight', 20_000, false)).toEqual({w: Math.ceil(10 + 4 + 6 * 6.6), h: Math.ceil(16.5)});
        expect(betLineSize('tight', 119_800, false)).toEqual({w: Math.ceil(3 * 10 + 2 + 4 + 6 * 6.6), h: Math.ceil(16.5)});
        expect(betLineSize('comfortable', 200_000, true)).toEqual({w: Math.ceil(18 + 4 + 4 * 0.6 * 13 + 22), h: Math.ceil(18 * (0.42 + 7 * 0.24) + 14)});
        expect(betLineSize('compact', 1, false).w).toBeLessThan(betLineSize('compact', WIDE_BET, false).w);
        // Never narrower than the stage's own bet line once the chips are many.
        for (const fit of ['tight', 'compact', 'comfortable'] as const) expect(betLineSize(fit, WIDE_BET, true).w).toBeGreaterThan(BET[fit].w);
        // The "+N" over a plate, and over the cards a bottom seat turned up; a top seat's over its plate.
        const s = stageLayout({w: 378, h: 617}, 6, 0);
        const bottom = s.seats[0];
        const plain = winPopRect(bottom, s, false, 95_400);
        const plateTop = bottom.plate.y - s.plateSize.h / 2;
        expect(plain.y + plain.h / 2).toBeCloseTo(plateTop + WIN_POP.from, 6);
        expect(plain.y - plain.h / 2).toBeCloseTo(plateTop - WIN_POP.to - WIN_POP.px * WIN_POP.line, 6);
        expect(plain.w).toBe(Math.ceil(BANK_COPY.net(95_400).length * MONO_EM * WIN_POP.px));
        const over = winPopRect(bottom, s, true, 95_400);
        expect(over.y + over.h / 2).toBeCloseTo(plateTop - SHOWN_OFF.over - SHOWN_CARD_PX[s.fit] * CARD_RATIO + WIN_POP.from, 6);
        const top = s.seats.find((p) => p.spot.side === 'top')!;
        expect(winPopRect(top, s, true, 95_400)).toEqual(winPopRect(top, s, false, 95_400));
    });

    it('reads the felt inside its rail as a stadium: full width at its middle, narrowing round its ends', () => {
        for (const box of [{w: 1428, h: 705}, {w: 378, h: 727}]) {
            const s = stageLayout(box, 6, 0);
            const f = s.felt;
            const inner = {left: f.left + FELT_RAIL, right: f.left + f.width - FELT_RAIL, up: f.top + FELT_RAIL, down: f.top + f.height - FELT_RAIL};
            const r = Math.min(inner.right - inner.left, inner.down - inner.up) / 2;
            const mid = (inner.up + inner.down) / 2;
            // A thin band through the middle spans the whole inside width.
            const span = feltSpan(s, mid - 1, 2)!;
            expect(span[0]).toBeCloseTo(inner.left, 0);
            expect(span[1]).toBeCloseTo(inner.right, 0);
            // Leaving the felt: nothing.
            expect(feltSpan(s, inner.up - 1, 10)).toBeNull();
            expect(feltSpan(s, inner.down - 5, 10)).toBeNull();
            // Near an end, every corner of a rectangle the span holds lies inside the stadium.
            const top = inner.up + 4;
            const near = feltSpan(s, top, 20)!;
            expect(near[1] - near[0]).toBeLessThan(inner.right - inner.left);
            const wide = inner.right - inner.left >= inner.down - inner.up;
            for (const [x, y] of [[near[0], top], [near[1], top], [near[0], top + 20], [near[1], top + 20]]) {
                const cx = wide ? Math.min(Math.max(x, inner.left + r), inner.right - r) : (inner.left + inner.right) / 2;
                const cy = wide ? mid : Math.min(Math.max(y, inner.up + r), inner.down - r);
                expect(Math.hypot(x - cx, y - cy)).toBeLessThanOrEqual(r + 1e-6);
            }
        }
    });
});

// The sizes a script places things by (the emotes) are the stylesheet's own, per fit: the avatar
// (--pn-av), a turned-up card (--pn-show-w), the room over the table's top edge (.pn-table's top
// margin, --pn-show-w × 0.75); and an avatar's middle sits inside its plate, at the plate's left.
describe('the sizes shared with the stylesheet', () => {
    const css = readFileSync(fileURLToPath(new URL('../../../app/globals.css', import.meta.url)), 'utf8');
    const room = (fit: Fit): string =>
        (fit === 'compact' ? css.match(/\.pn-room \{[^}]*\}/) : css.match(new RegExp(`\\.pn-room\\[data-pn-fit="${fit}"\\] \\{[^}]*\\}`)))?.[0] ?? '';
    const px = (rule: string, name: string): number => Number(rule.match(new RegExp(`${name}: (\\d+)px`))?.[1]);

    it('reads the avatar and a shown card per fit, and the table\'s top room from them', () => {
        for (const fit of ['tight', 'compact', 'comfortable'] as const) {
            expect(px(room(fit), '--pn-av'), fit).toBe(AVATAR_PX[fit]);
            expect(px(room(fit), '--pn-show-w'), fit).toBe(SHOWN_CARD_PX[fit]);
            expect(TABLE_TOP_ROOM[fit], fit).toBe(SHOWN_CARD_PX[fit] * 0.75);
        }
        expect(css).toMatch(/\.pn-table \{[^}]*margin: calc\(var\(--pn-show-w\) \* 0\.75\) /);
        expect(css).toMatch(/\.pn-plate \{[^}]*padding: 3px 5px;/);
        expect(PLATE_PAD_X).toBe(5);
    });

    it("draws a pot's pill, a seat's face-down pair and a blind's mark at the sizes the pots' plan keeps clear of", () => {
        const rule = (selector: string): string => {
            const at = css.indexOf(`${selector} {`);
            return at < 0 ? '' : css.slice(at, css.indexOf('}', at));
        };
        const pill = rule('.pn-pot-pill');
        expect(pill).toContain(`gap: ${POT_PILL.chipsGap}px; padding: ${POT_PILL.pad.y}px ${POT_PILL.pad.x}px;`);
        expect(pill).toContain(`font-size: ${POT_PILL.px}px; line-height: ${POT_PILL.line}px; font-weight: 700;`);
        expect(pill).toContain(`overflow: hidden; --pn-chip: ${POT_PILL.chip}px;`);
        // At most three chips to a column (0.9 of a chip tall, inside the line) and CHIP_COLUMNS columns a pixel apart.
        expect(css).toContain('.pn-pot-pill .pn-chip-col > .pn-chip:nth-child(n + 4) { display: none; }');
        expect(rule('.pn-chips')).toContain('gap: 1px;');
        expect(CHIP_COLUMNS).toBe(3);
        expect(POT_PILL_H).toBe(POT_PILL.line + 2 * (POT_PILL.pad.y + BANNER.border));
        for (const fit of ['tight', 'compact', 'comfortable'] as const) expect(px(room(fit), '--pn-mini-w'), fit).toBe(MINI_CARD_PX[fit]);
        expect(rule('.pn-seat-cards')).toContain('top: calc(var(--pn-mini-w) * -0.45); right: 3px;');
        expect(css).toContain('.pn-seat-cards > * + * { margin-left: calc(var(--pn-mini-w) * -0.45); }');
        expect(css).toContain('.pn-seat-cards > :first-child { rotate: -7deg; }');
        expect(css).toContain('.pn-seat-cards > :last-child { rotate: 7deg; }');
        const blind = rule('.pn-blind');
        for (const part of ['left: 0;', 'top: 0;', 'translate: -30% -45%;', 'padding: 0 4px;', 'font-size: 11px;', 'line-height: 14px;']) expect(blind).toContain(part);
        // Two mono figures (0.62 em at most), the padding and the widest border inside the mark kept clear.
        expect(2 * 11 * 0.62 + 2 * 4 + 2 * BANNER.border).toBeLessThanOrEqual(BLIND_MARK.w);
        expect(14 + 2 * BANNER.border).toBeLessThanOrEqual(BLIND_MARK.h);
        // The pair and the mark where those rules put them, on every plate.
        const s = stageLayout({w: 378, h: 617}, 6, 0);
        for (const p of s.seats) {
            const w = MINI_CARD_PX[s.fit];
            const pair = seatCardsRect(p, s);
            const plateTop = p.plate.y - s.plateSize.h / 2;
            const plateRight = p.plate.x + s.plateSize.w / 2;
            expect(pair.x + pair.w / 2).toBeGreaterThanOrEqual(plateRight - 3 + 0.08 * w);
            expect(pair.x - pair.w / 2).toBeLessThanOrEqual(plateRight - 3 - 1.55 * w - 0.08 * w);
            expect(pair.y - pair.h / 2).toBeLessThanOrEqual(plateTop - 0.45 * w - 0.056 * w);
            expect(pair.y + pair.h / 2).toBeGreaterThanOrEqual(plateTop + 0.95 * w + 0.056 * w);
            const mark = blindRect(p, s);
            expect(mark.x - mark.w / 2).toBeCloseTo(p.plate.x - s.plateSize.w / 2 - 0.3 * BLIND_MARK.w, 6);
            expect(mark.y - mark.h / 2).toBeCloseTo(plateTop - 0.45 * BLIND_MARK.h, 6);
        }
    });

    it('lifts three or four cards face down a whole width over a compact or tight plate, above the stack\'s figures; a pair, and any number on a roomy plate, where they were', () => {
        expect(css).toContain(':is([data-pn-fit="compact"], [data-pn-fit="tight"]) .pn-seat-cards:is([data-count="3"], [data-count="4"]) { top: calc(var(--pn-mini-w) * -1); }');
        expect([SEAT_CARDS_OVER.pair, SEAT_CARDS_OVER.more]).toEqual([0.45, 1]);
        for (const box of [{w: 378, h: 617}, {w: 308, h: 340}, {w: 1428, h: 705}]) {
            const s = stageLayout(box, 6, 0);
            const w = MINI_CARD_PX[s.fit];
            for (const p of s.seats) {
                const pair = seatCardsRect(p, s);
                expect(seatCardsRect(p, s, 2)).toEqual(pair);
                for (const count of [3, 4]) {
                    const more = seatCardsRect(p, s, count);
                    for (const k of ['x', 'w', 'h'] as const) expect(more[k]).toBeCloseTo(pair[k], 6);
                    if (s.fit === 'comfortable') expect(more).toEqual(pair);
                    else {
                        expect(more.y).toBeCloseTo(pair.y - (SEAT_CARDS_OVER.more - SEAT_CARDS_OVER.pair) * w, 6);
                        // The foot of the fan 0.4 of a width into the plate (a turned card's corner and the
                        // pixel round it below that): above the figures, level with the avatar's middle.
                        const plateTop = p.plate.y - s.plateSize.h / 2;
                        expect(more.y + more.h / 2).toBeCloseTo(plateTop + 0.46 * w + 1, 6);
                        expect(more.y + more.h / 2).toBeLessThan(avatarCentre(p, s).y - 11 * 1.15 / 2);
                    }
                }
            }
        }
    });

    it('draws a bet line, an all-in\'s pulse, a winner\'s "+N" and the felt\'s rail at the sizes the pots\' plan keeps clear of', () => {
        const rule = (selector: string): string => {
            const at = css.indexOf(`${selector} {`);
            return at < 0 ? '' : css.slice(at, css.indexOf('}', at));
        };
        const chipStack = readFileSync(fileURLToPath(new URL('../../../components/poker-night/ChipStack.tsx', import.meta.url)), 'utf8');
        // The chips: --pn-chip wide, 0.42 of that tall, each one more 0.18 under the last; the columns a
        // pixel apart, 4 px (gap-1) from the count.
        for (const fit of ['tight', 'compact', 'comfortable'] as const) expect(px(room(fit), '--pn-chip'), fit).toBe(CHIP_PX[fit]);
        expect(rule('.pn-chip')).toContain('width: var(--pn-chip);\n    height: calc(var(--pn-chip) * 0.42);'.replace(/\n/g, css.includes('\r\n') ? '\r\n' : '\n'));
        expect(css).toContain('.pn-chip-col > .pn-chip + .pn-chip { margin-bottom: calc(var(--pn-chip) * -0.18); }');
        expect(rule('.pn-chips')).toContain('gap: 1px;');
        expect(chipStack).toContain("cn('inline-flex items-center gap-1', className)");
        // The count in the mono face at --pn-amount (11 px but where a fit sets it), on the page's line.
        expect(rule('.pn-chip-amount')).toContain('font-family: var(--type-mono); font-weight: 700; font-size: var(--pn-amount, 11px);');
        for (const fit of ['tight', 'compact'] as const) {
            expect(room(fit)).not.toContain('--pn-amount');
            expect(AMOUNT_PX[fit]).toBe(11);
        }
        expect(px(room('comfortable'), '--pn-amount')).toBe(AMOUNT_PX.comfortable);
        // Every visual style's mono face is JetBrains Mono or IBM Plex Mono: 0.6 em a character.
        expect(new Set([...css.matchAll(/--type-mono: var\((--font-[a-z-]+)\)/g)].map((m) => m[1]))).toEqual(new Set(['--font-jetbrains', '--font-plex-mono']));
        expect(MONO_EM).toBe(0.6);
        // An all-in's line: 4 px a side inside a 2 px outline breathing out to 5 px.
        expect(css).toContain(`.pn-bet.pn-pulse { outline: ${PULSE.outline}px solid var(--warning); border-radius: 9999px; padding-inline: ${PULSE.pad}px; }`);
        expect(css).toMatch(new RegExp(`@keyframes pn-pulse \\{[^}]*\\}\\s*50% \\{ outline-offset: ${PULSE.offset}px; \\}`));
        // The "+N": the mono face at 13 px, from 6 px under its place to 18 px over it, its place on the
        // plate's top or over the cards a side or bottom seat turned up.
        expect(rule('  .pn-win-pop-text')).toContain('font-family: var(--type-mono);');
        expect(rule('  .pn-win-pop-text')).toContain(`font-size: ${WIN_POP.px}px;`);
        expect(rule('  .pn-win-pop-text')).toContain('translate: -50% -100%;');
        expect(css).toContain(`0% { transform: translateY(${WIN_POP.from}px); opacity: 0; }`);
        expect(css).toContain(`80% { transform: translateY(-${WIN_POP.to}px); opacity: 1; }`);
        expect(css).toContain(`.pn-seat[data-shown]:not([data-side="top"]) .pn-win-pop-text { top: calc(var(--pn-show-w) * -${CARD_RATIO} - ${SHOWN_OFF.over}px); }`);
        // The felt's rail at its widest.
        expect(rule('.pn-felt')).toContain(`border: clamp(6px, 1.4vmin, ${FELT_RAIL}px) solid var(--pn-rail);`);
    });

    it('finds every avatar inside its plate, at the plate\'s left', () => {
        for (const box of BOXES) {
            for (const n of SEAT_COUNTS) {
                const s = stageLayout(box, n, 0);
                for (const p of s.seats) {
                    const c = avatarCentre(p, s);
                    const av = AVATAR_PX[s.fit];
                    const left = p.plate.x - s.plateSize.w / 2;
                    const top = p.plate.y - s.plateSize.h / 2;
                    expect(Math.abs(c.x - av / 2 - left - PLATE_PAD_X)).toBeLessThanOrEqual(0.5);
                    expect(c.y - av / 2).toBeGreaterThanOrEqual(top);
                    expect(c.y + av / 2).toBeLessThanOrEqual(top + s.plateSize.h);
                    expect(c.x + av / 2).toBeLessThan(p.plate.x + s.plateSize.w / 2);
                }
            }
        }
    });
});


// ── the winner's banner ──

// The seat layer at the sizes the QA drives — 390 × 844, 375 × 667 and 320 × 568 phones upright and
// a 1440 × 900 desktop, the box left between the top bar and the dock — and a little either side.
const BANNER_BOXES: Record<string, {w: number; h: number}[]> = {
    '390 × 844': [{w: 378, h: 590}, {w: 378, h: 617}, {w: 378, h: 650}],
    '375 × 667': [{w: 363, h: 420}, {w: 363, h: 440}, {w: 363, h: 470}],
    '320 × 568': [{w: 308, h: 340}, {w: 308, h: 352}, {w: 308, h: 384}],
    '1440 × 900': [{w: 1428, h: 680}, {w: 1428, h: 705}, {w: 1428, h: 740}],
};

const threesFull = HAND_COPY.label({category: 6, ranks: [1, 3]});
const flush = HAND_COPY.label({category: 5, ranks: [12, 10, 8, 4, 2]});
// One winner, the viewer; one with a long name and a hand that plays the board; a pot split three ways.
const shortWins = (name: string) => ({lead: '', name: TABLE_COPY.bannerShortNames([name]), tail: TABLE_COPY.bannerShortWins});
const TEXTS: Record<string, BannerText['winners']> = {
    you: [{head: TABLE_COPY.bannerYou(70), short: {lead: TABLE_COPY.bannerShortYou, name: '', tail: ''}, hand: threesFull}],
    long: [{head: TABLE_COPY.banner('Bartholomew Q.', 123_456), short: shortWins('Bartholomew Q.'), hand: `${HAND_COPY.label({category: 6, ranks: [5, 1]})} · ${HAND_COPY.playsBoard}`}],
    split: ['Ana', 'Cleo', 'Dinosaur'].map((name) => ({head: TABLE_COPY.banner(name, 1_200), short: shortWins(name), hand: flush})),
};
const NOTES = [TABLE_COPY.nextHandIn(99), TABLE_COPY.paused, TABLE_COPY.waitingForPlayers, null];

const piecesOf = (plan: BannerPlan): {name: string; r: Rect}[] => [
    {name: 'banner', r: pieceRect(plan.banner)},
    ...(plan.note ? [{name: 'note', r: pieceRect(plan.note)}] : []),
];

// A plan clears every obstacle by the room it keeps (less a pixel), inside the box, the banner and
// the line apart, neither narrower than a few letters.
const expectClear = (s: Stage, text: BannerText, seen: BannerSeen, label: string): BannerPlan => {
    const plan = bannerPlan(s, text, seen);
    expect(plan.clear, label).toBe(true);
    const avoid = bannerObstacles(s, seen);
    for (const {name, r} of piecesOf(plan)) {
        expect(insideBox(r, s.box), `${label}: ${name} inside`).toBe(true);
        expect(r.w, `${label}: ${name} width`).toBeGreaterThanOrEqual(4 * BANNER.compact.px);
        const hit = avoid.findIndex((o) => overlaps(r, o, BANNER.clear - 1));
        expect(hit, `${label}: ${name} over obstacle ${hit}`).toBe(-1);
    }
    if (plan.note) expect(overlaps(pieceRect(plan.banner), pieceRect(plan.note)), `${label}: banner over note`).toBe(false);
    expect(plan.rows).toBeGreaterThanOrEqual(1);
    expect(plan.rows).toBeLessThanOrEqual(Math.min(BANNER.rows, text.winners.length));
    return plan;
};

describe("the winner's banner", () => {
    it('in the pause after a hand, never stands over a plate for the pots and "+N" that have left: clear of the table alone where nothing clears them too', () => {
        const text: BannerText = {
            winners: [{head: TABLE_COPY.banner('Hana', 40), short: {lead: '', name: TABLE_COPY.bannerShortNames(['Hana']), tail: TABLE_COPY.bannerShortWins}, hand: threesFull}],
            note: TABLE_COPY.paused,
        };
        let rescued = 0;
        for (const [w, from, to] of [[364, 205, 240], [308, 330, 370], [442, 260, 300]] as const) for (let h = from; h <= to; h += 5) for (const n of [6, 7, 8, 9]) {
            for (let mine = 0; mine < n; mine += 2) for (const button of [mine, (mine + 1) % n]) for (const open of [[], [(mine + 2) % n, (mine + 3) % n, (mine + 4) % n]]) {
                const s = stageLayout({w, h}, n, mine, 1, {open});
                const seated = s.seats.map((p) => p.seat).filter((seat) => !open.includes(seat));
                const pops: WinPop[] = [{seat: seated.find((seat) => seat !== mine) ?? mine, amount: 40}];
                const pots = potPlan(s, potsOf([40]), {open, shown: [], button, bets: seated, now: {shown: [], bets: [], pops}, handSize: 2});
                const seen: BannerSeen = {open, shown: [], button, pots: pots?.pills ?? [], pops, handSize: 2};
                const label = `${w}×${h} ${n} seats, viewer ${mine}, button ${button}, open ${open.join()}`;
                const plan = resultBannerPlan(s, text, seen);
                const busy = bannerPlan(s, text, seen);
                // Clear of the pots and the "+N" where that leaves room: the same plan.
                if (busy.clear) expect(plan, label).toEqual(busy);
                // Else clear of the table alone wherever the table leaves room.
                else if (bannerPlan(s, text, {...seen, pots: [], pops: []}).clear) {
                    expect(plan.clear, label).toBe(true);
                    for (const r of [pieceRect(plan.banner), ...(plan.note ? [pieceRect(plan.note)] : [])]) {
                        for (const o of bannerObstacles(s, {...seen, pots: [], pops: []})) expect(overlaps(r, o, BANNER.clear - 1), label).toBe(false);
                    }
                    rescued++;
                }
            }
        }
        // The smallest phone on its side, eight seats: where the fallback once sat on a plate.
        expect(rescued).toBeGreaterThan(0);
        // With nothing paying out, nothing more to drop.
        const s = stageLayout({w: 364, h: 216}, 8, 3, 1, {open: [5, 6, 7]});
        const seen: BannerSeen = {open: [5, 6, 7], shown: [], button: 3, handSize: 2};
        expect(resultBannerPlan(s, text, seen)).toEqual(bannerPlan(s, text, seen));
        expect(resultBannerPlan(s, text, seen).clear).toBe(true);
    });

    for (const [size, boxes] of Object.entries(BANNER_BOXES)) for (const handSize of [2, 4]) {
        it(`clears every plate, turned-up hand (of ${handSize}), the dealer button and the board at ${size}, every seat count and button`, () => {
            for (const box of boxes) for (const n of SEAT_COUNTS) for (const mine of [0, null]) {
                const s = stageLayout(box, n, mine, 1, {handSize});
                // Every seat taken and every hand but the viewer's turned up on the felt (a watcher's
                // seat 0 too), the most a showdown shows; and the table half empty. Texas hold'em's
                // two cards a hand, and PLO's four.
                const full: BannerSeen = {open: [], shown: s.seats.filter((p) => p.seat !== mine).map((p) => p.seat), button: 0, handSize};
                const half: BannerSeen = {
                    open: s.seats.filter((p) => p.seat % 2 === 1).map((p) => p.seat),
                    shown: s.seats.filter((p) => p.seat % 2 === 0 && p.seat !== mine).map((p) => p.seat), button: 0, handSize,
                };
                for (const [name, winners] of Object.entries(TEXTS)) {
                    // Each winner's "+N" rising over their seat: the viewer's own (or seat 0's), the
                    // last seat's, or the first three seats'.
                    const won = (seats: number[]): WinPop[] => seats.slice(0, winners.length).map((seat) => ({seat, amount: 123_456}));
                    const fullPops = won(name === 'you' ? [mine ?? 0] : name === 'long' ? [n - 1] : [0, 1, 2].filter((seat) => seat < n));
                    const halfPops = won(name === 'long' ? [0] : [0, 2, 4].filter((seat) => seat < n));
                    for (const note of NOTES) {
                        if (name !== 'you' && note !== NOTES[0]) continue;
                        for (let button = 0; button < n; button++) {
                            expectClear(s, {winners, note}, {...full, button, pops: fullPops}, `${box.w}×${box.h} ${n} seats, viewer ${mine}, ${name}, ${note}, button ${button}`);
                        }
                        expectClear(s, {winners, note}, {...half, pops: halfPops}, `${box.w}×${box.h} ${n} seats half empty, viewer ${mine}, ${name}, ${note}`);
                    }
                }
            }
        }, 60_000);
    }

    it('hangs the full banner and its line where the pot was, centred, when there is room', () => {
        for (const [box, n] of [[{w: 378, h: 617}, 2], [{w: 378, h: 617}, 4], [{w: 1428, h: 705}, 6], [{w: 1428, h: 705}, 9]] as const) {
            const s = stageLayout(box, n, 0);
            const plan = bannerPlan(s, {winners: TEXTS.you, note: TABLE_COPY.nextHandIn(99)}, {open: [], shown: s.seats.filter((p) => p.seat !== 0).map((p) => p.seat), button: 0});
            expect(plan.variant, `${box.w} ${n}`).toBe('full');
            expect(plan.banner.x).toBe(s.board.x);
            expect(plan.note?.x).toBe(s.board.x);
            expect(plan.note!.top).toBe(plan.banner.top + plan.banner.height + BANNER.note.gap);
            const up = s.pot.y <= s.board.y;
            if (up) expect(plan.note!.top + plan.note!.height).toBeLessThanOrEqual(s.board.y - s.board.h / 2);
            else expect(plan.banner.top).toBeGreaterThanOrEqual(s.board.y + s.board.h / 2);
        }
    });

    it('gives up the full banner on a crowded small phone, and names every winner where there is room', () => {
        const s = stageLayout({w: 308, h: 352}, 9, 0);
        const seen: BannerSeen = {open: [], shown: s.seats.filter((p) => p.seat !== 0).map((p) => p.seat), button: 1};
        expect(expectClear(s, {winners: TEXTS.you, note: TABLE_COPY.nextHandIn(99)}, seen, 'crowded').variant).not.toBe('full');
        const roomy = stageLayout({w: 1428, h: 705}, 9, 0);
        const plan = bannerPlan(roomy, {winners: TEXTS.split, note: null}, {...seen, button: 0});
        expect([plan.variant, plan.rows]).toEqual(['full', 3]);
    });

    it('sits where the pot was, flagged, when nothing has room', () => {
        const s = stageLayout({w: 308, h: 352}, 9, 0);
        const crowded = {...s, board: {...s.board, w: 300, h: 340, y: 176}};
        const plan = bannerPlan(crowded, {winners: TEXTS.you, note: null}, {open: [], shown: [], button: null});
        expect(plan.clear).toBe(false);
        expect(plan.banner.x).toBe(s.board.x);
    });

    it('never cuts inside a number or a board\'s name: cut short, a head loses its chips, then the banner names fewer boards, and only then a name shrinks to a letter and an ellipsis', () => {
        const chrome = 2 * (BANNER.compact.pad.x + BANNER.border);
        const w = (text: string) => textWidth(text, BANNER.compact.px, true);
        for (const box of [{w: 363, h: 420}, {w: 308, h: 340}, {w: 562, h: 294}, {w: 442, h: 279}, {w: 364, h: 224}, {w: 378, h: 617}]) for (const n of SEAT_COUNTS) for (const boards of [2, 3]) {
            const s = stageLayout(box, n, 0, boards);
            const shown = s.seats.filter((p) => p.seat !== 0).map((p) => p.seat);
            for (const name of ['Hana', 'Dinosaur Q.']) for (const amount of [27, 123_456]) {
                const text: BannerText = {
                    winners: Array.from({length: boards}, (_, k) => ({
                        head: TABLE_COPY.bannerBoard(k, name, amount), short: {lead: TABLE_COPY.bannerShortBoard(k), name: TABLE_COPY.bannerShortNames([name]), tail: ''}, hand: flush,
                    })),
                    note: TABLE_COPY.nextHandIn(99),
                };
                const plan = bannerPlan(s, text, {open: [], shown, button: 0, handSize: 4});
                const label = `${box.w}×${box.h} ${n} seats, ${boards} boards, ${name} ${amount}: ${plan.variant}${plan.short ? ' short' : ''}, ${plan.rows} rows`;
                if (plan.variant !== 'cut' || !plan.clear) continue;
                const named = text.winners.slice(0, plan.rows);
                if (!plan.short) expect(plan.banner.width, label).toBeGreaterThanOrEqual(chrome + Math.max(...named.map((l) => w(l.head))) + textWidth(' …', BANNER.compact.px));
                else {
                    expect(plan.banner.width, label).toBeGreaterThanOrEqual(chrome + Math.max(...named.map((l) => w(l.short!.lead) + Math.min(w(l.short!.name), w('W…')))));
                    // A name is cut only where not even one board's whole short head has room.
                    if (plan.banner.width < chrome + Math.max(...named.map((l) => w(`${l.short!.lead}${l.short!.name}`)))) {
                        const one = bannerPlan(s, {...text, winners: text.winners.slice(0, 1)}, {open: [], shown, button: 0, handSize: 4});
                        expect(one.variant === 'cut' && one.short && one.banner.width < chrome + w(`${text.winners[0].short!.lead}${text.winners[0].short!.name}`), label).toBe(true);
                    }
                }
            }
        }
        // The finding's phones: a 375 × 667 and a 320 × 568, three boards, every board won by another.
        for (const box of [{w: 363, h: 420}, {w: 308, h: 340}]) {
            const s = stageLayout(box, 8, 0, 3);
            const text: BannerText = {
                winners: ['Hana', 'Amy', 'Bo'].map((name, k) => ({head: TABLE_COPY.bannerBoard(k, name, 27), short: {lead: TABLE_COPY.bannerShortBoard(k), name: TABLE_COPY.bannerShortNames([name]), tail: ''}, hand: flush})),
                note: TABLE_COPY.nextHandIn(9),
            };
            const plan = bannerPlan(s, text, {open: [1, 2, 3, 4], shown: [5, 6, 7], button: 0, handSize: 4});
            expect(plan.clear).toBe(true);
            if (plan.variant === 'cut') expect(plan.banner.width).toBeGreaterThanOrEqual(chrome + w(`${TABLE_COPY.bannerShortBoard(0)}${TABLE_COPY.bannerShortNames(['Hana'])}`));
        }
    });

    it('keeps the line under the banner off the winner\'s "+N" — heads up at a nine-seat table, a phone on its side', () => {
        const s = stageLayout({w: 442, h: 279}, 9, 0);
        for (const button of [0, 1]) for (const shown of [[], [1]]) {
            const label = `button ${button}, shown ${shown.join()}`;
            const plan = expectClear(s, {winners: TEXTS.you, note: TABLE_COPY.nextHandIn(99)}, {open: [2, 3, 4, 5, 6, 7, 8], shown, button, pops: [{seat: 0, amount: 127_400}]}, label);
            const rise = winPopRect(s.seats[0], s, false, 127_400);
            for (const piece of piecesOf(plan)) expect(overlaps(piece.r, rise), `${label}: ${piece.name}`).toBe(false);
        }
    });

    it('gives the turned-up hands and the open seats their drawn sizes', () => {
        // PLO's four overlap: 75 px on a compact table, 64 tight, 107 comfortable.
        expect([shownHandWidth('compact', 4), shownHandWidth('tight', 4), shownHandWidth('comfortable', 4)].map(Math.round)).toEqual([75, 64, 107]);
        for (const box of BOXES) {
            const s = stageLayout(box, 9, 0);
            for (const p of s.seats) {
                const r = shownHandRect(p, s);
                const card = SHOWN_CARD_PX[s.fit];
                expect(r.w).toBe(2 * card + SHOWN_OFF.gap + 4);
                const four = shownHandRect(p, s, 4);
                expect(four.w).toBeCloseTo(card * (1 + 3 * SHOWN_STEP) + 4, 6);
                expect([four.x, four.y, four.h]).toEqual([r.x, r.y, r.h]);
                expect(r.h).toBeCloseTo(card * CARD_RATIO + 8, 6);
                const plateTop = p.plate.y - s.plateSize.h / 2;
                const plateBottom = p.plate.y + s.plateSize.h / 2;
                // Where it is drawn before the stage moves it (shownDy: off a crowded column's plates).
                if (p.spot.side === 'top') expect(r.y + r.h / 2 - p.shownDy).toBeCloseTo(plateBottom + SHOWN_OFF.under + card * CARD_RATIO, 6);
                else expect(r.y + r.h / 2 - p.shownDy).toBeCloseTo(plateTop - SHOWN_OFF.over, 6);
            }
            expect(openSeatPx(s)).toBe(Math.max(44, s.plateSize.h * 0.95));
        }
    });

    it('wraps words as a browser fills a line, breaking a word wider than the line', () => {
        expect(wrappedLines([30, 30, 30], 4, 100)).toBe(1);
        expect(wrappedLines([30, 30, 30], 4, 90)).toBe(2);
        expect(wrappedLines([30, 30, 30], 4, 30)).toBe(3);
        expect(wrappedLines([250], 4, 100)).toBe(3);
        expect(wrappedLines([250, 20], 4, 100)).toBe(3);
        expect(wrappedLines([250, 60], 4, 100)).toBe(4);
    });

    it("estimates a line no narrower than the app's faces draw it, the marks that isolate a name taking no room", () => {
        // As Hanken Grotesk draws them on the table: 156 px and 71 px.
        expect(textWidth('Full house, threes full of fives', 12)).toBeGreaterThanOrEqual(156);
        expect(textWidth(TABLE_COPY.bannerYou(70), 14, true)).toBeGreaterThanOrEqual(71);
        expect(textWidth(TABLE_COPY.banner('Ana', 5), 12)).toBe(textWidth('Ana wins 5', 12));
        expect(textWidth('WWW', 12)).toBeGreaterThan(textWidth('iii', 12));
    });
});

// The banner's sizes are the stylesheet's.
describe("the banner's sizes in the stylesheet", () => {
    const css = readFileSync(fileURLToPath(new URL('../../../app/globals.css', import.meta.url)), 'utf8');
    const rule = (selector: string): string => {
        const at = css.indexOf(`${selector} {`);
        return at < 0 ? '' : css.slice(at, css.indexOf('}', at));
    };
    const screen = readFileSync(fileURLToPath(new URL('../../../components/poker-night/TableScreen.tsx', import.meta.url)), 'utf8');
    const pad = (r: string) => r.match(/padding: (\d+)px (\d+)px;/)?.slice(1).map(Number);
    const gap = (r: string) => Number(r.match(/gap: (\d+)px;/)?.[1]);

    it('pads, spaces and sets the lines the plan sizes it by', () => {
        expect(pad(rule('.pn-banner'))).toEqual([BANNER.full.pad.compact.y, BANNER.full.pad.compact.x]);
        expect(gap(rule('.pn-banner'))).toBe(BANNER.full.rowGap.compact);
        expect(pad(rule('[data-pn-fit="tight"] .pn-banner'))).toEqual([BANNER.full.pad.tight.y, BANNER.full.pad.tight.x]);
        expect(gap(rule('[data-pn-fit="tight"] .pn-banner'))).toBe(BANNER.full.rowGap.tight);
        expect(rule('.pn-banner .pn-avatar')).toContain(`--pn-av-size: ${BANNER.full.avatar.compact}px`);
        expect(rule('[data-pn-fit="tight"] .pn-banner .pn-avatar')).toContain(`--pn-av-size: ${BANNER.full.avatar.tight}px`);
        expect(gap(rule('.pn-banner-row'))).toBe(BANNER.full.avatarGap);
        expect(rule('.pn-banner-head')).toContain(`font-size: ${BANNER.full.head.px}px; line-height: ${BANNER.full.head.line}px`);
        expect(rule('.pn-banner-hand')).toContain(`font-size: ${BANNER.full.hand.px}px; line-height: ${BANNER.full.hand.line}px`);
        expect(pad(rule('.pn-banner:not([data-variant="full"])'))).toEqual([BANNER.compact.pad.y, BANNER.compact.pad.x]);
        expect(gap(rule('.pn-banner:not([data-variant="full"])'))).toBe(BANNER.compact.rowGap);
        expect(rule('.pn-banner-line')).toContain(`font-size: ${BANNER.compact.px}px; line-height: ${BANNER.compact.line}px; overflow-wrap: anywhere`);
        // The line's pill: px-3 py-0.5 text-xs, 12 px on 16.
        expect(screen).toMatch(/const PILL = '[^']*\bpx-3 py-0\.5 text-xs\b/);
        expect([BANNER.note.pad.x, BANNER.note.pad.y, BANNER.note.px, BANNER.note.line]).toEqual([12, 2, 12, 16]);
        // No visual style draws a chrome border wider than the plan allows for.
        const borders = [...css.matchAll(/--chrome-border: (\d+)px/g)].map((m) => Number(m[1]));
        expect(borders.length).toBeGreaterThan(0);
        expect(Math.max(...borders)).toBeLessThanOrEqual(BANNER.border);
    });

    it('brings the banner in where it lands, growing from its middle, so on its way in it covers nothing its place does not', () => {
        const drop = css.match(/@keyframes pn-banner-drop \{[^}]*\}\s*\}/)?.[0] ?? '';
        expect(drop).toContain('from { transform: scale(0.9); opacity: 0; }');
        expect(drop).not.toMatch(/translate|top:|left:|margin/);
        expect(rule('.pn-banner')).not.toContain('transform-origin');
    });

    it('turns cards up and lifts the five that play where the plan expects them', () => {
        // A hand of four overlaps by what SHOWN_STEP leaves of a card.
        expect(css).toContain(`.pn-seat-shown[data-count="3"] > * + *, .pn-seat-shown[data-count="4"] > * + * { margin-left: calc(var(--pn-card-w) * -${Number((1 - SHOWN_STEP).toFixed(2))}); }`);
        expect(css).toContain('.pn-seat-shown[data-count="3"], .pn-seat-shown[data-count="4"] { gap: 0; }');
        expect(rule('.pn-seat-shown')).toContain(`bottom: calc(100% + ${SHOWN_OFF.over}px)`);
        expect(rule('.pn-seat-shown')).toContain(`gap: ${SHOWN_OFF.gap}px`);
        expect(rule('.pn-seat[data-side="top"] .pn-seat-shown')).toContain(`top: calc(100% + ${SHOWN_OFF.under}px)`);
        expect(rule('.pn-card[data-state="win"] > .pn-card-inner')).toContain('translateY(-6px)');
        expect(rule('.pn-card[data-state="win"] > .pn-card-inner')).toContain('0 0 0 2px');
    });
});

describe("a plate's menu", () => {
    it('opens toward the middle of the table: up from every plate below the centre, down from every other', () => {
        for (const box of BOXES) {
            for (const n of SEAT_COUNTS) {
                const s = stageLayout(box, n, 0);
                for (const p of s.seats) expect(menuSide(p, s), `${box.w}x${box.h}, ${n} seats, seat ${p.seat}`).toBe(p.plate.y > s.centre.y ? 'top' : 'bottom');
                // The viewer's own plate sits at the foot: a menu from it (or a neighbour there) opens upward.
                expect(menuSide(s.seats[0], s)).toBe('top');
                // A plate along the top opens downward.
                const top = s.seats.reduce((a, b) => (b.plate.y < a.plate.y ? b : a));
                expect(menuSide(top, s)).toBe('bottom');
            }
        }
    });
});

// ── two and three boards (PLO, P6) ──
//
// The spike before them measured every phone's seat layer at every seat count, the boards clear of
// every hand of four that may turn up: the cards (the narrowest of a seated viewer's table and a
// watcher's) come out at 19 px or more on every upright phone 360 px wide or more (26 up to seven
// seats), 16 px or more on a 320 px one (20 up to seven seats), 20 px or more on a phone on its side,
// 60 px or more on a desktop — and on the smallest phone on its side, 568 × 320, at 14 px, where with
// seven to nine seats nothing fits at all. The boards sheet (components/poker-night/BoardsSheet)
// shows them at 44 px wherever that is small.

const BOARD_BOXES = [...BOXES, ...Object.values(POT_BOXES).flat(), ...Object.values(SIDEWAYS)];

// Every board's row and numeral as drawn.
const boardRects = (s: Stage): {name: string; r: Rect}[] => s.boards.flatMap((b) => [
    {name: `board ${b.index}`, r: b as Rect},
    ...(b.label ? [{name: `label ${b.index}`, r: {...b.label, w: BOARD_LABEL[s.fit].w, h: BOARD_LABEL[s.fit].h}}] : []),
]);

describe('two and three boards', () => {
    it('keeps every board, numeral, plate, bet line, button and the pot inside the box and apart, the boards on the felt, for every table and viewer', () => {
        for (const box of BOARD_BOXES) for (const n of SEAT_COUNTS) for (const mine of [null, 0, n - 1]) for (const boards of [2, 3]) {
            const s = stageLayout(box, n, mine, boards);
            const label = `${box.w}×${box.h} ${n} seats, viewer ${mine}, ${boards} boards`;
            expect(s.boards.map((b) => b.index), label).toEqual(Array.from({length: boards}, (_, k) => k));
            const table = rectsOf(s);
            const own = boardRects(s);
            for (const {name, r} of [...table, ...own]) expect(insideBox(r, box), `${label}: ${name} inside`).toBe(true);
            // Nowhere for the boards on the smallest phone on its side with seven seats or more (as for
            // one board at eight, whose nine seats crowd even the bet lines onto the plates): there they
            // cover a bet line or a dealer button where that is least, never a plate.
            const nowhere = box.w === 364 && box.h === 224 && n >= 7;
            for (let i = 0; i < table.length; i++) for (let j = i + 1; j < table.length; j++) {
                const board = table[i].name === 'board' || table[j].name === 'board';
                const plate = table[i].name.startsWith('plate') || table[j].name.startsWith('plate');
                if (nowhere && !(board && plate)) continue;
                expect(overlaps(table[i].r, table[j].r), `${label}: ${table[i].name} and ${table[j].name}`).toBe(false);
            }
            // Each board and numeral inside the block, which the plates, bets, buttons and pot clear.
            for (const {name, r} of own) {
                expect(r.x - r.w / 2, `${label}: ${name}`).toBeGreaterThanOrEqual(s.board.x - s.board.w / 2 - 0.5);
                expect(r.x + r.w / 2, `${label}: ${name}`).toBeLessThanOrEqual(s.board.x + s.board.w / 2 + 0.5);
                expect(r.y - r.h / 2, `${label}: ${name}`).toBeGreaterThanOrEqual(s.board.y - s.board.h / 2 - 0.5);
                expect(r.y + r.h / 2, `${label}: ${name}`).toBeLessThanOrEqual(s.board.y + s.board.h / 2 + 0.5);
            }
            // Clear of every hand of four that may turn up (all but the seated viewer's own), wherever
            // that keeps the cards 18 px or wider — everywhere but a few of the smallest phones' tables.
            if (s.board.handsClear) {
                for (const p of s.seats) {
                    if (mine !== null && p.slot === 0) continue;
                    expect(overlaps(s.board, shownHandRect(p, s, 4)), `${label}: the boards and seat ${p.seat}'s hand`).toBe(false);
                }
            } else expect(nowhere || s.board.card.w < BOARD_CARD_MIN || box.w <= 320 || (box.w === 364 && box.h === 224), `${label}: not clear of the hands`).toBe(true);
            // On the felt, its rail included.
            const span = feltSpan(s, s.board.y - s.board.h / 2, s.board.h, 0);
            expect(span, label).not.toBeNull();
            expect(s.board.x - s.board.w / 2, label).toBeGreaterThanOrEqual(span![0] - 0.5);
            expect(s.board.x + s.board.w / 2, label).toBeLessThanOrEqual(span![1] + 0.5);
            // Boards one over another or side by side never touch; cascaded, each covers the foot of
            // the one above and leaves its index band in sight.
            for (let k = 1; k < boards; k++) {
                const [a, b] = [s.boards[k - 1], s.boards[k]];
                if (s.board.arrangement === 'cascade') expect(b.y - b.h / 2 - (a.y - a.h / 2), label).toBeCloseTo(a.h * CASCADE_STEP, 6);
                else expect(overlaps(a, b), `${label}: boards ${k - 1} and ${k}`).toBe(false);
            }
        }
    }, 120_000);

    it('deals the cards as large as the room allows, never under the floors the phones were measured at', () => {
        const floor = (box: {w: number; h: number}, n: number): number => {
            if (box.w === 364 && box.h === 224) return MULTI_BOARD_MIN;
            if (fitFor(box) === 'comfortable') return 60;
            if (box.h <= box.w) return 20;
            if (box.w >= 360) return n <= 7 ? 26 : 19;
            return n <= 7 ? 20 : 16;
        };
        for (const box of BOARD_BOXES) for (const n of SEAT_COUNTS) for (const boards of [2, 3]) {
            const narrowest = Math.min(...[0, null].map((mine) => stageLayout(box, n, mine, boards).board.card.w));
            const s = stageLayout(box, n, 0, boards);
            expect(narrowest, `${box.w}×${box.h} ${n} seats, ${boards} boards`).toBeGreaterThanOrEqual(Math.max(MULTI_BOARD_MIN, floor(box, n)));
            expect(s.board.card.w).toBeLessThanOrEqual(BOARD_CARD_MAX[s.fit]);
            expect(s.board.card.h).toBe(Math.round(s.board.card.w * CARD_RATIO));
            for (const b of s.boards) expect([b.w, b.h]).toEqual([5 * s.board.card.w + 4 * s.board.gap, s.board.card.h]);
        }
        // The sizes the plan named: a 390 × 630 phone at 28 px or more, a 375 × 469 one at 24.
        for (const n of SEAT_COUNTS) for (const boards of [2, 3]) {
            expect(stageLayout({w: 390, h: 630}, n, 0, boards).board.card.w).toBeGreaterThanOrEqual(28);
            expect(stageLayout({w: 375, h: 469}, n, 0, boards).board.card.w).toBeGreaterThanOrEqual(24);
        }
    }, 120_000);

    it('lays one board out exactly as before', () => {
        for (const box of BOXES) for (const n of SEAT_COUNTS) {
            const s = stageLayout(box, n, 0, 1);
            expect(s).toEqual(stageLayout(box, n, 0));
            expect([s.board.arrangement, s.board.labels, s.boards]).toEqual(['row', false, [{index: 0, x: s.board.x, y: s.board.y, w: s.board.w, h: s.board.h, label: null}]]);
        }
    });

    it("builds a block of boards stacked, side by side or cascaded, with a numeral at each board's left", () => {
        for (const fit of ['tight', 'compact', 'comfortable'] as const) for (const n of [2, 3]) for (const labels of [true, false]) {
            const cw = 30;
            const ch = Math.round(cw * CARD_RATIO);
            const bw = 5 * cw + 4 * BOARD_GAP[fit];
            const lab = labels ? BOARD_LABEL[fit].w + BOARD_LABEL[fit].gap : 0;
            const stack = boardBlock('stack', n, cw, fit, labels);
            expect([stack.w, stack.h]).toEqual([lab + bw, n * ch + (n - 1) * BOARD_ROW_GAP[fit]]);
            const side = boardBlock('side', n, cw, fit, labels);
            expect([side.w, side.h]).toEqual([n * (lab + bw) + (n - 1) * BOARD_SIDE_GAP[fit], ch]);
            const cascade = boardBlock('cascade', n, cw, fit, labels);
            expect(cascade.w).toBe(lab + bw);
            expect(cascade.h).toBeCloseTo(ch * (1 + (n - 1) * CASCADE_STEP), 6);
            for (const block of [stack, side, cascade]) {
                expect(block.places).toHaveLength(n);
                for (const p of block.places) {
                    expect(Math.abs(p.dx) + bw / 2).toBeLessThanOrEqual(block.w / 2 + 1e-9);
                    expect(Math.abs(p.dy) + ch / 2).toBeLessThanOrEqual(block.h / 2 + 1e-9);
                    if (!labels) expect(p.label).toBeNull();
                    else {
                        // Left of its board, a gap apart, level with it (in a cascade, with its index band).
                        expect(p.label!.x + BOARD_LABEL[fit].w / 2 + BOARD_LABEL[fit].gap).toBeCloseTo(p.dx - bw / 2, 6);
                        expect(p.label!.y).toBeGreaterThanOrEqual(p.dy - ch / 2);
                        expect(p.label!.y).toBeLessThanOrEqual(p.dy - ch / 2 + (block === cascade ? ch * INDEX_BAND : ch));
                    }
                }
            }
        }
        expect(boardBlock('row', 3, 30, 'compact', true)).toEqual({w: 5 * 30 + 4 * BOARD_GAP.compact, h: 42, places: [{dx: 0, dy: 0, label: null}]});
        // A cascade's step leaves the rank and corner suit of the card above in sight.
        expect(CASCADE_STEP).toBeGreaterThanOrEqual(INDEX_BAND);
    });

    it('uses the seats nobody sits in: on the smallest phone on its side, eight seats and four players, the boards move into the felt\'s free half rather than shrink to 14 px', () => {
        const seatings: number[][] = [];
        for (let a = 1; a < 8; a++) for (let b = a + 1; b < 8; b++) for (let c = b + 1; c < 8; c++) seatings.push([0, a, b, c]);
        for (const box of [SIDEWAYS['568 × 320'], SIDEWAYS['667 × 375']]) for (const boards of [2, 3]) {
            const widths: number[] = [];
            for (const seated of seatings) {
                const open = Array.from({length: 8}, (_, seat) => seat).filter((seat) => !seated.includes(seat));
                const s = stageLayout(box, 8, 0, boards, {handSize: 4, open});
                const label = `${box.w}×${box.h}, ${boards} boards, seated ${seated.join()}`;
                widths.push(s.board.card.w);
                // On the felt, clear of every seat taken (its plate, bet line and button) and of every
                // open seat's ring.
                const span = feltSpan(s, s.board.y - s.board.h / 2, s.board.h, 0);
                expect(span, label).not.toBeNull();
                expect(s.board.x - s.board.w / 2, label).toBeGreaterThanOrEqual(span![0] - 0.5);
                expect(s.board.x + s.board.w / 2, label).toBeLessThanOrEqual(span![1] + 0.5);
                const ring = openSeatPx(s);
                for (const p of s.seats) {
                    const near = open.includes(p.seat)
                        ? [{...p.plate, w: ring, h: ring}]
                        : [{...p.plate, ...s.plateSize}, {...p.bet, ...s.betSize}, {...p.button, w: s.buttonSize, h: s.buttonSize}];
                    for (const r of near) expect(overlaps(s.board, r), `${label}: seat ${p.seat}`).toBe(false);
                }
            }
            widths.sort((a, b) => a - b);
            // Half the seatings deal them 18 px or more on the smallest phone; all of them 22 a size up.
            expect(widths[Math.floor(widths.length / 2)], `${box.w}×${box.h}, ${boards} boards`).toBeGreaterThanOrEqual(box.w === 364 ? BOARD_CARD_MIN : 22);
        }
        // QA's seating: the viewer at the foot and three players up the right-hand side.
        const qa = (boards: number) => stageLayout(SIDEWAYS['568 × 320'], 8, 0, boards, {handSize: 4, open: [1, 2, 3, 4]}).board.card.w;
        expect([qa(2), qa(3)].every((w) => w >= 20), `${qa(2)}, ${qa(3)}`).toBe(true);
        // Every seat taken there, the squat slots (two to a side column) still leave the boards 18 px or
        // more; nine seats on the portrait slots leave nowhere larger than 14 px, and the sheet is where
        // they read.
        expect(stageLayout(SIDEWAYS['568 × 320'], 8, 0, 3, {handSize: 4}).board.card.w).toBeGreaterThanOrEqual(BOARD_CARD_MIN);
        expect(stageLayout(SIDEWAYS['568 × 320'], 9, 0, 3, {handSize: 4}).board.card.w).toBe(MULTI_BOARD_MIN);
    }, 120_000);

    it("sends a board's share of the pots from its numeral, else its left end", () => {
        const s = stageLayout({w: 1428, h: 705}, 6, 0, 3);
        expect(s.board.labels).toBe(true);
        for (const b of s.boards) expect(boardAnchor(s, b.index)).toEqual(b.label);
        const bare = {...s, boards: s.boards.map((b) => ({...b, label: null}))};
        for (const b of bare.boards) expect(boardAnchor(bare, b.index)).toEqual({x: b.x - b.w / 2, y: b.y});
    });

    for (const [size, boxes] of Object.entries({...POT_BOXES, '667 × 375': [SIDEWAYS['667 × 375']], '568 × 320': [SIDEWAYS['568 × 320']]})) {
        it(`finds the pots their place and keeps the banner clear at ${size}, two and three boards, four-card hands up`, () => {
            for (const box of boxes) for (const n of SEAT_COUNTS) for (const mine of [0, null]) for (const boards of [2, 3]) {
                const s = stageLayout(box, n, mine, boards);
                const seated = s.seats.map((p) => p.seat);
                const shown = seated.filter((seat) => seat !== mine);
                for (const amounts of [POTS[0], POTS[3]]) for (const button of [0, n - 1]) {
                    const label = `${box.w}×${box.h} ${n} seats, viewer ${mine}, ${boards} boards, ${amounts.length} pots, button ${button}`;
                    const pops: WinPop[] = [{seat: mine ?? 0, amount: 1_250_000}];
                    const pots = expectPotPlan(s, amounts, {open: [], shown, button, bets: seated, handSize: 4, now: {shown, bets: [], pops}}, label);
                    // On the desktop clear of everything that may yet show; on a phone held upright, on the felt.
                    if (size === '1440 × 900') expect(pots.keeps, label).toBe('all');
                    if (size === '390 × 844') expect(pots.felt, label).toBe(true);
                    // A line a board, "Board 2: Dinosaur wins 123,456" over the hand's name.
                    const text: BannerText = {
                        winners: Array.from({length: boards}, (_, k) => ({head: TABLE_COPY.bannerBoard(k, 'Dinosaur', 123_456), short: {lead: TABLE_COPY.bannerShortBoard(k), name: TABLE_COPY.bannerShortNames(['Dinosaur']), tail: ''}, hand: k === 0 ? flush : threesFull})),
                        note: TABLE_COPY.nextHandIn(99),
                    };
                    const seen: BannerSeen = {open: [], shown, button, pots: pots.pills, pops, handSize: 4};
                    // Clear everywhere but the smallest phone on its side with eight seats or more,
                    // where it sits where the pot was; full on a desktop.
                    if (size === '568 × 320' && n >= 8) {
                        const plan = bannerPlan(s, text, seen);
                        if (!plan.clear) expect(plan.banner.x, label).toBe(s.board.x);
                        continue;
                    }
                    const plan = expectClear(s, text, seen, label);
                    if (size === '1440 × 900' && n <= 7) expect(plan.variant, label).toBe('full');
                    for (const piece of piecesOf(plan)) for (const pill of pots.pills) expect(overlaps(piece.r, pill), `${label}: ${piece.name} over a pot`).toBe(false);
                }
            }
        }, 120_000);
    }
});

describe('one board as the table moves a pixel, and the hands turned up round it', () => {
    const css = readFileSync(fileURLToPath(new URL('../../../app/globals.css', import.meta.url)), 'utf8');
    // A move from one height to the next that comes back within ten pixels of height: the board sent
    // across the felt and back as the dock's line wraps.
    const flips = (ys: readonly number[]): number[] => {
        const out: number[] = [];
        for (let i = 1; i < ys.length; i++) {
            if (Math.abs(ys[i] - ys[i - 1]) <= 12) continue;
            for (let j = i + 1; j < Math.min(ys.length, i + 10); j++) if (Math.abs(ys[j] - ys[i - 1]) < 12) {
                out.push(i);
                break;
            }
        }
        return out;
    };

    it('keeps its place where the bands over and under the middle are as wide: the throw-away\'s line growing the dock two pixels never sends it across', () => {
        // QA's 390 × 844 phone, eight seats, the Triple T pick's line taking two pixels from the table;
        // and the other phones the finding measured.
        for (const [w, from, to] of [[378, 600, 640], [363, 410, 430], [308, 320, 340]] as const) for (const mine of [0, null]) {
            const ys: number[] = [];
            for (let h = from; h <= to; h++) ys.push(stageLayout({w, h}, 8, mine).board.y);
            for (let i = 1; i < ys.length; i++) expect(Math.abs(ys[i] - ys[i - 1]), `${w}×${from + i}, viewer ${mine}`).toBeLessThanOrEqual(3);
        }
        // Over the middle where the bands either side are as wide.
        const s = stageLayout({w: 378, h: 617}, 8, 0);
        expect(s.board.y).toBeLessThan(s.centre.y);
    });

    it('stays where the page drew it a moment ago (prefer) at every phone size, seat count and hand, the table growing or shrinking a pixel at a time', () => {
        const SWEEPS: [number, number, number][] = [[308, 330, 400], [363, 400, 480], [378, 570, 680], [364, 205, 240], [442, 260, 300], [562, 270, 320]];
        for (const [w, from, to] of SWEEPS) for (const n of SEAT_COUNTS) for (const handSize of [2, 4]) for (const down of [false, true]) {
            const heights = Array.from({length: to - from + 1}, (_, k) => (down ? to - k : from + k));
            let share: number | null = null;
            const ys = heights.map((h) => {
                const s = stageLayout({w, h}, n, 0, 1, {handSize, prefer: share === null ? null : share * h});
                share = s.board.y / h;
                return s.board.y;
            });
            expect(flips(ys).map((i) => heights[i]), `${w} wide, ${n} seats, hands of ${handSize}${down ? ', shrinking' : ''}`).toEqual([]);
            // The place it prefers is the place it keeps: asked again where it is, it stays.
            const h = heights[heights.length - 1];
            const last = stageLayout({w, h}, n, 0, 1, {handSize, prefer: ys[ys.length - 1]});
            expect(last.board.y).toBe(ys[ys.length - 1]);
        }
    }, 120_000);

    it('in PLO keeps clear of every hand of four that may turn up, wherever that leaves its cards 18 px or wider — all but the smallest phone on its side', () => {
        for (const box of [...BOXES, ...Object.values(POT_BOXES).flat(), ...Object.values(SIDEWAYS)]) for (const n of SEAT_COUNTS) for (const mine of [0, null]) {
            const s = stageLayout(box, n, mine, 1, {handSize: 4});
            const label = `${box.w}×${box.h} ${n} seats, viewer ${mine}`;
            expect(s.board.card.w, label).toBeGreaterThanOrEqual(BOARD_CARD_MIN);
            if (box.w === 364 && box.h === 224) continue;
            expect(s.board.handsClear, label).toBe(true);
            for (const p of s.seats) {
                if (mine !== null && p.slot === 0) continue;
                expect(overlaps(s.board, shownHandRect(p, s, 4)), `${label}: the board and seat ${p.seat}'s hand`).toBe(false);
            }
            // Texas hold'em's board is laid out as it always was: the hands of two do not move it.
            expect(stageLayout(box, n, mine, 1, {handSize: 2}).board).toEqual(stageLayout(box, n, mine).board);
        }
    }, 120_000);

    it('keeps a turned-up hand of two off every other plate and the board, on every phone QA drives and every seat count: along its row, beside its plate or on its other side', () => {
        // Texas hold'em's hands (and Triple T's): never over another seat's plate, nor the board (but on
        // the smallest phone on its side with eight seats or more, where nine hands up leave the board's
        // band the last room); apart from one another and off the flags plates hang (as wide as "Out of
        // chips") but where there is no room for every hand at once — eight seats or more on the smallest
        // phone on its side, nine on a 320 px phone, where the pots keep a band by the board — there a hand
        // may meet another, or the end of a long flag under a top seat's plate.
        const crowdedMeet = (box: {w: number; h: number}, n: number): boolean => (box.w === 364 && box.h === 224 && n >= 8) || (box.w <= 308 && n === 9);
        const crowdedFlag = (box: {w: number; h: number}, n: number): boolean => crowdedMeet(box, n) || ((box.w <= 308 || (box.w === 363 && box.h === 470)) && n === 9);
        for (const box of [...Object.values(POT_BOXES).flat(), ...Object.values(SIDEWAYS)]) for (const n of SEAT_COUNTS) for (const mine of [0, null]) {
            const s = stageLayout(box, n, mine, 1, {handSize: 2});
            const label = `${box.w}×${box.h} ${n} seats, viewer ${mine}`;
            const lit = {x: s.board.x, y: s.board.y - 4, w: s.board.w + 4, h: s.board.h + 8};
            const hands = s.seats.filter((p) => mine === null || p.slot !== 0).map((p) => ({p, r: shownHandRect(p, s, 2)}));
            for (const {p, r} of hands) {
                expect(insideBox(r, s.box), `${label}: seat ${p.seat}'s hand inside`).toBe(true);
                for (const q of s.seats) if (q.seat !== p.seat) expect(overlaps(r, {...q.plate, ...s.plateSize}), `${label}: seat ${p.seat}'s hand over plate ${q.seat}`).toBe(false);
                // Its own plate, never.
                expect(overlaps(r, {...p.plate, ...s.plateSize}), `${label}: seat ${p.seat}'s hand over its own plate`).toBe(false);
                if (!(box.w === 364 && n >= 8)) expect(overlaps(r, lit), `${label}: seat ${p.seat}'s hand over the board`).toBe(false);
                if (crowdedFlag(box, n)) continue;
                // The cards (a lit card lifts over a flag only for a moment).
                const cards = {...r, y: r.y + 3, h: r.h - 6};
                for (const q of s.seats) if (q.seat !== p.seat) expect(overlaps(cards, flagRect(q, s, 'Out of chips')), `${label}: seat ${p.seat}'s hand over seat ${q.seat}'s flag`).toBe(false);
            }
            if (crowdedMeet(box, n)) continue;
            for (let i = 0; i < hands.length; i++) for (let j = i + 1; j < hands.length; j++) {
                expect(handsMeet(hands[i].r, hands[j].r), `${label}: seats ${hands[i].p.seat} and ${hands[j].p.seat}`).toBe(false);
            }
        }
        // Nine seats on a 320 × 568 phone: the left column's hands under the lowest plate and beside the
        // middle one — each still beside its own plate.
        const s = stageLayout({w: 308, h: 340}, 9, 0);
        const [low, middle] = [s.seats.find((p) => p.slot === 1)!, s.seats.find((p) => p.slot === 2)!];
        expect(low.shownDy).toBeGreaterThan(0);
        expect(middle.shownDx).toBeGreaterThan(0);
    }, 120_000);

    it('moves a turned-up hand of four along its row off another: apart on the phones QA drives at every seat count but seven or more on a 320 px phone (eight on its side)', () => {
        // Where there is no room for every seat's hand at once — seven seats or more on a 320 px phone,
        // eight on the smallest phone on its side, and nine on a 375 px phone held upright — each hand
        // that meets none stays where it was.
        const crowded = (box: {w: number; h: number}, n: number): boolean =>
            (box.w <= 320 && n >= 7) || (box.w === 364 && box.h === 224 && n >= 8) || (box.w < 380 && box.h < 480 && n === 9);
        for (const box of [...Object.values(POT_BOXES).flat(), ...Object.values(SIDEWAYS)]) for (const n of SEAT_COUNTS) for (const mine of [0, null]) {
            const s = stageLayout(box, n, mine, 1, {handSize: 4});
            const label = `${box.w}×${box.h} ${n} seats, viewer ${mine}, hands of 4`;
            const hands = s.seats.filter((p) => mine === null || p.slot !== 0).map((p) => ({p, r: shownHandRect(p, s, 4)}));
            for (const {p, r} of hands) {
                expect(insideBox(r, s.box), `${label}: seat ${p.seat}'s hand inside`).toBe(true);
                expect(p.shownDy, label).toBe(0);
                // A hand moved along its row never covers another seat's plate.
                if (p.shownDx === 0) continue;
                for (const q of s.seats) if (q.seat !== p.seat) expect(overlaps(r, {...q.plate, ...s.plateSize}), `${label}: seat ${p.seat}'s hand over plate ${q.seat}`).toBe(false);
            }
            if (crowded(box, n)) continue;
            for (let i = 0; i < hands.length; i++) for (let j = i + 1; j < hands.length; j++) {
                expect(handsMeet(hands[i].r, hands[j].r), `${label}: seats ${hands[i].p.seat} and ${hands[j].p.seat}`).toBe(false);
            }
        }
        // QA's PLO table at 320 × 568: the top corner's hand and the side seat's under it, apart.
        const s = stageLayout({w: 308, h: 340}, 8, 0, 1, {handSize: 4});
        const [corner, side] = [s.seats.find((p) => p.slot === 5)!, s.seats.find((p) => p.slot === 6)!];
        expect(handsMeet(shownHandRect(corner, s, 4), shownHandRect(side, s, 4))).toBe(false);
        expect(corner.shownDx).toBeLessThan(0);
    }, 120_000);

    it('draws a hand moved along its row where the stage put it', () => {
        expect(css).toContain('translate: calc(-50% + var(--pn-shown-dx, 0px)) var(--pn-shown-dy, 0px);');
        const seat = readFileSync(fileURLToPath(new URL('../../../components/poker-night/Seat.tsx', import.meta.url)), 'utf8');
        expect(seat).toContain("'--pn-shown-dx': `${place.shownDx}px`");
        expect(seat).toContain("'--pn-shown-dy': `${place.shownDy}px`");
    });
});

describe("the boards' sizes in the stylesheet", () => {
    const css = readFileSync(fileURLToPath(new URL('../../../app/globals.css', import.meta.url)), 'utf8');
    const room = (fit: Fit): string =>
        (fit === 'compact' ? css.match(/\.pn-room \{[^}]*\}/) : css.match(new RegExp(`\\.pn-room\\[data-pn-fit="${fit}"\\] \\{[^}]*\\}`)))?.[0] ?? '';
    const px = (rule: string, name: string): number => Number(rule.match(new RegExp(`${name}: (\\d+)px`))?.[1]);

    it("draws a board's numeral at the size the stage keeps for it, and never lifts a card that plays on two or three boards", () => {
        for (const fit of ['tight', 'compact', 'comfortable'] as const) {
            expect(px(room(fit), '--pn-board-label-w'), fit).toBe(BOARD_LABEL[fit].w);
            expect(px(room(fit), '--pn-board-label-h'), fit).toBe(BOARD_LABEL[fit].h);
        }
        expect(css).toContain('.pn-board-label { position: absolute; translate: -50% -50%;');
        expect(css).toContain('width: var(--pn-board-label-w); height: var(--pn-board-label-h);');
        expect(css).toContain('.pn-board-set .pn-card[data-state="win"] > .pn-card-inner { transform: none; }');
        // The boards sheet's five cards and their gaps fit a 320 px phone's sheet.
        expect(BOARDS_SHEET_CARD * 5 + 4 * 3).toBeLessThanOrEqual(320 - 2 * 16 - 8);
    });
});
