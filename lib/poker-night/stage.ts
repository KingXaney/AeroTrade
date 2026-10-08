// The table's stage in pixels: where every plate, bet line, dealer button, the board, the pot and
// the felt sit inside the measured seat layer, worked out from lib/poker-night/layout's spots. Pure
// and client-safe; components/poker-night/TableScreen measures the box and draws from this, and the
// animations take their flight paths from it (CSS custom properties, never a script animation).
//
// The spots are percentages; here they meet real sizes. A narrow box always takes the portrait
// slots (layout's landscape slots crowd the sides below NARROW_STAGE). Each seat's bet line sits on
// the ray from its plate to the middle, at the first place clear of every plate and of the bet
// lines already placed; its dealer button beside that; and the board and the pot are then fitted
// into what is left — the widest five cards that clear every plate, bet line and button, as near
// the middle as they can sit, and where the page drew them a moment ago among places as good
// (options.prefer), so a box a pixel taller or shorter never sends them across the felt. An open seat
// (options.open) is a ring alone. A hand turned up meeting another's moves along its row
// (nudgeHands); in PLO the board keeps clear of the hands of four. lib/poker-night/__tests__/stage.test.ts
// holds them all apart from 320 px phones to wide desktops. stage.pot is the one pot's own place (and
// the table's name between hands); the pots of a hand — side pots and all — go where potPlan (at the
// foot) finds room.

import {BANK_COPY, FELT_COPY, TABLE_COPY} from '@/lib/learn/copy/poker-night';
import {CHIP_COLUMNS, chipBreakdown, compactChips} from '@/lib/poker-night/chips';
import {CENTRE, densityFor, isSquat, orientationFor, PLATE, seatSpots, spotToPx, visualSlot, type Box, type Density, type Orientation, type SeatSpot} from '@/lib/poker-night/layout';

export type Px = {x: number; y: number};
// A rectangle by its centre.
export type Rect = Px & {w: number; h: number};

// Below this width the portrait slots, whatever the height.
export const NARROW_STAGE = 560;

export const stageOrientation = (box: Box): Orientation => (box.w < NARROW_STAGE ? 'portrait' : orientationFor(box.w, box.h));

// How roomy the stage is: layout's two densities, and 'tight' for a compact box under TIGHT_BELOW
// px tall (a small phone held upright), whose plates are a little smaller than layout's compact ones.
export type Fit = Density | 'tight';
export const TIGHT_BELOW = 400;
export const fitFor = (box: Box): Fit => {
    const density = densityFor(box.w, box.h);
    return density === 'compact' && box.h < TIGHT_BELOW ? 'tight' : density;
};

// A seat plate: the avatar, the name and the stack.
export const PLATE_SIZE: Record<Fit, Box> = {tight: {w: 72, h: 46}, compact: PLATE.compact, comfortable: PLATE.comfortable};
// A bet line: a chip and its count.
export const BET: Record<Fit, Box> = {tight: {w: 52, h: 16}, compact: {w: 56, h: 18}, comfortable: {w: 78, h: 24}};
// The dealer button's diameter.
export const BUTTON: Record<Fit, number> = {tight: 14, compact: 16, comfortable: 24};
// The pot's pill.
export const POT: Record<Fit, Box> = {tight: {w: 92, h: 20}, compact: {w: 104, h: 22}, comfortable: {w: 168, h: 30}};
// Board cards: height = width × CARD_RATIO, the gap between them, the largest and smallest width.
export const CARD_RATIO = 1.4;
export const BOARD_GAP: Record<Fit, number> = {tight: 2, compact: 3, comfortable: 6};
export const BOARD_CARD_MAX: Record<Fit, number> = {tight: 40, compact: 46, comfortable: 66};
export const BOARD_CARD_MIN = 18;
// Two or three boards (PLO): the gap between two boards one over another, and side by side; a
// board's numeral (.pn-board-label: its width, its height and the gap to its board); how far down a
// cascade's next board starts, as a share of a card's height — the share of a card above it left in
// sight, which holds the face's rank and corner suit (INDEX_BAND, app/globals.css .pn-card-rank and
// .pn-card-corner); and the narrowest card several boards are dealt at (MULTI_BOARD_MIN — the boards
// sheet, components/poker-night/BoardsSheet, shows them at BOARDS_SHEET_CARD whatever the table).
export const BOARD_ROW_GAP: Record<Fit, number> = {tight: 3, compact: 4, comfortable: 8};
export const BOARD_SIDE_GAP: Record<Fit, number> = {tight: 6, compact: 8, comfortable: 16};
export const BOARD_LABEL: Record<Fit, Box & {gap: number}> = {tight: {w: 12, h: 14, gap: 2}, compact: {w: 14, h: 16, gap: 3}, comfortable: {w: 18, h: 20, gap: 4}};
export const CASCADE_STEP = 0.62;
export const INDEX_BAND = 0.58;
export const MULTI_BOARD_MIN = 14;
export const BOARDS_SHEET_CARD = 44;
// The room kept between a plate and what it carries, and around the board and the pot.
const GAP = 2;
const PAD = 2;

// The sizes app/globals.css gives the room per fit, for what is placed from a script (the emotes,
// lib/poker-night/emotes.emoteSpot and the throws): the avatar disc (--pn-av), a seat's turned-up
// card (--pn-show-w; its height × CARD_RATIO) and the room the table keeps over its top edge for a
// top seat's cards (.pn-table's top margin, --pn-show-w × 0.75), under which the top bar ends.
// stage.test holds them equal to the stylesheet.
export const AVATAR_PX: Record<Fit, number> = {tight: 22, compact: 28, comfortable: 42};
export const SHOWN_CARD_PX: Record<Fit, number> = {tight: 24, compact: 28, comfortable: 40};
export const TABLE_TOP_ROOM: Record<Fit, number> = {tight: 18, compact: 21, comfortable: 30};
// A plate's side padding (.pn-plate), and on a compact or tight plate the name's row under the
// avatar's (its line and the row gap), which lifts the avatar above the plate's middle.
export const PLATE_PAD_X = 5;
const NAME_ROW: Record<Fit, number> = {tight: 12.5, compact: 13.65, comfortable: 0};

// The middle of a seat's avatar disc: at the plate's left, inside its padding; on a comfortable plate
// level with the plate's middle, on a smaller one in the top row, above the name.
export const avatarCentre = (place: Pick<SeatPlace, 'plate'>, stage: Pick<Stage, 'plateSize' | 'fit'>): Px => ({
    x: Math.round(place.plate.x - stage.plateSize.w / 2 + PLATE_PAD_X + AVATAR_PX[stage.fit] / 2),
    y: Math.round(place.plate.y - NAME_ROW[stage.fit] / 2),
});

export type SeatPlace = {
    seat: number;
    slot: number;
    spot: SeatSpot;
    plate: Px; // the plate's centre
    bet: Px; // the bet line's centre
    button: Px; // where the dealer button sits when this seat has it
    // How far across and down from its place over (a top seat's: under) its plate the seat's turned-up
    // hand is drawn (placeHands): along its row off another hand, or — in a crowded column — beside the
    // plate toward the middle or on its other side, off the plates and flags round it.
    shownDx: number;
    shownDy: number;
};

// How a hand's boards lie together: one board in its row; two or three (PLO) one over another
// (stack), side by side (side), or each lower one over the foot of the one above, which keeps every
// card's index in sight (cascade). labels: each board's numeral in a column at its left.
export type BoardArrangement = 'row' | 'stack' | 'side' | 'cascade';
// One board's own row of five (its centre and size) and where its numeral sits, when it has one.
export type BoardPlace = Rect & {index: number; label: Px | null};

export type Stage = {
    box: Box;
    orientation: Orientation;
    fit: Fit;
    plateSize: Box;
    betSize: Box;
    buttonSize: number;
    // The felt: the rectangle the plates' centres run round, so every plate straddles its rail.
    felt: {left: number; top: number; width: number; height: number};
    centre: Px;
    // The boards together, as one block (with its numerals): what the pots, the banner, the notes and
    // the emotes keep clear of and anchor to. One board: its own row.
    // handsClear: several boards, or one in PLO, placed clear of every hand of four that may turn up
    // (all but the seated viewer's own, an open seat's none), as they are wherever that keeps their
    // cards BOARD_CARD_MIN or wider. x: the table's middle, unless several boards squeezed under
    // BOARD_CARD_MIN there deal larger elsewhere across the felt.
    board: Rect & {card: Box; gap: number; arrangement: BoardArrangement; labels: boolean; handsClear: boolean};
    boards: BoardPlace[];
    pot: Rect;
    // Nowhere clear for the pot (only on the smallest boxes): it sits on the board's top edge.
    potOnBoard: boolean;
    seats: SeatPlace[]; // by seat number
};

export const overlaps = (a: Rect, b: Rect, pad = 0): boolean =>
    Math.abs(a.x - b.x) < (a.w + b.w) / 2 + pad && Math.abs(a.y - b.y) < (a.h + b.h) / 2 + pad;

const rect = (p: Px, size: Box): Rect => ({x: p.x, y: p.y, w: size.w, h: size.h});

export const insideBox = (r: Rect, box: Box): boolean =>
    r.x - r.w / 2 >= -0.5 && r.x + r.w / 2 <= box.w + 0.5 && r.y - r.h / 2 >= -0.5 && r.y + r.h / 2 <= box.h + 0.5;

const unit = (from: Px, to: Px): Px => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy);
    return len === 0 ? {x: 0, y: -1} : {x: dx / len, y: dy / len};
};

// The way a seat's bet line leaves its plate: straight in from a side seat, so the bet lines keep to
// their plates' rows and leave the bands between them for the board; toward the middle from a seat
// at the top or the bottom.
// When that way is blocked, the bet line tries straight toward the middle, then straight up or
// down toward it.
// With several boards on a phone the bet lines that go straight in (or toward the middle from a seat
// at the top) cut the middle band the boards need, so a second layout (`along`) sends every seat's
// line straight up or down first: a side seat's along its rail, a top seat's straight under it.
const raysOf = (spot: SeatSpot, plate: Px, centre: Px, along = false): Px[] => {
    const toMiddle = unit(plate, centre);
    const vertical = {x: 0, y: plate.y <= centre.y ? 1 : -1};
    if (spot.side === 'left') return along ? [vertical, {x: 1, y: 0}, toMiddle] : [{x: 1, y: 0}, toMiddle, vertical];
    if (spot.side === 'right') return along ? [vertical, {x: -1, y: 0}, toMiddle] : [{x: -1, y: 0}, toMiddle, vertical];
    return along ? [vertical, toMiddle] : [toMiddle, vertical];
};

// Where a rectangle sent along a ray from `from` first clears `own` (1 px steps).
const firstClear = (from: Px, dir: Px, size: Box, own: Rect): number => {
    let t = 0;
    while (t < 600 && overlaps(rect({x: from.x + dir.x * t, y: from.y + dir.y * t}, size), own, GAP)) t += 1;
    return t;
};

// The first spot along one of the rays from `from`, tried in order, in 2 px steps from where the
// rectangle clears `own` up to `reach` beyond it, that sits inside the box and clears every
// rectangle in `avoid`; the nearest spot clear of `own` on the first ray when none does.
const placeAlong = (from: Px, dirs: readonly Px[], size: Box, own: Rect, avoid: readonly Rect[], box: Box, reach: number): Px => {
    for (const dir of dirs) {
        const t0 = firstClear(from, dir, size, own);
        for (let t = t0; t <= t0 + reach; t += 2) {
            const p = {x: from.x + dir.x * t, y: from.y + dir.y * t};
            const r = rect(p, size);
            if (insideBox(r, box) && avoid.every((o) => !overlaps(r, o, GAP))) return p;
        }
    }
    const t0 = firstClear(from, dirs[0], size, own);
    return {x: from.x + dirs[0].x * t0, y: from.y + dirs[0].y * t0};
};

// Where a seat's dealer button goes: beside its bet line — on its side away from the table's middle,
// else the other — else at the plate's inner corners, else on along the ray: the first that is clear.
// Away from the middle, so the band the board takes stays open. Beside the line and past the plate it
// sits half a pixel (EDGE) further than touching, so a floating hair never decides the side: set
// exactly at the clearance, the strict check would take it on one box's height and refuse it on the
// next, and the board, which keeps clear of every button, would leap across the table.
const EDGE = 0.5;
const LEVEL = 4;
const placeButton = (plate: Px, bet: Rect, dir: Px, plateSize: Box, size: number, avoid: readonly Rect[], box: Box, centre: Px): Px => {
    const r = size / 2;
    const across = {x: -dir.y, y: dir.x};
    const side = Math.abs(across.x) * (bet.w / 2) + Math.abs(across.y) * (bet.h / 2) + GAP + r + EDGE;
    const corner = Math.abs(across.x) * (plateSize.w / 2) + Math.abs(across.y) * (plateSize.h / 2) - r;
    const out = Math.abs(dir.x) * (plateSize.w / 2) + Math.abs(dir.y) * (plateSize.h / 2) + GAP + r + EDGE;
    const square = {w: size, h: size};
    // Which side is away from the middle, by where the plate sits (which moves smoothly with the box,
    // where its bet line, placed in steps, does not); level with the middle, the first side.
    const beside: Px[] = [{x: bet.x + across.x * side, y: bet.y + across.y * side}, {x: bet.x - across.x * side, y: bet.y - across.y * side}];
    if (across.x * (plate.x - centre.x) + across.y * (plate.y - centre.y) < -LEVEL) beside.reverse();
    const candidates: Px[] = [
        ...beside,
        {x: plate.x + dir.x * out + across.x * corner, y: plate.y + dir.y * out + across.y * corner},
        {x: plate.x + dir.x * out - across.x * corner, y: plate.y + dir.y * out - across.y * corner},
    ];
    return candidates.find((p) => insideBox(rect(p, square), box) && avoid.every((o) => !overlaps(rect(p, square), o, GAP)))
        ?? placeAlong(bet, [dir], square, bet, avoid, box, 80);
};

