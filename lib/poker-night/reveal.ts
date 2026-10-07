// A finished hand as the table shows it until the next deal: who won what (each winner's total over
// every pot), each shown hand's name, and which cards play — the union of the winners' five cards
// that play, lifted and glowing, every other card on the board and in the shown hands dimmed.
// Pure and client-safe: read from the view's own result (lib/poker-night/view-types
// HandResultView) with the server's hand-name functions (views.readShownHand), so the page shows
// exactly what the server decided. The animations (lib/poker-night/choreography) only time it.

import {HAND_COPY, TABLE_COPY} from '@/lib/learn/copy/poker-night';
import type {Card} from '@/lib/poker/cards';
import {describeHand, playsBoard, type HandDescription} from '@/lib/poker-night/hand-name';
import {BANNER} from '@/lib/poker-night/stage';
import type {HandView} from '@/lib/poker-night/view-types';
import {readShownHand} from '@/lib/poker-night/views';

export type ShownLook = {seat: number; cards: [Card, Card]; best: Card[]; description: HandDescription | null; playsBoard: boolean; winner: boolean};
export type WinnerLook = {seat: number; amount: number; description: HandDescription | null; playsBoard: boolean};

export type ResultLook = {
    handNo: number;
    showdown: boolean;
    winners: WinnerLook[]; // the most chips first, then by seat
    shown: ShownLook[]; // in show order
    playing: Card[]; // the winners' five cards that play, together
};

// The result of the view's hand, or null while there is none.
export const resultLook = (hand: Pick<HandView, 'no' | 'board' | 'result'> | null): ResultLook | null => {
    const result = hand?.result;
    if (!hand || !result) return null;
    const totals = new Map<number, number>();
    for (const pot of result.pots) pot.winners.forEach((seat, k) => totals.set(seat, (totals.get(seat) ?? 0) + (pot.shares[k] ?? 0)));
    const shown = result.hands.map((h): ShownLook => {
        const read = readShownHand(hand.board, h);
        return {
            seat: read.seat, cards: read.cards, best: read.best,
            description: read.value === null ? null : describeHand(read.value),
            playsBoard: read.value !== null && playsBoard(hand.board, read.value),
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
