// A betting round of a poker night hand — no limit, or pot limit in PLO: what a player owes, whether
// they still have to act, the moves open to them, and the walk from one actor to the next. Pure.
//
// The rules, in the order a table meets them:
// - A player owes the current bet less their street bet, capped at what a live opponent can still
//   match once nobody else can act (the small blind facing a short all-in big blind calls only the
//   difference).
// - The minimum bet is the big blind; the minimum raise is to the current bet plus the last full
//   increment, and only a full raise grows the increment. A short all-in reopens the betting for
//   nobody who has acted, unless the short all-ins since their move add up to a full raise (the TDA
//   rule). One exception, the friendlier reading: a player who checked and then faces an opening
//   all-in below the minimum bet may raise. No raise is open when every opponent is all in.
// - No limit: a bet or a raise may go up to every chip the player has. Pot limit (PLO): at most to the
//   current bet plus the pot after the call — every chip committed this hand (antes, earlier streets,
//   every bet in front of the players, the player's own) plus what the player owes — never below the
//   minimum, never past all in. The all-in move is a raise only when all in is within that; facing a
//   bet as large as the stack it is the call; else it is refused, and the table's Pot sends the raise
//   to the cap.
// - Pre-actions are kept on the server and resolved when the turn reaches their owner; an away
//   player checks when that is free and folds otherwise.
//
// legalFor runs on a BettingSnapshot, which the server builds from its state and the client from
// the view it was sent (lib/poker-night/views.snapshotFromView), so both offer the same moves.
// The helpers that move chips work on the reducer's private copy (a Work) and report 'close' when
// the betting is over; lib/poker-night/showdown.closeBetting takes it from there.

import {ENTRY_FLAGS, ENTRY_KINDS, KEEP, STREETS} from '@/lib/poker-night/config';
import type {EntryKind, Hand, HandEntry, LogEntry, Legal, Move, PreAction, Refusal, TableState, Work} from '@/lib/poker-night/types';
import {limitOf, type BettingLimit} from '@/lib/poker-night/variants';

export type BetSeat = {seat: number; streetBet: number; actedAtBet: number | null; folded: boolean; allIn: boolean};
type Round = {currentBet: number; seats: readonly BetSeat[]};

export type BettingSnapshot = {
    phase: Hand['phase'] | null;
    actor: number | null;
    currentBet: number;
    increment: number;
    limit: BettingLimit; // the hand's game's: pot limit in PLO
    pot: number; // every chip committed this hand: antes, earlier streets and every bet in front
    seats: (BetSeat & {stack: number})[];
};

export type Flow = 'waiting' | 'close';

export const NO_HAND_SNAPSHOT: Readonly<BettingSnapshot> = Object.freeze({phase: null, actor: null, currentBet: 0, increment: 0, limit: 'no-limit', pot: 0, seats: []});

export const snapshotFromState = (state: Pick<TableState, 'hand' | 'seats'>): BettingSnapshot => {
    const hand = state.hand;
    if (!hand) return {...NO_HAND_SNAPSHOT, seats: []};
    return {
        phase: hand.phase, actor: hand.actor, currentBet: hand.currentBet, increment: hand.increment,
        limit: limitOf(hand.variant), pot: hand.seats.reduce((sum, p) => sum + p.committed, 0),
        seats: hand.seats.map((p) => ({seat: p.seat, streetBet: p.streetBet, actedAtBet: p.actedAtBet, folded: p.folded, allIn: p.allIn, stack: state.seats[p.seat]?.stack ?? 0})),
    };
};

const seatIn = <T extends BetSeat>(round: {seats: readonly T[]}, seat: number): T | undefined => round.seats.find((p) => p.seat === seat);

// Someone besides this seat is still in and holds chips.
export const othersCanAct = (round: Round, seat: number): boolean =>
    round.seats.some((q) => q.seat !== seat && !q.folded && !q.allIn);

export const owed = (round: Round, seat: number): number => {
    const p = seatIn(round, seat);
    if (!p || p.folded) return 0;
    let target = round.currentBet;
    if (!othersCanAct(round, seat)) {
        let top = 0;
        for (const q of round.seats) if (q.seat !== seat && !q.folded) top = Math.max(top, q.streetBet);
        target = Math.min(target, top);
    }
    return Math.max(0, target - p.streetBet);
};

export const needsToAct = (round: Round, seat: number): boolean => {
    const p = seatIn(round, seat);
    return !!p && !p.folded && !p.allIn && (owed(round, seat) > 0 || (p.actedAtBet === null && othersCanAct(round, seat)));
};

