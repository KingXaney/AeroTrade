// When each of a view's animations plays: the table's events (lib/poker-night/events.diffViews) laid
// on one timeline, so a poll that brings a whole street at once still plays it in order — the
// chips go out one player after another, the street's bets sweep into the pot once they have
// landed, the next cards turn, the showdown's hands flip before the five cards that play lift, and
// the pots pay out one after another, side pots first and the main pot last, each its own stream of
// chips to its winners, split by their shares. With two or three boards (PLO) each street's cards turn
// board after board, the cards that play lift board after board, and each pot's chips split first —
// a stack flying from its pill to each board's numeral — then stream from each board to the winners
// of its share. A showdown's pay-out keeps within the result's revealMs (the next deal may come
// then): a batch that would run past it plays faster, every time in proportion. Pure and
// client-safe.
//
// Times are in units of the style's motion token (--motion-base, UNIT_MS at its default): a
// component sets an element's animation-delay to calc(var(--motion-base) * at) and its duration the
// same way, so a style that zeroes the token (brutalist) and both reduced-motion guards play every
// step at once — straight to the final state, which is the element's static style. The element's
// lifetime is a JS timer (`until`), never animationend, which a stopped animation never fires.

import type {TableEvent} from '@/lib/poker-night/events';

// --motion-base at its default: the length of one unit when the motion is on.
export const UNIT_MS = 200;

// Every step's length and spacing, in units.
export const BEAT = {
    DEAL_STAGGER: 0.35, // between two cards going round (a hand of two; more cards each go round faster, in the same time)
    DEAL: 1.6, // one card's flight from the dealer
    CHIP: 2, // chips from a stack to the bet line
    ALL_IN: 2.6, // the all-in's bigger push
    MOVE_GAP: 0.8, // from one player's move to the next one's
    CHECK_GAP: 0.5,
    TAG_HOLD: 9, // how long a move's tag stays on its plate
    FOLD: 2.5, // cards to the middle, fading
    SWEEP: 2.5, // the bets into the pot
    BOARD_STAGGER: 0.6, // between the flop's three cards
    BOARD_TURN_GAP: 0.4, // from one board's cards to the next board's, on the same street
    FLIP: 2, // a card turning face up
    STREET_PAUSE: 1, // after a street's cards, before what follows
    REVEAL_STAGGER: 0.6, // between two shown hands
    LIFT: 2, // the five cards that play lifting, the rest dimming
    BOARD_LIFT_STAGGER: 1.2, // from one board's cards that play lifting to the next board's
    BANNER: 2, // the winner's banner dropping in
    POT_GAP: 3.5, // from one pot's pay-out to the next
    SPLIT: 2, // a pot's share flying from its pill to a board's numeral
    SPLIT_LEAD: 1.4, // from the split leaving to the first board's stream
    BOARD_STREAM_GAP: 0.8, // from one board's stream to the next board's, in one pot
    STREAM: 3, // one chip's flight from the pot to a winner
    STREAM_STAGGER: 0.22, // between two chips of one pot
    STREAM_CHIPS: 6, // the chips one pot sends (split between its winners by share)
    COUNT: 2.5, // a winner's stack counting up
    SEAT_IN: 2, // a player sitting down
    MAX_BATCH: 40, // a batch longer than this is played faster, to fit
} as const;

// A card's own moment: a dealt card (the seat, its index in the hand: 0 to 3), a board card (seat
// −1, its index on the board, and which board), a shown hand's card.
export type CardTiming = {seat: number; index: number; at: number; board?: number};
// One chip of a pot's stream to one of its winners (pot 0 is the main pot): from the pot's pill, or
// with two or three boards from the numeral of the board whose share it is.
export type StreamChip = {key: string; pot: number; board: number; seat: number; at: number; from: 'pot' | 'board'};
// A pot's share flying from its pill to a board's numeral, before that board's stream.
export type SplitFlight = {key: string; pot: number; board: number; amount: number; at: number};