// The widest card (up to max) whose row of five, centred at (cx, y), sits inside the box and clears
// every obstacle; 0 when not even the smallest does.
const widestAt = (cx: number, y: number, box: Box, obstacles: readonly Rect[], gap: number, min: number, max: number): number => {
    const fits = (w: number): boolean => {
        const board = {x: cx, y, w: 5 * w + 4 * gap, h: w * CARD_RATIO};
        return insideBox(board, box) && obstacles.every((o) => !overlaps(board, o, PAD));
    };
    if (!fits(min)) return 0;
    let lo = min;
    let hi = max;
    if (fits(hi)) return hi;
    while (hi - lo > 0.5) {
        const mid = (lo + hi) / 2;
        if (fits(mid)) lo = mid;
        else hi = mid;
    }
    return Math.floor(lo);
};

// The block of `n` boards in an arrangement, their cards `cw` wide: its size, and each board's centre
// and numeral as offsets from the block's centre. A board is five cards and four gaps wide and a card
// tall; its numeral, when the block has them, sits in a column at its left — level with the board,
// or in a cascade level with the index band the next board leaves in sight.
type BlockPlace = {dx: number; dy: number; label: Px | null};
export const boardBlock = (arrangement: BoardArrangement, n: number, cw: number, fit: Fit, labels: boolean): {w: number; h: number; places: BlockPlace[]} => {
    const gap = BOARD_GAP[fit];
    const ch = Math.round(cw * CARD_RATIO);
    const bw = 5 * cw + 4 * gap;
    if (arrangement === 'row' || n <= 1) return {w: bw, h: ch, places: [{dx: 0, dy: 0, label: null}]};
    const L = BOARD_LABEL[fit];
    const lab = labels ? L.w + L.gap : 0;
    const rowW = lab + bw;
    const places: BlockPlace[] = [];
    if (arrangement === 'side') {
        const w = n * rowW + (n - 1) * BOARD_SIDE_GAP[fit];
        for (let k = 0; k < n; k++) {
            const left = -w / 2 + k * (rowW + BOARD_SIDE_GAP[fit]);
            places.push({dx: left + lab + bw / 2, dy: 0, label: labels ? {x: left + L.w / 2, y: 0} : null});
        }
        return {w, h: ch, places};
    }
    const step = arrangement === 'stack' ? ch + BOARD_ROW_GAP[fit] : ch * CASCADE_STEP;
    const h = ch + (n - 1) * step;
    for (let k = 0; k < n; k++) {
        const top = -h / 2 + k * step;
        const labelY = arrangement === 'stack' || k === n - 1 ? top + ch / 2 : top + Math.max(L.h, ch * INDEX_BAND) / 2;
        places.push({dx: lab / 2, dy: top + ch / 2, label: labels ? {x: -rowW / 2 + L.w / 2, y: labelY} : null});
    }
    return {w: rowW, h, places};
};

// The widest whole-pixel card (from min up to max) whose block, centred at (cx, y), sits inside the
// box, on the felt (its rail included) and clear of every obstacle; 0 when not even the smallest does.
const widestBlock = (
    cx: number, y: number, box: Box, felt: Pick<Stage, 'felt'>, obstacles: readonly Rect[],
    arrangement: BoardArrangement, n: number, fit: Fit, labels: boolean, min: number, max: number,
): number => {
    const fits = (cw: number): boolean => {
        const b = boardBlock(arrangement, n, cw, fit, labels);
        const r = {x: cx, y, w: b.w, h: b.h};
        const span = feltSpan(felt, y - b.h / 2, b.h, 0);
        return insideBox(r, box) && span !== null && cx - b.w / 2 >= span[0] && cx + b.w / 2 <= span[1] && obstacles.every((o) => !overlaps(r, o, PAD));
    };
    if (!fits(min)) return 0;
    if (fits(max)) return max;
    let lo = min;
    let hi = max;
    while (hi - lo > 1) {
        const mid = Math.floor((lo + hi) / 2);
        if (fits(mid)) lo = mid;
        else hi = mid;
    }
    return lo;
};

// The narrowest card a block of boards keeps its numerals at: in a cascade, where the step from one
// board to the next is a numeral's height or more, so the numerals never touch; else the smallest.
const labelsFrom = (arrangement: BoardArrangement, fit: Fit): number => {
    let cw = MULTI_BOARD_MIN;
    if (arrangement === 'cascade') while (Math.round(cw * CARD_RATIO) * CASCADE_STEP < BOARD_LABEL[fit].h) cw++;
    return cw;
};

// Where a block that fits nowhere goes: at the height in the band where it covers least — a plate or
// a button weighing a hundred times a bet line's square pixel — the nearest the middle among equals.
const fallbackY = (box: Box, centre: Px, obstacles: readonly Rect[], weights: readonly number[], block: Box): number => {
    let best = {y: centre.y, cost: Infinity};
    for (let y = box.h * 0.25; y <= box.h * 0.75; y += 1) {
        const r = {x: centre.x, y, w: block.w, h: block.h};
        if (!insideBox(r, box)) continue;
        let cost = 0;
        obstacles.forEach((o, i) => {
            const ox = Math.min(r.x + r.w / 2, o.x + o.w / 2) - Math.max(r.x - r.w / 2, o.x - o.w / 2);
            const oy = Math.min(r.y + r.h / 2, o.y + o.h / 2) - Math.max(r.y - r.h / 2, o.y - o.h / 2);
            if (ox > 0 && oy > 0) cost += weights[i] * ox * oy;
        });
        if (cost < best.cost || (cost === best.cost && Math.abs(y - centre.y) < Math.abs(best.y - centre.y))) best = {y, cost};
    }
    return best.y;
};

// Several boards' arrangements, in the order a tie goes: one over another, side by side, cascaded.
const MULTI_ORDER: readonly BoardArrangement[] = ['stack', 'side', 'cascade'];
// Within this many pixels of the widest card, the earlier arrangement, the numerals and the middle win;
// the numerals win outright while they keep the cards this share of the widest or more.
const MULTI_TIE = 1;
// How far apart the places across the felt are that several boards squeezed under BOARD_CARD_MIN try.
const ACROSS_STEP = 4;
export const LABELS_SHARE = 0.92;

// One board: cards within this many pixels of the widest count as wide; a row under the middle is
// taken over one above it only when it is this much nearer the middle.
export const BOARD_TIE = 2;
export const UNDER_BIAS = 24;

// Where the board (or the boards) and the pot go, round the plates, bet lines and buttons.
type BoardsPlaced = Pick<Stage, 'board' | 'boards' | 'pot' | 'potOnBoard'>;
const placeBoards = (
    box: Box, fit: Fit, centre: Px, felt: Pick<Stage, 'felt'>, obstacles: readonly Rect[], weights: readonly number[], hands: readonly Rect[], n: number,
    prefer: number | null = null,
): BoardsPlaced => {
    const gap = BOARD_GAP[fit];
    let arrangement: BoardArrangement = 'row';
    let labels = false;
    let handsClear = false;
    let chosen: {w: number; y: number; x?: number};
    if (n <= 1) {
        // The board: the widest cards anywhere in the band around the middle, at every pixel from the
        // middle out; among widths within BOARD_TIE of the widest, the row nearest the middle, one
        // under it only when it is UNDER_BIAS nearer. Where the middle is taken (a side seat's bet line
        // across it) the rows over it and under it are about as near, so "nearest" alone would send
        // the board from one to the other as the table's height moves a pixel (the dock's line
        // wrapping, a phone's bar sliding). In PLO clear of every hand of four that may turn up too
        // (`hands`), wherever that keeps the cards BOARD_CARD_MIN or wider (`handsClear`). With `prefer`
        // (where the page drew the board a moment ago), among those rows the one nearest it: the board
        // then stays put until the band it is in falls BOARD_TIE behind another, and only comes back
        // once that band is BOARD_TIE ahead again, so no wavering width can send it to and fro.
        const row = (avoid: readonly Rect[]): {w: number; y: number} | null => {
            const rows: {w: number; y: number}[] = [];
            const reach = Math.floor(box.h * 0.25);
            for (let k = -reach; k <= reach; k++) {
                const y = centre.y + k;
                if (y >= box.h * 0.25 && y <= box.h * 0.75) rows.push({y, w: widestAt(centre.x, y, box, avoid, gap, BOARD_CARD_MIN, BOARD_CARD_MAX[fit])});
            }
            // A row counts at the width that fits a pixel over and under it too, so a card that fits at one
            // sub-pixel height alone (squeezed between two hands) never decides the board's place.
            const steady = rows.map((r, i) => ({y: r.y, w: Math.min(r.w, rows[i - 1]?.w ?? 0, rows[i + 1]?.w ?? 0)}));
            const widest = Math.max(0, ...steady.map((r) => r.w));
            const far = (r: {y: number}) => (prefer !== null ? Math.abs(r.y - prefer) : Math.abs(r.y - centre.y) + (r.y > centre.y ? UNDER_BIAS : 0));
            return widest > 0 ? steady.filter((r) => r.w >= widest - BOARD_TIE).sort((a, b) => far(a) - far(b))[0] : null;
        };
        const clear = hands.length > 0 ? row([...obstacles, ...hands]) : null;
        handsClear = clear !== null;
        chosen = clear ?? row(obstacles) ?? {y: centre.y, w: BOARD_CARD_MIN};
    } else {
        // Several boards: the widest cards of every arrangement, with and without their numerals, at
        // every height in the band; within MULTI_TIE of the widest, by MULTI_ORDER, the numerals, then
        // nearest the middle — clear of every hand of four that may turn up too, unless that alone
        // deals them under BOARD_CARD_MIN where without it they would be larger (`handsClear` says
        // which). Nowhere at all (seven seats or more on the smallest phone on its side, as one board
        // at eight): cascaded at the smallest, where it covers least of the bet lines, the hands and the
        // dealer button, never a plate (fallbackY).
        type Try = {arrangement: BoardArrangement; labels: boolean; x: number; y: number; w: number};
        const search = (avoid: readonly Rect[], xs: readonly number[] = [centre.x]): Try | null => {
            const tries: Try[] = [];
            for (const a of MULTI_ORDER) for (const l of [true, false]) {
                const min = l ? labelsFrom(a, fit) : MULTI_BOARD_MIN;
                for (const x of xs) for (let y = box.h * 0.25; y <= box.h * 0.75 && min <= BOARD_CARD_MAX[fit]; y += 2) {
                    const w = widestBlock(x, y, box, felt, avoid, a, n, fit, l, min, BOARD_CARD_MAX[fit]);
                    if (w > 0) tries.push({arrangement: a, labels: l, x, y, w});
                }
            }
            const widest = Math.max(0, ...tries.map((t) => t.w));
            // The numerals are worth a little of the cards' size: the banner and the log name the boards.
            const labelled = Math.max(0, ...tries.filter((t) => t.labels).map((t) => t.w));
            const pool = labelled >= widest * LABELS_SHARE ? tries.filter((t) => t.labels && t.w >= labelled - MULTI_TIE) : tries.filter((t) => t.w >= widest - MULTI_TIE);
            return pool.sort((a, b) =>
                MULTI_ORDER.indexOf(a.arrangement) - MULTI_ORDER.indexOf(b.arrangement) || Number(b.labels) - Number(a.labels)
                || Math.abs(a.x - centre.x) - Math.abs(b.x - centre.x)
                || Math.abs(a.y - (prefer ?? centre.y)) - Math.abs(b.y - (prefer ?? centre.y)) || b.w - a.w)[0] ?? null;
        };
        // Centred on the table; where that deals the cards under BOARD_CARD_MIN (a phone on its side,
        // its seats on one side open), anywhere across the felt that deals them larger — the block in
        // the felt's free half rather than squeezed between the seats taken.
        const across = (avoid: readonly Rect[]): Try | null => {
            const middle = search(avoid);
            if (middle && middle.w >= BOARD_CARD_MIN) return middle;
            const xs: number[] = [];
            for (let x = Math.ceil(felt.felt.left); x <= felt.felt.left + felt.felt.width; x += ACROSS_STEP) xs.push(x);
            const off = search(avoid, xs);
            return off && off.w > (middle?.w ?? 0) ? off : middle;
        };
        const clear = across([...obstacles, ...hands]);
        const loose = clear && clear.w >= BOARD_CARD_MIN ? null : across(obstacles);
        const pick = clear && (!loose || clear.w >= BOARD_CARD_MIN || clear.w >= loose.w) ? clear : loose;
        handsClear = pick !== null && pick === clear;
        arrangement = pick?.arrangement ?? 'cascade';
        labels = pick?.labels ?? false;
        chosen = pick ?? {
            x: centre.x,
            y: fallbackY(box, centre, [...obstacles, ...hands], [...weights, ...hands.map(() => 10)], boardBlock('cascade', n, MULTI_BOARD_MIN, fit, false)),
            w: MULTI_BOARD_MIN,
        };
    }
    const card = {w: chosen.w, h: Math.round(chosen.w * CARD_RATIO)};
    const block = boardBlock(arrangement, n, card.w, fit, labels);
    const board = {x: chosen.x ?? centre.x, y: chosen.y, w: block.w, h: block.h, card, gap, arrangement, labels, handsClear};
    const boards: BoardPlace[] = block.places.map((p, index) => ({
        index, x: board.x + p.dx, y: board.y + p.dy, w: 5 * card.w + 4 * gap, h: card.h,
        label: p.label && {x: board.x + p.label.x, y: board.y + p.label.y},
    }));

    // The pot: just over the board where it fits, else just under it, else a little further out;
    // failing all of those, on the board's top edge.
    const potBase = POT[fit];
    const potSize = {w: Math.min(potBase.w, Math.max(board.w, 72)), h: potBase.h};
    const against = [...obstacles, board];
    const candidates: Px[] = [
        {x: board.x, y: board.y - board.h / 2 - PAD * 2 - potSize.h / 2},
        {x: board.x, y: board.y + board.h / 2 + PAD * 2 + potSize.h / 2},
    ];
    for (let k = 1; k <= 40; k++) {
        candidates.push({x: board.x, y: board.y - board.h / 2 - PAD * 2 - potSize.h / 2 - k * 2});
        candidates.push({x: board.x, y: board.y + board.h / 2 + PAD * 2 + potSize.h / 2 + k * 2});
    }
    const potAt = candidates.find((p) => {
        const r = rect(p, potSize);
        return insideBox(r, box) && against.every((o) => !overlaps(r, o, PAD));
    }) ?? null;
    return {board, boards, pot: rect(potAt ?? {x: board.x, y: board.y - board.h / 2}, potSize), potOnBoard: potAt === null};
};

