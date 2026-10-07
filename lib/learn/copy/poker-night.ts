// Copy for poker night: the lobby (/poker-night) and the table (/play/[code]). Held to the 'copy' tier
// of lib/learn/banned.ts by lib/learn/__tests__/poker-night-copy.test.ts, which also bans currency
// words.
//
// Vocabulary: a hand "wins against" another and is "stronger", never "beats" or "better"; scores
// are "most", "highest", "biggest", never "best" (the five cards a hand is made of are "the five
// cards that play"); chips are play chips with no cash value; never "optimal" or "GTO"; and no
// sentence or label opens on "Hold'em", "Hold" or "Buy", which the list reads as orders ("Texas
// hold'em…", "Press and hold…", "Chips in", "Rebuy").
//
// Organised by export, one section per part of the table, each naming the module whose data it
// words.

import type {HandDescription} from "@/lib/poker-night/hand-name";
import type {EntryKind, Refusal} from "@/lib/poker-night/types";
import {capitalize} from "@/lib/text";

// ---- cards (lib/poker/cards.ts) -------------------------------------------------------------

// Suits by lib/poker/cards' index (c, d, h, s). The glyphs carry the text-presentation selector, so
// no platform draws them as emoji.
export const SUIT_GLYPHS = ['♣︎', '♦︎', '♥︎', '♠︎'] as const;
export const SUIT_NAMES = ['clubs', 'diamonds', 'hearts', 'spades'] as const;

// ---- hand names (lib/poker-night/hand-name.ts) ----------------------------------------------

// Ranks by lib/poker/cards' index, 0 a two and 12 an ace.
const RANK_NAMES = ['two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'jack', 'queen', 'king', 'ace'] as const;
const RANK_PLURALS = ['twos', 'threes', 'fours', 'fives', 'sixes', 'sevens', 'eights', 'nines', 'tens', 'jacks', 'queens', 'kings', 'aces'] as const;

// A hand's name without its article: "full house, kings full of twos". The royal flush is the
// straight flush to the ace (hand-name.isRoyal), read here off the description so the copy loads no
// evaluator.
const handWords = ({category, ranks}: HandDescription): string => {
    const one = RANK_NAMES[ranks[0]];
    const many = RANK_PLURALS[ranks[0]];
    switch (category) {
        case 8: return ranks[0] === 12 ? 'royal flush' : `straight flush, ${one} high`;
        case 7: return `four of a kind, ${many}`;
        case 6: return `full house, ${many} full of ${RANK_PLURALS[ranks[1]]}`;
        case 5: return `flush, ${one} high`;
        case 4: return `straight, ${one} high`;
        case 3: return `three of a kind, ${many}`;
        case 2: return `two pair, ${many} and ${RANK_PLURALS[ranks[1]]}`;
        case 1: return `pair of ${many}`;
        default: return `${one} high`;
    }
};

// The categories a sentence names with "a": a royal flush, a pair; but four of a kind, ace high.
const TAKES_A = new Set([8, 6, 5, 4, 1]);

export const HAND_COPY = {
    rankName: RANK_NAMES,
    rankPlural: RANK_PLURALS,
    // On its own: "Full house, kings full of twos".
    label: (d: HandDescription): string => capitalize(handWords(d)),
    // Inside a sentence: "… with a full house, kings full of twos."
    phrase: (d: HandDescription): string => `${TAKES_A.has(d.category) ? 'a ' : ''}${handWords(d)}`,
    playsBoard: 'Plays the board',
    fiveCards: 'The five cards that play',
} as const;

// ---- the hand's log (lib/poker-night/types.ts, EntryKind) ------------------------------------

const chips = (n: number): string => n.toLocaleString('en-US');

// Keyed on every kind of log line, so a new kind does not compile without its words.
const DOES: Record<EntryKind, (n: string) => string> = {
    ante: (n) => `posts an ante, ${n}`,
    'small-blind': (n) => `posts the small blind, ${n}`,
    'big-blind': (n) => `posts the big blind, ${n}`,
    post: (n) => `posts a big blind to play, ${n}`,
    fold: () => 'folds',
    check: () => 'checks',
    call: (n) => `calls ${n}`,
    bet: (n) => `bets ${n}`,
    raise: (n) => `raises to ${n}`,
    refund: (n) => `gets back ${n} uncalled`,
    show: () => 'shows',
    void: () => 'the hand is called off',
};

export const ACTION_COPY = {
    // What a log line says, after the player's name: "Ana calls 40", "Ana raises to 340, all in".
    // amount is the chips the line moved, except a raise's: the street total it raised to (the
    // entry's `to`). The table's own line, a hand called off, takes no name.
    does: (kind: EntryKind, amount: number, allIn: boolean): string => `${DOES[kind](chips(amount))}${allIn ? ', all in' : ''}`,
} as const;

// ---- refusals (lib/poker-night/types.ts, Refusal) --------------------------------------------

// Why the table turned a request down, in one short sentence the player can read in passing.
export const REFUSAL_COPY: Record<Refusal, string> = {
    closed: 'This table has closed.',
    'not-now': "That can't be done right now.",
    'not-host': 'Only the host can do that.',
    'not-seated': 'That needs a seat at the table.',
    'already-seated': 'You already have a seat.',
    'seat-taken': 'That seat is taken.',
    'bad-seat': 'There is no such seat at this table.',
    'bad-amount': "That chip amount can't be used.",
    'below-buy-in': "That is fewer chips than the table's minimum.",
    'over-cap': "That is over the table's chip cap.",
    'rebuys-off': 'Rebuys are off at this table.',
    'rebuy-cap': 'You have had every rebuy this table allows.',
    'no-request': 'That request is no longer waiting.',
    'not-your-turn': 'It is not your turn yet.',
    stale: 'The table moved on before that arrived.',
    illegal: 'That is not allowed here.',
    'below-min-raise': 'That raise is under the minimum.',
    'bad-config': "Those settings are outside the table's limits.",
    'bad-deck': 'The deal did not go through, so nothing changed.',
    'not-due': 'That is not due yet.',
};