// The moves open to `seat`, or null unless it is that seat's turn in a betting round.
export const legalFor = (snap: BettingSnapshot, seat: number): Legal | null => {
    if (snap.phase !== 'betting' || snap.actor !== seat) return null;
    const p = seatIn(snap, seat);
    if (!p || p.folded || p.allIn) return null;
    const due = owed(snap, seat);
    const reopened = p.actedAtBet === null
        || (p.actedAtBet === 0 && snap.currentBet > 0 && snap.currentBet < snap.increment)
        || snap.currentBet - p.actedAtBet >= snap.increment;
    const allInTo = p.streetBet + p.stack;
    const min = Math.min(snap.currentBet + snap.increment, allInTo);
    // Pot limit: the current bet plus the pot after the call. A raise is open only while someone else
    // can act, so `due` here is the whole of the current bet less the player's street bet.
    const capTo = snap.limit === 'pot-limit' ? snap.currentBet + snap.pot + due : Infinity;
    const raise = p.stack > due && reopened && othersCanAct(snap, seat)
        ? {kind: snap.currentBet === 0 ? 'bet' as const : 'raise' as const, min, max: Math.min(allInTo, Math.max(min, capTo))}
        : null;
    return {fold: true, check: due === 0, call: Math.min(due, p.stack), callAllIn: due > 0 && p.stack <= due, raise};
};

// Whether the all-in move is open: a raise to all in within the limit, or a call of everything left.
export const allInOpen = (legal: Legal, snap: Pick<BettingSnapshot, 'seats'>, seat: number): boolean => {
    const p = seatIn(snap, seat);
    return legal.callAllIn || (legal.raise !== null && p !== undefined && legal.raise.max === p.streetBet + p.stack);
};

// ── the hand's log ──

// Appends a line, keeping the latest KEEP.LOG_SUMMARY. `to` is the seat's street bet after it.
export const pushLog = (w: Work, seat: number, kind: EntryKind, amount: number, flags = 0): void => {
    const hand = w.state.hand!;
    const to = hand.seats.find((p) => p.seat === seat)?.streetBet ?? 0;
    hand.log.push([seat, ENTRY_KINDS.indexOf(kind), amount, to, flags, STREETS.indexOf(hand.street), w.at - hand.startedAt]);
    const extra = hand.log.length - KEEP.LOG_SUMMARY;
    if (extra > 0) {
        hand.log.splice(0, extra);
        hand.logDropped += extra;
    }
};

export const readEntry = (hand: Pick<Hand, 'startedAt'>, e: LogEntry): HandEntry => ({
    seat: e[0], street: STREETS[e[5]], kind: ENTRY_KINDS[e[1]], amount: e[2], to: e[3],
    allIn: (e[4] & ENTRY_FLAGS.allIn) !== 0, timeout: (e[4] & ENTRY_FLAGS.timeout) !== 0, auto: (e[4] & ENTRY_FLAGS.auto) !== 0,
    at: hand.startedAt + e[6],
});

// ── moving chips ──

export type How = 'player' | 'timeout' | 'auto';
export const FLAG_OF: Record<How, number> = {player: 0, timeout: ENTRY_FLAGS.timeout, auto: ENTRY_FLAGS.auto};

// Chips from a seat's stack into the hand: committed and, unless dead (an ante), the street bet.
export const commit = (w: Work, seat: number, amount: number, live = true): void => {
    const p = w.state.hand!.seats.find((q) => q.seat === seat)!;
    const table = w.state.seats[seat]!;
    table.stack -= amount;
    p.committed += amount;
    if (live) p.streetBet += amount;
    if (table.stack === 0) p.allIn = true;
};

// The actor's move. Refuses (and changes nothing) when it is not open to them.
export const applyMove = (w: Work, seat: number, move: Move, how: How): Refusal | null => {
    const s = w.state;
    const hand = s.hand!;
    const legal = legalFor(snapshotFromState(s), seat);
    if (!legal) return 'not-your-turn';
    const p = hand.seats.find((q) => q.seat === seat)!;
    const table = s.seats[seat]!;
    const flags = FLAG_OF[how];
    const pay = (kind: EntryKind, amount: number) => {
        commit(w, seat, amount);
        pushLog(w, seat, kind, amount, flags | (table.stack === 0 ? ENTRY_FLAGS.allIn : 0));
    };
    const raiseTo = (to: number, kind: 'bet' | 'raise') => {
        const size = to - hand.currentBet;
        if (size >= hand.increment) hand.increment = size;
        hand.currentBet = to;
        hand.lastAggressor = seat;
        pay(kind, to - p.streetBet);
    };
    switch (move.kind) {
        case 'fold':
            p.folded = true;
            pushLog(w, seat, 'fold', 0, flags);
            break;
        case 'check':
            if (!legal.check) return 'illegal';
            pushLog(w, seat, 'check', 0, flags);
            break;
        case 'call':
            if (legal.call <= 0) return 'illegal';
            pay('call', legal.call);
            break;
        case 'raise': {
            if (!legal.raise) return 'illegal';
            const to = move.to;
            if (!Number.isSafeInteger(to) || to > legal.raise.max) return 'bad-amount';
            if (to < legal.raise.min) return 'below-min-raise';
            raiseTo(to, legal.raise.kind);
            break;
        }
        case 'all-in':
            // Under pot limit all in is a raise only when it is within the cap; the cap itself is a
            // raise to legal.raise.max.
            if (legal.raise && legal.raise.max === p.streetBet + table.stack) raiseTo(legal.raise.max, legal.raise.kind);
            else if (legal.callAllIn) pay('call', legal.call);
            else return 'illegal';
            break;
        default:
            return 'illegal';
    }
    p.actedAtBet = hand.currentBet;
    p.pre = null;
    if (how === 'player') {
        table.timeouts = 0;
        table.away = false;
    }
    return null;
};

