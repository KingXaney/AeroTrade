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
// that clears everything wins. What it clears is what is drawn: the banner and the line are drawn
// top-anchored at the place found, never wider than the room found there (their wrap's width), their
// line heights fixed in the stylesheet, and every text width it sizes them by an upper bound.

// What the banner and the line under it are drawn at (app/globals.css .pn-banner, .pn-banner-note;
// stage.test holds them to it): the full banner's padding, its rows' gap and its avatar, by fit — a
// row is the avatar beside the name's line (14 px on 20) over the hand's (12 on 16); the compact
// banner's padding and gap, a 12-on-16 line a winner, no avatar; the line's pill; the gap under the
// banner; the widest chrome border any visual style draws (brutalist's, 2 px a side); and the room
// kept between the banner and anything it must not cover.
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
// a seat's turned-up cards sit 3 px over a bottom or side plate, 10 px under a top one, 2 px apart.
const LIT = {lift: 6, ring: 2} as const;
const FLAG = {h: 15, below: 0.55, wider: 28} as const;
export const SHOWN_OFF = {over: 3, under: 10, gap: 2} as const;

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
// "Ana wins 1,200", and the hand's name or null — and the line under it, or null.
export type BannerText = {winners: readonly {head: string; hand: string | null}[]; note: string | null};
// What the table shows beside it: the seats nobody sits in (an open seat's ring, no plate), the seats
// whose cards are turned up on the felt, and the dealer button's seat.
export type BannerSeen = {open: readonly number[]; shown: readonly number[]; button: number | null};
// The full banner (the avatar, the head over the hand's name); the compact one (no avatar, a line a
// winner — "You win 70 · Full house, threes full of fives" — wrapped when narrow); the compact one cut
// to a line a winner with an ellipsis, when nothing else has room.
export type BannerVariant = 'full' | 'compact' | 'cut';
// A piece drawn top-anchored: its centre's x, its top, the most it may be wide, its height.
export type BannerPiece = {x: number; top: number; width: number; height: number};
// The plan: which banner, how many of the winners it names (the first `rows`), where it and the line
// under it go (no line when there is none, or no room for it).
export type BannerPlan = {variant: BannerVariant; rows: number; banner: BannerPiece; note: BannerPiece | null; clear: boolean};

export const pieceRect = (p: BannerPiece): Rect => ({x: p.x, y: p.top + p.height / 2, w: p.width, h: p.height});

// A seat's turned-up cards as drawn (.pn-seat-shown), the lift and ring of a card that plays included.
export const shownHandRect = (place: Pick<SeatPlace, 'plate' | 'spot'>, stage: Pick<Stage, 'plateSize' | 'fit'>): Rect => {
    const card = SHOWN_CARD_PX[stage.fit];
    const h = card * CARD_RATIO;
    const top = place.spot.side === 'top'
        ? place.plate.y + stage.plateSize.h / 2 + SHOWN_OFF.under
        : place.plate.y - stage.plateSize.h / 2 - SHOWN_OFF.over - h;
    const lit = LIT.lift + LIT.ring;
    return {x: place.plate.x, y: top - lit + (h + lit) / 2, w: 2 * card + SHOWN_OFF.gap + 2 * LIT.ring, h: h + lit};
};

// An open seat's ring (.pn-open-seat): max(44 px, 95 % of the plate's height) across.
export const openSeatPx = (stage: Pick<Stage, 'plateSize'>): number => Math.max(44, stage.plateSize.h * 0.95);

// Everything the banner must not cover: every seated player's plate and the status flag that may hang
// under it, every open seat's ring, each turned-up hand, the dealer button, and the board with its lit
// cards' lift.
export const bannerObstacles = (stage: Stage, seen: BannerSeen): Rect[] => {
    const out: Rect[] = [];
    const ring = openSeatPx(stage);
    for (const p of stage.seats) {
        if (seen.open.includes(p.seat)) {
            out.push(rect(p.plate, {w: ring, h: ring}));
            continue;
        }
        out.push(rect(p.plate, stage.plateSize));
        const bottom = p.plate.y + stage.plateSize.h / 2;
        out.push({x: p.plate.x, y: bottom + FLAG.h * FLAG.below - FLAG.h / 2, w: stage.plateSize.w + FLAG.wider, h: FLAG.h});
    }
    for (const seat of seen.shown) if (stage.seats[seat]) out.push(shownHandRect(stage.seats[seat], stage));
    const button = seen.button === null ? undefined : stage.seats[seen.button];
    if (button) out.push(rect(button.button, {w: stage.buttonSize, h: stage.buttonSize}));
    const lit = LIT.lift + LIT.ring;
    out.push({x: stage.board.x, y: stage.board.y - lit / 2, w: stage.board.w + 2 * LIT.ring, h: stage.board.h + lit});
    return out;
};

