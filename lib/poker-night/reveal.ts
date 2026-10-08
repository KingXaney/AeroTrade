// A finished hand as the table shows it until the next deal: who won what (each winner's total over
// every pot), each shown hand's name, and which cards play — the union of the winners' five cards
// that play, lifted and glowing, every other card on the board and in the shown hands dimmed.
// Pure and client-safe: read from the view's own result (lib/poker-night/view-types
// HandResultView) with the server's own functions (variants.readShown, pots.seatShares), so the page
// shows exactly what the server decided. The animations (lib/poker-night/choreography) only time it.
// One board for now: the first board's reading.

import {HAND_COPY, TABLE_COPY} from '@/lib/learn/copy/poker-night';
import type {Card} from '@/lib/poker/cards';
import {describeHand, type HandDescription} from '@/lib/poker-night/hand-name';
import {seatShares} from '@/lib/poker-night/pots';
import {BANNER} from '@/lib/poker-night/stage';
import {playsBoardFor, readShown} from '@/lib/poker-night/variants';
import type {HandView, TableView} from '@/lib/poker-night/view-types';

export type ShownLook = {seat: number; cards: Card[]; best: Card[]; description: HandDescription | null; playsBoard: boolean; winner: boolean};
export type WinnerLook = {seat: number; amount: number; description: HandDescription | null; playsBoard: boolean};

export type ResultLook = {
    handNo: number;
    showdown: boolean;
    winners: WinnerLook[]; // the most chips first, then by seat
    shown: ShownLook[]; // in show order
    playing: Card[]; // the winners' five cards that play, together
};

// The result of the view's hand, or null while there is none.
export const resultLook = (hand: Pick<HandView, 'no' | 'variant' | 'boards' | 'result'> | null): ResultLook | null => {
    const result = hand?.result;
    if (!hand || !result) return null;
    const totals = new Map<number, number>();
    for (const pot of result.pots) for (const {seat, share} of seatShares(pot)) totals.set(seat, (totals.get(seat) ?? 0) + share);
    const board = hand.boards[0] ?? [];
    const shown = result.hands.map((h): ShownLook => {
        const read = readShown(hand.variant, hand.boards, h);
        const first = read.reads[0] ?? null;
        return {
            seat: read.seat, cards: read.cards, best: first?.best ?? [],
            description: first === null ? null : describeHand(first.value),
            playsBoard: first !== null && playsBoardFor(hand.variant, board, first.value),
            winner: totals.has(read.seat),
        };
    });
    const bySeat = new Map(shown.map((s) => [s.seat, s]));
    const winners = [...totals.entries()]
        .filter(([, amount]) => amount > 0)
        .map(([seat, amount]): WinnerLook => ({seat, amount, description: bySeat.get(seat)?.description ?? null, playsBoard: bySeat.get(seat)?.playsBoard ?? false}))
        .sort((a, b) => b.amount - a.amount || a.seat - b.seat);
    const playing = result.showdown ? [...new Set(shown.filter((s) => s.winner).flatMap((s) => s.best))] : [];
    return {handNo: hand.no, showdown: result.showdown, winners, shown, playing};
};

// How a card is drawn while a showdown's result shows: one of the cards that play, or dimmed; null
// outside a showdown (an uncontested pot shows nothing).
export const cardLook = (look: ResultLook | null, card: Card): 'win' | 'dim' | null => {
    if (!look || !look.showdown || look.playing.length === 0) return null;
    return look.playing.includes(card) ? 'win' : 'dim';
};

// Who played a seat in the view's hand: the result's gone list first (a player cashed out as the
// hand completed, or a seat taken by someone new in the pause), else whoever sits there now — so a
// result never names the wrong player. A view from an older server has no gone list.
export const playerAt = (table: Pick<TableView, 'seats' | 'hand'>, seat: number): string | null => {
    const gone = (table.hand?.result?.gone ?? []).find(([s]) => s === seat);
    return gone ? gone[1] : table.seats[seat]?.pid ?? null;
};

// The seat the viewer played in the view's hand, for the banner's "You win": their seat, only while
// the result says it was theirs (playerAt) — someone who takes a winner's seat in the pause is not
// told they won. Null for a watcher.
export const viewerSeatIn = (table: Pick<TableView, 'seats' | 'hand'>, mySeat: number | null, myPid: string | null): number | null =>
    mySeat !== null && myPid !== null && playerAt(table, mySeat) === myPid ? mySeat : null;

// Whether the winner's banner shows for this hand: once it is complete, with this hand's result and
// someone paid. TableScreen asks too: while it shows, the line under the board (the next deal's
// countdown, the pause) goes where lib/poker-night/stage.bannerPlan puts it.
export const bannerShows = (hand: Pick<HandView, 'no' | 'phase'> | null, look: ResultLook | null): boolean =>
    !!hand && hand.phase === 'complete' && !!look && look.handNo === hand.no && look.winners.length > 0;

// The banner's words for each winner it names (the first BANNER.rows, the most chips first): the
// head — "You win 70" for the viewer, "Ana wins 1,200" for anyone else, under their seat's name when
// the people have not arrived — and the hand's name ("Full house, threes full of fives", with
// "Plays the board" when it does), or null when no hand was shown. lib/poker-night/stage.bannerPlan
// sizes the banner from these, and components/poker-night/WinnerReveal draws them.
export type BannerLine = {seat: number; mine: boolean; head: string; hand: string | null};
export const bannerLines = (look: ResultLook, nameOf: (seat: number) => string | null, mySeat: number | null): BannerLine[] =>
    look.winners.slice(0, BANNER.rows).map((w) => {
        const mine = w.seat === mySeat;
        const hand = w.description ? (w.playsBoard ? `${HAND_COPY.label(w.description)} · ${HAND_COPY.playsBoard}` : HAND_COPY.label(w.description)) : null;
        return {seat: w.seat, mine, head: mine ? TABLE_COPY.bannerYou(w.amount) : TABLE_COPY.banner(nameOf(w.seat) ?? TABLE_COPY.seat(w.seat), w.amount), hand};
    });
