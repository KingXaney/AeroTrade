// The hand log as the drawer prints it (components/poker-night HandLog): a hand's lines in order —
// the moves street by street, each street led by its cards, then the hands shown and who won what —
// all in LOG_COPY's words. Pure and client-safe. The current hand comes from GET detail?part=log
// (its whole log) with the view's board and result; an earlier hand from GET detail?part=history,
// which carries its own players, board, shown hands and pots.
//
// A seat's name is the player's who sat there in that hand; one the room has let go of reads as
// its seat ("Seat 3"), never as a blank.

import type {Card} from '@/lib/poker/cards';
import {HAND_COPY, LOG_COPY, TABLE_COPY, type PotIndex} from '@/lib/learn/copy/poker-night';
import {STREETS} from '@/lib/poker-night/config';
import {describeHand, playsBoard} from '@/lib/poker-night/hand-name';
import type {Street} from '@/lib/poker-night/types';
import type {HandEntryView, HandResultView, HandSummaryView, People, ShownHandView} from '@/lib/poker-night/view-types';
import {readShownHand} from '@/lib/poker-night/views';

export type LogLineKind = 'street' | 'move' | 'show' | 'result' | 'note';
export type LogLine = {key: string; kind: LogLineKind; text: string; seat: number | null};

export type LogHand = {
    no: number;
    title: string; // "Hand 12"
    blinds: string | null; // "Blinds 10/20, ante 5", when the hand says
    lines: LogLine[];
    truncated: boolean;
};

const BOARD_AT: Record<Exclude<Street, 'preflop'>, [number, number]> = {flop: [0, 3], turn: [3, 4], river: [4, 5]};

// A seat's player in this hand: their name, else the seat as people count seats.
export type SeatNamer = (seat: number) => string;

export const seatNamer = (pidOfSeat: (seat: number) => string | null, people: People): SeatNamer => (seat) => {
    const pid = pidOfSeat(seat);
    const name = pid === null ? '' : people[pid]?.name ?? '';
    return name || TABLE_COPY.seat(seat);
};

// The moves, each street's cards before its first line; a street the hand reached with no move of
// its own (an all-in run-out) still shows its cards.
const moveLines = (no: number, entries: readonly HandEntryView[], board: readonly Card[], nameOf: SeatNamer): LogLine[] => {
    const lines: LogLine[] = [];
    let street = 0;
    const open = (target: number) => {
        while (street < target) {
            street++;
            const name = STREETS[street] as Exclude<Street, 'preflop'>;
            const [from, to] = BOARD_AT[name];
            if (board.length < to) return;
            lines.push({key: `${no}:street:${name}`, kind: 'street', text: LOG_COPY.street(name, HAND_COPY.cardsShort(board.slice(from, to))), seat: null});
        }
    };
    entries.forEach((e, i) => {
        open(STREETS.indexOf(e.street));
        const amount = e.kind === 'raise' ? e.to : e.amount;
        lines.push({
            key: `${no}:${i}`, kind: 'move',
            text: LOG_COPY.line(e.seat >= 0 ? nameOf(e.seat) : '', e.kind, amount, e.allIn, e.timeout), seat: e.seat >= 0 ? e.seat : null,
        });
    });
    open(board.length >= 5 ? 3 : board.length === 4 ? 2 : board.length === 3 ? 1 : 0);
    return lines;
};

const phraseOf = (hand: ShownHandView | undefined): string | null => (hand && hand.value !== null ? HAND_COPY.phrase(describeHand(hand.value)) : null);

type Pot = {amount: number; winners: readonly number[]; shares: readonly number[]};

// The hands shown (each with its name once the flop is out, and a hand that plays the board said
// so), then each pot's winners — the main pot first, side pots after, by number — or the one player
// everyone else folded to.
const resultLines = (no: number, board: readonly Card[], hands: readonly ShownHandView[], pots: readonly Pot[], nameOf: SeatNamer): LogLine[] => {
    const lines: LogLine[] = [];
    for (const h of hands) {
        lines.push({key: `${no}:show:${h.seat}`, kind: 'show', text: LOG_COPY.shows(nameOf(h.seat), HAND_COPY.cardsShort(h.cards), phraseOf(h)), seat: h.seat});
        if (h.value !== null && playsBoard(board, h.value)) {
            lines.push({key: `${no}:board:${h.seat}`, kind: 'note', text: LOG_COPY.playsBoard(nameOf(h.seat)), seat: h.seat});
        }
    }
    const bySeat = new Map(hands.map((h) => [h.seat, h]));
    pots.forEach((pot, i) => {
        const index: PotIndex = pots.length === 1 ? null : i;
        const key = `${no}:pot:${i}`;
        if (pot.winners.length === 0) return;
        if (hands.length === 0 && pot.winners.length === 1) {
            lines.push({key, kind: 'result', text: LOG_COPY.uncontested(nameOf(pot.winners[0]), pot.shares[0] ?? pot.amount), seat: pot.winners[0]});
        } else if (pot.winners.length === 1) {
            const seat = pot.winners[0];
            lines.push({key, kind: 'result', text: LOG_COPY.wins(nameOf(seat), pot.shares[0] ?? pot.amount, phraseOf(bySeat.get(seat)), index), seat});
        } else {
            const shares = pot.winners.map((seat, k) => ({name: nameOf(seat), amount: pot.shares[k] ?? 0}));
            lines.push({key, kind: 'result', text: LOG_COPY.split(shares, index), seat: null});
        }
    });
    return lines;
};

// The hand in play (or just ended), from its whole log, its board and, once it is complete, its
// result.
export const currentHandLog = (
    no: number, entries: readonly HandEntryView[], board: readonly Card[], result: HandResultView | null, nameOf: SeatNamer,
): LogHand => {
    const shown = result ? result.hands.map((h) => readShownHand(board, h)) : [];
    return {
        no, title: LOG_COPY.hand(no), blinds: null,
        lines: [...moveLines(no, entries, board, nameOf), ...(result ? resultLines(no, board, shown, result.pots, nameOf) : [])],
        truncated: false,
    };
};

// A completed hand from history, the viewer's own cards added when they were never shown.
export const historyHandLog = (summary: HandSummaryView, people: People, mePid: string | null): LogHand => {
    const pidAt = new Map(summary.players.map((p) => [p.seat, p.pid]));
    const nameOf = seatNamer((seat) => pidAt.get(seat) ?? null, people);
    const lines = [
        ...moveLines(summary.no, summary.log, summary.board, nameOf),
        ...resultLines(summary.no, summary.board, summary.hands, summary.pots, nameOf),
    ];
    const mine = summary.players.find((p) => p.pid === mePid);
    if (mine && mine.hole && !mine.shown) lines.push({key: `${summary.no}:mine`, kind: 'note', text: LOG_COPY.youHeld(HAND_COPY.cardsShort(mine.hole)), seat: mine.seat});
    return {
        no: summary.no, title: LOG_COPY.hand(summary.no), blinds: LOG_COPY.blinds(summary.smallBlind, summary.bigBlind, summary.ante),
        lines, truncated: summary.truncated,
    };
};
