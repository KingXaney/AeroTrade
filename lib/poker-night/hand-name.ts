// What a poker night hand is made of: its category and significant ranks, read back from the
// evaluator's value, and the five cards that play. Pure and client-safe — the table computes the
// reader's own hand name from their hole cards and the board — and its words are HAND_COPY in
// lib/learn/copy/poker-night.ts, never here.
//
// lib/poker/evaluator.ts packs a value as category << 26 | detail, the detail laid out per category:
// a straight's top rank + 1 (the wheel is 4); quads and a full house as rank << 4 | rank; trips and a
// pair as rank << 13 over a mask of kickers; two pair as a mask of both pairs << 13 over a one-bit
// kicker mask; a flush and high card as a mask of five ranks. describeHand reads every field back,
// so lib/poker-night/__tests__/hand-name.test.ts can rebuild the value from the description.

import {rankOf, suitOf, type Card} from "@/lib/poker/cards";
import {evaluateCards, type HandValue} from "@/lib/poker/evaluator";

// category: 0–8, an index into the evaluator's CATEGORY. ranks: 0 (a two) to 12 (an ace), the
// significant ones high first — high card and flush five ranks; a pair [pair, three kickers]; two
// pair [high pair, low pair, kicker]; trips [trips, two kickers]; a straight or straight flush its
// top card (3, the five, for the wheel); quads [quads, kicker]; a full house [trips, pair].
export type HandDescription = {category: number; ranks: number[]};

const DETAIL = (1 << 26) - 1;
const LOW13 = (1 << 13) - 1;

// The ranks in a 13-bit mask, high first.
const ranksOf = (mask: number): number[] => {
    const out: number[] = [];
    for (let rank = 12; rank >= 0; rank--) if (mask & (1 << rank)) out.push(rank);
    return out;
};

export const describeHand = (value: HandValue): HandDescription => {
    if (!Number.isInteger(value) || value < 0 || value >= 9 << 26) throw new RangeError(`not a hand value: ${value}`);
    const category = value >>> 26;
    const d = value & DETAIL;
    switch (category) {
        case 8:
        case 4:
            return {category, ranks: [d - 1]};
        case 7:
        case 6:
            return {category, ranks: [d >> 4, d & 15]};
        case 3:
        case 1:
            return {category, ranks: [d >> 13, ...ranksOf(d & LOW13)]};
        case 2:
            return {category, ranks: [...ranksOf(d >> 13), ...ranksOf(d & LOW13)]};
        default:
            return {category, ranks: ranksOf(d & LOW13)};
    }
};

export const isRoyal = (d: HandDescription): boolean => d.category === 8 && d.ranks[0] === 12;

// Every 5-card subset of 5 to 7 cards, as index lists in lexicographic order.
const SUBSETS: readonly (readonly number[])[][] = [5, 6, 7].map((n) => {
    const out: number[][] = [];
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) for (let c = b + 1; c < n; c++)
        for (let d = c + 1; d < n; d++) for (let e = d + 1; e < n; e++) out.push([a, b, c, d, e]);
    return out;
});

// The five cards that play, out of 5 to 7. Of the subsets with the hand's value, the one holding the
// most `prefer` cards (the player's hole cards), then the first in index order, so a tie never
// depends on anything but the input; the cards come back in input order.
export const bestFive = (cards: readonly Card[], prefer: readonly Card[] = []): {value: HandValue; cards: Card[]} => {
    if (cards.length < 5 || cards.length > 7) throw new RangeError(`bestFive takes 5 to 7 cards, not ${cards.length}`);
    const five = [0, 0, 0, 0, 0];
    let value = -1;
    let held = -1;
    let chosen: readonly number[] = [];
    for (const subset of SUBSETS[cards.length - 5]) {
        let preferred = 0;
        for (let i = 0; i < 5; i++) {
            five[i] = cards[subset[i]];
            if (prefer.includes(five[i])) preferred++;
        }
        const v = evaluateCards(five, 5);
        if (v > value || (v === value && preferred > held)) {
            value = v;
            held = preferred;
            chosen = subset;
        }
    }
    return {value, cards: chosen.map((i) => cards[i])};
};

// An Omaha hand's value and the five cards that play: exactly two of the hole cards with exactly
// three of the board (at least three out). Every pair of hole cards (in index order, outer) with
// every three board cards (inner) is tried, and the first that reaches the highest value is kept;
// the cards come back as the three board cards in board order, then the two hole cards.
export const bestOmaha = (hole: readonly Card[], board: readonly Card[]): {value: HandValue; cards: Card[]} => {
    if (hole.length < 2 || board.length < 3 || board.length > 5) throw new RangeError(`bestOmaha takes 2+ hole and 3 to 5 board cards, not ${hole.length} and ${board.length}`);
    const five = [0, 0, 0, 0, 0];
    let value = -1;
    let cards: Card[] = [];
    for (let a = 0; a < hole.length; a++) for (let b = a + 1; b < hole.length; b++) {
        for (let c = 0; c < board.length; c++) for (let d = c + 1; d < board.length; d++) for (let e = d + 1; e < board.length; e++) {
            five[0] = board[c];
            five[1] = board[d];
            five[2] = board[e];
            five[3] = hole[a];
            five[4] = hole[b];
            const v = evaluateCards(five, 5);
            if (v > value) {
                value = v;
                cards = [...five];
            }
        }
    }
    return {value, cards};
};

// "Plays the board": the five board cards alone make the hand's value.
export const playsBoard = (board: readonly Card[], value: HandValue): boolean =>
    board.length === 5 && evaluateCards(board) === value;

// Two hole cards as a starting hand: the higher and lower rank, a pair, suited.
export const startingHand = (a: Card, b: Card): {hi: number; lo: number; pair: boolean; suited: boolean} => {
    const ra = rankOf(a);
    const rb = rankOf(b);
    return {hi: Math.max(ra, rb), lo: Math.min(ra, rb), pair: ra === rb, suited: suitOf(a) === suitOf(b)};
};