// How many cards a hand turns up (two; PLO's four, which one board keeps clear of too — several boards
// always do), and where the page drew the board (its middle's y) a moment ago, which the board keeps to
// among places as good (`prefer`, placeBoards).
export type StageOptions = {handSize?: number; prefer?: number | null; open?: readonly number[]};

// The plates, bet lines and buttons of a table, its board (or boards: `boards`, PLO's one to three)
// and pot. With several boards, a second layout sends the side seats' bet lines along their rails
// (raysOf) and is kept when it deals the boards larger.
export const stageLayout = (box: Box, seatCount: number, mySeat: number | null, boards = 1, options: StageOptions = {}): Stage => {
    const n = Math.max(1, Math.min(3, Math.round(boards)));
    if (n === 1) return layoutStage(box, seatCount, mySeat, 1, false, options);
    const straight = layoutStage(box, seatCount, mySeat, n, false, options);
    const along = layoutStage(box, seatCount, mySeat, n, true, options);
    return along.board.card.w > straight.board.card.w && apart(along) ? along : straight;
};

// Every plate, bet line and dealer button clear of the others: a layout whose bet lines found their
// place (along the rail there may be none).
const apart = (stage: Stage): boolean => {
    const rects = stage.seats.flatMap((p) => [rect(p.plate, stage.plateSize), rect(p.bet, stage.betSize), rect(p.button, {w: stage.buttonSize, h: stage.buttonSize})]);
    return rects.every((a, i) => rects.every((b, j) => j <= i || !overlaps(a, b)));
};

const layoutStage = (box: Box, seatCount: number, mySeat: number | null, n: number, along: boolean, options: StageOptions): Stage => {
    const orientation = stageOrientation(box);
    const fit = fitFor(box);
    const plateSize = PLATE_SIZE[fit];
    const betSize = BET[fit];
    const buttonSize = BUTTON[fit];
    const centre = spotToPx(CENTRE, box, plateSize);
    // A phone on its side, the dock in its column: seven seats or more take the squat slots.
    const spots = seatSpots(seatCount, orientation, isSquat(box, box.w < NARROW_STAGE));

    // Plates first; then each seat's bet line, the viewer's first and on round the table, clear of
    // every plate and the bet lines before it; then the buttons, clear of all of those.
    const placed = spots.map((_, seat) => {
        const slot = visualSlot(seat, mySeat, spots.length);
        const spot = spots[slot];
        const plate = spotToPx(spot, box, plateSize);
        const dirs = raysOf(spot, plate, centre, along);
        return {seat, slot, spot, plate, dirs, dir: dirs[0]};
    });
    const bySlot = [...placed].sort((a, b) => a.slot - b.slot);
    const plates = placed.map((p) => rect(p.plate, plateSize));
    const reach = Math.min(box.w, box.h) * 0.2;
    const bets: Rect[] = new Array(placed.length);
    for (const p of bySlot) {
        bets[p.seat] = rect(placeAlong(p.plate, p.dirs, betSize, plates[p.seat], [...plates, ...bets.filter(Boolean)], box, reach), betSize);
    }
    const buttons: Rect[] = new Array(placed.length);
    for (const p of bySlot) {
        const avoid = [...plates, ...bets, ...buttons.filter(Boolean)];
        // Along the rail, the button sits across the way the line actually went out.
        const dir = along ? unit(p.plate, bets[p.seat]) : p.dir;
        buttons[p.seat] = rect(placeButton(p.plate, bets[p.seat], dir, plateSize, buttonSize, avoid, box, centre), {w: buttonSize, h: buttonSize});
    }
    // An open seat draws its ring alone: no plate, bet line or button there, and no hand to turn up.
    const open = new Set(options.open ?? []);
    const ring = openSeatPx({plateSize});
    const at = placed.map((p) => (open.has(p.seat) ? rect(p.plate, {w: ring, h: ring}) : plates[p.seat]));
    const taken = (_: unknown, seat: number) => !open.has(seat);
    const obstacles = [...at, ...bets.filter(taken), ...buttons.filter(taken)];
    // What covering each weighs, where boards fit nowhere: a plate or a button a hundred bet lines.
    const weights = [...at.map(() => 100), ...bets.filter(taken).map(() => 1), ...buttons.filter(taken).map(() => 100)];
    const felt = {left: plateSize.w / 2, top: plateSize.h / 2, width: Math.max(0, box.w - plateSize.w), height: Math.max(0, box.h - plateSize.h)};
    // The hands that may turn up — every seat's but the seated viewer's own, whose cards are in the dock
    // — each moved along its row off another (nudgeHands). Texas hold'em's two (and Triple T's) are
    // moved round the board, placed first, and off a crowded column's plates and flags (placeHands); PLO's four are moved first and the board (one, or several)
    // keeps clear of them where its cards stay BOARD_CARD_MIN or wider — unless that holds only with the
    // hands left where they are, which the board then keeps clear of instead.
    const handSize = n > 1 ? 4 : Math.max(2, options.handSize ?? 2);
    const showing = placed.filter((p) => (mySeat === null || p.slot !== 0) && !open.has(p.seat));
    const stageOf = (shown: HandPlaces, boards: BoardsPlaced): Stage => ({
        box, orientation, fit, plateSize, betSize, buttonSize, felt, centre, ...boards,
        seats: placed.map((p) => ({
            seat: p.seat, slot: p.slot, spot: p.spot, plate: p.plate,
            bet: {x: bets[p.seat].x, y: bets[p.seat].y}, button: {x: buttons[p.seat].x, y: buttons[p.seat].y},
            shownDx: shown[p.seat]?.dx ?? 0, shownDy: shown[p.seat]?.dy ?? 0,
        })),
    });
    const sized = {plateSize, fit};
    const plateRects = at.map((r, seat) => ({r, seat}));
    // The flags that may hang under a seated player's plate, the seated viewer's own included.
    const flagged = placed.filter((p) => !open.has(p.seat)).map((p) => ({seat: p.seat, plate: p.plate}));
    const litBoard = (b: BoardsPlaced): Rect => {
        const lit = LIT.lift + LIT.ring;
        return {x: b.board.x, y: b.board.y - lit / 2, w: b.board.w + 2 * LIT.ring, h: b.board.h + lit};
    };
    if (handSize <= 2 && n <= 1) {
        const boards = placeBoards(box, fit, centre, {felt}, obstacles, weights, [], n, options.prefer ?? null);
        return stageOf(placeHands(showing, sized, box, centre, [...plateRects, {r: litBoard(boards), seat: -1}], flagged, handSize, potBands(boards.board, fit)), boards);
    }
    const handsAt = (shown: HandPlaces) => showing.map((p) => shownHandRect({...p, shownDx: shown[p.seat]?.dx ?? 0, shownDy: shown[p.seat]?.dy ?? 0}, sized, handSize));
    const moved = nudged(showing, sized, box, centre, plateRects, handSize);
    const boards = placeBoards(box, fit, centre, {felt}, obstacles, weights, handsAt(moved), n, options.prefer ?? null);
    if (boards.board.handsClear || Object.values(moved).every((h) => h.dx === 0)) return stageOf(moved, boards);
    const still = placeBoards(box, fit, centre, {felt}, obstacles, weights, handsAt({}), n, options.prefer ?? null);
    return still.board.handsClear ? stageOf({}, still) : stageOf(moved, boards);
};

// ── the winner's banner ──
//
// While a result shows, the banner (each winner's look, "Ana wins 1,200" and the hand's name) and the
// line under it (the next deal's countdown, the pause) must never cover a seat's plate, a hand turned
// up, the dealer button or the board, whose five cards that play are lit. On a phone the board's
// neighbourhood is crowded — the side seats' turned-up cards sit right beside it — so the banner's
// place is chosen, not assumed: bannerPlan tries the full banner with the line under it, nearest the
// board on the pot's side (where the pot sat), then its other side, then out over the felt's empty
// bands, centred where it can be; then a compact banner (a line a winner, no avatar, wrapped when
// narrow) the same way; then each apart from the line; then the compact one cut short. The first
// that clears everything wins. The cut one says each head whole, or cut short without its chips (each
// seat's "+N" says them) — "Board 2: Ana", "Ana wins" — never inside a number or a board's name; it
// names fewer winners before it cuts a name, and then only to an ellipsis. What it clears is what is drawn: the banner and the line are drawn
// top-anchored at the place found, never wider than the room found there (their wrap's width), their
// line heights fixed in the stylesheet, and every text width it sizes them by an upper bound.

// What the banner and the line under it are drawn at (app/globals.css .pn-banner, .pn-banner-note;
// stage.test holds them to it): the full banner's padding, its rows' gap and its avatar, by fit — a
// row is the avatar beside the name's line (14 px on 20) over the hand's (12 on 16); the compact
// banner's padding and gap, a 12-on-16 line a winner, no avatar; the line's pill; the gap under the
// banner; the widest chrome border any visual style draws (brutalist's, 2 px a side); and the room
// kept between the banner and anything it must not cover. It comes in where it lands, growing from
// 90 % of its size (.pn-banner-drop), so on its way in it covers nothing its place does not.
export const BANNER = {
    full: {
        pad: {tight: {x: 8, y: 3}, compact: {x: 12, y: 6}, comfortable: {x: 12, y: 6}} as Record<Fit, {x: number; y: number}>,
        rowGap: {tight: 2, compact: 4, comfortable: 4} as Record<Fit, number>,
        avatar: {tight: 20, compact: 26, comfortable: 26} as Record<Fit, number>,
        avatarGap: 8,
        head: {px: 14, line: 20},
        hand: {px: 12, line: 16},
    },
    compact: {pad: {x: 8, y: 2}, rowGap: 2, px: 12, line: 16},
    note: {pad: {x: 12, y: 2}, px: 12, line: 16, gap: 6},
    border: 2,
    clear: 4,
    // The most winners it names.
    rows: 3,
    // The widest it is drawn: 92 % of the table, at most 22rem.
    capShare: 0.92,
    capPx: 352,
} as const;

// A card that plays rises 6 px (.pn-card[data-state="win"]) inside a 2 px ring; a seat's status flag
// (.pn-plate-flag, 15 px, at most 28 px wider than the plate) hangs 55 % of itself under the plate;
// a seat's turned-up cards sit 3 px over a bottom or side plate, 10 px under a top one, 2 px apart —
// a hand of more than two (PLO's four) overlapping instead, each card SHOWN_STEP of a card on from the
// one before (.pn-seat-shown[data-count]), so every card's index stays in sight.
const LIT = {lift: 6, ring: 2} as const;
const FLAG = {h: 15, below: 0.55, wider: 28} as const;
export const SHOWN_OFF = {over: 3, under: 10, gap: 2} as const;
export const SHOWN_STEP = 0.56;

// How wide a seat's turned-up hand of `count` cards is drawn, the cards alone: two side by side, more
// overlapping by SHOWN_STEP — PLO's four at 75 px on a compact table, 64 tight, 107 comfortable.
export const shownHandWidth = (fit: Fit, count = 2): number => {
    const card = SHOWN_CARD_PX[fit];
    return count <= 2 ? 2 * card + SHOWN_OFF.gap : card * (1 + (count - 1) * SHOWN_STEP);
};

