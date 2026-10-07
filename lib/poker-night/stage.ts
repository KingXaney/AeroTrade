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
// the middle as they can sit. lib/poker-night/__tests__/stage.test.ts holds them all apart from
// 320 px phones to wide desktops.

import {CENTRE, densityFor, orientationFor, PLATE, seatSpots, spotToPx, visualSlot, type Box, type Density, type Orientation, type SeatSpot} from '@/lib/poker-night/layout';

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
// The room kept between a plate and what it carries, and around the board and the pot.
const GAP = 2;
const PAD = 2;

export type SeatPlace = {
    seat: number;
    slot: number;
    spot: SeatSpot;
    plate: Px; // the plate's centre
    bet: Px; // the bet line's centre
    button: Px; // where the dealer button sits when this seat has it
};

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
    board: Rect & {card: Box; gap: number};
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
const raysOf = (spot: SeatSpot, plate: Px, centre: Px): Px[] => {
    const toMiddle = unit(plate, centre);
    const vertical = {x: 0, y: plate.y <= centre.y ? 1 : -1};
    if (spot.side === 'left') return [{x: 1, y: 0}, toMiddle, vertical];
    if (spot.side === 'right') return [{x: -1, y: 0}, toMiddle, vertical];
    return [toMiddle, vertical];
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

// Where a seat's dealer button goes: beside its bet line (either side, across the ray), else at the
// plate's inner corners, else on along the ray — the first that is clear.
const placeButton = (plate: Px, bet: Rect, dir: Px, plateSize: Box, size: number, avoid: readonly Rect[], box: Box): Px => {
    const r = size / 2;
    const across = {x: -dir.y, y: dir.x};
    const side = Math.abs(across.x) * (bet.w / 2) + Math.abs(across.y) * (bet.h / 2) + GAP + r;
    const corner = Math.abs(across.x) * (plateSize.w / 2) + Math.abs(across.y) * (plateSize.h / 2) - r;
    const out = Math.abs(dir.x) * (plateSize.w / 2) + Math.abs(dir.y) * (plateSize.h / 2) + GAP + r;
    const square = {w: size, h: size};
    const candidates: Px[] = [
        {x: bet.x + across.x * side, y: bet.y + across.y * side},
        {x: bet.x - across.x * side, y: bet.y - across.y * side},
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

export const stageLayout = (box: Box, seatCount: number, mySeat: number | null): Stage => {
    const orientation = stageOrientation(box);
    const fit = fitFor(box);
    const plateSize = PLATE_SIZE[fit];
    const betSize = BET[fit];
    const buttonSize = BUTTON[fit];
    const gap = BOARD_GAP[fit];
    const centre = spotToPx(CENTRE, box, plateSize);
    const spots = seatSpots(seatCount, orientation);

    // Plates first; then each seat's bet line, the viewer's first and on round the table, clear of
    // every plate and the bet lines before it; then the buttons, clear of all of those.
    const placed = spots.map((_, seat) => {
        const slot = visualSlot(seat, mySeat, spots.length);
        const spot = spots[slot];
        const plate = spotToPx(spot, box, plateSize);
        const dirs = raysOf(spot, plate, centre);
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
        buttons[p.seat] = rect(placeButton(p.plate, bets[p.seat], p.dir, plateSize, buttonSize, avoid, box), {w: buttonSize, h: buttonSize});
    }
    const seats: SeatPlace[] = placed.map((p) => ({
        seat: p.seat, slot: p.slot, spot: p.spot, plate: p.plate,
        bet: {x: bets[p.seat].x, y: bets[p.seat].y}, button: {x: buttons[p.seat].x, y: buttons[p.seat].y},
    }));
    const obstacles = [...plates, ...bets, ...buttons];

    // The board: the widest cards anywhere in the band around the middle; among widths within a
    // pixel of the widest, the row nearest the middle.
    const rows: {w: number; y: number}[] = [];
    for (let y = box.h * 0.25; y <= box.h * 0.75; y += 2) rows.push({y, w: widestAt(centre.x, y, box, obstacles, gap, BOARD_CARD_MIN, BOARD_CARD_MAX[fit])});
    const widest = Math.max(0, ...rows.map((r) => r.w));
    const chosen = widest > 0
        ? rows.filter((r) => r.w >= widest - 1).sort((a, b) => Math.abs(a.y - centre.y) - Math.abs(b.y - centre.y))[0]
        : {y: centre.y, w: BOARD_CARD_MIN};
    const card = {w: chosen.w, h: Math.round(chosen.w * CARD_RATIO)};
    const board = {x: centre.x, y: chosen.y, w: 5 * card.w + 4 * gap, h: card.h, card, gap};

    // The pot: just over the board where it fits, else just under it, else a little further out;
    // failing all of those, on the board's top edge.
    const potBase = POT[fit];
    const potSize = {w: Math.min(potBase.w, Math.max(board.w, 72)), h: potBase.h};
    const against = [...obstacles, board];
    const candidates: Px[] = [
        {x: centre.x, y: board.y - board.h / 2 - PAD * 2 - potSize.h / 2},
        {x: centre.x, y: board.y + board.h / 2 + PAD * 2 + potSize.h / 2},
    ];
    for (let k = 1; k <= 40; k++) {
        candidates.push({x: centre.x, y: board.y - board.h / 2 - PAD * 2 - potSize.h / 2 - k * 2});
        candidates.push({x: centre.x, y: board.y + board.h / 2 + PAD * 2 + potSize.h / 2 + k * 2});
    }
    const potAt = candidates.find((p) => {
        const r = rect(p, potSize);
        return insideBox(r, box) && against.every((o) => !overlaps(r, o, PAD));
    }) ?? null;
    const potOnBoard = potAt === null;

    return {
        box, orientation, fit, plateSize, betSize, buttonSize,
        felt: {left: plateSize.w / 2, top: plateSize.h / 2, width: Math.max(0, box.w - plateSize.w), height: Math.max(0, box.h - plateSize.h)},
        centre, board, pot: rect(potAt ?? {x: board.x, y: board.y - board.h / 2}, potSize), potOnBoard, seats,
    };
};

// Where the winner's banner hangs: away from the board — up from the pot's foot when the pot sits
// over the board, down from its head when under it; up from the board's top when the pot had no
// place of its own. `up` says which way it grows, so whatever shows under the board (the next deal's
// countdown, the pause) goes inside the banner's column when it grows down over that spot.
export const bannerPlace = (stage: Pick<Stage, 'pot' | 'board' | 'potOnBoard'>): {up: boolean; left: number; top: number} => {
    const up = stage.potOnBoard || stage.pot.y <= stage.board.y;
    const top = stage.potOnBoard ? stage.board.y - stage.board.h / 2 - 2 : up ? stage.pot.y + stage.pot.h / 2 : stage.pot.y - stage.pot.h / 2;
    return {up, left: stage.pot.x, top};
};

// The offset of `from` as seen from `to`: a flight's --pn-dx / --pn-dy (an element drawn at `to`
// starts that far away), whole pixels.
export const offset = (from: Px, to: Px): {dx: number; dy: number} => ({dx: Math.round(from.x - to.x), dy: Math.round(from.y - to.y)});

// ── the pot's pills ──

// A pill's width as the pot draws it: about this much per character at its type size, its padding,
// and the chips the first one carries.
export const POT_PILL = {char: 6.6, pad: 22, chips: 30, gap: 4} as const;

const pillWidth = (label: string, first: boolean): number => label.length * POT_PILL.char + POT_PILL.pad + (first ? POT_PILL.chips : 0);

// How many of the pots get a pill of their own in a row `width` px wide: all of them when they fit,
// else as many as fit beside one more pill (`more(k)`, the words for the pots from k on) that stands
// for the rest — at least the main pot's.
export const potPillsShown = (labels: readonly string[], width: number, more: (from: number) => string): number => {
    const row = (widths: number[]) => widths.reduce((s, w) => s + w, 0) + POT_PILL.gap * Math.max(0, widths.length - 1);
    const all = labels.map((label, i) => pillWidth(label, i === 0));
    if (labels.length <= 1 || row(all) <= width) return labels.length;
    for (let k = labels.length - 1; k >= 1; k--) {
        if (row([...all.slice(0, k), pillWidth(more(k), false)]) <= width) return k;
    }
    return 1;
};
