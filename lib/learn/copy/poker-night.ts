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

import type {FaceId} from "@/lib/poker-night/avatar";
import type {HandDescription} from "@/lib/poker-night/hand-name";
import type {PokerNightErrorCode} from "@/lib/poker-night/http";
import {LIMITS} from "@/lib/poker-night/limits";
import type {EntryKind, Refusal} from "@/lib/poker-night/types";
import {capitalize, numberWord} from "@/lib/text";

// A player's name inside a sentence, set apart from the words around it (U+2068 … U+2069), so a
// name written right to left cannot reorder the sentence it sits in.
export const isolate = (name: string): string => `\u2068${name}\u2069`;

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

// ---- errors (lib/poker-night/http.ts, PokerNightErrorCode) -----------------------------------

// What the table says when a request comes back refused. Keyed on every code a route answers with,
// so a new code does not compile without its sentence; a code named after a refusal says what the
// refusal does.
export const POKER_NIGHT_ERRORS: Record<PokerNightErrorCode, string> = {
    bad_request: 'That request could not be read, so nothing changed.',
    no_identity: 'Join the table first: this browser has not taken a seat or a place to watch.',
    cross_origin: 'That request came from another site, so it was turned down.',
    not_player: 'This browser has not joined the table yet.',
    banned: 'The host removed you from this table.',
    locked: 'The host closed this table to new players.',
    forbidden: 'That is not open at this table.',
    not_host: REFUSAL_COPY['not-host'],
    needs_account: 'That needs a signed-in account.',
    not_found: 'No table has this code. The link may be missing a letter.',
    watchers_full: 'Every place to watch is taken. One opens when a watcher leaves.',
    room_full: 'This table has as many players as it can keep tonight.',
    host_cap: `You have ${numberWord(LIMITS.hostOpenTables)} open tables already. Close one to start another.`,
    stale: REFUSAL_COPY.stale,
    not_your_turn: REFUSAL_COPY['not-your-turn'],
    not_now: REFUSAL_COPY['not-now'],
    not_seated: REFUSAL_COPY['not-seated'],
    already_seated: REFUSAL_COPY['already-seated'],
    seat_taken: REFUSAL_COPY['seat-taken'],
    no_request: REFUSAL_COPY['no-request'],
    rebuys_off: REFUSAL_COPY['rebuys-off'],
    rebuy_cap: REFUSAL_COPY['rebuy-cap'],
    closed: REFUSAL_COPY.closed,
    invalid_action: REFUSAL_COPY.illegal,
    bad_seat: REFUSAL_COPY['bad-seat'],
    bad_amount: REFUSAL_COPY['bad-amount'],
    below_buy_in: REFUSAL_COPY['below-buy-in'],
    over_cap: REFUSAL_COPY['over-cap'],
    below_min_raise: REFUSAL_COPY['below-min-raise'],
    bad_config: REFUSAL_COPY['bad-config'],
    reload: 'This table was updated. Reload to keep playing.',
    rate_limited: 'One moment: actions are coming in fast.',
    busy: 'The table was busy, so that did not go through. Try again.',
    unavailable: 'The table cannot be reached right now. Try again in a moment.',
};

// ---- joining (lib/poker-night/room.ts joinStep, JoinOutcome) --------------------------------

export const JOIN_COPY = {
    heading: 'Pull up a chair',
    // The face is the avatar's name (AVATAR_COPY.faces), which a blank name sits as.
    blankName: (face: string): string => `Leave it blank to sit as ${face}.`,
    // How a join went (JoinOutcome): 'returning' says nothing.
    seated: 'Seated. You are dealt in from the next hand.',
    seatTaken: 'That seat was just taken, so you have the next free one.',
    full: 'The table is full. You can watch, and a seat opens when someone leaves.',
    watching: 'Watching. Take any open seat to join the game.',
    // Someone here goes by that name, or it is one the table keeps for itself.
    renamed: (name: string): string => `That name is taken here, so you sit as ${isolate(name)}.`,
    posting: 'You post one big blind when you are dealt in.',
    locked: 'The host closed this table to new players.',
    banned: 'The host removed you from this table.',
} as const;

// ---- avatars (lib/poker-night/avatar.ts) -----------------------------------------------------

export const AVATAR_COPY = {
    // Each face's name: what the face is called in the builder, and the name a player who leaves
    // theirs blank sits under.
    faces: {
        fox: 'Fox', cat: 'Cat', dog: 'Dog', panda: 'Panda', koala: 'Koala', tiger: 'Tiger', lion: 'Lion', frog: 'Frog',
        monkey: 'Monkey', penguin: 'Penguin', owl: 'Owl', octopus: 'Octopus', unicorn: 'Unicorn', dragon: 'Dragon', turtle: 'Turtle',
        rabbit: 'Rabbit', bear: 'Bear', pig: 'Pig', cow: 'Cow', shark: 'Shark', dinosaur: 'Dinosaur', bee: 'Bee',
        butterfly: 'Butterfly', whale: 'Whale', robot: 'Robot', alien: 'Alien', ghost: 'Ghost', pumpkin: 'Pumpkin', cowboy: 'Cowboy',
        wizard: 'Wizard', vampire: 'Vampire', superhero: 'Superhero', clown: 'Clown', cactus: 'Cactus', mushroom: 'Mushroom',
        sunflower: 'Sunflower', doughnut: 'Doughnut', pizza: 'Pizza', die: 'Dice', rocket: 'Rocket',
    } satisfies Record<FaceId, string>,
} as const;
