// The table's stage in pixels: for every seat count, viewer and box from a 320 px phone to a wide
// desktop, every plate, bet line, dealer button, the board and the pot inside the box and clear of
// one another; the board's cards as large as the room allows (and readable on a phone); the felt
// under the plates' centres; a narrow box always on the portrait slots; a flight's offset; the
// pot's pills kept to one row; and the winner's banner and the line under it clear of every plate,
// turned-up hand, the dealer button and the board on the phones and the desktop the QA drives.

import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import {HAND_COPY, TABLE_COPY} from '@/lib/learn/copy/poker-night';
import {PLATE, SEAT_COUNTS, spotToPx} from '@/lib/poker-night/layout';
import {
    AVATAR_PX, avatarCentre, BANNER, bannerObstacles, bannerPlan, BOARD_CARD_MAX, CARD_RATIO, fitFor, insideBox, NARROW_STAGE, offset, openSeatPx, overlaps,
    pieceRect, PLATE_PAD_X, PLATE_SIZE, POT_PILL, potPillsShown, SHOWN_CARD_PX, SHOWN_OFF, shownHandRect, stageLayout, stageOrientation, TABLE_TOP_ROOM, textWidth,
    TIGHT_BELOW, wrappedLines, type BannerPlan, type BannerSeen, type BannerText, type Fit, type Rect, type Stage,
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
    for (const [size, boxes] of Object.entries(BANNER_BOXES)) {
        it(`clears every plate, turned-up hand, the dealer button and the board at ${size}, every seat count and button`, () => {
            for (const box of boxes) for (const n of SEAT_COUNTS) for (const mine of [0, null]) {
                const s = stageLayout(box, n, mine);
                // Every seat taken and every hand but the viewer's turned up on the felt (a watcher's
                // seat 0 too), the most a showdown shows; and the table half empty.
                const full: BannerSeen = {open: [], shown: s.seats.filter((p) => p.seat !== mine).map((p) => p.seat), button: 0};
                const half: BannerSeen = {
                    open: s.seats.filter((p) => p.seat % 2 === 1).map((p) => p.seat),
                    shown: s.seats.filter((p) => p.seat % 2 === 0 && p.seat !== mine).map((p) => p.seat), button: 0,
                };
                for (const [name, winners] of Object.entries(TEXTS)) {
                    for (const note of NOTES) {
                        if (name !== 'you' && note !== NOTES[0]) continue;
                        for (let button = 0; button < n; button++) {
                            expectClear(s, {winners, note}, {...full, button}, `${box.w}×${box.h} ${n} seats, viewer ${mine}, ${name}, ${note}, button ${button}`);
                        }
                        expectClear(s, {winners, note}, half, `${box.w}×${box.h} ${n} seats half empty, viewer ${mine}, ${name}, ${note}`);
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

    it('gives the turned-up hands and the open seats their drawn sizes', () => {
        for (const box of BOXES) {
            const s = stageLayout(box, 9, 0);
            for (const p of s.seats) {
                const r = shownHandRect(p, s);
                const card = SHOWN_CARD_PX[s.fit];
                expect(r.w).toBe(2 * card + SHOWN_OFF.gap + 4);
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

    it('turns cards up and lifts the five that play where the plan expects them', () => {
        expect(rule('.pn-seat-shown')).toContain(`bottom: calc(100% + ${SHOWN_OFF.over}px)`);
        expect(rule('.pn-seat-shown')).toContain(`gap: ${SHOWN_OFF.gap}px`);
        expect(rule('.pn-seat[data-side="top"] .pn-seat-shown')).toContain(`top: calc(100% + ${SHOWN_OFF.under}px)`);
        expect(rule('.pn-card[data-state="win"] > .pn-card-inner')).toContain('translateY(-6px)');
        expect(rule('.pn-card[data-state="win"] > .pn-card-inner')).toContain('0 0 0 2px');
    });
});