// ── finding room ──

type Span = [number, number];

// The free spans across the band [top, top + h]: the box's width less every obstacle reaching into
// the band, widened on each side by the room kept. A rectangle that band tall clears everything
// exactly when it lies inside one of them.
const freeSpans = (top: number, h: number, avoid: readonly Rect[], box: Box): Span[] => {
    if (top < 0 || top + h > box.h) return [];
    const blocked: Span[] = [];
    for (const o of avoid) {
        if (Math.abs(top + h / 2 - o.y) >= (h + o.h) / 2 + BANNER.clear) continue;
        blocked.push([o.x - o.w / 2 - BANNER.clear, o.x + o.w / 2 + BANNER.clear]);
    }
    blocked.sort((a, b) => a[0] - b[0]);
    const spans: Span[] = [];
    let from = 0;
    for (const [a, b] of blocked) {
        if (a > from) spans.push([from, Math.min(a, box.w)]);
        from = Math.max(from, b);
    }
    if (from < box.w) spans.push([from, box.w]);
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
    const prefer: 'up' | 'down' = stage.potOnBoard || stage.pot.y <= board.y ? 'up' : 'down';
    const anchor: Anchor = {x: board.x, top: board.y - board.h / 2 - LIT.lift - LIT.ring, bottom: board.y + board.h / 2};
    const piece = (x: number, top: number, h: number, against: readonly Rect[]): BannerPiece =>
        ({x, top, width: Math.min(cap, clearWidth(x, top, h, against, box)), height: h});

    // The banner's three shapes naming the first `rows` winners.
    const shapes = (rows: number): Record<BannerVariant, Omit<Shape, 'note'>> => {
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
        return {
            full: {height: () => fullH, widest: fullW, least: fullW},
            compact: {
                height: (w) => lineH + small.line * (words.reduce((s, ws) => s + wrappedLines(ws, space, Math.max(1, w - chrome)), 0) - k),
                widest: fits(chrome + oneLine), least,
            },
            // Cut short, a line each: every head whole and an ellipsis at most, four ems at least.
            cut: {height: () => lineH, widest: Math.max(least, fits(chrome + heads + textWidth(' …', small.px))), least},
        };
    };

    const attempt = (rows: number): BannerPlan | null => {
        const shape = shapes(rows);
        const together = (variant: BannerVariant): BannerPlan | null => {
            const at = placeShape({...shape[variant], note}, avoid, box, anchor, prefer);
            if (!at) return null;
            return {variant, rows, banner: piece(at.x, at.top, at.h, avoid), note: note && piece(at.x, at.top + at.h + n.gap, noteH, avoid), clear: true};
        };
        let alone: BannerPlan | null = null;
        const apart = (variant: BannerVariant): BannerPlan | null => {
            const at = placeShape({...shape[variant], note: null}, avoid, box, anchor, prefer);
            if (!at) return null;
            const banner = piece(at.x, at.top, at.h, avoid);
            const around = [...avoid, pieceRect(banner)];
            const under = banner.top + at.h + n.gap;
            const line = note && placeShape({height: () => noteH, widest: noteW, least: noteW, note: null}, around, box, {x: banner.x, top: under, bottom: under}, null);
            if (line) return {variant, rows, banner, note: piece(line.x, line.top, noteH, around), clear: true};
            alone ??= {variant, rows, banner, note: null, clear: true};
            return null;
        };
        const order: [BannerVariant, 'together' | 'apart'][] = note === null
            ? [['full', 'together'], ['compact', 'together'], ['cut', 'together']]
            : [['full', 'together'], ['compact', 'together'], ['full', 'apart'], ['compact', 'apart'], ['cut', 'together'], ['cut', 'apart']];
        for (const [variant, how] of order) {
            const plan = how === 'together' ? together(variant) : apart(variant);
            if (plan) return plan;
        }
        return alone;
    };

    const most = Math.min(BANNER.rows, Math.max(1, text.winners.length));
    for (let rows = most; rows >= 1; rows--) {
        const plan = attempt(rows);
        if (plan) return plan;
    }
    // Nowhere clear: where the pot was, full size.
    const h = shapes(most).full.height(0);
    const column = h + (note ? n.gap + noteH : 0);
    const top = prefer === 'up' ? anchor.top - BANNER.clear - column : anchor.bottom + BANNER.clear;
    return {
        variant: 'full', rows: most, banner: {x: board.x, top, width: cap, height: h},
        note: note && {x: board.x, top: top + h + n.gap, width: cap, height: noteH}, clear: false,
    };
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