// A line's width at `px` (semibold when `bold`), from each character's advance in em — an upper bound
// for the app's text faces (Hanken Grotesk, Inter): the narrow marks and letters, the slim ones, the
// wide, capitals, figures and the rest; a character past Latin's scripts (a name in another script,
// an emoji) a whole em; the marks that isolate a name or join an emoji none.
const NARROW = new Set([...' .,:;\'!|ijlI·']);
const SLIM = new Set([...'frt()-1']);
const WIDE = new Set([...'mwMW@%']);
export const textWidth = (text: string, px: number, bold = false): number => {
    let em = 0;
    for (const ch of text) {
        const c = ch.codePointAt(0) ?? 0;
        if (c === 0x2068 || c === 0x2069 || c === 0x200d || (c >= 0xfe00 && c <= 0xfe0f) || (c >= 0x300 && c <= 0x36f)) continue;
        em += NARROW.has(ch) ? 0.3 : SLIM.has(ch) ? 0.4 : WIDE.has(ch) ? 0.9 : ch >= 'A' && ch <= 'Z' ? 0.72 : ch >= '0' && ch <= '9' ? 0.62 : c >= 0x2e80 ? 1 : 0.58;
    }
    return Math.ceil(em * px * (bold ? 1.06 : 1));
};

// What the banner says: a line for each winner it names (at most three) — the head, "You win 70" or
// "Ana wins 1,200"; the head cut short, without its chips, in three parts (`short`: the words before the
// name, the name, the words after — "Board 2: " "Ana" ""), of which only the name is ever cut; and the
// hand's name or null — and the line under it, or null.
export type BannerText = {winners: readonly {head: string; short?: {lead: string; name: string; tail: string}; hand: string | null}[]; note: string | null};
// A winner's "+N" (the seat and what it won), rising over its seat while the pots pay out.
export type WinPop = {seat: number; amount: number};
// What the table shows beside it: the seats nobody sits in (an open seat's ring, no plate), the seats
// whose cards are turned up on the felt and how many cards a hand there shows (the game's: two, four
// in PLO), the dealer button's seat, the pots' pills (potPlan's, which stay on while their chips stream
// out under the banner) and the winners' "+N".
export type BannerSeen = {
    open: readonly number[]; shown: readonly number[]; button: number | null; pots?: readonly Rect[]; pops?: readonly WinPop[];
    handSize?: number;
};
// The full banner (the avatar, the head over the hand's name); the compact one (no avatar, a line a
// winner — "You win 70 · Full house, threes full of fives" — wrapped when narrow); the compact one cut
// to a line a winner with an ellipsis, when nothing else has room.
export type BannerVariant = 'full' | 'compact' | 'cut';
// A piece drawn top-anchored: its centre's x, its top, the most it may be wide, its height.
export type BannerPiece = {x: number; top: number; width: number; height: number};
// The plan: which banner, how many of the winners it names (the first `rows`), where it and the line
// under it go (no line when there is none, or no room for it), and whether the cut banner says each
// head cut short (`short`: where its room is narrower than the heads whole).
export type BannerPlan = {variant: BannerVariant; rows: number; banner: BannerPiece; note: BannerPiece | null; clear: boolean; short: boolean};

// The least of a name a cut banner keeps: a letter and the ellipsis (an upper bound, in textWidth's terms).
const NAME_LEAST = 'W…';

export const pieceRect = (p: BannerPiece): Rect => ({x: p.x, y: p.top + p.height / 2, w: p.width, h: p.height});

// A seat's turned-up cards as drawn (.pn-seat-shown), `count` of them, the lift and ring of a card
// that plays included.
export const shownHandRect = (place: Pick<SeatPlace, 'plate' | 'spot'> & {shownDx?: number; shownDy?: number}, stage: Pick<Stage, 'plateSize' | 'fit'>, count = 2): Rect => {
    const card = SHOWN_CARD_PX[stage.fit];
    const h = card * CARD_RATIO;
    const top = place.spot.side === 'top'
        ? place.plate.y + stage.plateSize.h / 2 + SHOWN_OFF.under
        : place.plate.y - stage.plateSize.h / 2 - SHOWN_OFF.over - h;
    const lit = LIT.lift + LIT.ring;
    return {x: place.plate.x + (place.shownDx ?? 0), y: top - lit + (h + lit) / 2 + (place.shownDy ?? 0), w: shownHandWidth(stage.fit, count) + 2 * LIT.ring, h: h + lit};
};

// Where each hand that may turn up is drawn across from its plate (SeatPlace.shownDx). A side seat's
// hand over its plate and the top corner's under its own meet on a phone, and two neighbours along
// the top meet when a row is full: placed side and bottom seats first, then the top row, each by its
// slot, a hand that meets one placed before it moves along its row — toward the table's middle first,
// then the other way, two pixels at a time, up to two plates' widths — to the first place inside the
// box clear of every hand placed, every other plate and (two cards, the board placed first) the board
// with its lit cards' lift; where none is clear (seven seats or more on the smallest phones, every
// seat's hand up), it stays. The dealer button it may cover for the seconds a showdown lasts, as a hand
// at its own place may: every seat has a place for the button, and keeping clear of all of them would
// leave the hands nowhere to go. Every seat's but the seated viewer's,
// whose cards are in the dock, so a hand's place never moves while a hand is played.
const NUDGE_REACH = 2;
// Whether two hands turned up meet: their cards, a lit card's lift above one allowed under the other
// (it rises only into the foot of the hand over it, never to its corner's index).
export const handsMeet = (a: Rect, b: Rect): boolean =>
    Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2 - LIT.lift;
const nudgeHands = (
    showing: readonly {seat: number; slot: number; spot: SeatSpot; plate: Px}[], stage: Pick<Stage, 'plateSize' | 'fit'>, box: Box, centre: Px,
    fixed: readonly {r: Rect; seat: number}[], count: number,
): Record<number, number> => {
    const dx: Record<number, number> = {};
    const placed: {seat: number; r: Rect}[] = [];
    const bases = new Map(showing.map((p) => [p.seat, shownHandRect(p, stage, count)]));
    const toMiddle = (p: {plate: Px}) => (centre.x >= p.plate.x ? 1 : -1);
    // The nearest place along its row for a hand, clear of `others`; null when there is none.
    const slide = (p: {seat: number; plate: Px}, others: readonly Rect[]): number | null => {
        const base = bases.get(p.seat)!;
        for (let d = 2; d <= stage.plateSize.w * NUDGE_REACH; d += 2) for (const sign of [toMiddle(p), -toMiddle(p)]) {
            const r = {...base, x: base.x + sign * d};
            if (insideBox(r, box) && others.every((q) => !handsMeet(r, q)) && fixed.every((q) => q.seat === p.seat || !overlaps(r, q.r))) return sign * d;
        }
        return null;
    };
    const order = [...showing].sort((a, b) => Number(a.spot.side === 'top') - Number(b.spot.side === 'top') || a.slot - b.slot);
    for (const p of order) {
        const base = bases.get(p.seat)!;
        let at = 0;
        if (placed.some((q) => handsMeet(base, q.r))) {
            const moved = slide(p, placed.map((q) => q.r));
            if (moved !== null) at = moved;
            else {
                // No room for it along its row: the hand it meets slides instead, where that one has room,
                // this one staying where it was.
                for (const q of placed.filter((o) => handsMeet(base, o.r))) {
                    const them = showing.find((o) => o.seat === q.seat)!;
                    const theirs = slide(them, [...placed.filter((o) => o !== q).map((o) => o.r), base]);
                    if (theirs === null) continue;
                    dx[q.seat] = theirs;
                    q.r = {...bases.get(q.seat)!, x: bases.get(q.seat)!.x + theirs};
                }
            }
        }
        dx[p.seat] = at;
        placed.push({seat: p.seat, r: {...base, x: base.x + at}});
    }
    return dx;
};

// Where each hand that may turn up is drawn (SeatPlace.shownDx, shownDy). First along its row
// (nudgeHands); where that still leaves a hand over another seat's plate, under the flag a plate may
// hang ("Folded", "All in"), over another hand or (two cards) the board — a crowded column of side
// seats on a small phone, nine seats at 375 × 667, seven or more on a phone on its side — every hand
// is placed again, a seat at a time and round again until none moves, at the place that covers least:
// along its row, beside its plate toward the table's middle (anywhere from a little over it to a
// little under it), or on the plate's other side (under a side or bottom seat's, over a top seat's),
// each a few pixels at a time; then two hands that still meet are placed together. Covering a plate
// weighs most, then the board, a pots' band by the board (potBands), another hand, a flag as wide as
// "Out of chips", and one as wide as any flag is drawn; never its own plate, never outside the box —
// and one of the pots' bands is kept clear, over a hand meeting another. Where every hand has room,
// that is where it goes. Texas hold'em's and Triple T's hands of two; PLO's four keep the row's nudge.
export type HandPlace = {dx: number; dy: number};
// The hands moved along their rows alone (nudgeHands), as places.
const nudged = (showing: readonly Showing[], stage: Pick<Stage, 'plateSize' | 'fit'>, box: Box, centre: Px, fixed: readonly {r: Rect; seat: number}[], count: number): HandPlaces => {
    const slid = nudgeHands(showing, stage, box, centre, fixed, count);
    return Object.fromEntries(showing.map((p) => [p.seat, {dx: slid[p.seat] ?? 0, dy: 0}]));
};
// The bands over and under a board where its pots go (potPlan looks there first): a pill's height and
// its room, as wide as the board or the pot's default pill. A hand moved off a plate keeps out of them
// where it can, so the pots keep a place by the board.
const potBands = (board: Rect, fit: Fit): Rect[] => {
    const h = POT_PILL_H + 2 * POT_CLEAR;
    const w = Math.max(board.w, POT[fit].w);
    return [
        {x: board.x, y: board.y - board.h / 2 - LIT.lift - LIT.ring - h / 2, w, h},
        {x: board.x, y: board.y + board.h / 2 + h / 2, w, h},
    ];
};
export type HandPlaces = Record<number, HandPlace>;
type Showing = {seat: number; slot: number; spot: SeatSpot; plate: Px};
const HAND_WEIGHT = {plate: 1000, board: 400, reserve: 350, hand: 300, band: 100, flag: 30, wideFlag: 6} as const;
// The search's steps: 2 px along a row (as nudgeHands), 4 px across the space beside a plate.
const HAND_STEP = 2;
const BESIDE_STEP = 4;
// The words a flag at a showdown is sized by: the longest a seat dealt in may say then.
const SHOWDOWN_FLAG = 'Out of chips';
const placeHands = (
    showing: readonly Showing[], stage: Pick<Stage, 'plateSize' | 'fit'>, box: Box, centre: Px,
    fixed: readonly {r: Rect; seat: number}[], flagged: readonly {seat: number; plate: Px}[], count: number, reserve: readonly Rect[] = [],
): HandPlaces => {
    const start = nudged(showing, stage, box, centre, fixed, count);
    if (showing.length === 0) return start;
    const {w: plateW, h: plateH} = stage.plateSize;
    const bases = new Map(showing.map((p) => [p.seat, shownHandRect(p, stage, count)]));
    const flags = flagged.map((f) => ({
        seat: f.seat,
        r: flagRect({plate: f.plate}, stage, SHOWDOWN_FLAG),
        wide: {x: f.plate.x, y: f.plate.y + plateH / 2 + FLAG.h * FLAG.below - FLAG.h / 2, w: plateW + FLAG.wider, h: FLAG.h},
    }));
    const at = (p: Showing, h: HandPlace): Rect => {
        const base = bases.get(p.seat)!;
        return {...base, x: base.x + h.dx, y: base.y + h.dy};
    };
    // What covering costs for seat p's hand at r, the other hands where they are now; bands[i] what
    // covering the pots' band i weighs in this search.
    const cost = (p: Showing, r: Rect, now: HandPlaces, bands: readonly number[]): number => {
        if (!insideBox(r, box)) return Infinity;
        let c = 0;
        for (const q of fixed) {
            if (!overlaps(r, q.r)) continue;
            if (q.seat === p.seat) return Infinity;
            c += q.seat === -1 ? HAND_WEIGHT.board : HAND_WEIGHT.plate;
        }
        // A flag is weighed against the cards alone: a card that plays lifts over one only for a moment.
        const cards = {...r, y: r.y + LIT.lift / 2, h: r.h - LIT.lift};
        for (const f of flags) {
            if (overlaps(cards, f.r)) c += HAND_WEIGHT.flag;
            else if (overlaps(cards, f.wide)) c += HAND_WEIGHT.wideFlag;
        }
        for (const o of showing) if (o.seat !== p.seat && now[o.seat] && handsMeet(r, at(o, now[o.seat]))) c += HAND_WEIGHT.hand;
        reserve.forEach((band, i) => {
            if (bands[i] > 0 && overlaps(r, band)) c += bands[i];
        });
        return c;
    };
    const soft = reserve.map(() => HAND_WEIGHT.band);
    const clean = showing.every((p) => cost(p, at(p, start[p.seat]), start, soft) < HAND_WEIGHT.wideFlag);
    if (clean) return start;

    // Every place a seat's hand may go, the nearest first: its row, beside its plate, its other side —
    // each next to its own plate, so the hand still reads as that seat's: a side seat's moves along its
    // row at most half a plate's width, and a seat along the top or the bottom as far as two.
    const handW = bases.values().next().value!.w;
    const handH = bases.values().next().value!.h;
    const slides = (p: Showing): number[] => {
        const reach = p.spot.side === 'left' || p.spot.side === 'right' ? plateW / 2 : plateW * NUDGE_REACH;
        const out = [0];
        for (let d = HAND_STEP; d <= reach; d += HAND_STEP) out.push(d, -d);
        return out;
    };
    const places = (p: Showing): (HandPlace & {pref: number})[] => {
        const base = bases.get(p.seat)!;
        const out: (HandPlace & {pref: number})[] = slides(p).map((dx) => ({dx, dy: 0, pref: Math.abs(dx) / 40}));
        const signs = Math.abs(centre.x - p.plate.x) < 1 ? [1, -1] : [centre.x > p.plate.x ? 1 : -1];
        for (const sign of signs) {
            for (let k = 0; k <= plateW / 2; k += BESIDE_STEP) {
                const x = p.plate.x + sign * (plateW / 2 + handW / 2 + k);
                for (let y = p.plate.y - (plateH + handH) / 2; y <= p.plate.y + (plateH + handH) / 2; y += BESIDE_STEP) {
                    out.push({dx: Math.round(x - base.x), dy: Math.round(y - base.y), pref: 4 + (k + Math.abs(y - p.plate.y)) / 40});
                }
            }
        }
        // The plate's other side: under a side or bottom seat's plate, over a top seat's.
        const top = p.spot.side === 'top';
        const otherY = top ? p.plate.y - plateH / 2 - SHOWN_OFF.over - handH / 2 : p.plate.y + plateH / 2 + SHOWN_OFF.under + handH / 2 - LIT.lift - LIT.ring;
        for (const dx of slides(p).filter((d) => Math.abs(d) <= plateW / 2)) out.push({dx, dy: Math.round(otherY - base.y), pref: 2 + Math.abs(dx) / 40});
        return out;
    };
    const choices = new Map(showing.map((p) => [p.seat, places(p)]));
    const order = [...showing].sort((a, b) => Number(a.spot.side === 'top') - Number(b.spot.side === 'top') || a.slot - b.slot);

    // A seat at a time to its cheapest place, round again until none moves; then two hands that still
    // meet — where neither alone has a better place (mirror seats both reaching for the same band) —
    // placed together: each of one's cheapest places, with the other's cheapest beside it.
    const PAIR_KEEP = 24;
    const search = (bands: readonly number[]): HandPlaces => {
        const now: HandPlaces = {...start};
        const descend = () => {
            for (let pass = 0; pass < 6; pass++) {
                let moved = false;
                for (const p of order) {
                    const here = now[p.seat];
                    const hereCost = cost(p, at(p, here), now, bands);
                    if (hereCost < HAND_WEIGHT.wideFlag) continue;
                    let best = here;
                    let bestCost = hereCost;
                    for (const c of choices.get(p.seat)!) {
                        const total = cost(p, at(p, c), now, bands) + c.pref;
                        if (total < bestCost) {
                            best = {dx: c.dx, dy: c.dy};
                            bestCost = total;
                        }
                    }
                    if (best !== here) {
                        now[p.seat] = best;
                        moved = true;
                    }
                }
                if (!moved) break;
            }
        };
        descend();
        let repaired = false;
        for (const p of order) for (const q of order) {
            if (q.seat <= p.seat || !handsMeet(at(p, now[p.seat]), at(q, now[q.seat]))) continue;
            const without = (seat: number): HandPlaces => Object.fromEntries(Object.entries(now).filter(([k]) => Number(k) !== seat));
            const rest = without(q.seat);
            const cheapest = choices.get(p.seat)!.map((c) => ({c, k: cost(p, at(p, c), rest, bands) + c.pref})).filter((x) => x.k < HAND_WEIGHT.hand)
                .sort((x, y) => x.k - y.k).slice(0, PAIR_KEEP);
            const pairNow = cost(p, at(p, now[p.seat]), now, bands) + cost(q, at(q, now[q.seat]), now, bands);
            let best: {a: HandPlace; b: HandPlace; k: number} | null = null;
            for (const x of cheapest) {
                const withP = {...rest, [p.seat]: {dx: x.c.dx, dy: x.c.dy}};
                for (const c of choices.get(q.seat)!) {
                    if (handsMeet(at(p, x.c), at(q, c))) continue;
                    const k = x.k + cost(q, at(q, c), withP, bands) + c.pref;
                    if (!best || k < best.k) best = {a: {dx: x.c.dx, dy: x.c.dy}, b: {dx: c.dx, dy: c.dy}, k};
                }
            }
            if (best && best.k < pairNow) {
                now[p.seat] = best.a;
                now[q.seat] = best.b;
                repaired = true;
            }
        }
        if (repaired) descend();
        return now;
    };
    // The pots keep at least one of their bands: where the search leaves a hand in both, it is run again
    // with the band fewer hands took kept firmly clear (over a hand meeting another) and the other free.
    const placed = search(soft);
    const taken = reserve.map((band) => showing.filter((p) => overlaps(at(p, placed[p.seat]), band)).length);
    if (reserve.length === 0 || taken.some((n) => n === 0)) return placed;
    const keep = taken.indexOf(Math.min(...taken));
    return search(reserve.map((_, i) => (i === keep ? HAND_WEIGHT.reserve : 0)));
};

