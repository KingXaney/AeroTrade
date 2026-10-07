// What happened at the table between two views, as the animations need it: a deal, chips going out
// to a bet line, a check, a fold, the street's bets sweeping into the pot, a board card, the
// winning hands revealed, the pots paid out, a turn starting, a player sitting down or getting up.
// Pure and client-safe: the table runs it on every view it applies (lib/poker-night/feed) and the
// components animate the events, never the views.
//
// Events come from the hand's log, by index: a view carries the last few entries (logTail) and the
// hand's whole length (logLength), so the entries new since the previous view are those at
// indexes from the previous length on. Every event's id is built from the hand number and that
// index (or the street, the turn, the seq), so a view applied twice, or a replay, never fires one
// twice — and a view older than the one before it fires nothing.
//
// When the jump spans a whole hand (a tab that slept), nothing is animated: the table snaps to
// where it is. A result is `fresh` while the table is still showing it (inside its revealMs).

import type {Card} from '@/lib/poker/cards';
import {ENTRY_FLAGS, STREETS} from '@/lib/poker-night/config';
import type {EntryKind, Street} from '@/lib/poker-night/types';
import type {HandView, SeatView, TableView, WireEntry} from '@/lib/poker-night/view-types';
import {readShownHand, WIRE_KINDS} from '@/lib/poker-night/views';

// The moves that send chips from a stack to the table.
export type ChipMove = Extract<EntryKind, 'ante' | 'small-blind' | 'big-blind' | 'post' | 'call' | 'bet' | 'raise'>;
const CHIP_MOVES: ReadonlySet<string> = new Set<ChipMove>(['ante', 'small-blind', 'big-blind', 'post', 'call', 'bet', 'raise']);

// A seat's bet line as a street closes.
export type BetLine = {seat: number; amount: number};

// A hand shown at the showdown: its cards, the five cards that play (lib/poker-night/hand-name
// bestFive, through views.readShownHand) and its value (null before the flop); winner when any pot
// paid it.
export type RevealedHand = {seat: number; cards: [Card, Card]; best: Card[]; value: number | null; winner: boolean};

// One pot as it pays out: pot 0 is the main pot, 1 the first side pot; each winner's share.
export type PotPayout = {pot: number; amount: number; winners: {seat: number; share: number}[]};

// What a pot of this many big blinds or more wins counts as a big win (confetti).
export const BIG_WIN_BIG_BLINDS = 40;

type Base = {id: string; handNo: number};

export type TableEvent =
    // A new hand dealt to these seats, in the order the cards go round (from the seat after the button).
    | (Base & {kind: 'deal'; seats: number[]})
    // Chips from a stack: an ante or a blind, a call, a bet, a raise. amount is what moved, to the
    // seat's bet line after it (a raise's "raise to").
    | (Base & {kind: 'chips-out'; seat: number; move: ChipMove; amount: number; to: number; allIn: boolean})
    | (Base & {kind: 'check'; seat: number})
    | (Base & {kind: 'fold'; seat: number})
    // The clock made this move for them (a check when free, else a fold).
    | (Base & {kind: 'timeout'; seat: number; move: 'check' | 'fold'})
    // The uncalled part of a bet going back to its owner.
    | (Base & {kind: 'refund'; seat: number; amount: number})
    // A player showing their cards when nothing obliged them to.
    | (Base & {kind: 'show'; seat: number})
    // The street's bets sweeping into the pot.
    | (Base & {kind: 'street-sweep'; street: Street; bets: BetLine[]; total: number})
    // Board cards turned: the flop's three, the turn's or the river's one; from is the first card's
    // index on the board.
    | (Base & {kind: 'board'; street: Exclude<Street, 'preflop'>; cards: Card[]; from: number})
    // The showdown: every shown hand, the winners among them.
    | (Base & {kind: 'reveal'; board: Card[]; hands: RevealedHand[]; winners: number[]})
    // The pots paid out in the order the table pays them: side pots first, the main pot last.
    // totals is what each winner took across them; uncontested when everyone else folded.
    | (Base & {kind: 'win'; pots: PotPayout[]; totals: {seat: number; amount: number}[]; uncontested: boolean; big: boolean; fresh: boolean})
    // A player on the clock.
    | (Base & {kind: 'turn'; seat: number; turn: number; mine: boolean})
    // A seat taken or given up.
    | (Base & {kind: 'join' | 'leave'; seat: number; pid: string});

