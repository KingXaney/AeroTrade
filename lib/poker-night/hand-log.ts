// The hand log as the drawer prints it (components/poker-night HandLog): a hand's lines in order —
// the moves street by street, each street led by its cards, then the hands shown and who won what —
// all in LOG_COPY's words. Pure and client-safe. The current hand comes from GET detail?part=log
// (its whole log) with the view's game, boards and result; an earlier hand from GET
// detail?part=history, which carries its own players, boards, shown hands and pots — and the cards
// shown to the viewer alone, answering their ask, which only their own history holds. With two or
// three boards (PLO) each street's cards come board by board, a shown hand says what it makes on
// each, and each pot's share on each board has its own line. In Triple T a throw-away is a line that
// names no card ("Ana throws away a card."), but the reader's own: the card they threw away is theirs
// to read, in this hand's log and their history of it alone.
//
// A seat's name is the player's who sat there in that hand; one the room has let go of reads as
// its seat ("Seat 3"), never as a blank.

import type {Card} from '@/lib/poker/cards';
import {HAND_COPY, LOG_COPY, TABLE_COPY, type PotIndex} from '@/lib/learn/copy/poker-night';
import {STREETS} from '@/lib/poker-night/config';
import {describeHand} from '@/lib/poker-night/hand-name';
import {paidParts} from '@/lib/poker-night/pots';
import type {Street, Variant} from '@/lib/poker-night/types';
import {playsBoardFor, readShown} from '@/lib/poker-night/variants';
import type {HandEntryView, HandResultView, HandSummaryView, People, ShownCardsView} from '@/lib/poker-night/view-types';

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
const moveLines = (no: number, entries: readonly HandEntryView[], boards: readonly (readonly Card[])[], nameOf: SeatNamer): LogLine[] => {
    const lines: LogLine[] = [];
    const board = boards[0] ?? [];
    let street = 0;
    const open = (target: number) => {
        while (street < target) {
            street++;
            const name = STREETS[street] as Exclude<Street, 'preflop'>;
            const [from, to] = BOARD_AT[name];
            if (board.length < to) return;
            boards.forEach((cards, k) => lines.push({
                key: k === 0 ? `${no}:street:${name}` : `${no}:street:${name}:${k}`, kind: 'street',
                text: LOG_COPY.street(name, HAND_COPY.cardsShort(cards.slice(from, to)), boards.length > 1 ? k : null), seat: null,
            }));
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

// A game and its boards: what a shown hand is read against.
export type LogMode = {variant: Variant; boards: readonly (readonly Card[])[]};

// A shown hand's cards and its value on each board (none before the flop).
type ReadHand = {seat: number; cards: Card[]; values: number[]};

const readHand = (mode: LogMode, shown: ShownCardsView): ReadHand => {
    const read = readShown(mode.variant, mode.boards, shown);
    return {seat: read.seat, cards: read.cards, values: read.reads.map((r) => r.value)};
};

const phraseOf = (hand: ReadHand | undefined, board = 0): string | null => {
    const value = hand?.values[board];
    return value === undefined ? null : HAND_COPY.phrase(describeHand(value));
};

type Pot = {amount: number; winners: readonly (readonly number[])[]};

// The hands shown (each with its name once the flop is out, and a hand that plays the board said
// so), then each pot's winners — the main pot first, side pots after, by number — or the one player
// everyone else folded to.
const resultLines = (no: number, mode: LogMode, hands: readonly ReadHand[], pots: readonly Pot[], nameOf: SeatNamer): LogLine[] => {
    const lines: LogLine[] = [];
    const board = mode.boards[0] ?? [];
    const several = mode.boards.length > 1;
    for (const h of hands) {
        const phrase = several ? LOG_COPY.onBoards(mode.boards.map((_, k) => phraseOf(h, k))) || null : phraseOf(h);
        lines.push({key: `${no}:show:${h.seat}`, kind: 'show', text: LOG_COPY.shows(nameOf(h.seat), HAND_COPY.cardsShort(h.cards), phrase), seat: h.seat});
        if (!several && h.values.length > 0 && playsBoardFor(mode.variant, board, h.values[0])) {
            lines.push({key: `${no}:board:${h.seat}`, kind: 'note', text: LOG_COPY.playsBoard(nameOf(h.seat)), seat: h.seat});
        }
    }
    const bySeat = new Map(hands.map((h) => [h.seat, h]));
    pots.forEach((pot, i) => {
        const index: PotIndex = pots.length === 1 ? null : i;
        const parts = paidParts(pot);
        // A pot on one board (or paid uncontested): one line; on two or three, a line for each
        // board's share — a share of no chips has none.
        for (const part of parts) {
            const board = parts.length > 1 ? part.board : null;
            const key = board === null ? `${no}:pot:${i}` : `${no}:pot:${i}:${board}`;
            const shares = part.winners.map((seat, j) => ({seat, share: part.shares[j]}));
            if (shares.length === 0 || (board !== null && part.amount === 0)) continue;
            if (hands.length === 0 && shares.length === 1) {
                lines.push({key, kind: 'result', text: LOG_COPY.uncontested(nameOf(shares[0].seat), shares[0].share), seat: shares[0].seat});
            } else if (shares.length === 1) {
                const seat = shares[0].seat;
                lines.push({key, kind: 'result', text: LOG_COPY.wins(nameOf(seat), shares[0].share, phraseOf(bySeat.get(seat), part.board), index, board), seat});
            } else {
                lines.push({key, kind: 'result', text: LOG_COPY.split(shares.map((s) => ({name: nameOf(s.seat), amount: s.share})), index, board), seat: null});
            }
        }
    });
    return lines;
};

// The hands shown to the viewer alone, answering their ask: "Shown to you: Ana held …".
const seenLines = (no: number, seen: readonly {seat: number; cards: readonly Card[]}[], nameOf: SeatNamer): LogLine[] =>
    seen.map((h) => ({key: `${no}:seen:${h.seat}`, kind: 'note', text: LOG_COPY.showedYou(nameOf(h.seat), HAND_COPY.cardsShort(h.cards)), seat: h.seat}));

// The card the reader threw away (Triple T), said to them alone.
const thrownLine = (no: number, card: Card | null, seat: number | null): LogLine[] =>
    card === null ? [] : [{key: `${no}:threw`, kind: 'note', text: LOG_COPY.youThrew(HAND_COPY.cardShort(card)), seat}];

// The hand in play (or just ended), from its whole log, its game and boards and, once it is
// complete, its result — and the hands shown to the viewer alone since (MeView.shownToMe), and the
// card the viewer threw away (MeView.discard).
export const currentHandLog = (
    no: number, entries: readonly HandEntryView[], mode: LogMode, result: HandResultView | null, nameOf: SeatNamer,
    shownToMe: readonly ShownCardsView[] = [], thrown: {card: Card; seat: number} | null = null,
): LogHand => {
    const shown = result ? result.hands.map((h) => readHand(mode, h)) : [];
    return {
        no, title: LOG_COPY.hand(no), blinds: null,
        lines: [
            ...moveLines(no, entries, mode.boards, nameOf),
            ...thrownLine(no, thrown?.card ?? null, thrown?.seat ?? null),
            ...(result ? [...resultLines(no, mode, shown, result.pots, nameOf), ...seenLines(no, shownToMe, nameOf)] : []),
        ],
        truncated: false,
    };
};

// A completed hand from history, the viewer's own cards added when they were never shown, and any
// hand shown to the viewer alone — from the history row, or (the hand just ended, its row written a
// moment after the answer) from the view's own part, `seenNow`.
export const historyHandLog = (summary: HandSummaryView, people: People, mePid: string | null, seenNow: readonly ShownCardsView[] = []): LogHand => {
    const pidAt = new Map(summary.players.map((p) => [p.seat, p.pid]));
    const nameOf = seatNamer((seat) => pidAt.get(seat) ?? null, people);
    const mode: LogMode = {variant: summary.variant, boards: summary.boards};
    const lines = [
        ...moveLines(summary.no, summary.log, summary.boards, nameOf),
        ...resultLines(summary.no, mode, summary.hands.map((h) => readHand(mode, h)), summary.pots, nameOf),
    ];
    const mine = summary.players.find((p) => p.pid === mePid);
    if (mine && mine.hole && !mine.shown) lines.push({key: `${summary.no}:mine`, kind: 'note', text: LOG_COPY.youHeld(HAND_COPY.cardsShort(mine.hole)), seat: mine.seat});
    if (mine) lines.push(...thrownLine(summary.no, mine.discard ?? null, mine.seat));
    const seen = summary.players.flatMap((p) => (p.pid === mePid || p.shown || !p.hole ? [] : [{seat: p.seat, cards: p.hole}]));
    const shownAll = new Set(summary.players.filter((p) => p.shown).map((p) => p.seat));
    for (const h of seenNow) if (!shownAll.has(h.seat) && !seen.some((s) => s.seat === h.seat)) seen.push({seat: h.seat, cards: [...h.cards]});
    lines.push(...seenLines(summary.no, seen, nameOf));
    return {
        no: summary.no, title: LOG_COPY.hand(summary.no), blinds: LOG_COPY.blinds(summary.smallBlind, summary.bigBlind, summary.ante),
        lines, truncated: summary.truncated,
    };
};