export type Scheduled = {
    id: string;
    event: TableEvent;
    at: number; // when it starts
    dur: number; // how long its main movement runs
    until: number; // when its elements may be taken away
    still?: boolean; // shown in place, not animated (a result the table had already shown)
    cards?: CardTiming[]; // deal, board, reveal, show
    liftAt?: number; // reveal: the five cards that play lift and the rest dim (the first board's)
    lifts?: number[]; // reveal: each board's cards that play lifting, board by board
    bannerAt?: number; // win
    potsOut?: {pot: number; at: number}[]; // win: each pot's pill empties as its stream leaves
    splits?: SplitFlight[]; // win, two or three boards: each pot's shares to the boards
    streams?: StreamChip[]; // win
    counts?: {seat: number; amount: number; at: number; dur: number}[]; // win: each winner's stack counting up
    confettiAt?: number | null; // win: a big win
    pace?: number; // a batch played faster: what its fixed lengths (a stream's, a split's) are scaled by
};

export type Batch = {items: Scheduled[]; length: number};

const timed = (event: TableEvent, at: number, dur: number, hold = 0): Scheduled => ({id: event.id, event, at, dur, until: Math.max(at + dur, at + hold)});

// One batch of events — what one view brought — on one timeline from 0.
export const scheduleBatch = (events: readonly TableEvent[]): Batch => {
    const items: Scheduled[] = [];
    let t = 0;
    let chipsLand = 0; // when the last chips sent out reach their bet lines
    let street: {name: string; at: number} | null = null; // the street whose first board turned last, and when
    let revealCap = Infinity; // the result's showing, in units: what a pay-out keeps within
    let paidOut = 0; // when the pay-out ends
    for (const event of events) {
        switch (event.kind) {
            case 'join':
                items.push(timed(event, 0, BEAT.SEAT_IN));
                break;
            case 'deal': {
                const n = event.seats.length;
                const cards: CardTiming[] = [];
                // Round by round, a card to each seat; four cards each go round twice as fast as two.
                const each = Math.max(1, event.cards);
                const stagger = (BEAT.DEAL_STAGGER * 2) / Math.max(2, each);
                for (let index = 0; index < each; index++) event.seats.forEach((seat, k) => cards.push({seat, index, at: t + (index * n + k) * stagger}));
                const last = cards.length > 0 ? cards[cards.length - 1].at : t;
                items.push({...timed(event, t, last - t + BEAT.DEAL), cards});
                t = last + BEAT.DEAL * 0.5;
                break;
            }
            case 'chips-out': {
                const dur = event.allIn ? BEAT.ALL_IN : BEAT.CHIP;
                items.push(timed(event, t, dur, BEAT.TAG_HOLD));
                chipsLand = Math.max(chipsLand, t + dur);
                t += BEAT.MOVE_GAP;
                break;
            }
            case 'check':
                items.push(timed(event, t, 1, BEAT.TAG_HOLD));
                t += BEAT.CHECK_GAP;
                break;
            case 'fold':
                items.push(timed(event, t, BEAT.FOLD, BEAT.TAG_HOLD));
                t += BEAT.MOVE_GAP;
                break;
            case 'timeout':
                // The clock's move: its tag shows with the move itself, which comes next.
                items.push(timed(event, t, 1, BEAT.TAG_HOLD));
                break;
            case 'refund': {
                const at = Math.max(t, chipsLand);
                items.push(timed(event, at, BEAT.CHIP, BEAT.TAG_HOLD));
                t = at + BEAT.MOVE_GAP;
                break;
            }
            case 'show':
                items.push({...timed(event, t, BEAT.FLIP), cards: Array.from({length: event.cards}, (_, index) => ({seat: event.seat, index, at: t + index * (0.6 / Math.max(2, event.cards))}))});
                t += BEAT.CHECK_GAP;
                break;
            case 'street-sweep': {
                const at = Math.max(t, chipsLand);
                items.push(timed(event, at, BEAT.SWEEP));
                t = at + BEAT.SWEEP * 0.8;
                break;
            }
            case 'board': {
                // Every board turns its cards for the street, board after board.
                const first = street as {name: string; at: number} | null;
                const at: number = event.board > 0 && first?.name === event.street ? first.at + event.board * BEAT.BOARD_TURN_GAP : Math.max(t, chipsLand);
                if (event.board === 0 || first?.name !== event.street) street = {name: event.street, at};
                const cards = event.cards.map((_, i) => ({seat: -1, board: event.board, index: event.from + i, at: at + i * BEAT.BOARD_STAGGER}));
                const end = cards[cards.length - 1].at + BEAT.FLIP;
                items.push({...timed(event, at, end - at), cards});
                t = Math.max(t, end + BEAT.STREET_PAUSE);
                break;
            }
            case 'reveal': {
                const at = Math.max(t, chipsLand);
                // A hand's cards turn within a quarter of a unit, however many it shows.
                const step = (count: number) => 0.25 / Math.max(1, count - 1);
                const cards = event.hands.flatMap((h, k) => h.cards.map((_, index) => ({seat: h.seat, index, at: at + k * BEAT.REVEAL_STAGGER + index * step(h.cards.length)})));
                const liftAt = at + Math.max(0, event.hands.length - 1) * BEAT.REVEAL_STAGGER + 0.25 + BEAT.FLIP;
                // Each board's cards that play lift in turn.
                const lifts = Array.from({length: Math.max(1, event.boards.length)}, (_, k) => liftAt + k * BEAT.BOARD_LIFT_STAGGER);
                const last = lifts[lifts.length - 1];
                items.push({...timed(event, at, last + BEAT.LIFT - at), cards, liftAt, lifts});
                t = last + BEAT.LIFT * 0.5;
                break;
            }
            case 'win': {
                if (!event.fresh) {
                    // The table had already shown this result: in place, without a show.
                    items.push({...timed(event, 0, 0), still: true});
                    break;
                }
                const bannerAt = Math.max(t, chipsLand);
                const potsOut: {pot: number; at: number}[] = [];
                const splits: SplitFlight[] = [];
                const streams: StreamChip[] = [];
                const arrivals = new Map<number, {first: number; last: number}>();
                // With two or three boards at a showdown, each pot's shares fly to the boards first.
                const onBoards = event.boards > 1 && !event.uncontested;
                const pots = [...new Set(event.pots.map((part) => part.pot))];
                pots.forEach((pot, p) => {
                    const leave = bannerAt + 1 + p * BEAT.POT_GAP;
                    potsOut.push({pot, at: leave});
                    const parts = event.pots.filter((part) => part.pot === pot);
                    const potAmount = parts.reduce((sum, part) => sum + part.amount, 0);
                    for (const part of parts) {
                        // A share of no chips (a pot of fewer chips than boards) sends nothing.
                        if (part.amount === 0) continue;
                        const start = onBoards ? leave + BEAT.SPLIT_LEAD + part.board * BEAT.BOARD_STREAM_GAP : leave;
                        if (onBoards) splits.push({key: `${pot}:${part.board}`, pot, board: part.board, amount: part.amount, at: leave});
                        const paid = part.winners.filter((w) => w.share > 0);
                        // Each winner's part of the stream, by share of the pot; every winner at least one chip.
                        const counts = paid.map((w) => Math.max(1, Math.round((BEAT.STREAM_CHIPS * w.share) / Math.max(1, potAmount))));
                        let k = 0;
                        for (let round = 0; round < Math.max(0, ...counts); round++) {
                            paid.forEach((w, i) => {
                                if (round >= counts[i]) return;
                                const at = start + k++ * BEAT.STREAM_STAGGER;
                                streams.push({key: `${pot}:${part.board}:${w.seat}:${round}`, pot, board: part.board, seat: w.seat, at, from: onBoards ? 'board' : 'pot'});
                                const land = at + BEAT.STREAM * 0.85;
                                const seen = arrivals.get(w.seat);
                                arrivals.set(w.seat, {first: Math.min(seen?.first ?? land, land), last: Math.max(seen?.last ?? land, land)});
                            });
                        }
                    }
                });
                const counts = event.totals.filter((w) => arrivals.has(w.seat)).map((w) => {
                    const {first, last} = arrivals.get(w.seat)!;
                    return {seat: w.seat, amount: w.amount, at: first, dur: last - first + BEAT.COUNT};
                });
                const lastStream = streams.length > 0 ? Math.max(...streams.map((c) => c.at)) + BEAT.STREAM : bannerAt + BEAT.BANNER;
                const end = Math.max(lastStream, ...counts.map((c) => c.at + c.dur));
                items.push({
                    ...timed(event, bannerAt, end - bannerAt), bannerAt, potsOut, ...(onBoards ? {splits} : {}), streams, counts,
                    confettiAt: event.big ? bannerAt + 1 : null,
                });
                t = end;
                // The pay-out keeps within the result's showing (lib/poker-night/config revealMs).
                if (event.revealMs > 0) revealCap = Math.min(revealCap, event.revealMs / UNIT_MS);
                paidOut = Math.max(paidOut, end);
                break;
            }
            // A turn starting and a seat given up draw nothing that moves (the turn's ring is the
            // seat's own); the announcer reads them from the events themselves.
            case 'turn':
            case 'leave':
                break;
        }
    }
    let batch: Batch = {items, length: Math.max(0, ...items.map((s) => s.until))};
    // A pay-out past the result's showing plays faster, the whole batch in proportion, to end with it.
    if (paidOut > revealCap) batch = compress(batch, revealCap / paidOut);
    return batch.length > BEAT.MAX_BATCH ? compress(batch, BEAT.MAX_BATCH / batch.length) : batch;
};

