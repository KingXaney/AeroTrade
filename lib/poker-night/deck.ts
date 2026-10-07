// Poker night's deck as data. Pure and client-safe: the shuffle takes its randomness as an argument,
// so the engine, the tests and the seeded simulation all deal from the same code, and only
// lib/poker-night/shuffle.ts (server-only) hands it node:crypto.
//
// A card is lib/poker/cards' rank·4 + suit. A deal is a fixed layout over a shuffled deck: player k
// (in hand order) gets deck[2k] and deck[2k + 1], and the board is the next five cards, deck[2n] to
// deck[2n + 4]. Nothing else of the deck is ever read.

import {CARDS, type Card} from "@/lib/poker/cards";

// Where a new hand's deck and the first big blind's draw come from: the server's crypto source in
// play (shuffle.SECURE_SOURCE), a seeded or stacked one in tests. Declared here, not beside the crypto
// source, so the pure clock can name it.
export type DeckSource = {deck(): Card[]; draw(): number};

export const FULL_DECK: readonly Card[] = Object.freeze(Array.from({length: CARDS}, (_, card) => card));

// A permutation of the 52 cards: 52 integers, each 0–51, none twice.
export const isDeck = (cards: unknown): cards is Card[] => {
    if (!Array.isArray(cards) || cards.length !== CARDS) return false;
    const seen = new Array<boolean>(CARDS).fill(false);
    for (const card of cards) {
        if (!Number.isInteger(card) || card < 0 || card >= CARDS || seen[card]) return false;
        seen[card] = true;
    }
    return true;
};

// Fisher–Yates into a new array: for i from n − 1 down to 1, swap i with j = randomInt(i + 1). Every
// sequence of draws gives a different order, so a uniform randomInt gives a uniform deck. A draw
// outside 0…i throws rather than deal from a broken deck.
export const shuffleWith = (cards: readonly Card[], randomInt: (maxExclusive: number) => number): Card[] => {
    const out = [...cards];
    for (let i = out.length - 1; i >= 1; i--) {
        const j = randomInt(i + 1);
        if (!Number.isInteger(j) || j < 0 || j > i) throw new RangeError(`randomInt(${i + 1}) returned ${j}`);
        const card = out[i];
        out[i] = out[j];
        out[j] = card;
    }
    return out;
};

// The hole cards of n players and the five board cards, in the layout above.
export const dealFrom = (deck: readonly Card[], n: number): {holes: [Card, Card][]; board: Card[]} => {
    if (!Number.isInteger(n) || n < 1 || 2 * n + 5 > deck.length) throw new RangeError(`cannot deal ${n} hands from ${deck.length} cards`);
    const holes: [Card, Card][] = [];
    for (let k = 0; k < n; k++) holes.push([deck[2 * k], deck[2 * k + 1]]);
    return {holes, board: deck.slice(2 * n, 2 * n + 5)};
};