export type TableEventKind = TableEvent['kind'];

// What diffViews reads: the public table, with its version and the time it was read.
export type DiffableView = TableView & {seq: number; serverNow: number};

export type DiffOptions = {
    mySeat?: number | null; // whose turn is "mine"
    bigBlind?: number; // for what counts as a big win
};

const streetIndex = (street: Street): number => STREETS.indexOf(street);

// Where each street's cards sit on the board.
const BOARD_RANGE: Record<Exclude<Street, 'preflop'>, [number, number]> = {flop: [0, 3], turn: [3, 4], river: [4, 5]};

// The seats dealt into a hand, clockwise from the one after the button.
const dealtSeats = (seats: readonly (SeatView | null)[], button: number): number[] => {
    const n = seats.length;
    const out: number[] = [];
    for (let k = 1; k <= n; k++) {
        const i = (button + k) % n;
        const s = seats[i];
        if (s && (s.cards !== 'none' || s.state === 'folded')) out.push(i);
    }
    return out;
};

// The hand's log entries at and after `from` that the view still carries.
const entriesFrom = (hand: HandView, from: number): {index: number; entry: WireEntry}[] => {
    const tailStart = hand.logLength - hand.logTail.length;
    const out: {index: number; entry: WireEntry}[] = [];
    for (let index = Math.max(from, tailStart); index < hand.logLength; index++) out.push({index, entry: hand.logTail[index - tailStart]});
    return out;
};

const seatEvents = (prev: DiffableView, next: DiffableView, out: TableEvent[]): void => {
    const n = Math.max(prev.seats.length, next.seats.length);
    for (let seat = 0; seat < n; seat++) {
        const was = prev.seats[seat]?.pid ?? null;
        const now = next.seats[seat]?.pid ?? null;
        if (was === now) continue;
        if (was !== null) out.push({kind: 'leave', id: `seat:${seat}:${was}:${next.seq}:leave`, handNo: next.handNo, seat, pid: was});
        if (now !== null) out.push({kind: 'join', id: `seat:${seat}:${now}:${next.seq}:join`, handNo: next.handNo, seat, pid: now});
    }
};

