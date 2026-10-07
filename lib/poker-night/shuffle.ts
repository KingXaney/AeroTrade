// Poker night's randomness, server-only: every deck the table plays and the draw that seats the first
// big blind come from node:crypto here. Nothing under components/ and no client file may import it
// (the poker-night server guard test). The engine never calls it: the clock pulls one deck and one
// draw from a DeckSource per new hand, and the tests hand it a stacked or seeded one instead.

import {randomInt} from "node:crypto";
import type {Card} from "@/lib/poker/cards";
import {FULL_DECK, shuffleWith, type DeckSource} from "@/lib/poker-night/deck";

export type {DeckSource};

// A uniformly shuffled 52-card deck.
export const secureDeck = (): Card[] => shuffleWith(FULL_DECK, (max) => randomInt(max));

// A uniform integer in [0, 2^31), for the first big blind (draw % eligible seats).
export const secureDraw = (): number => randomInt(0, 2 ** 31);

export const SECURE_SOURCE: DeckSource = Object.freeze({deck: secureDeck, draw: secureDraw});
