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
import {describe, expect, it} from 'vitest';
import {BANK_COPY, FELT_COPY, HAND_COPY, TABLE_COPY} from '@/lib/learn/copy/poker-night';
import {CHIP_COLUMNS} from '@/lib/poker-night/chips';
import {PLATE, SEAT_COUNTS, spotToPx} from '@/lib/poker-night/layout';
import {
    AMOUNT_PX, AVATAR_PX, avatarCentre, BANNER, bannerObstacles, bannerPlan, BET, betLineSize, BLIND_MARK, blindRect, BOARD_CARD_MAX, CARD_RATIO, CHIP_PX, FELT_RAIL,
    feltSpan, fitFor, insideBox, menuSide, MINI_CARD_PX, MONO_EM, NARROW_STAGE, offset, openSeatPx, overlaps, pieceRect, PLATE_PAD_X, PLATE_SIZE, POT_CLEAR, POT_PILL, POT_PILL_H,
    potCentre, potLayouts, potObstacles, potPillWidth, potPlan, PULSE, seatCardsRect, SHOWN_CARD_PX, SHOWN_OFF, SHOWN_STEP, shownHandRect, shownHandWidth, stageLayout, stageOrientation,
    TABLE_TOP_ROOM, textWidth, TIGHT_BELOW, WIN_POP, winPopRect, wrappedLines,
    type BannerPlan, type BannerSeen, type BannerText, type BetOut, type Fit, type PotNow, type PotPlan, type PotSeen, type Rect, type Stage, type WinPop,
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
                const s = stageLayout(box, n, mine);
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
                const s = stageLayout(box, n, mine);
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
const TEXTS: Record<string, BannerText['winners']> = {
    you: [{head: TABLE_COPY.bannerYou(70), hand: threesFull}],
    long: [{head: TABLE_COPY.banner('Bartholomew Q.', 123_456), hand: `${HAND_COPY.label({category: 6, ranks: [5, 1]})} · ${HAND_COPY.playsBoard}`}],
    split: ['Ana', 'Cleo', 'Dinosaur'].map((name) => ({head: TABLE_COPY.banner(name, 1_200), hand: flush})),
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
    for (const [size, boxes] of Object.entries(BANNER_BOXES)) for (const handSize of [2, 4]) {
        it(`clears every plate, turned-up hand (of ${handSize}), the dealer button and the board at ${size}, every seat count and button`, () => {
            for (const box of boxes) for (const n of SEAT_COUNTS) for (const mine of [0, null]) {
                const s = stageLayout(box, n, mine);
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
                if (p.spot.side === 'top') expect(r.y + r.h / 2).toBeCloseTo(plateBottom + SHOWN_OFF.under + card * CARD_RATIO, 6);
                else expect(r.y + r.h / 2).toBeCloseTo(plateTop - SHOWN_OFF.over, 6);
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