// A hand's events from the previous view of it (null for a hand the previous view had not seen).
const handEvents = (prevView: DiffableView, prevHand: HandView | null, next: DiffableView, hand: HandView, opts: DiffOptions, out: TableEvent[]): void => {
    const no = hand.no;
    const id = (rest: string) => `${no}:${rest}`;
    let street = prevHand ? streetIndex(prevHand.street) : 0;
    let boardShown = prevHand ? prevHand.board.length : 0;
    // Each seat's bet line on the street being played: as the previous view showed it, then as the
    // log moves it (every entry carries the seat's street bet after it).
    const bets = new Map<number, number>();
    if (prevHand) prevView.seats.forEach((s, i) => s && s.bet > 0 && bets.set(i, s.bet));
    const allInSeats = new Set<number>();
    if (prevHand) prevView.seats.forEach((s, i) => s?.state === 'all-in' && allInSeats.add(i));

    const sweep = () => {
        const lines = [...bets.entries()].filter(([, amount]) => amount > 0).map(([seat, amount]) => ({seat, amount})).sort((a, b) => a.seat - b.seat);
        bets.clear();
        if (lines.length === 0) return;
        out.push({kind: 'street-sweep', id: id(`sweep:${STREETS[street]}`), handNo: no, street: STREETS[street], bets: lines, total: lines.reduce((sum, l) => sum + l.amount, 0)});
    };
    const turnBoard = () => {
        const name = STREETS[street];
        if (name === 'preflop') return;
        const [from, to] = BOARD_RANGE[name];
        if (boardShown >= to || hand.board.length < to) return;
        out.push({kind: 'board', id: id(`board:${name}`), handNo: no, street: name, cards: hand.board.slice(from, to), from});
        boardShown = to;
    };
    // Closes every street before `target`: its bets swept, the next street's cards turned.
    const reach = (target: number) => {
        while (street < target) {
            sweep();
            street++;
            turnBoard();
        }
    };

    if (!prevHand) out.push({kind: 'deal', id: id('deal'), handNo: no, seats: dealtSeats(next.seats, hand.button)});

    for (const {index, entry} of entriesFrom(hand, prevHand ? prevHand.logLength : 0)) {
        const [seat, kindIndex, amount, to, flags, entryStreet] = entry;
        const kind = WIRE_KINDS[kindIndex] as EntryKind | undefined;
        if (kind === undefined || kind === 'void' || seat < 0) continue;
        if (entryStreet > street) reach(entryStreet);
        const at = id(String(index));
        const allIn = (flags & ENTRY_FLAGS.allIn) !== 0;
        if (allIn) allInSeats.add(seat);
        if ((flags & ENTRY_FLAGS.timeout) !== 0 && (kind === 'check' || kind === 'fold')) {
            out.push({kind: 'timeout', id: `${at}:timeout`, handNo: no, seat, move: kind});
        }
        if (CHIP_MOVES.has(kind)) out.push({kind: 'chips-out', id: at, handNo: no, seat, move: kind as ChipMove, amount, to, allIn});
        else if (kind === 'check') out.push({kind: 'check', id: at, handNo: no, seat});
        else if (kind === 'fold') out.push({kind: 'fold', id: at, handNo: no, seat});
        else if (kind === 'refund') out.push({kind: 'refund', id: at, handNo: no, seat, amount});
        else if (kind === 'show') out.push({kind: 'show', id: at, handNo: no, seat});
        bets.set(seat, to);
    }

    // The streets the hand moved on to without a line in the log (a run-out), and the last street's
    // bets once its betting has closed.
    reach(streetIndex(hand.street));
    if (hand.phase !== 'betting') sweep();

    const result = hand.result;
    if (result && !prevHand?.result) {
        const winners = [...new Set(result.pots.flatMap((p) => p.winners))];
        if (result.showdown && result.hands.length > 0) {
            const hands = result.hands.map((shown): RevealedHand => {
                const read = readShownHand(hand.board, shown);
                return {seat: read.seat, cards: read.cards, best: read.best, value: read.value, winner: winners.includes(read.seat)};
            });
            out.push({kind: 'reveal', id: id('reveal'), handNo: no, board: [...hand.board], hands, winners});
        }
        const pots = result.pots
            .map((p, pot): PotPayout => ({pot, amount: p.amount, winners: p.winners.map((seat, k) => ({seat, share: p.shares[k] ?? 0}))}))
            .reverse();
        const totals = new Map<number, number>();
        for (const pot of pots) for (const w of pot.winners) totals.set(w.seat, (totals.get(w.seat) ?? 0) + w.share);
        const bigBlind = opts.bigBlind ?? 0;
        const big = [...totals.entries()].some(([seat, amount]) => (bigBlind > 0 && amount >= BIG_WIN_BIG_BLINDS * bigBlind) || allInSeats.has(seat));
        out.push({
            kind: 'win', id: id('win'), handNo: no, pots,
            totals: [...totals.entries()].map(([seat, amount]) => ({seat, amount})).sort((a, b) => a.seat - b.seat),
            uncontested: !result.showdown, big, fresh: next.serverNow - result.completedAt < result.revealMs,
        });
    }

    if (hand.phase === 'betting' && hand.actor !== null && (!prevHand || prevHand.actor !== hand.actor || prevView.turn !== next.turn)) {
        out.push({kind: 'turn', id: id(`turn:${next.turn}`), handNo: no, seat: hand.actor, turn: next.turn, mine: opts.mySeat !== undefined && opts.mySeat !== null && hand.actor === opts.mySeat});
    }
};

// The events between two views, oldest first. Nothing for a first view, for a view no newer than
// the previous one, or (beyond seats changing hands) for a jump past a whole hand.
export const diffViews = (prev: DiffableView | null, next: DiffableView, opts: DiffOptions = {}): TableEvent[] => {
    if (!prev || next.seq <= prev.seq) return [];
    const out: TableEvent[] = [];
    seatEvents(prev, next, out);
    const hand = next.hand;
    if (!hand) return out;
    const prevHand = prev.hand;
    if (prevHand && prevHand.no === hand.no) handEvents(prev, prevHand, next, hand, opts, out);
    else if (!prevHand || hand.no === prevHand.no + 1) handEvents(prev, null, next, hand, opts, out);
    return out;
};

// Every event kind, for the components' data-anim hooks and the QA that reads them.
export const EVENT_KINDS: readonly TableEventKind[] = [
    'deal', 'chips-out', 'check', 'fold', 'timeout', 'refund', 'show', 'street-sweep', 'board', 'reveal', 'win', 'turn', 'join', 'leave',
];