// An open seat's ring (.pn-open-seat): max(44 px, 95 % of the plate's height) across.
export const openSeatPx = (stage: Pick<Stage, 'plateSize'>): number => Math.max(44, stage.plateSize.h * 0.95);

// Text in the mono face (JetBrains Mono, IBM Plex Mono): 0.6 em a character, whatever the weight.
export const MONO_EM = 0.6;

// A winner's "+N" (.pn-win-pop-text): BANK_COPY.net's words in the mono face at 13 px on the page's
// 1.5 line, rising (.pn-win-pop) from 6 px under its place to 18 px over it; its place's foot on the
// plate's top, or on the top of the cards a side or bottom seat has turned up (`shown`).
export const WIN_POP = {px: 13, line: 1.5, from: 6, to: 18} as const;
export const winPopRect = (place: Pick<SeatPlace, 'plate' | 'spot'>, stage: Pick<Stage, 'plateSize' | 'fit'>, shown: boolean, amount: number): Rect => {
    const plateTop = place.plate.y - stage.plateSize.h / 2;
    const foot = shown && place.spot.side !== 'top' ? plateTop - SHOWN_OFF.over - SHOWN_CARD_PX[stage.fit] * CARD_RATIO : plateTop;
    const top = foot - WIN_POP.to - WIN_POP.px * WIN_POP.line;
    const bottom = foot + WIN_POP.from;
    return {x: place.plate.x, y: (top + bottom) / 2, w: Math.ceil(BANK_COPY.net(amount).length * MONO_EM * WIN_POP.px), h: bottom - top};
};

// Everything the banner must not cover: every seated player's plate and the status flag that may hang
// under it, every open seat's ring, each turned-up hand, the dealer button, the board with its lit
// cards' lift, the pots' pills and the winners' "+N" as they rise.
export const bannerObstacles = (stage: Stage, seen: BannerSeen): Rect[] => [
    ...tableObstacles(stage, seen),
    ...(seen.pots ?? []),
    ...(seen.pops ?? []).flatMap((pop) => (stage.seats[pop.seat] ? [winPopRect(stage.seats[pop.seat], stage, seen.shown.includes(pop.seat), pop.amount)] : [])),
];

// The same less the pots and the "+N": what the banner and the pots both keep clear of — by part:
// the plates and open seats' rings, the flags under the plates, the hands turned up, and the dealer
// button with the board and its lit cards' lift.
const tableParts = (stage: Stage, seen: Pick<BannerSeen, 'open' | 'shown' | 'button' | 'handSize'>): {plates: Rect[]; flags: Rect[]; shown: Rect[]; fixed: Rect[]} => {
    const plates: Rect[] = [];
    const flags: Rect[] = [];
    const ring = openSeatPx(stage);
    for (const p of stage.seats) {
        if (seen.open.includes(p.seat)) {
            plates.push(rect(p.plate, {w: ring, h: ring}));
            continue;
        }
        plates.push(rect(p.plate, stage.plateSize));
        const bottom = p.plate.y + stage.plateSize.h / 2;
        flags.push({x: p.plate.x, y: bottom + FLAG.h * FLAG.below - FLAG.h / 2, w: stage.plateSize.w + FLAG.wider, h: FLAG.h});
    }
    const shown = seen.shown.flatMap((seat) => (stage.seats[seat] ? [shownHandRect(stage.seats[seat], stage, seen.handSize)] : []));
    const fixed: Rect[] = [];
    const button = seen.button === null ? undefined : stage.seats[seen.button];
    if (button) fixed.push(rect(button.button, {w: stage.buttonSize, h: stage.buttonSize}));
    const lit = LIT.lift + LIT.ring;
    fixed.push({x: stage.board.x, y: stage.board.y - lit / 2, w: stage.board.w + 2 * LIT.ring, h: stage.board.h + lit});
    return {plates, flags, shown, fixed};
};
const tableObstacles = (stage: Stage, seen: BannerSeen): Rect[] => {
    const t = tableParts(stage, seen);
    return [...t.plates, ...t.flags, ...t.shown, ...t.fixed];
};

// ── a seat's status flag ──
//
// A plate's status flag (.pn-plate-flag: 11 px bold, 10 on a tight table, on a 15 px line, 6 px a side
// inside the widest chrome border, never more than 28 px wider than the plate) hangs 55 % of itself
// under the plate. In a crowded side column — a phone on its side, seven seats or more — that is where
// the next plate down draws its blind's mark and the cards face down before it, or the plate itself:
// flagRoom says whether a flag clears every other seat's plate (an open seat's ring), its cards face
// down, its blind's mark and its own flag, so a status every plate shows at once (Triple T's
// "Discarding…", components/poker-night/SeatRing) is drawn on the plate instead where it has none.
export const FLAG_PX: Record<Fit, number> = {tight: 10, compact: 11, comfortable: 11};
export const flagRect = (place: Pick<SeatPlace, 'plate'>, stage: Pick<Stage, 'plateSize' | 'fit'>, text: string): Rect => ({
    x: place.plate.x,
    y: place.plate.y + stage.plateSize.h / 2 + FLAG.h * FLAG.below - FLAG.h / 2,
    w: Math.min(stage.plateSize.w + FLAG.wider, textWidth(text, FLAG_PX[stage.fit], true) + 2 * (6 + BANNER.border)),
    h: FLAG.h,
});
// What a seat draws round its spot, as flagRoom weighs it: an open seat's ring, else its plate, the
// cards face down before it (how many), its blind's mark and its flag's words.
export type SeatMarks = {seat: number; open: boolean; backs: number; blind: boolean; flag: string | null};
export const flagRoom = (stage: Stage, seat: number, text: string, seats: readonly SeatMarks[]): boolean => {
    const place = stage.seats[seat];
    if (!place) return false;
    const flag = flagRect(place, stage, text);
    const ring = openSeatPx(stage);
    return seats.every((o) => {
        const p = o.seat === seat ? undefined : stage.seats[o.seat];
        if (!p) return true;
        const drawn: Rect[] = o.open ? [rect(p.plate, {w: ring, h: ring})] : [
            rect(p.plate, stage.plateSize),
            ...(o.backs > 0 ? [seatCardsRect(p, stage, o.backs)] : []),
            ...(o.blind ? [blindRect(p, stage)] : []),
            ...(o.flag ? [flagRect(p, stage, o.flag)] : []),
        ];
        return drawn.every((r) => !overlaps(flag, r));
    });
};

// The seats whose status has no room under the plate (flagRoom, every other seat's flag counted as
// hanging): their plate carries it instead — Triple T's "Discarding…" as a dashed ring, any other
// word in place of the stack (components/poker-night/Seat) — so no status is ever drawn over a plate,
// the cards before it, a blind's mark or another flag.
export const flagsOnPlate = (stage: Stage, seats: readonly SeatMarks[]): Set<number> =>
    new Set(seats.filter((m) => m.flag !== null && !m.open && !flagRoom(stage, m.seat, m.flag, seats)).map((m) => m.seat));

// ── finding room ──

type Span = [number, number];

// The free spans across the band [top, top + h]: the box's width (or the part of it `within` names)
// less every obstacle reaching into the band, widened on each side by the room kept (`clear`). A
// rectangle that band tall clears everything exactly when it lies inside one of them.
const freeSpans = (top: number, h: number, avoid: readonly Rect[], box: Box, clear: number = BANNER.clear, within: Span = [0, box.w]): Span[] => {
    if (top < 0 || top + h > box.h) return [];
    const blocked: Span[] = [];
    for (const o of avoid) {
        if (Math.abs(top + h / 2 - o.y) >= (h + o.h) / 2 + clear) continue;
        blocked.push([o.x - o.w / 2 - clear, o.x + o.w / 2 + clear]);
    }
    blocked.sort((a, b) => a[0] - b[0]);
    const spans: Span[] = [];
    const end = Math.min(box.w, within[1]);
    let from = Math.max(0, within[0]);
    for (const [a, b] of blocked) {
        if (from >= end) break;
        if (a > from) spans.push([from, Math.min(a, end)]);
        from = Math.max(from, b);
    }
    if (from < end) spans.push([from, end]);
    return spans.filter(([a, b]) => b > a);
};

// Where the middle of a piece `w` wide may sit inside the spans.
const centres = (spans: readonly Span[], w: number): Span[] => spans.filter(([a, b]) => b - a >= w).map(([a, b]) => [a + w / 2, b - w / 2]);

const intersect = (xs: readonly Span[], ys: readonly Span[]): Span[] =>
    xs.flatMap(([a, b]) => ys.flatMap(([c, d]): Span[] => (Math.max(a, c) <= Math.min(b, d) ? [[Math.max(a, c), Math.min(b, d)]] : [])));

const nearest = (spans: readonly Span[], want: number): number | null => {
    let best: number | null = null;
    for (const [a, b] of spans) {
        const x = Math.min(b, Math.max(a, want));
        if (best === null || Math.abs(x - want) < Math.abs(best - want)) best = x;
    }
    return best;
};