// A fold out of turn: a player leaving, or removed, while facing a bet.
export const foldOutOfTurn = (w: Work, seat: number): void => {
    const p = w.state.hand!.seats.find((q) => q.seat === seat)!;
    p.folded = true;
    p.pre = null;
    pushLog(w, seat, 'fold', 0);
};

// What a pre-action does once its owner is on the clock, or null when it no longer applies (it is
// then cleared and the player decides).
export const resolvePre = (pre: PreAction & {atBet: number}, legal: Legal, currentBet: number): Move | null => {
    switch (pre.kind) {
        case 'check-fold':
            return legal.check ? {kind: 'check'} : {kind: 'fold'};
        case 'check':
            return legal.check ? {kind: 'check'} : null;
        case 'call':
            if (currentBet !== pre.atBet || legal.call > pre.amount) return null;
            return legal.check ? {kind: 'check'} : {kind: 'call'};
        case 'call-any':
            return legal.check ? {kind: 'check'} : {kind: 'call'};
    }
};

// The actor's move when it is made for them: away, or a pre-action that applies. True if it moved.
const autoAct = (w: Work, seat: number): boolean => {
    const s = w.state;
    const p = s.hand!.seats.find((q) => q.seat === seat)!;
    const legal = legalFor(snapshotFromState(s), seat);
    if (!legal) return false;
    if (s.seats[seat]!.away) return applyMove(w, seat, legal.check ? {kind: 'check'} : {kind: 'fold'}, 'auto') === null;
    const pre = p.pre;
    if (!pre) return false;
    p.pre = null;
    const move = resolvePre(pre, legal, s.hand!.currentBet);
    return move !== null && applyMove(w, seat, move, 'auto') === null;
};

const liveCount = (hand: Hand): number => hand.seats.filter((p) => !p.folded).length;

// The first seat in hand order after `from` that still has to act, or null.
const nextToAct = (hand: Hand, from: number): number | null => {
    const n = hand.seats.length;
    const start = hand.seats.findIndex((p) => p.seat === from);
    for (let k = 1; k <= n; k++) {
        const p = hand.seats[(start + k) % n];
        if (needsToAct(hand, p.seat)) return p.seat;
    }
    return null;
};

// Puts the next player on the clock, making the moves of anyone away or holding a pre-action that
// applies, until someone has to decide ('waiting') or the betting is over ('close').
export const settleTurn = (w: Work, from: number): Flow => {
    const s = w.state;
    const hand = s.hand!;
    for (let guard = 0; guard <= 4 * hand.seats.length; guard++) {
        if (liveCount(hand) <= 1) return 'close';
        const next = nextToAct(hand, from);
        if (next === null) return endStreet(w);
        hand.actor = next;
        s.turn++;
        hand.deadline = w.at + s.config.turnSeconds * 1000;
        if (!autoAct(w, next)) return 'waiting';
        from = next;
    }
    throw new Error('the betting round did not settle');
};

// The next street's cards, on every board at once; the bets of the last one are in the pot.
export const nextStreet = (hand: Hand): void => {
    hand.street = STREETS[STREETS.indexOf(hand.street) + 1];
    const n = hand.street === 'flop' ? 3 : hand.street === 'turn' ? 4 : 5;
    hand.boards = hand.deck.map((run) => run.slice(0, n));
    for (const p of hand.seats) {
        p.streetBet = 0;
        p.actedAtBet = null;
        p.pre = null;
    }
    hand.currentBet = 0;
    hand.increment = hand.bigBlind;
    hand.lastAggressor = null;
};

// Nobody has to act: deal the next street while two players can still bet, else close.
export const endStreet = (w: Work): Flow => {
    const hand = w.state.hand!;
    const canAct = hand.seats.filter((p) => !p.folded && !p.allIn).length;
    if (canAct < 2 || hand.street === 'river') return 'close';
    nextStreet(hand);
    return settleTurn(w, hand.button);
};

// After a change out of turn (a fold or a player going away): close if one player is left, move
// the clock on if the actor no longer has to act, or act for them if they are away now.
export const recheck = (w: Work): Flow => {
    const hand = w.state.hand!;
    if (hand.phase !== 'betting') return 'waiting';
    if (liveCount(hand) <= 1) return 'close';
    const actor = hand.actor;
    if (actor === null) return 'waiting';
    if (!needsToAct(hand, actor) || autoAct(w, actor)) return settleTurn(w, actor);
    return 'waiting';
};