// The same batch played faster: every time scaled by k (< 1).
const compress = ({items, length}: Batch, k: number): Batch => {
    const s = (n: number) => n * k;
    return {
        length: s(length),
        items: items.map((item) => ({
            ...item,
            at: s(item.at), dur: s(item.dur), until: s(item.until), pace: (item.pace ?? 1) * k,
            ...(item.cards ? {cards: item.cards.map((c) => ({...c, at: s(c.at)}))} : {}),
            ...(item.liftAt !== undefined ? {liftAt: s(item.liftAt)} : {}),
            ...(item.lifts ? {lifts: item.lifts.map(s)} : {}),
            ...(item.splits ? {splits: item.splits.map((c) => ({...c, at: s(c.at)}))} : {}),
            ...(item.bannerAt !== undefined ? {bannerAt: s(item.bannerAt)} : {}),
            ...(item.potsOut ? {potsOut: item.potsOut.map((p) => ({...p, at: s(p.at)}))} : {}),
            ...(item.streams ? {streams: item.streams.map((c) => ({...c, at: s(c.at)}))} : {}),
            ...(item.counts ? {counts: item.counts.map((c) => ({...c, at: s(c.at), dur: s(c.dur)}))} : {}),
            ...(item.confettiAt !== undefined && item.confettiAt !== null ? {confettiAt: s(item.confettiAt)} : {}),
        })),
    };
};

// ── batches in a row ──

// Events older than this when they reach the table are not animated (a tab that woke up).
export const STALE_MS = 2500;
// A batch waits for the one before it to finish, but never longer than this.
export const MAX_LAG_MS = 1600;

// When a batch arriving at `now` starts: after the one still playing, at most MAX_LAG_MS late.
export const batchStart = (now: number, busyUntil: number): number => Math.min(Math.max(now, busyUntil), now + MAX_LAG_MS);