// The widest a piece may be inside the spans with its middle in `allowed` (anywhere when null).
const widestIn = (spans: readonly Span[], allowed: readonly Span[] | null): number => {
    let best = 0;
    for (const [a, b] of spans) {
        const mid = (a + b) / 2;
        const at = allowed === null ? mid : nearest(intersect([[a, b]], allowed), mid);
        if (at !== null) best = Math.max(best, 2 * Math.min(at - a, b - at));
    }
    return best;
};

// A banner to place: its height at a width (the compact one wraps), its widest and narrowest, and the
// line under it in its column (its height and width), or none.
type Shape = {height: (w: number) => number; widest: number; least: number; note: {h: number; w: number} | null};
// What a shape is placed near: a centre line and a span of height (the board's, from its lit cards'
// top to its foot; or one line, under the banner, for the line on its own).
type Anchor = {x: number; top: number; bottom: number};
type Placed = {x: number; top: number; w: number; h: number};

// The place for a shape nearest `anchor`, its edge `gap` px up or down from the anchor's span — a
// pixel apart, both ways, the side `prefer` names first — at the x nearest the anchor's, as wide as
// it can be there up to its widest (a narrower compact banner wraps taller, so the width settles in a
// few steps). The cost: the gap, twice the distance across, the height wrapping added, and a pixel
// off the preferred side. Null when no gap has room.
const placeShape = (shape: Shape, avoid: readonly Rect[], box: Box, anchor: Anchor, prefer: 'up' | 'down' | null): Placed | null => {
    const gapUnder = BANNER.note.gap;
    const base = shape.height(shape.widest);
    const extra = shape.note ? gapUnder + shape.note.h : 0;
    let best = null as (Placed & {cost: number}) | null;
    const tryEdge = (gap: number, side: 'up' | 'down') => {
        let w = shape.widest;
        for (let step = 0; step < 8 && w >= shape.least; step++) {
            const h = shape.height(w);
            const top = side === 'down' ? anchor.bottom + gap : anchor.top - gap - h - extra;
            if (top < 0 || top + h + extra > box.h) return;
            const spans = freeSpans(top, h, avoid, box);
            const under = shape.note ? centres(freeSpans(top + h + gapUnder, shape.note.h, avoid, box), shape.note.w) : null;
            const room = widestIn(spans, under);
            if (room >= w) {
                const x = nearest(under ? intersect(centres(spans, w), under) : centres(spans, w), anchor.x);
                if (x === null) return;
                const cost = gap + 2 * Math.abs(x - anchor.x) + (h - base) + (prefer && side !== prefer ? 1 : 0);
                if (!best || cost < best.cost) best = {x, top, w, h, cost};
                return;
            }
            w = Math.floor(room);
        }
    };
    const sides: ('up' | 'down')[] = prefer === 'down' ? ['down', 'up'] : ['up', 'down'];
    for (let gap = 0; gap <= box.h; gap++) {
        if (best && gap > best.cost) break;
        for (const side of sides) tryEdge(gap, side);
    }
    return best && {x: best.x, top: best.top, w: best.w, h: best.h};
};

// The widest a band `h` tall with its top at `top`, centred on x, may be and clear everything.
const clearWidth = (x: number, top: number, h: number, avoid: readonly Rect[], box: Box): number => {
    const span = freeSpans(top, h, avoid, box).find(([a, b]) => a <= x && x <= b);
    return span ? 2 * Math.min(x - span[0], span[1] - x) : 0;
};

// How many lines words take wrapped greedily at `width`, as a browser fills a line, a space apart; a
// word wider than the line broken across as many as it needs (overflow-wrap: anywhere). With every
// word and space estimated no narrower than drawn, the lines drawn are never more than these.
export const wrappedLines = (words: readonly number[], space: number, width: number): number => {
    let lines = 1;
    let used = 0;
    for (const w of words) {
        if (used > 0 && used + space + w <= width) {
            used += space + w;
            continue;
        }
        if (used > 0) lines++;
        if (w <= width) {
            used = w;
            continue;
        }
        const pieces = Math.ceil(w / width);
        lines += pieces - 1;
        used = w - (pieces - 1) * width;
    }
    return lines;
};

// Where the winner's banner and the line under it go (see above). For the winners it names, in order:
// the full banner with the line under it; the compact one with the line under it (on a line each
// winner, else wrapped narrower); each of those on its own with the line, whole, on its own nearest
// the place under it; the compact one cut short, with the line under it, then on its own. Failing
// a place for the line, the first banner placed without it (the top bar says a pause too); failing
// any banner, the same naming one winner fewer. `clear` is false only when nothing cleared
// everything: the banner then sits where the pot was, at its full size.
export const bannerPlan = (stage: Stage, text: BannerText, seen: BannerSeen): BannerPlan => {
    const {box, fit, board} = stage;
    const B = BANNER.border;
    const cap = Math.min(box.w * BANNER.capShare, BANNER.capPx);
    const fits = (w: number) => Math.min(cap, Math.ceil(w));
    const full = BANNER.full;
    const small = BANNER.compact;
    const n = BANNER.note;
    const noteH = 2 * (n.pad.y + B) + n.line;
    const noteW = text.note === null ? 0 : fits(2 * (n.pad.x + B) + textWidth(text.note, n.px));
    const note = text.note === null ? null : {h: noteH, w: noteW};
    const avoid = bannerObstacles(stage, seen);
    // The pot's side of the board, where the pot sat; while the pots' pills are still on, the other.
    const pots = seen.pots ?? [];
    const prefer: 'up' | 'down' = pots.length > 0
        ? (pots.reduce((s, r) => s + r.y, 0) / pots.length <= board.y ? 'down' : 'up')
        : stage.potOnBoard || stage.pot.y <= board.y ? 'up' : 'down';
    const anchor: Anchor = {x: board.x, top: board.y - board.h / 2 - LIT.lift - LIT.ring, bottom: board.y + board.h / 2};
    const piece = (x: number, top: number, h: number, against: readonly Rect[]): BannerPiece =>
        ({x, top, width: Math.min(cap, clearWidth(x, top, h, against, box)), height: h});
    // Whether a cut banner as wide as `width` says the heads cut short: narrower than every head whole
    // and an ellipsis.
    const cutShort = (variant: BannerVariant, rows: number, width: number): boolean => {
        if (variant !== 'cut') return false;
        const heads = Math.max(0, ...text.winners.slice(0, rows).map((w) => textWidth(w.head, small.px, true)));
        return width < 2 * (small.pad.x + B) + heads + textWidth(' …', small.px);
    };

    // The banner's three shapes naming the first `rows` winners; the cut one, with `names`, cutting a
    // name to an ellipsis where it has to.
    const shapes = (rows: number, names = false): Record<BannerVariant, Omit<Shape, 'note'>> => {
        const winners = text.winners.slice(0, rows);
        const k = Math.max(1, winners.length);
        const fullH = 2 * (full.pad[fit].y + B) + (k - 1) * full.rowGap[fit]
            + (winners.length === 0 ? full.avatar[fit] : winners.reduce((s, w) => s + Math.max(full.avatar[fit], full.head.line + (w.hand ? full.hand.line : 0)), 0));
        const fullW = fits(2 * (full.pad[fit].x + B) + full.avatar[fit] + full.avatarGap
            + Math.max(0, ...winners.map((w) => Math.max(textWidth(w.head, full.head.px, true), w.hand ? textWidth(w.hand, full.hand.px) : 0))));
        // Compact: each winner's head in semibold, a dot, the hand's name, wrapped at the width found.
        const chrome = 2 * (small.pad.x + B);
        const space = textWidth(' ', small.px);
        const words = winners.map((w) => [
            ...w.head.split(' ').map((word) => textWidth(word, small.px, true)),
            ...(w.hand ? ['·', ...w.hand.split(' ')].map((word) => textWidth(word, small.px)) : []),
        ]);
        const oneLine = Math.max(0, ...words.map((ws) => ws.reduce((s, w) => s + w, 0) + space * (ws.length - 1)));
        const lineH = 2 * (small.pad.y + B) + (k - 1) * small.rowGap + k * small.line;
        const least = fits(chrome + 4 * small.px);
        const heads = Math.max(0, ...winners.map((w) => textWidth(w.head, small.px, true)));
        // Cut short: never inside a number or a board's name — at least as wide as the widest head cut
        // short (with `names`, its name cut as far as a letter and an ellipsis), at most as wide as it whole.
        const shortOf = (w: BannerText['winners'][number]) => w.short ?? {lead: w.head, name: '', tail: ''};
        const shorts = Math.max(0, ...winners.map((w) => textWidth(`${shortOf(w).lead}${shortOf(w).name}${shortOf(w).tail}`, small.px, true)));
        const floors = Math.max(0, ...winners.map((w) => {
            const {lead, name, tail} = shortOf(w);
            return textWidth(`${lead}${tail}`, small.px, true) + Math.min(textWidth(name, small.px, true), textWidth(NAME_LEAST, small.px, true));
        }));
        return {
            full: {height: () => fullH, widest: fullW, least: fullW},
            compact: {
                height: (w) => lineH + small.line * (words.reduce((s, ws) => s + wrappedLines(ws, space, Math.max(1, w - chrome)), 0) - k),
                widest: fits(chrome + oneLine), least,
            },
            // Cut short, a line each: every head whole and an ellipsis at most; where that has no room,
            // every head cut short (with `names`, its name to an ellipsis at the narrowest); four ems at least.
            cut: {height: () => lineH, widest: Math.max(least, fits(chrome + Math.max(shorts, heads + textWidth(' …', small.px)))), least: Math.max(least, fits(chrome + (names ? floors : shorts)))},
        };
    };

    const attempt = (rows: number, names = false): BannerPlan | null => {
        const shape = shapes(rows, names);
        const together = (variant: BannerVariant): BannerPlan | null => {
            const at = placeShape({...shape[variant], note}, avoid, box, anchor, prefer);
            if (!at) return null;
            const banner = piece(at.x, at.top, at.h, avoid);
            return {variant, rows, banner, note: note && piece(at.x, at.top + at.h + n.gap, noteH, avoid), clear: true, short: cutShort(variant, rows, banner.width)};
        };
        let alone: BannerPlan | null = null;
        const apart = (variant: BannerVariant): BannerPlan | null => {
            const at = placeShape({...shape[variant], note: null}, avoid, box, anchor, prefer);
            if (!at) return null;
            const banner = piece(at.x, at.top, at.h, avoid);
            const around = [...avoid, pieceRect(banner)];
            const under = banner.top + at.h + n.gap;
            const line = note && placeShape({height: () => noteH, widest: noteW, least: noteW, note: null}, around, box, {x: banner.x, top: under, bottom: under}, null);
            if (line) return {variant, rows, banner, note: piece(line.x, line.top, noteH, around), clear: true, short: cutShort(variant, rows, banner.width)};
            alone ??= {variant, rows, banner, note: null, clear: true, short: cutShort(variant, rows, banner.width)};
            return null;
        };
        const order: [BannerVariant, 'together' | 'apart'][] = names
            ? (note === null ? [['cut', 'together']] : [['cut', 'together'], ['cut', 'apart']])
            : note === null
                ? [['full', 'together'], ['compact', 'together'], ['cut', 'together']]
                : [['full', 'together'], ['compact', 'together'], ['full', 'apart'], ['compact', 'apart'], ['cut', 'together'], ['cut', 'apart']];
        for (const [variant, how] of order) {
            const plan = how === 'together' ? together(variant) : apart(variant);
            if (plan) return plan;
        }
        return alone;
    };

    // Every head whole (cut short at most) naming fewer winners — fewer boards — before a name is cut.
    const most = Math.min(BANNER.rows, Math.max(1, text.winners.length));
    for (const names of [false, true]) for (let rows = most; rows >= 1; rows--) {
        const plan = attempt(rows, names);
        if (plan) return plan;
    }
    // Nowhere clear: where the pot was, full size.
    const h = shapes(most).full.height(0);
    const column = h + (note ? n.gap + noteH : 0);
    const top = prefer === 'up' ? anchor.top - BANNER.clear - column : anchor.bottom + BANNER.clear;
    return {
        variant: 'full', rows: most, banner: {x: board.x, top, width: cap, height: h},
        note: note && {x: board.x, top: top + h + n.gap, width: cap, height: noteH}, clear: false, short: false,
    };
};

// The banner while a result shows (components/poker-night/TableScreen): clear of the pots paying out
// and the winners' "+N" as well where that leaves room. Both leave within a second or two of the
// payout (the pills once their chips have streamed out, a "+N" once it has risen), so where nothing
// clears them too the banner is placed clear of the table alone — over a pill or a "+N" for that
// moment at most, never over a plate for the whole pause after the hand.
export const resultBannerPlan = (stage: Stage, text: BannerText, seen: BannerSeen): BannerPlan => {
    const busy = bannerPlan(stage, text, seen);
    if (busy.clear || ((seen.pots?.length ?? 0) === 0 && (seen.pops?.length ?? 0) === 0)) return busy;
    return bannerPlan(stage, text, {...seen, pots: [], pops: []});
};

// The offset of `from` as seen from `to`: a flight's --pn-dx / --pn-dy (an element drawn at `to`
// starts that far away), whole pixels.
export const offset = (from: Px, to: Px): {dx: number; dy: number} => ({dx: Math.round(from.x - to.x), dy: Math.round(from.y - to.y)});

// ── the pots ──
//
// The pot, or the main pot and each side pot, as pills on the felt that must never cover a card (the
// board's, its lit cards' lift included; a seat's face-down pair; a hand turned up), a plate, its
// flag, a blind's mark, a bet line, the dealer button or a winner's "+N" — and on a phone the board's
// neighbourhood is crowded, so, like the banner's, the pots' place is chosen, not assumed. potPlan's
// layouts: every pot its own pill in one row, in full ("Main pot 600", "Side pot 1: 1,350"), chips on
// the first; the same in short ("Main 600", "Side 1: 1,350"), then without the chips; the short pills
// in two rows, three, … one a row; the side pots past the first few gathered into one pill ("2 more:
// 5,050"), in a row, then two; and every pot in one pill ("4 pots: 6,250"). Each is placed at its
// nearest to the board — over it, under it, beside it — on the felt inside its rail, clear of
// everything by POT_CLEAR, and the plan takes the nearest of them all, the fuller words weighing in
// their favour (POT_PENALTY): the pots' own words in one row a little further out before three rows
// on the board's edge, a pill for every pot before one for them all.
//
// What it keeps clear of comes in three kinds. What the table draws for every seated player whatever
// the hand does — plates, flags, face-down pairs, blinds' marks — the dealer button and the board:
// always. What shows now (PotSeen.now): the hands turned up, the bet lines out at the size they are
// drawn (betLineSize), and the winners' "+N" while the pots pay out. And what the table may yet show,
// so the pills hold their place from the first bet to the payout: every seated player's hand but the
// viewer's turned up (seen.shown) and, while there is a hand, every bet line at the stage's size
// (seen.bets). On the felt, the plan keeps clear of all of it where that is near enough (POT_NEAR,
// keeps 'all'); else of what shows now and the hands that may yet turn up ('hands'); else of what
// shows now ('now'), by POT_CLEAR, then a pixel apart; else of that less the "+N", which rises for a
// second and a half ('still'). Only then does it leave the felt (felt: false), clear of what shows
// now, then of that less the "+N"; and where not even that has room — nine seats on the smallest
// phone on its side — the smallest layout goes where it covers least (COVER_WEIGHT: a card, plate or
// the board hardly ever, a flag, a mark or a bet line before them; 'least', clear: false). Between two
// plans of the same pots what shows now only grows (a bet line out, a hand turned up), so the pots
// move only when something lands where they are (the rows' box, which a plan keeps clear whole): the
// place they had is still the nearest clear one until then. The winner's banner keeps clear of the
// pills (bannerPlan's seen.pots). What is drawn is what it measured: each pill at the size the plan
// gives it (app/globals.css .pn-pot-pill, held by stage.test), its words sized by textWidth, an upper
// bound.

// A pill: 11 px bold on a 15 px line, 2 px over and under and 8 px a side inside the widest chrome
// border, 4 px from the next; the first pill's chips (at most CHIP_COLUMNS columns of 10 px chips, a
// pixel apart) 5 px from its words.
export const POT_PILL = {px: 11, line: 15, pad: {x: 8, y: 2}, gap: 4, chip: 10, chipsGap: 5} as const;
export const POT_PILL_H = POT_PILL.line + 2 * (POT_PILL.pad.y + BANNER.border);
const POT_CHIPS_W = CHIP_COLUMNS * POT_PILL.chip + (CHIP_COLUMNS - 1) + POT_PILL.chipsGap;
// The room kept between a pill and anything it must not cover.
export const POT_CLEAR = 3;

// The felt's rail at its widest (.pn-felt's border, clamp(6px, 1.4vmin, 14px)): a pill lies inside it.
export const FELT_RAIL = 14;

// The felt inside its rail (or `rail` in from its edge) across the band [top, top + h]: the span a
// rectangle that tall may take and lie on it — a stadium (rounded-full) is widest at its middle, so the narrower of the band's two
// edges. Null when the band leaves the felt.
export const feltSpan = (stage: Pick<Stage, 'felt'>, top: number, h: number, rail: number = FELT_RAIL): Span | null => {
    const f = stage.felt;
    const left = f.left + rail;
    const right = f.left + f.width - rail;
    const up = f.top + rail;
    const down = f.top + f.height - rail;
    if (right <= left || top < up || top + h > down) return null;
    const wide = right - left >= down - up;
    const r = Math.min(right - left, down - up) / 2;
    const across = (y: number): Span => {
        const dy = wide ? Math.abs(y - (up + down) / 2) : Math.max(0, up + r - y, y - (down - r));
        const dx = Math.sqrt(Math.max(0, r * r - dy * dy));
        return wide ? [left + r - dx, right - r + dx] : [(left + right) / 2 - dx, (left + right) / 2 + dx];
    };
    const [a, b] = [across(top), across(top + h)];
    const span: Span = [Math.max(a[0], b[0]), Math.min(a[1], b[1])];
    return span[1] > span[0] ? span : null;
};

// A seat's face-down pair (.pn-seat-cards): two cards --pn-mini-w wide (MINI_CARD_PX) and 1.4 times as
// tall, overlapping by 0.45 of a width, at the plate's top right 3 px in and 0.45 of a width over its
// top, each turned 7° (which widens it by 0.09 of a width a side and heightens it by 0.06); a pixel
// round it. Three or four (Triple T's, PLO's) keep the pair's footprint, the ones between closer, which
// closes the gap the pair leaves over the stack's figures: on a compact or tight plate, whose figures
// sit in the top row beside the avatar, they start a whole width over the plate's top
// (SEAT_CARDS_OVER), ending 0.4 of a width into it, above the figures.
export const MINI_CARD_PX: Record<Fit, number> = {tight: 14, compact: 17, comfortable: 24};
export const SEAT_CARDS_OVER = {pair: 0.45, more: 1} as const;
export const seatCardsOver = (fit: Fit, count = 2): number => (count > 2 && fit !== 'comfortable' ? SEAT_CARDS_OVER.more : SEAT_CARDS_OVER.pair);
export const seatCardsRect = (place: Pick<SeatPlace, 'plate'>, stage: Pick<Stage, 'plateSize' | 'fit'>, count = 2): Rect => {
    const w = MINI_CARD_PX[stage.fit];
    const right = place.plate.x + stage.plateSize.w / 2 - 3 + 0.09 * w + 1;
    const left = right - 1.55 * w - 0.18 * w - 2;
    const top = place.plate.y - stage.plateSize.h / 2 - seatCardsOver(stage.fit, count) * w - 0.06 * w - 1;
    const bottom = top + 1.4 * w + 0.12 * w + 2;
    return {x: (left + right) / 2, y: (top + bottom) / 2, w: right - left, h: bottom - top};
};

// A blind's mark (.pn-blind): "SB" or "BB" in the mono face on a 14 px line, 4 px a side inside the
// widest chrome border — at most BLIND_MARK — over the plate's top-left corner by 30 % of its width
// and 45 % of its height.
export const BLIND_MARK: Box = {w: 28, h: 18};
export const blindRect = (place: Pick<SeatPlace, 'plate'>, stage: Pick<Stage, 'plateSize'>): Rect => ({
    x: place.plate.x - stage.plateSize.w / 2 - 0.3 * BLIND_MARK.w + BLIND_MARK.w / 2,
    y: place.plate.y - stage.plateSize.h / 2 - 0.45 * BLIND_MARK.h + BLIND_MARK.h / 2,
    ...BLIND_MARK,
});

// A bet line as drawn (.pn-bet, components/poker-night/ChipStack) round the stage's place for it: a
// column of chips for each denomination (chipBreakdown: at most CHIP_COLUMNS, a pixel apart), each
// chip CHIP_PX wide and a column of n of them 0.42 + 0.24 (n − 1) of a chip tall; 4 px on, the count
// (compactChips) in the mono face at AMOUNT_PX on the page's 1.5 line; an all-in's (.pn-bet.pn-pulse)
// 4 px a side more, inside a 2 px outline breathing out to 5 px.
export const CHIP_PX: Record<Fit, number> = {tight: 10, compact: 12, comfortable: 18};
export const AMOUNT_PX: Record<Fit, number> = {tight: 11, compact: 11, comfortable: 13};
export const PULSE = {pad: 4, outline: 2, offset: 5} as const;
export const betLineSize = (fit: Fit, amount: number, allIn: boolean): Box => {
    const chip = CHIP_PX[fit];
    const columns = chipBreakdown(amount);
    const chips = columns.length === 0 ? 0 : columns.length * chip + (columns.length - 1) + 4;
    const tallest = Math.max(0, ...columns.map((c) => chip * (0.42 + 0.24 * (c.count - 1))));
    const ring = allIn ? PULSE.outline + PULSE.offset : 0;
    return {
        w: Math.ceil(chips + compactChips(amount).length * MONO_EM * AMOUNT_PX[fit] + 2 * ((allIn ? PULSE.pad : 0) + ring)),
        h: Math.ceil(Math.max(tallest, 1.5 * AMOUNT_PX[fit]) + 2 * ring),
    };
};

// A bet line out now: its seat, its chips and whether its player is all in (the line pulses).
export type BetOut = {seat: number; amount: number; allIn: boolean};
// What shows on the table now: the seats whose cards are turned up, the bet lines out and the winners'
// "+N" while the pots pay out.
export type PotNow = {shown: readonly number[]; bets: readonly BetOut[]; pops: readonly WinPop[]};
// What the pots keep clear of: the banner's open seats and dealer button; in `shown` every seat whose
// hand may yet turn up, and in `bets` every seat whose bet line may yet show (the seats dealt in, while
// there is a hand); what shows now; and how many cards lie face down before a plate (`backs`: the
// hand's, Triple T's three while they throw one away; else handSize, else two).
export type PotSeen = Omit<BannerSeen, 'pots' | 'pops'> & {bets: readonly number[]; now?: PotNow; backs?: number};

// What the pots keep clear of, by kind (see above). What the table always draws: the cards, plates,
// open seats' rings, the dealer button and the board (`cards`), and the flags and blinds' marks
// (`marks`). What shows now: the hands turned up (`turned`), the bet lines out (`out`), the winners'
// "+N" (`pops`). What may yet show: the hands (`hands`) and the bet lines (`bets`).
type PotKinds = {cards: Rect[]; marks: Rect[]; turned: Rect[]; out: Rect[]; pops: Rect[]; hands: Rect[]; bets: Rect[]};
const potKinds = (stage: Stage, seen: PotSeen): PotKinds => {
    const now: PotNow = seen.now ?? {shown: [], bets: [], pops: []};
    const table = tableParts(stage, {open: seen.open, shown: now.shown, button: seen.button, handSize: seen.handSize});
    const cards = [...table.plates, ...table.fixed];
    const marks = [...table.flags];
    const bets: Rect[] = [];
    for (const p of stage.seats) {
        if (seen.open.includes(p.seat)) continue;
        cards.push(seatCardsRect(p, stage, seen.backs ?? seen.handSize ?? 2));
        marks.push(blindRect(p, stage));
        if (seen.bets.includes(p.seat)) bets.push(rect(p.bet, stage.betSize));
    }
    const at = (seat: number): SeatPlace | undefined => stage.seats[seat];
    return {
        cards, marks, turned: table.shown,
        out: now.bets.flatMap((b) => {
            const p = at(b.seat);
            return p ? [rect(p.bet, betLineSize(stage.fit, b.amount, b.allIn))] : [];
        }),
        pops: now.pops.flatMap((pop) => {
            const p = at(pop.seat);
            return p ? [winPopRect(p, stage, now.shown.includes(pop.seat), pop.amount)] : [];
        }),
        hands: tableParts(stage, {open: seen.open, shown: seen.shown, button: null, handSize: seen.handSize}).shown,
        bets,
    };
};

// What a plan keeps clear of (see above): everything — what the table always draws, what shows now
// and what may yet show; that less the bet lines that may yet show; what the table always draws and
// what shows now; that less the winners' "+N"; or, covering least of that, nothing.
export type PotKeeps = 'all' | 'hands' | 'now' | 'still' | 'least';

// Everything a plan that keeps `keeps` clear must not cover.
export const potObstacles = (stage: Stage, seen: PotSeen, keeps: Exclude<PotKeeps, 'least'> = 'all'): Rect[] => {
    const k = potKinds(stage, seen);
    return [
        ...k.cards, ...k.marks, ...k.turned, ...k.out, ...(keeps === 'still' ? [] : k.pops),
        ...(keeps === 'all' || keeps === 'hands' ? k.hands : []), ...(keeps === 'all' ? k.bets : []),
    ];
};

// The pots in the order they were built (pot 0 the main pot), as the hand or its result has them.
export type PotAmount = {pot: number; amount: number};
// A pill: its words, the pots it stands for and their chips, whether it carries the chips, and where
// it is drawn.
export type PotPill = Rect & {key: string; pots: number[]; amount: number; label: string; chips: boolean};
export type PotVariant = 'full' | 'short' | 'gathered' | 'total';
// The plan: which words, in how many rows, each pill's place, the rows' bounding box, what it keeps
// clear of and whether that is anything (`clear`, false only when it covers least), by how much room
// (POT_CLEAR, or a pixel where that has no room; none when it covers least), and whether every pill
// lies on the felt inside its rail.
export type PotPlan = {variant: PotVariant; rows: number; pills: PotPill[]; box: Rect; keeps: PotKeeps; clear: boolean; room: number; felt: boolean};

export const potPillWidth = (label: string, chips: boolean): number =>
    Math.ceil(textWidth(label, POT_PILL.px, true)) + 2 * (POT_PILL.pad.x + BANNER.border) + (chips ? POT_CHIPS_W : 0);

type PillWords = Omit<PotPill, keyof Rect>;
export type PotLayout = {variant: PotVariant; rows: PillWords[][]; w: number; h: number};

// Items in k rows, as even as they go, the first rows the longer.
const inRows = <T>(items: readonly T[], k: number): T[][] => {
    const rows: T[][] = [];
    let at = 0;
    for (let r = 0; r < k && at < items.length; r++) {
        const size = Math.ceil((items.length - at) / (k - r));
        rows.push(items.slice(at, at + size));
        at += size;
    }
    return rows;
};

const rowWidth = (row: readonly PillWords[]): number =>
    row.reduce((s, p) => s + potPillWidth(p.label, p.chips), 0) + POT_PILL.gap * Math.max(0, row.length - 1);

const layout = (variant: PotVariant, rows: PillWords[][]): PotLayout => ({
    variant, rows, w: Math.max(...rows.map(rowWidth)), h: rows.length * POT_PILL_H + (rows.length - 1) * POT_PILL.gap,
});

// Every layout of these pots, in the order potPlan tries them.
export const potLayouts = (pots: readonly PotAmount[]): PotLayout[] => {
    const pill = (p: PotAmount, label: string, chips: boolean): PillWords => ({key: `pot-${p.pot}`, pots: [p.pot], amount: p.amount, label, chips});
    const gather = (key: string, of: readonly PotAmount[], label: (pots: number, chips: number) => string): PillWords => {
        const amount = of.reduce((s, p) => s + p.amount, 0);
        return {key, pots: of.map((p) => p.pot), amount, label: label(of.length, amount), chips: false};
    };
    if (pots.length === 1) {
        const label = TABLE_COPY.pot(pots[0].amount);
        return [layout('full', [[pill(pots[0], label, true)]]), layout('short', [[pill(pots[0], label, false)]])];
    }
    const full = pots.map((p, i) => pill(p, i === 0 ? TABLE_COPY.mainPot(p.amount) : TABLE_COPY.sidePot(i, p.amount), i === 0));
    const short = (chips: boolean) => pots.map((p, i) => pill(p, i === 0 ? FELT_COPY.mainPot(p.amount) : FELT_COPY.sidePot(i, p.amount), chips && i === 0));
    const out = [layout('full', [full]), layout('short', [short(true)]), layout('short', [short(false)])];
    for (let k = 2; k <= pots.length; k++) out.push(layout('short', inRows(short(false), k)));
    // The first `shown` pots and one pill for the rest, two or more of them.
    for (let shown = pots.length - 2; shown >= 1; shown--) {
        const rest = pots.slice(shown);
        const more = gather('more', rest, FELT_COPY.morePots);
        const pills = [...short(false).slice(0, shown), more];
        out.push(layout('gathered', [pills]), layout('gathered', inRows(pills, 2)));
    }
    // Last, every pot in one pill: how many, and their chips.
    const all = gather('all', pots, FELT_COPY.allPots);
    out.push(layout('total', [[all]]));
    return out;
};

// The pills of a layout drawn with the rows' box centred on x, its top at `top`: each row centred.
const drawPots = (l: PotLayout, x: number, top: number, keeps: PotKeeps, felt: boolean, room: number): PotPlan => {
    const pills: PotPill[] = [];
    l.rows.forEach((row, r) => {
        const y = top + r * (POT_PILL_H + POT_PILL.gap) + POT_PILL_H / 2;
        let left = x - rowWidth(row) / 2;
        for (const words of row) {
            const w = potPillWidth(words.label, words.chips);
            pills.push({...words, x: left + w / 2, y, w, h: POT_PILL_H});
            left += w + POT_PILL.gap;
        }
    });
    return {variant: l.variant, rows: l.rows.length, pills, box: {x, y: top + l.h / 2, w: l.w, h: l.h}, keeps, clear: keeps !== 'least', felt, room};
};

// How near the board a layout sits, as potPlan weighs it: how far its far edge is from the board (the
// gap over or under it — none beside it — and the layout's height), twice how far its middle is
// across from the board's, and a pixel under the board rather than over. Beside the board the
// distance across alone puts it far.
// What a layout's words cost on top of that: the pots' own words in full nothing, in short a few
// pixels (two more without the chips), gathered or all in one pill much more — so the fuller words win
// wherever they sit about as near.
const POT_PENALTY: Record<PotVariant, number> = {full: 0, short: 6, gathered: 120, total: 240};
const potPenalty = (l: PotLayout): number => POT_PENALTY[l.variant] + (l.rows[0][0].chips ? 0 : 2);
// Clear of what may yet show too, as long as that costs no more than this.
const POT_NEAR = 120;

// The place for a layout costing less than `budget`, the cheapest; null when none does. Every
// whole-pixel top, outward from the board, until the gap alone costs the budget; `spansAt` the room
// across a band.
const placeNear = (l: PotLayout, spansAt: (top: number, h: number) => Span[], box: Box, anchor: Anchor, budget: number): {x: number; top: number; cost: number} | null => {
    let best = null as {x: number; top: number; cost: number} | null;
    const at = (top: number, gap: number, under: boolean) => {
        const x = nearest(centres(spansAt(top, l.h), l.w), anchor.x);
        if (x === null) return;
        const cost = gap + l.h + 2 * Math.abs(x - anchor.x) + (under ? 1 : 0);
        if (cost < (best?.cost ?? budget)) best = {x: Math.round(x), top, cost};
    };
    const within = (gap: number) => gap + l.h < (best?.cost ?? budget);
    const overTop = Math.floor(anchor.top - l.h);
    const underTop = Math.ceil(anchor.bottom);
    for (let gap = 0; within(gap); gap++) {
        if (overTop - gap < 0 && underTop + gap + l.h > box.h) break;
        if (overTop - gap >= 0) at(overTop - gap, anchor.top - l.h - (overTop - gap), false);
        if (underTop + gap + l.h <= box.h) at(underTop + gap, underTop + gap - anchor.bottom, true);
    }
    // Beside the board: the tops whose band reaches into its span.
    if (within(0)) for (let top = Math.max(0, overTop + 1); top < underTop && top + l.h <= box.h; top++) at(top, 0, false);
    return best;
};

// Covering a square pixel of a card, a plate, the button or the board outweighs this many pixels of
// distance; of a flag, a blind's mark or a bet line a hundredth of that, of a "+N" a thousandth; and
// leaving the felt as much as a square pixel of a card.
const COVER_WEIGHT = {cards: 10_000, marks: 100, pops: 10} as const;
const OFF_FELT = COVER_WEIGHT.cards;

// Where a layout covers least of what shows (each thing's overlap with the pill and the room kept round
// it, in square pixels, weighed by COVER_WEIGHT; off the felt weighed as OFF_FELT): at every whole
// pixel inside the box, the nearest the board among equals.
const leastCovering = (l: PotLayout, cards: readonly Rect[], marks: readonly Rect[], pops: readonly Rect[], stage: Stage, anchor: Anchor): {x: number; top: number; felt: boolean} => {
    const {box} = stage;
    const mid = (anchor.top + anchor.bottom) / 2;
    const w = l.w + 2 * POT_CLEAR;
    const h = l.h + 2 * POT_CLEAR;
    const weighed = [
        ...cards.map((r) => ({r, k: COVER_WEIGHT.cards})), ...marks.map((r) => ({r, k: COVER_WEIGHT.marks})), ...pops.map((r) => ({r, k: COVER_WEIGHT.pops})),
    ];
    let best = {x: Math.round(Math.min(Math.max(anchor.x, l.w / 2), box.w - l.w / 2)), top: Math.max(0, Math.round(mid - l.h / 2)), cost: Infinity, felt: false};
    for (let top = 0; top + l.h <= box.h; top++) {
        const felt = feltSpan(stage, top, l.h);
        const y = top + l.h / 2;
        const near = weighed.filter(({r}) => Math.abs(r.y - y) < (r.h + h) / 2);
        for (let x = Math.ceil(l.w / 2); x + l.w / 2 <= box.w; x++) {
            const onFelt = felt !== null && x - l.w / 2 >= felt[0] && x + l.w / 2 <= felt[1];
            let cover = onFelt ? 0 : OFF_FELT;
            for (const {r, k} of near) {
                const ox = Math.min(x + w / 2, r.x + r.w / 2) - Math.max(x - w / 2, r.x - r.w / 2);
                if (ox > 0) cover += k * ox * (Math.min(y + h / 2, r.y + r.h / 2) - Math.max(y - h / 2, r.y - r.h / 2));
            }
            const cost = cover + Math.abs(x - anchor.x) + Math.abs(y - mid);
            if (cost < best.cost) best = {x, top, cost, felt: onFelt};
        }
    }
    return best;
};

// Where the pots go (see above); null with no chips in any pot. On the felt, the cheapest place of
// every layout clear of everything, when that is near enough (POT_NEAR); else the cheapest clear of
// what shows now and the hands that may yet turn up; else of what shows now, by the room kept, then a
// pixel apart; else of that less the "+N"; then anywhere in the box, off the felt if it must (felt:
// false); else the smallest layout where it covers least.
export const potPlan = (stage: Stage, pots: readonly PotAmount[], seen: PotSeen): PotPlan | null => {
    const live = pots.filter((p) => p.amount > 0);
    if (live.length === 0) return null;
    const {box, board} = stage;
    const anchor: Anchor = {x: board.x, top: board.y - board.h / 2 - LIT.lift - LIT.ring, bottom: board.y + board.h / 2};
    const layouts = potLayouts(live);
    type Best = {l: PotLayout; x: number; top: number; cost: number};
    // The cheapest place of every layout clear of `avoid` by `clear`, on the felt or anywhere in the
    // box, cheaper than `start`.
    const search = (avoid: readonly Rect[], start: Best | null, onFelt = true, clear: number = POT_CLEAR): Best | null => {
        // The room across each band it looks at, kept while it looks.
        const kept = new Map<string, Span[]>();
        const spansAt = (top: number, h: number): Span[] => {
            const key = `${top}:${h}`;
            let spans = kept.get(key);
            if (!spans) {
                const within = onFelt ? feltSpan(stage, top, h) : ([0, box.w] as Span);
                kept.set(key, spans = within ? freeSpans(top, h, avoid, box, clear, within) : []);
            }
            return spans;
        };
        let best = start;
        for (const l of layouts) {
            const penalty = potPenalty(l);
            const at = placeNear(l, spansAt, box, anchor, (best?.cost ?? Infinity) - penalty);
            if (at) best = {l, x: at.x, top: at.top, cost: at.cost + penalty};
        }
        return best;
    };
    const k = potKinds(stage, seen);
    const still = [...k.cards, ...k.marks, ...k.turned, ...k.out];
    const now = [...still, ...k.pops];
    const all = k.bets.length > 0 ? search([...now, ...k.hands, ...k.bets], null) : null;
    if (all && all.cost <= POT_NEAR) return drawPots(all.l, all.x, all.top, 'all', true, POT_CLEAR);
    const hands = search([...now, ...k.hands], all);
    if (hands) return drawPots(hands.l, hands.x, hands.top, hands === all || k.bets.length === 0 ? 'all' : 'hands', true, POT_CLEAR);
    // Then what shows now: on the felt, by the room kept, then a pixel apart; the same less the "+N";
    // then off the felt.
    type Try = [PotKeeps, readonly Rect[], boolean, number];
    const pops = k.pops.length > 0;
    const tries: Try[] = [
        ['now', now, true, POT_CLEAR], ['now', now, true, 1], ...(pops ? [['still', still, true, 1] as Try] : []),
        ['now', now, false, POT_CLEAR], ...(pops ? [['still', still, false, POT_CLEAR] as Try] : []),
    ];
    for (const [keeps, avoid, onFelt, room] of tries) {
        const at = search(avoid, null, onFelt, room);
        if (at) return drawPots(at.l, at.x, at.top, keeps, onFelt, room);
    }
    const smallest = layouts[layouts.length - 1];
    const at = leastCovering(smallest, [...k.cards, ...k.turned], [...k.marks, ...k.out], k.pops, stage, anchor);
    return drawPots(smallest, at.x, at.top, 'least', at.felt, 0);
};

// Where a pot's chips are: its pill's middle (the pill a gathered pot shares), else the rows' middle.
export const potCentre = (plan: PotPlan, pot: number): Px => {
    const pill = plan.pills.find((p) => p.pots.includes(pot));
    return pill ? {x: pill.x, y: pill.y} : {x: plan.box.x, y: plan.box.y};
};

// The side a plate's menu opens on (components/poker-night/SeatMenu): toward the table's middle — up
// from a plate in the lower half, down from one in the upper — where there is room for it. The menu
// keeps to the space it is given (it scrolls inside itself rather than overflow), so it never flips by
// itself: opened down from a lower plate it would sit over the dock, its last rows cut off.
export const menuSide = (place: Pick<SeatPlace, 'plate'>, stage: Pick<Stage, 'centre'>): 'top' | 'bottom' => (place.plate.y > stage.centre.y ? 'top' : 'bottom');

// Where a board's share of the pots gathers on its way to the board's winners (choreography's
// splits and streams, two or three boards): its numeral, else its left end.
export const boardAnchor = (stage: Pick<Stage, 'boards' | 'board'>, board: number): Px => {
    const place = stage.boards[board];
    if (!place) return {x: stage.board.x, y: stage.board.y};
    return place.label ?? {x: place.x - place.w / 2, y: place.y};
};
