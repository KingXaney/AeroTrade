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
// words. Every player's name a sentence or a label carries goes through isolate(); so does a table's
// name. A seat is passed as its index in TableView.seats and printed from 1 ("seat 1"); a count of
// chips is printed with en-US digit groups ("1,250"), a net with its sign ("+1,250", "−300").

import {rankOf, suitOf, type Card} from "@/lib/poker/cards";
import type {AvatarPart, AvatarSpec, BadgeId, ColourId, FaceId, FrameId} from "@/lib/poker-night/avatar";
import type {CardBackId, CardFaceId, ChipSetId} from "@/lib/poker-night/looks";
import type {FeltId, SceneId} from "@/lib/poker-night/types";
import {compactChips} from "@/lib/poker-night/chips";
import {CODE_LENGTH} from "@/lib/poker-night/code";
import {ASKS, DISCARD_MAX_SECONDS, KEEP, TABLE_LIMITS} from "@/lib/poker-night/config";
import type {HandDescription} from "@/lib/poker-night/hand-name";
import type {PokerNightErrorCode} from "@/lib/poker-night/http";
import {LIMITS} from "@/lib/poker-night/limits";
import {NAME_MAX_GRAPHEMES} from "@/lib/poker-night/names";
import type {EntryKind, LedgerKind, PreAction, RebuyPolicy, Refusal, Street, Variant} from "@/lib/poker-night/types";
import type {SeatState} from "@/lib/poker-night/view-types";
import {capitalize, numberWord} from "@/lib/text";
import type {PhraseId, ReactionId, ThrowId} from "@/lib/poker-night/emotes";
import type {ShortcutGroup, ShortcutId} from "@/lib/poker-night/keys";
import type {AwardId} from "@/lib/poker-night/awards";
import type {GuideGame, RankingSlot} from "@/lib/poker-night/hands-guide";

// A player's name inside a sentence, set apart from the words around it (U+2068 … U+2069), so a
// name written right to left cannot reorder the sentence it sits in.
export const isolate = (name: string): string => `\u2068${name}\u2069`;

// ---- numbers and lists ------------------------------------------------------------------------

// A count of chips (or hands, or seconds) as the table prints it: "1,250".
const count = (n: number): string => n.toLocaleString('en-US');
const plural = (n: number, one: string, many: string): string => `${count(n)} ${n === 1 ? one : many}`;
// A net always carries its sign, so colour is never the only cue: "+1,250", "−300" (a real minus
// sign), "0".
const signed = (n: number): string => (n > 0 ? `+${count(n)}` : n < 0 ? `−${count(-n)}` : '0');
// Plain words joined as prose: "a", "a and b", "a, b and c".
const words = (list: readonly string[]): string =>
    list.length < 2 ? list.join('') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
// Players' names joined the same way, each one isolated.
const names = (list: readonly string[]): string => words(list.map(isolate));
// A night's length: "45 min", "2 h", "2 h 14 min".
const duration = (minutes: number): string => {
    const m = Math.max(0, Math.round(minutes));
    if (m < 60) return `${m} min`;
    return `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;
};
// A seat index as people count seats: index 0 is seat 1.
const seatNo = (seat: number): number => seat + 1;

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

// Each category's name alone, high card to straight flush, then the royal flush.
const KIND_WORDS = ['high card', 'pair', 'two pair', 'three of a kind', 'straight', 'flush', 'full house', 'four of a kind', 'straight flush', 'royal flush'] as const;

// The categories a sentence names with "a": a royal flush, a pair; but four of a kind, ace high.
const TAKES_A = new Set([8, 6, 5, 4, 1]);

// A card's corner: the rank as printed on it, the ten as "10".
const RANK_SHORT = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const;
const cardWords = (card: Card): string => `${RANK_NAMES[rankOf(card)]} of ${SUIT_NAMES[suitOf(card)]}`;
const cardShort = (card: Card): string => `${RANK_SHORT[rankOf(card)]}${SUIT_GLYPHS[suitOf(card)]}`;

export const HAND_COPY = {
    rankName: RANK_NAMES,
    rankPlural: RANK_PLURALS,
    rankShort: RANK_SHORT,
    // On its own: "Full house, kings full of twos".
    label: (d: HandDescription): string => capitalize(handWords(d)),
    // Inside a sentence: "… with a full house, kings full of twos."
    phrase: (d: HandDescription): string => `${TAKES_A.has(d.category) ? 'a ' : ''}${handWords(d)}`,
    playsBoard: 'Plays the board',
    fiveCards: 'The five cards that play',
    // A hand's kind alone ("Flush", "Two pair", "Royal flush"); with two or three boards the dock
    // says what the viewer's cards make on each, each kind behind its board's numeral badge
    // (components/poker-night/HandStrength), the names in full for a screen reader ("Board 1: Flush,
    // ace high; board 2: Pair of kings").
    kind: (d: HandDescription): string => capitalize(KIND_WORDS[d.category === 8 && d.ranks[0] === 12 ? 9 : d.category]),
    onBoardsSpoken: (labels: readonly string[]): string => capitalize(labels.map((l, i) => `board ${count(i + 1)}: ${l}`).join('; ')),
    // A card as a picture's name (role="img"): "Ace of spades"; inside a sentence, "ace of spades";
    // as its corner, "A♠︎".
    card: (card: Card): string => capitalize(cardWords(card)),
    cardSpoken: cardWords,
    cardShort,
    // Several cards: read aloud ("ace of spades, king of hearts and seven of clubs") or as corners
    // ("A♠︎ K♥︎ 7♣︎").
    cardsSpoken: (cards: readonly Card[]): string => words(cards.map(cardWords)),
    cardsShort: (cards: readonly Card[]): string => cards.map(cardShort).join(' '),
    faceDown: 'Face-down card',
    yourHand: 'Your hand',
    board: 'Board',
    noBoard: 'No cards on the board yet',
} as const;

// ---- the hand's log (lib/poker-night/types.ts, EntryKind) ------------------------------------

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
    // Triple T: never the card.
    discard: () => 'throws away a card',
};

// The last move a seat made, on the small tag beside its plate: "Call 40", "Raise to 340"; an
// all-in move reads "All in 340" whatever its kind.
const TAG: Record<EntryKind, (n: string) => string> = {
    ante: (n) => `Ante ${n}`,
    'small-blind': (n) => `SB ${n}`,
    'big-blind': (n) => `BB ${n}`,
    post: (n) => `Posts ${n}`,
    fold: () => 'Fold',
    check: () => 'Check',
    call: (n) => `Call ${n}`,
    bet: (n) => `Bet ${n}`,
    raise: (n) => `Raise to ${n}`,
    refund: (n) => `${n} back`,
    show: () => 'Shows',
    void: () => 'Called off',
    discard: () => 'Threw one away',
};

// A pre-action's button (lib/poker-night/types PreAction): "Check/fold", "Check", "Call 40",
// "Call any".
const preLabel = (pre: PreAction): string => {
    switch (pre.kind) {
        case 'check-fold': return 'Check/fold';
        case 'check': return 'Check';
        case 'call': return `Call ${count(pre.amount)}`;
        case 'call-any': return 'Call any';
    }
};

export const ACTION_COPY = {
    // What a log line says, after the player's name: "Ana calls 40", "Ana raises to 340, all in".
    // amount is the chips the line moved, except a raise's: the street total it raised to (the
    // entry's `to`). The table's own line, a hand called off, takes no name.
    does: (kind: EntryKind, amount: number, allIn: boolean): string => `${DOES[kind](count(amount))}${allIn ? ', all in' : ''}`,
    tag: (kind: EntryKind, amount: number, allIn: boolean): string => (allIn ? `All in ${count(amount)}` : TAG[kind](count(amount))),

    // The action bar (role="toolbar"). A call that takes the last chip says so; "Bet" and "Raise"
    // open the raise panel, whose confirm button names the total: "Bet 100", "Raise to 340".
    toolbar: 'Your actions',
    fold: 'Fold',
    check: 'Check',
    call: (n: number): string => `Call ${count(n)}`,
    callAllIn: (n: number): string => `Call ${count(n)}, all in`,
    openBet: 'Bet',
    openRaise: 'Raise',
    bet: (n: number): string => `Bet ${count(n)}`,
    raiseTo: (n: number): string => `Raise to ${count(n)}`,
    allIn: (n: number): string => `All in for ${count(n)}`,
    // Pot limit (PLO): the top of the range when the stack goes past the pot.
    potBet: (n: number): string => `Bet ${count(n)} (pot)`,
    potRaise: (n: number): string => `Raise to ${count(n)} (pot)`,
    back: 'Back',
    toCall: (n: number): string => `${count(n)} to call`,
    sending: 'Sending…',

    // The raise panel: quick sizes keyed by lib/poker-night/bet-sizing's QuickSize ids, the slider
    // and the amount field.
    sizes: {min: 'Min', half: '½ pot', 'three-quarters': '¾ pot', pot: 'Pot', 'all-in': 'All in'},
    sizesLabel: 'Quick sizes',
    sliderLabel: 'Size',
    amountLabel: 'Amount',
    amountRule: (min: number, max: number): string => `From ${count(min)} to ${count(max)}.`,
    // The steppers beside the slider: a big blind less or more ("20 less", "20 more").
    less: (n: number): string => `${count(n)} less`,
    more: (n: number): string => `${count(n)} more`,

    // Folding when checking is free: the first press asks, the second folds.
    foldFree: 'Checking is free here.',
    foldConfirm: 'Fold anyway',
    checkInstead: 'Check instead',

    // Pre-actions, chosen before the turn comes round.
    preHeading: 'Before your turn',
    pre: preLabel,
    preCleared: 'The bet changed, so your early choice was cleared.',

    // A turn the clock ran out on.
    timeUp: {checked: "Time's up: checked for you.", folded: "Time's up: folded for you."},
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
    'asks-off': 'This player has turned off asks to see their cards.',
    'ask-waiting': 'Your last ask is still waiting for an answer.',
    'ask-limit': 'That is every ask this hand allows.',
    'ask-cooldown': `They did not show you their cards when you last asked, so asking them again waits ${numberWord(ASKS.COOLDOWN_HANDS)} hands.`,
    // The table holds as many cooldowns and waiting asks as it keeps (lib/poker-night/asks.asksFull).
    'asks-full': `Asks to see cards are resting at this table: they open again within ${numberWord(ASKS.COOLDOWN_HANDS)} hands.`,
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
    asks_off: REFUSAL_COPY['asks-off'],
    ask_waiting: REFUSAL_COPY['ask-waiting'],
    ask_limit: REFUSAL_COPY['ask-limit'],
    ask_cooldown: REFUSAL_COPY['ask-cooldown'],
    asks_full: REFUSAL_COPY['asks-full'],
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
    // Once the first hand is dealt, a new player's chips wait for the host's yes: said on the card
    // before they sit, and after (TABLE_COPY.waitingApproval).
    approvalNote: 'The game has started: the host approves your chips before you are dealt in.',
    locked: 'The host closed this table to new players.',
    banned: 'The host removed you from this table.',

    // The join card (a Panel over the live table): the table's terms, a name prefilled from the
    // account or this browser, a pre-rolled look, and one tap to sit.
    lead: 'Pick a name and a look, then take a seat.',
    terms: (mode: string, smallBlind: number, bigBlind: number, chips: number): string =>
        `${mode} · Blinds ${count(smallBlind)}/${count(bigBlind)} · ${count(chips)} chips to start`,
    // Opens the Hands guide on the table's game, before sitting down.
    howItPlays: 'How it plays',
    nameLabel: 'Your name',
    namePlaceholder: 'Name at the table',
    nameRule: `Up to ${numberWord(NAME_MAX_GRAPHEMES)} characters.`,
    lookLabel: (face: string): string => `Your look: ${face}`,
    roll: 'Roll a new look',
    sit: 'Sit down',
    // An open seat's own button: the seat chosen, then the card.
    sitIn: (seat: number): string => `Sit in seat ${seatNo(seat)}`,
    watch: 'Just watch',
    joining: 'Taking a seat…',
    // The chips a player brings, shown only when the table's minimum and cap differ.
    chipsInLabel: 'Chips in',
    chipsInRule: (min: number, max: number): string => `From ${count(min)} to ${count(max)} chips.`,
    closed: REFUSAL_COPY.closed,

    // A card with nothing to sit down with (removed, locked, full): what can change it, and a way to
    // look again. The card also looks again by itself every few seconds.
    bannedNext: 'Only the host can let you back in. This card shows a seat again once they do.',
    lockedNext: 'This card shows a seat again once the host opens the table.',
    fullNext: 'This card shows a seat again once one opens.',
    checkAgain: 'Check again',
} as const;

// ---- avatars (lib/poker-night/avatar.ts) -----------------------------------------------------

// Each face's name: what the face is called in the builder, and the name a player who leaves
// theirs blank sits under.
const AVATAR_FACE_NAMES = {
    fox: 'Fox', cat: 'Cat', dog: 'Dog', panda: 'Panda', koala: 'Koala', tiger: 'Tiger', lion: 'Lion', frog: 'Frog',
    monkey: 'Monkey', penguin: 'Penguin', owl: 'Owl', octopus: 'Octopus', unicorn: 'Unicorn', dragon: 'Dragon', turtle: 'Turtle',
    rabbit: 'Rabbit', bear: 'Bear', pig: 'Pig', cow: 'Cow', shark: 'Shark', dinosaur: 'Dinosaur', bee: 'Bee',
    butterfly: 'Butterfly', whale: 'Whale', robot: 'Robot', alien: 'Alien', ghost: 'Ghost', pumpkin: 'Pumpkin', cowboy: 'Cowboy',
    wizard: 'Wizard', vampire: 'Vampire', superhero: 'Superhero', clown: 'Clown', cactus: 'Cactus', mushroom: 'Mushroom',
    sunflower: 'Sunflower', doughnut: 'Doughnut', pizza: 'Pizza', die: 'Dice', rocket: 'Rocket',
} as const satisfies Record<FaceId, string>;

// How a frame and a badge read inside a sentence ("with a gold frame and a crown").
const AVATAR_FRAME_WORDS: Record<Exclude<FrameId, 'none' | 'double'>, string> = {ring: 'ring', dashed: 'dashed', gold: 'gold', neon: 'neon'};
const AVATAR_BADGE_WORDS: Record<Exclude<BadgeId, 'none' | 'cherries'>, string> = {
    crown: 'crown', 'top-hat': 'top hat', star: 'star', clover: 'clover', flame: 'flame', gem: 'gem', bow: 'bow', moon: 'moon', target: 'target',
    heart: 'heart', balloon: 'balloon',
};

export const AVATAR_COPY = {
    faces: AVATAR_FACE_NAMES,

    // ==== P5: the avatar builder (components/poker-night/AvatarBuilder, AvatarDisc) ====
    // Every colour, frame and badge by name: the builder's swatches and the words a look is read
    // out in.
    colours: {
        tangerine: 'Tangerine', lemon: 'Lemon', lime: 'Lime', mint: 'Mint', sky: 'Sky', ocean: 'Ocean',
        grape: 'Grape', berry: 'Berry', rose: 'Rose', coral: 'Coral', sand: 'Sand', slate: 'Slate',
    } satisfies Record<ColourId, string>,
    frames: {none: 'No frame', ring: 'Ring', double: 'Double ring', dashed: 'Dashed', gold: 'Gold', neon: 'Neon'} satisfies Record<FrameId, string>,
    badges: {
        none: 'No badge', crown: 'Crown', 'top-hat': 'Top hat', star: 'Star', clover: 'Clover', flame: 'Flame', gem: 'Gem', bow: 'Bow',
        moon: 'Moon', target: 'Target', cherries: 'Cherries', heart: 'Heart', balloon: 'Balloon',
    } satisfies Record<BadgeId, string>,
    // The builder's four groups, a heading each.
    parts: {face: 'Face', colour: 'Colour', frame: 'Frame', badge: 'Badge'} satisfies Record<AvatarPart, string>,
    builder: 'Build your look',
    roll: 'Roll',
    rollLabel: 'Roll a random look',
    // A look read out: "Fox on tangerine", "Owl on sky, with a gold frame and a crown".
    describe: (spec: AvatarSpec): string => {
        const extras = [
            ...(spec.frame === 'none' ? [] : [`${spec.frame === 'double' ? 'a double ring' : `a ${AVATAR_FRAME_WORDS[spec.frame]} frame`}`]),
            ...(spec.badge === 'none' ? [] : [spec.badge === 'cherries' ? 'cherries' : `a ${AVATAR_BADGE_WORDS[spec.badge]}`]),
        ];
        return `${AVATAR_FACE_NAMES[spec.face]} on ${spec.colour}${extras.length > 0 ? `, with ${words(extras)}` : ''}`;
    },
} as const;

// ==== P3: the lobby, the table and its overlays ================================================

// ---- the games (lib/poker-night/config VARIANTS) ------------------------------------------------

// Each game by name: short where a line has little room (the top bar, a lobby row, the felt), spoken
// where a sentence or a screen reader says it. "Texas hold'em" always whole, so no label opens on
// "Hold'em". What a game is, is the glossary's (texas-holdem, omaha); a picker card says only what
// is dealt and the limit.
const MODE_SHORT: Record<Variant, string> = {holdem: "Texas hold'em", plo: 'PLO', 'triple-t': 'Triple T'};
const MODE_SPOKEN: Record<Variant, string> = {holdem: "Texas hold'em", plo: 'Pot-limit Omaha', 'triple-t': 'Triple T poker'};

export const MODE_COPY = {
    short: MODE_SHORT,
    spoken: MODE_SPOKEN,
    // With its boards when there is more than one: "PLO · 2 boards", "Pot-limit Omaha, 2 boards".
    label: (variant: Variant, boards: number): string => (boards > 1 ? `${MODE_SHORT[variant]} · ${count(boards)} boards` : MODE_SHORT[variant]),
    spokenLabel: (variant: Variant, boards: number): string => (boards > 1 ? `${MODE_SPOKEN[variant]}, ${count(boards)} boards` : MODE_SPOKEN[variant]),
    // The picker (the lobby's form, the host drawer): its group's name and each card's line; under
    // PLO, the board count (one to three), each choice's accessible name and the hint under them.
    gameLabel: 'Game',
    boardsLabel: 'Boards',
    boardsValue: (n: number): string => (n === 1 ? 'One board' : `${count(n)} boards`),
    boardsHint: 'Each board is played on its own, and the pot is split evenly between them.',
    pick: {
        holdem: 'Two cards each. No limit.',
        plo: 'Four cards each. Pot limit.',
        'triple-t': 'Three cards each, one thrown away before the betting.',
    } satisfies Record<Variant, string>,
    // Between hands, when the host picked another game: under the board. At the deal, a toast and the
    // screen reader.
    nextHand: (label: string): string => `Next hand: ${label}`,
    // The countdown to that deal, in the place of TABLE_COPY.nextHandIn.
    nextHandIn: (label: string, s: number): string => `Next hand: ${label}, in ${count(s)} s`,
    changed: (spoken: string): string => `New game from this hand: ${spoken}.`,
} as const;

// ---- the lobby and the /games card (app/(root)/poker-night, components/poker-night/lobby) ------

export const POKER_NIGHT_COPY = {
    title: 'Poker night',
    subtitle: "Texas hold'em, PLO and Triple T with friends: start a table, share the link, and play for chips.",
    note: 'Play chips only. No cash value, and nothing is paid out.',
    // POKER_NIGHT_ENABLED=false.
    off: 'Poker night is switched off for now.',

    // The card on /games.
    cardTitle: 'Poker night',
    cardBody: "Texas hold'em, PLO and Triple T for play chips at a table you share by link: friends join from a phone, with no account needed.",
    cardCta: 'Open poker night',

    // Starting a table: one tap with the defaults (Texas hold'em), one tap for another game, or the
    // form first. The hint opens with the game the first button deals.
    quickStart: 'Start a table',
    quickPlo: 'Start PLO',
    quickTripleT: 'Start Triple T',
    quickStartHint: (mode: string, smallBlind: number, bigBlind: number, chips: number, seats: number): string =>
        `${mode}, blinds ${count(smallBlind)}/${count(bigBlind)}, ${count(chips)} chips each, up to ${numberWord(seats)} seats. Everything can be changed at the table.`,
    starting: 'Setting the table…',
    setUp: 'Set it up first',
    create: 'Open the table',
    tableName: 'Table name',
    // The name field's default, from the host's first name. A field's value, not a sentence, so the
    // name is not isolated (lib/poker-night/names.cleanTableName would drop the marks anyway).
    tableNameDefault: (first: string): string => `${first}'s poker night`,
    seats: 'Seats',

    // A code read out or sent in a message.
    joinHeading: 'Join with a code',
    codeLabel: 'Table code',
    codePlaceholder: capitalize(`${numberWord(CODE_LENGTH)} characters`),
    join: 'Join',
    codeInvalid: `A table code is ${numberWord(CODE_LENGTH)} letters and digits, with no 0, O, 1 or I.`,

    // The host's own open tables; a row opens with the table's game (MODE_COPY.label).
    openHeading: 'Your open tables',
    openEmpty: 'No table is open. Start one and share the link.',
    openRow: (mode: string, seated: number, seats: number, hands: number): string =>
        `${mode} · ${count(seated)} of ${count(seats)} seats taken · ${hands === 0 ? 'no hand dealt yet' : `${plural(hands, 'hand', 'hands')} played`}`,
    open: 'Open',

    // Open tables friends chose to show to friends (the panel is hidden when there are none).
    friendsHeading: "Friends' tables",
    friendsLead: 'Open tables your friends chose to show you.',
    friendsRow: (mode: string, host: string, seated: number, seats: number): string => `${mode} · Hosted by ${isolate(host)} · ${count(seated)} of ${count(seats)} seats taken`,

    // The reader's own nights (PokerResult rows), as hands played and net chips.
    recentHeading: 'Recent nights',
    recentEmpty: 'A night shows here once its table closes.',
    recentRow: (hands: number, net: number): string => `${plural(hands, 'hand', 'hands')} · net ${signed(net)}`,
    recentOpen: 'Still open',

    // The card above everything else while the reader holds a seat at an open table (lobby.resumeOf),
    // with the table's name as the lobby prints it (TABLE_COPY.name).
    resumeTitle: (table: string): string => `You are seated at ${isolate(table)}`,
    rejoin: 'Rejoin',
} as const;

// ---- Home (app/(root)/page.tsx: components/home/PokerNightChip, components/home/HomePokerNight) --

// The chip beside the streak is always there while poker night is on; the panel only when one of
// its lists has a row (lib/poker-night/lobby.homePokerNight). A row's line is the lobby's own
// (lobby.tableLine), its button Rejoin where the reader holds a seat, Open at a table they host
// from outside a seat, Join at a friend's.
export const HOME_PANEL_COPY = {
    chip: 'Poker night',
    // The chip while the reader holds a seat: straight back to that table.
    chipRejoin: 'Rejoin your table',
    heading: 'Poker night',
    lobby: 'Open the lobby',
    yours: 'Your tables',
    friends: "Friends' tables",
    seatedBadge: 'Seated',
    rejoin: 'Rejoin',
    open: 'Open',
    join: 'Join',
    hands: 'Learn the hands',
} as const;

// ---- the invite (components/poker-night/InviteSheet) -------------------------------------------

export const INVITE_COPY = {
    heading: 'Invite your friends',
    lead: 'Anyone with the link can watch and take a seat, with no account needed.',
    open: 'Invite',
    linkLabel: 'Table link',
    copy: 'Copy link',
    copied: 'Link copied.',
    blocked: 'The clipboard is blocked: copy the link from the box.',
    // navigator.share, on phones. The table is its shown name (TABLE_COPY.name).
    share: 'Share',
    shareTitle: (table: string): string => `Join ${isolate(table)}`,
    // With the game the table deals (MODE_COPY.spokenLabel), so a link preview says it.
    mode: (mode: string): string => `Game: ${mode}`,
    shareText: (table: string, mode: string): string => `Pull up a chair at ${isolate(table)}: ${mode}, play chips only.`,
    qrLabel: 'QR code of the table link',
    qrCaption: 'Point a phone camera here to open the table.',
    qrShow: 'Show QR code',
    qrHide: 'Hide QR code',
    codeLabel: 'Table code',
    // The code in two groups of three, for reading aloud: "K7Q XM4".
    codeGrouped: (code: string): string => `${code.slice(0, 3)} ${code.slice(3)}`,
    deal: 'Deal the first hand',
    needTwo: 'The first hand is dealt once two players are seated.',
    ogDescription: (mode: string): string => `${mode} for play chips. Open the link to take a seat.`,
} as const;

// ---- the table (components/poker-night: TopBar, SeatRing, Seat, PotDisplay, Board, Dock) -------

// A seat's state as a word (SeatView.state); a seat simply in the hand has none.
const SEAT_STATUS: Record<Exclude<SeatState, 'in-hand'>, string> = {
    waiting: 'Next hand',
    folded: 'Folded',
    'all-in': 'All in',
    'sitting-out': 'Sitting out',
    away: 'Away',
    busted: 'Out of chips',
    leaving: 'Leaving',
};

export const TABLE_COPY = {
    // The table's shown name: the host's, else its code. Plain: a sentence that carries it
    // isolates it.
    name: (name: string, code: string): string => name || `Table ${code}`,
    region: (table: string): string => `${isolate(table)}, poker table`,
    documentTitle: (table: string, yourTurn: boolean): string => (yourTurn ? `Your turn · ${isolate(table)}` : isolate(table)),
    loading: 'Setting up the table…',

    // The top bar and its menu. Home is a full page load of "/": the app's Home for an account, the
    // landing page for a guest.
    menu: 'Table menu',
    home: 'Back to AeroTrade',
    invite: INVITE_COPY.open,
    bank: 'Bank',
    log: 'Hand log',
    host: 'Host controls',
    leaveTable: 'Leave table',
    handNo: (n: number): string => `Hand ${count(n)}`,
    watchers: (n: number): string => plural(n, 'watcher', 'watchers'),
    connection: {live: 'Live', polling: 'Updating every few seconds', reconnecting: 'Reconnecting…', back: 'Back online.'},
    // What each state means, on hover over the top bar's word: Live is the realtime channel alone;
    // polling is the table asking the server (no realtime here, or the channel stalled).
    connectionNote: {
        live: 'Every move shows here the moment it is made.',
        polling: 'This table asks for new moves every few seconds.',
        reconnecting: 'The connection dropped. Trying again.',
    },

    // The seats (a list labelled "Seats"). A seat is its index, printed from 1.
    seatsLabel: 'Seats',
    seat: (seat: number): string => `Seat ${seatNo(seat)}`,
    openSeat: 'Open seat',
    openSeatLabel: (seat: number): string => `Seat ${seatNo(seat)}, open`,
    sitHere: 'Sit here',
    // An open seat, for a seated player: a tap opens the invite sheet.
    inviteSeat: 'Invite',
    inviteToSeat: (seat: number): string => `Invite a friend to seat ${seatNo(seat)}`,
    you: 'You',
    hostBadge: 'Host',
    status: SEAT_STATUS,
    thinking: 'Thinking',
    presence: {hidden: 'In another tab', offline: 'Offline'},
    markers: {dealer: 'D', small: 'SB', big: 'BB'},
    markerNames: {dealer: 'Dealer button', small: 'Small blind', big: 'Big blind'},
    owesPost: 'Posts a big blind to play',
    pendingBuy: (n: number): string => `${plural(n, 'chip comes', 'chips come')} in after this hand`,
    // A plate's accessible name: "Ana, seat 3, 1,250 chips, all in, calls 40". status is a word from
    // this table (status, thinking, presence); last, the seat's last move (ACTION_COPY.does).
    seatLabel: (name: string, seat: number, chips: number, status: string | null, last: string | null): string =>
        `${isolate(name)}, seat ${seatNo(seat)}, ${plural(chips, 'chip', 'chips')}${status ? `, ${status.toLowerCase()}` : ''}${last ? `, ${last}` : ''}`,

    // The middle of the felt. Side pots count from 1, in the order the pots are built.
    chips: count,
    pot: (n: number): string => `Pot ${count(n)}`,
    mainPot: (n: number): string => `Main pot ${count(n)}`,
    sidePot: (i: number, n: number): string => `Side pot ${count(i)}: ${count(n)}`,
    board: (spoken: string): string => `Board: ${spoken}`,
    // PLO on two or three boards: each board's numeral on the felt and its name ("Board 2"), each
    // board's group read aloud, the boards' block as the button that opens them larger, and the
    // sheet that does (components/poker-night/BoardsSheet).
    boardName: (k: number): string => `Board ${count(k + 1)}`,
    boardOf: (k: number, spoken: string): string => `Board ${count(k + 1)}: ${spoken}`,
    boardsZoom: 'See the boards larger',
    boardsSheet: 'The boards',

    // The winner's banner; the hand's name sits under it (HAND_COPY.label).
    banner: (name: string, n: number): string => `${isolate(name)} wins ${count(n)}`,
    bannerYou: (n: number): string => `You win ${count(n)}`,
    bannerSplit: (players: readonly string[]): string => `Split pot: ${names(players)}`,
    // With two or three boards, a line a board: "Board 2: Ana wins 600", "Board 1: you win 300", or
    // its chips player by player ("Board 1: Ana 400 and Ben 200", the viewer as "you"); one line when
    // one player wins every board's share of every pot.
    bannerBoard: (k: number, name: string, n: number): string => `Board ${count(k + 1)}: ${isolate(name)} wins ${count(n)}`,
    bannerBoardYou: (k: number, n: number): string => `Board ${count(k + 1)}: you win ${count(n)}`,
    bannerBoardSplit: (k: number, parts: readonly {name: string | null; amount: number}[]): string =>
        `Board ${count(k + 1)}: ${words(parts.map((p) => `${p.name === null ? 'you' : isolate(p.name)} ${count(p.amount)}`))}`,

    bannerScoop: (name: string, n: number): string => `${isolate(name)} wins every board: ${count(n)}`,
    bannerScoopYou: (n: number): string => `You win every board: ${count(n)}`,
    // A banner line cut short where the banner has no room for its chips (each seat's "+N" says them),
    // in three parts so that only a name is ever cut, to an ellipsis, on the narrowest screens: the
    // words before it, the name (or names), the words after — "Board 2: " "Ana" "", "" "Ana" " wins",
    // "You win every board" "" "".
    bannerShortBoard: (k: number): string => `Board ${count(k + 1)}: `,
    bannerShortNames: (parts: readonly (string | null)[]): string => words(parts.map((name) => (name === null ? 'you' : isolate(name)))),
    bannerShortWins: ' wins',
    bannerShortEvery: ' wins every board',
    bannerShortYou: 'You win',
    bannerShortEveryYou: 'You win every board',

    // The turn and its countdown (role="timer"; the server's two seconds of grace are never shown).
    yourTurn: 'Your turn',
    waitingFor: (name: string): string => `Waiting for ${isolate(name)}`,
    timer: 'Time left to act',
    secondsLeft: (s: number): string => `${count(s)} s`,

    // Between hands.
    waitingForPlayers: 'Waiting for a second player to sit down.',
    waitingForHost: 'Waiting for the host to deal the first hand.',
    nextHandIn: (s: number): string => `Next hand in ${count(s)} s`,
    paused: 'Paused by the host.',
    pausing: 'The game pauses after this hand.',
    resumed: 'The game is back on.',
    closing: 'The night ends after this hand.',
    ended: 'The host ended the night.',
    closed: REFUSAL_COPY.closed,

    // The viewer's own seat: sitting out, coming back, showing.
    sitOut: 'Sit out next hand',
    sittingOut: 'You are sitting out.',
    dealMeIn: 'Deal me in',
    back: "I'm back",
    // n is the table's sitOutAfter: the timeouts in a row that sit a player out.
    awayNote: (n: number): string => `Sat out after ${numberWord(n)} ${n === 1 ? 'timeout' : 'timeouts'}. "I'm back" deals you in again.`,
    outOfChips: 'Out of chips.',
    // A seat that never had chips here (a newcomer whose request was taken back or declined).
    noChipsYet: 'No chips yet.',
    showCards: 'Show my cards',
    // The break's buttons in a narrow dock (a phone upright); the long words above stay their
    // accessible names.
    sitOutShort: 'Sit out',
    showShort: 'Show mine',
    leaveShort: 'Leave',
    // Beside the cards while the plate still reads Folded: what the seat does when the hand ends.
    leavingAfterHand: 'You leave when this hand ends.',
    // Leave after this hand: play it out as usual, leave as it ends. The dock's one-tap toggle and
    // the menu's, the note beside the cards with Stay (lastHand in a narrow dock), the toasts, and
    // the line the leave dialog adds under its body while it offers it.
    leaveAfter: 'Leave after this hand',
    // The action's word where the long one does not fit (the door beside the early choices, the all-in
    // button in a narrow dock); lastHand is the state's, beside the cards with Stay.
    leaveAfterShort: 'Leave after hand',
    lastHand: 'Last hand',
    leavingAfter: 'Leaving after this hand',
    stayAtTable: 'Stay at the table',
    leaveAfterSet: 'You leave the table when this hand ends.',
    leaveAfterCleared: 'You stay at the table.',
    leaveLanded: 'A new hand was dealt first: you leave the table when it ends.',
    leaveAfterNote: 'Leave after this hand to play it out as usual: your chips are counted in the bank as it ends.',
    // A seat whose chips wait for the host's yes (a new player once the game has started, or a
    // rebuy at zero): the dock's line, with Cancel, and the plate's word.
    waitingApproval: 'Waiting for the host to approve your chips',
    awaitingChips: 'Waiting for chips',
    // A plate kept while a result shows for a player who went as the hand completed.
    leftSeat: 'Left',
    ghostLabel: (name: string, seat: number): string => `${isolate(name)}, seat ${seatNo(seat)}, left the table`,
    cancelRequest: 'Cancel',
    cancelRequestLabel: 'Cancel the request for chips',
    requestCancelled: 'Request cancelled.',
    // The host unheard from for LIMITS.hostTakeoverMs: a waiting request may land without their yes
    // (BANK_COPY.takeChips); a host back by then keeps it waiting.
    hostAwayNote: `The host has been away for over ${numberWord(Math.round(LIMITS.hostTakeoverMs / 60_000))} minutes, so your chips no longer wait for them.`,
    hostBack: 'The host is back: your request waits for them.',
    sitOutNextNote: 'You sit out from the next hand.',
    // Triple T: a plate's word while its player is still to throw a card away.
    discarding: 'Discarding…',
    // The host sat the viewer out (the bank's "Sit out next hand"); "I'm back" deals them in again.
    hostSatYouOut: 'The host sat you out.',
    // The viewer's own cards after a fold: still theirs to see, dimmed, until the next deal.
    foldedHand: 'Your hand, folded',

    // Leaving. Mid-hand, leaving now folds the hand the next time it faces a bet, and the chips are
    // counted once it ends (leaveBodyInHand, one sentence in place of leaveBody).
    leaveTitle: 'Leave the table?',
    leaveBody: (n: number): string => `Your ${plural(n, 'chip is', 'chips are')} counted in the bank as you leave.`,
    leaveBodyInHand: (n: number): string =>
        `Your hand folds the next time it faces a bet; your ${plural(n, 'chip is', 'chips are')} counted in the bank once it ends.`,
    leave: 'Leave',
    stay: 'Stay',
    leaveMidHandTitle: 'Leave in the middle of a hand?',
    leaveNow: 'Leave now',
    leaveAndGo: 'Leave and go',
    leaveNowAndGo: 'Leave now and go',
    // What sitting down again takes, said before leaving (lib/poker-night/overlays.leaveAsks).
    rebuysOffNote: 'Rebuys are off at this table: once you leave, you can watch but not sit down again.',
    rebuysAskNote: "Sitting down again needs the host's yes.",
    rebuyCapNote: 'You have used every rebuy this table allows: once you leave, you can watch but not sit down again.',
    // After leaving: the dock's watching side, with the way home, the way back to a seat and, for an
    // account, the lobby.
    leftTitle: 'You left the table',
    netTonight: (n: number): string => `Net tonight: ${signed(n)}.`,
    sitAgain: 'Sit down again',
    lobby: 'Poker night lobby',

    // The error page (app/(play)/error.tsx), an unknown code (not-found.tsx) and a newer deploy.
    errorTitle: 'The table could not load',
    errorBody: 'Your seat and your chips are kept at the table. Try again to load it.',
    retry: 'Try again',
    notFoundTitle: 'No table here',
    notFound: POKER_NIGHT_ERRORS.not_found,
    toLobby: 'Back to poker night',
    reload: 'Reload',
} as const;

// ---- Triple T's throw-away (components/poker-night DiscardPicker, Dock, Seat, the felt) ----------

// Right after the deal everyone still in throws one of three cards away at once: the dock's three
// cards to pick from (a radio group), its confirm and its clock, the wait for the others, the felt's
// count, what a screen reader hears. A card is named in the viewer's own words alone: no sentence
// here ever names another player's.
export const DISCARD_COPY = {
    prompt: 'Tap the card to throw away',
    groupLabel: 'Card to throw away',
    // A card of the picker while Peek keeps the cards face down: its place, never its name.
    hiddenCard: (k: number): string => `Card ${count(k + 1)}, face down`,
    confirm: (card: string): string => `Throw away ${card}`,
    // With Peek on, the confirm never names the card.
    confirmHidden: 'Throw away the card picked',
    confirmNone: 'Pick a card first',
    sending: 'Throwing away…',
    clock: 'Throw away one',
    waiting: (n: number): string => `Waiting for ${plural(n, 'player', 'players')} to throw away a card`,
    felt: (done: number, n: number): string => `Everyone throws away one card · ${count(done)} of ${count(n)} done`,
    // The same where the board is narrow (a phone on its side).
    feltShort: (done: number, n: number): string => `${count(done)} of ${count(n)} thrown away`,
    announceStart: (cards: readonly Card[]): string => `Throw away one of your three cards: ${words(cards.map((c) => `the ${cardWords(c)}`))}.`,
    announceDone: 'Everyone has thrown away a card.',
    thrown: (card: Card): string => `You threw away the ${cardWords(card)}.`,
    timedOut: (card: Card): string => `Time ran out: the ${cardWords(card)} was thrown away for you.`,
} as const;

// ---- the hand log (components/poker-night/HandLog) ---------------------------------------------

// Which pot a line is about: null when the hand had one pot, 0 the main pot, 1 the first side pot.
export type PotIndex = number | null;
const fromPot = (pot: PotIndex): string => (pot === null ? '' : pot === 0 ? ' from the main pot' : ` from side pot ${count(pot)}`);
const splitName = (pot: PotIndex): string => (pot === null ? 'Split pot' : pot === 0 ? 'Main pot split' : `Side pot ${count(pot)} split`);
// A line about one board's share of a pot, with two or three boards: "Board 2: …".
const onBoard = (board: number | null): string => (board === null ? '' : `Board ${count(board + 1)}: `);

export const LOG_COPY = {
    heading: 'Hand log',
    // The winner's banner is a button that opens the log: its name says both.
    fromBanner: (heads: readonly string[]): string => `${heads.join('; ')}. Open the hand log`,
    empty: 'The log fills in once a hand is dealt.',
    hand: (n: number): string => `Hand ${count(n)}`,
    blinds: (smallBlind: number, bigBlind: number, ante: number): string =>
        `Blinds ${count(smallBlind)}/${count(bigBlind)}${ante ? `, ante ${count(ante)}` : ''}`,
    // A street's cards, on each board with two or three: "Flop, board 2: A♠︎ K♦︎ 7♣︎".
    street: (street: Exclude<Street, 'preflop'>, cards: string, board: number | null = null): string =>
        `${capitalize(street)}${board === null ? '' : `, board ${count(board + 1)}`}: ${cards}`,
    // One line: "Ana calls 40.", "Ana raises to 340, all in.", "Ben folds as time ran out."; a hand
    // called off is the table's own line and takes no name.
    line: (name: string, kind: EntryKind, amount: number, allIn: boolean, timedOut = false): string =>
        kind === 'void'
            ? `${capitalize(DOES.void(''))}.`
            : `${isolate(name)} ${ACTION_COPY.does(kind, amount, allIn)}${timedOut ? ' as time ran out' : ''}.`,
    shows: (name: string, cards: string, phrase: string | null): string => `${isolate(name)} shows ${cards}${phrase ? `: ${phrase}` : ''}.`,
    youHeld: (cards: string): string => `You held ${cards}.`,
    // Triple T: the card the reader threw away, in their own log alone.
    youThrew: (card: string): string => `You threw away ${card}.`,
    // A hand shown to the reader alone, answering their ask: "Shown to you: Ana's A♠ K♦."
    showedYou: (name: string, cards: string): string => `Shown to you: ${isolate(name)} held ${cards}.`,
    // "Ana wins 1,200 with two pair, kings and sevens.", "Ben wins 400 from side pot 1."; with two or
    // three boards, a line for each board's share: "Board 2: Ana wins 600 with a flush, ace high."
    wins: (name: string, n: number, phrase: string | null, pot: PotIndex = null, board: number | null = null): string =>
        `${onBoard(board)}${isolate(name)} wins ${count(n)}${fromPot(pot)}${phrase ? ` with ${phrase}` : ''}.`,
    // Share by share, never "each": an odd chip makes the shares differ.
    // "Board 2, split pot: …" on a board.
    split: (shares: readonly {name: string; amount: number}[], pot: PotIndex = null, board: number | null = null): string =>
        `${board === null ? splitName(pot) : `Board ${count(board + 1)}, ${splitName(pot).toLowerCase()}`}: ${shares.map((s) => `${isolate(s.name)} takes ${count(s.amount)}`).join(', ')}.`,
    // What a shown hand makes on each of two or three boards, for LOG_COPY.shows: "on board 1 a
    // flush, ace high; on board 2 a pair of kings".
    onBoards: (phrases: readonly (string | null)[]): string =>
        phrases.flatMap((p, k) => (p === null ? [] : [`on board ${count(k + 1)} ${p}`])).join('; '),
    uncontested: (name: string, n: number): string => `Everyone else folded: ${isolate(name)} takes ${count(n)}.`,
    refund: (name: string, n: number): string => `${isolate(name)} gets back ${count(n)} uncalled.`,
    playsBoard: (name: string): string => `${isolate(name)} plays the board.`,
    truncated: `Only the last ${count(KEEP.LOG_SUMMARY)} lines of this hand are kept.`,
    earlier: 'Earlier hands',
    more: 'Show earlier hands',
} as const;

// ---- what a screen reader hears (the table's polite and assertive live regions) -----------------

export const ANNOUNCE_COPY = {
    yourTurn: (toCall: number, pot: number): string =>
        toCall > 0 ? `Your turn: ${count(toCall)} to call, pot ${count(pot)}.` : `Your turn: checking is free, pot ${count(pot)}.`,
    timeLow: (s: number): string => `${plural(s, 'second', 'seconds')} left.`,
    dealt: (cards: readonly Card[]): string => `You have ${words(cards.map((c) => `the ${cardWords(c)}`))}.`,
    newGame: MODE_COPY.changed,
    street: (street: Exclude<Street, 'preflop'>, cards: readonly Card[], board: number | null = null): string =>
        `${capitalize(street)}${board === null ? '' : `, board ${count(board + 1)}`}: ${words(cards.map(cardWords))}.`,
    // With two or three boards, each board's share: "Board 2: you win 600 with a flush, ace high."
    youWinBoard: (board: number, n: number, phrase: string | null): string =>
        `Board ${count(board + 1)}: you win ${count(n)}${phrase ? ` with ${phrase}` : ''}.`,
    // Another player's move and a pot's winners read as the log does.
    move: LOG_COPY.line,
    wins: LOG_COPY.wins,
    split: LOG_COPY.split,
    uncontested: LOG_COPY.uncontested,
    youWin: (n: number, phrase: string | null): string => `You win ${count(n)}${phrase ? ` with ${phrase}` : ''}.`,
    joined: (name: string): string => `${isolate(name)} sat down.`,
    left: (name: string): string => `${isolate(name)} left the table.`,
    removed: (name: string): string => `The host removed ${isolate(name)} from the table.`,
    host: (name: string): string => `${isolate(name)} is the host now.`,
    youHost: 'You are the host now.',
    paused: 'The host paused the game.',
    resumed: TABLE_COPY.resumed,
    closed: 'The host closed the table.',
} as const;

// ---- asks to see a hand (components/poker-night SeatMenu, AskPrompt; lib/poker-night/asks) -------

// Why an ask is greyed in the seat menu (AskBlock), each one sentence; the refusals' own words where
// the engine has one.
const ASK_BLOCKS = {
    'asks-off': (name: string): string => `${isolate(name)} has turned off asks to see their cards.`,
    cooldown: (): string => REFUSAL_COPY['ask-cooldown'],
    waiting: (): string => REFUSAL_COPY['ask-waiting'],
    limit: (): string => REFUSAL_COPY['ask-limit'],
    full: (): string => REFUSAL_COPY['asks-full'],
} as const;

export const ASK_COPY = {
    // The seat menu, once a hand the reader folded is complete.
    ask: 'Ask to see their cards',
    blocked: ASK_BLOCKS,
    asked: (name: string): string => `You asked ${isolate(name)} to see their cards.`,
    // How the reader's ask of this player stands (AskAnswer), in the menu.
    status: {
        waiting: (name: string): string => `Waiting for ${isolate(name)} to answer`,
        shown: (): string => 'Shown to you',
        everyone: (): string => 'Shown to everyone',
        no: (name: string): string => `${isolate(name)} said no thanks`,
        expired: (name: string): string => `No answer from ${isolate(name)}`,
    },
    // How it ended, said once in a toast.
    ended: {
        shown: (name: string): string => `${isolate(name)} showed you their cards.`,
        everyone: (name: string): string => `${isolate(name)} showed their cards to everyone.`,
        no: (name: string): string => `${isolate(name)} said no thanks.`,
        expired: (name: string): string => `No answer from ${isolate(name)} in time.`,
        // The next deal ended it while it still had time: no answer, which counts as a no.
        dealt: (name: string): string => `The next hand was dealt before ${isolate(name)} answered.`,
    },
    // The plate of a player who showed the reader alone.
    shownTag: 'Shown to you',
    // The prompt the player asked sees, under the top bar, with its seconds left.
    region: 'An ask to see your cards',
    prompt: (name: string): string => `${isolate(name)} asks to see your cards`,
    showOne: (name: string): string => `Show ${isolate(name)}`,
    showAll: 'Show everyone',
    noThanks: 'No thanks',
    secondsLeft: (s: number): string => `${count(s)} s`,
    timer: 'Time left to answer',
    shownOne: (name: string): string => `Your cards are shown to ${isolate(name)} alone.`,
    // My look's switch (PersonalLook.allowAsks): the room keeps it for the reader's seat.
    allow: 'Let others ask to see my cards',
    allowHint: 'After a hand, a player who folded can ask to see your cards if nobody saw them, and you choose who sees them. Off, nobody can ask.',
} as const;

// ---- the host drawer (components/poker-night/HostDrawer, RemovePlayerDialog) -------------------

const REMOVED = 'Removed by host';

// The rebuy policy as the drawer's control reads it (GameConfig.rebuys): off, or on — once the first
// hand is dealt the host approves every buy but their own.
const REBUY_POLICY: Record<RebuyPolicy, string> = {off: 'Off', approve: 'On (host approves)'};

export const HOST_COPY = {
    heading: 'Host controls',
    sections: {game: 'Game', rebuys: 'Rebuys', players: 'Players', table: 'Table'},
    // Said once per section (invariant 8), never per control.
    fromNextHand: 'Changes apply from the next hand.',
    save: 'Save changes',
    saved: 'Saved.',

    // Game. Starting chips are the config's buyInMin, the chip cap its buyInMax.
    blinds: 'Blinds',
    blindsValue: (smallBlind: number, bigBlind: number): string => `${count(smallBlind)}/${count(bigBlind)}`,
    custom: 'Custom',
    smallBlind: 'Small blind',
    bigBlind: 'Big blind',
    ante: 'Ante',
    anteNone: 'None',
    startingChips: 'Starting chips',
    startingChipsHint: 'The fewest chips a player sits down with.',
    chipCap: 'Chip cap',
    chipCapHint: 'The most chips a player can sit down with or top up to.',
    timer: 'Turn timer',
    timerValue: (s: number): string => `${count(s)} s`,
    // Why a change was turned down, keyed on lib/poker-night/config checkConfig's messages.
    issues: {
        'below-small-blind': 'The big blind is at least the small blind.',
        'above-big-blind': 'The ante is at most the big blind.',
        'below-big-blind': 'Starting chips are at least one big blind.',
        'below-buy-in-min': 'The chip cap is at least the starting chips.',
        'above-cap': `The chip cap is at most ${count(TABLE_LIMITS.buyIn.bigBlinds)} big blinds.`,
        'plo-only': 'More than one board is for PLO only.',
        'not-open': 'That game is not open at this table yet.',
        'too-many-cards': 'Not enough cards for that many seats and boards.',
    },

    // Rebuys, and the requests waiting on the host (a dot on the menu icon, rows in the bank).
    rebuys: 'Rebuys',
    rebuysValue: REBUY_POLICY,
    rebuyLimitLabel: 'Rebuys per player',
    rebuyLimit: (n: number | null): string => (n === null ? 'No limit' : `Up to ${count(n)} each`),
    requestsHeading: 'Waiting for you',
    requests: (n: number): string => `${plural(n, 'request', 'requests')} waiting`,
    request: (name: string, n: number): string => `${isolate(name)} asks for ${plural(n, 'chip', 'chips')}.`,
    // What a request is for (lib/poker-night/overlays.requestKind): a new player's first chips, a
    // rebuy at zero, or a top-up.
    requestSeat: (name: string, n: number): string => `${isolate(name)} asks for ${plural(n, 'chip', 'chips')} to sit down.`,
    requestRebuy: (name: string, n: number): string => `${isolate(name)} asks for a rebuy of ${plural(n, 'chip', 'chips')}.`,
    requestTopUp: (name: string, n: number): string => `${isolate(name)} asks to top up with ${plural(n, 'chip', 'chips')}.`,
    approve: 'Approve',
    decline: 'Decline',
    approvedFor: (name: string): string => `Chips approved for ${isolate(name)}.`,
    // The rebuy policy's two choices, said once under them: on, the host approves every buy but
    // their own once the first hand is dealt.
    rebuysHint: "Once the first hand is dealt, every player's chips but yours wait for your yes in the bank. Off: a player who leaves or runs out of chips can watch, not sit down again.",

    // Players: each row's More menu.
    you: 'You',
    hostBadge: 'Host',
    more: 'More',
    moreFor: (name: string): string => `More for ${isolate(name)}`,
    handOver: 'Hand over host',
    handOverTitle: (name: string): string => `Make ${isolate(name)} the host?`,
    handOverBody: 'They get these controls, and you keep your seat.',
    handOverNeedsAccount: 'Only a player with an account can be host.',
    claimHost: 'Take over as host',
    claimHostNote: `The host has been away for over ${numberWord(Math.round(LIMITS.hostTakeoverMs / 60_000))} minutes.`,

    // Removing a player: a dialog naming them, and a button pressed and held for two seconds. A player
    // between hands leaves now with the chips they hold; one dealt into the hand in play stays in it,
    // away, until it ends (the engine's depart), so no figure is promised for them.
    removeFromTable: 'Remove from table',
    removeTitle: (name: string): string => `Remove ${isolate(name)}?`,
    removeBody: (name: string, chips: number): string =>
        `${isolate(name)} leaves the table now. Their ${plural(chips, 'chip is', 'chips are')} cashed out, and they can't rejoin unless you let them back in.`,
    removeBodyInHand: (name: string): string =>
        `${isolate(name)} leaves at the end of this hand, and their chips are cashed out then. They can't rejoin unless you let them back in.`,
    removeInHand: 'Their hand folds whenever it faces a bet.',
    lockToo: 'And lock the table',
    pressAndHold: 'Press and hold to remove',
    pressAndHoldHint: 'Keep it pressed for two seconds, with the pointer or with Space or Enter. Letting go early cancels.',
    removing: (name: string): string => `Removing ${isolate(name)}`,
    removedDone: (name: string): string => `${isolate(name)} was removed from the table.`,
    cancel: 'Cancel',
    removedHeading: 'Removed players',
    removed: REMOVED,
    letBackIn: 'Let back in',
    letBackInDone: (name: string): string => `${isolate(name)} can join again.`,

    // Sitting a player out from the bank or the Players list: from the next deal while they are in the
    // hand in play, at once between hands. Only the player deals themself back in ("Deal me in",
    // "I'm back"): the host's side has no take-back.
    sitOut: TABLE_COPY.sitOut,
    sitOutFor: (name: string): string => `Sit ${isolate(name)} out from the next hand`,
    sitOutWaiting: 'Sits out from the next hand.',
    satOut: (name: string): string => `${isolate(name)} sits out from the next hand.`,
    satOutNow: (name: string): string => `${isolate(name)} is sitting out.`,

    // Table.
    tableName: 'Table name',
    deal: INVITE_COPY.deal,
    pause: 'Pause the game',
    pauseNote: 'A hand in play finishes first.',
    resume: 'Resume',
    lock: 'Lock the table',
    lockHint: 'Nobody new can join, to play or to watch. Everyone already here stays.',
    showToFriends: 'Show this table to my friends',
    showToFriendsHint: 'Friends see it in their poker night lobby.',
    end: 'End the night',
    endTitle: 'End the night for everyone?',
    endBody: 'A hand in play finishes first. Then the table closes and everyone sees the summary.',
} as const;

// ---- the bank (components/poker-night/BankPanel; lib/poker-night/views.bankOf) ------------------

// A ledger event (LedgerKind) in the bank's "Chips in, by time" list; never opens on "Buy".
const BANK_EVENT: Record<LedgerKind, (n: string) => string> = {
    'buy-in': (n) => `Sat down with ${n}`,
    rebuy: (n) => `Rebuy of ${n}`,
    'top-up': (n) => `Topped up with ${n}`,
    'cash-out': (n) => `Left with ${n}`,
    removed: (n) => `${REMOVED}, left with ${n}`,
};

export const BANK_COPY = {
    heading: 'Bank',
    lead: 'Play chips only. No cash value: the bank counts what each player brought to the table and what they hold now.',
    columns: {player: 'Player', chipsIn: 'Chips in', rebuys: 'Rebuys', stack: 'Stack', net: 'Net'},
    net: signed,
    inPot: (n: number): string => `${count(n)} in the pot`,
    leftWith: (n: number): string => `Left with ${count(n)}`,
    removed: REMOVED,
    // The footer: every chip on the table or cashed out against every chip brought in.
    check: (onTable: number, broughtIn: number, cashedOut: number): string =>
        onTable + cashedOut === broughtIn
            ? `Every chip is accounted for: ${count(broughtIn)} brought in.`
            : `Counted ${count(onTable + cashedOut)} of the ${count(broughtIn)} chips brought in.`,
    byTime: 'Chips in, by time',
    event: (kind: LedgerKind, n: number): string => BANK_EVENT[kind](count(n)),
    pendingHeading: 'Waiting for the host',

    // The viewer's own chips: a rebuy at zero, a top-up to the cap above it. Their figure is the
    // table's Stack (a live pot counted, said beside it); a top-up counts only the chips behind, so
    // while some are in the pot it says what it adds rather than a total.
    rebuy: 'Rebuy',
    topUp: (to: number): string => `Top up to ${count(to)}`,
    // A seat's first chips here once the game has started: a request the host approves (askFor), or,
    // with the host away long enough, chips that land at once (takeChips).
    askFor: (n: number): string => `Ask for ${plural(n, 'chip', 'chips')}`,
    takeChips: (n: number): string => `Take ${plural(n, 'chip', 'chips')}`,
    // The dock's one-tap rebuy once the stack is empty: the table's whole buy-in in one tap ("Rebuy
    // 2,000 chips", or "Ask for 2,000 chips" where the host says yes first; a narrow dock says the
    // figure alone), and the bank for any other amount.
    rebuyFor: (n: number): string => `Rebuy ${plural(n, 'chip', 'chips')}`,
    rebuyShort: (n: number): string => `Rebuy ${count(n)}`,
    askShort: (n: number): string => `Ask for ${count(n)}`,
    otherShort: 'Other',
    ownInPot: (n: number): string => `Counting ${count(n)} in this pot.`,
    addChips: (n: number): string => `Add ${plural(n, 'chip', 'chips')}`,
    otherAmount: 'Other amount',
    amountLabel: 'Chips to add',
    amountRule: (min: number, max: number): string => `From ${count(min)} to ${count(max)}.`,
    requested: (n: number): string => `Asked the host for ${plural(n, 'chip', 'chips')}.`,
    cancel: TABLE_COPY.cancelRequest,
    cancelLabel: TABLE_COPY.cancelRequestLabel,
    cancelled: TABLE_COPY.requestCancelled,
    pending: (n: number): string => `${plural(n, 'chip joins', 'chips join')} your stack when this hand ends.`,
    approved: (n: number): string => `${plural(n, 'chip', 'chips')} added to your stack.`,
    declined: 'The host declined the request.',
    rebuysUsed: (used: number, max: number): string => `Rebuys used: ${count(used)} of ${count(max)}.`,
} as const;

// ---- the end of the night (components/poker-night/NightSummary) --------------------------------

// What "Copy summary" puts on the clipboard: the table and date, the length, one line per player
// by net, one line per award (P7), and the footer.
export type SummaryTextInput = {
    table: string;
    date: string;
    hands: number;
    minutes: number;
    standings: readonly {name: string; net: number; removed: boolean}[];
    awards?: readonly {id: AwardId; names: readonly string[]; value: number}[];
};

const SUMMARY_FOOTER = 'Play chips only. No cash value.';
const summaryWhen = (table: string, date: string): string => `${isolate(table)} · ${date}`;
const summaryLength = (hands: number, minutes: number): string => `${plural(hands, 'hand', 'hands')} in ${duration(minutes)}`;

// The night's awards (P7, lib/poker-night/awards AWARD_IDS): each one's name, and the figure it was
// won with, which starts on its number so it reads alone under the winners or after them.
const AWARD_LABELS = {
    'biggest-pot': 'Biggest pot',
    'most-won': 'Most hands won',
    'highest-stack': 'Highest stack',
    'most-all-ins': 'Most all-ins',
    'tomato-magnet': 'Tomato magnet',
    'most-roses': 'Most roses given',
} as const satisfies Record<AwardId, string>;
const AWARD_FIGURES: Record<AwardId, (n: number) => string> = {
    'biggest-pot': (n) => `${plural(n, 'chip', 'chips')} in one hand`,
    'most-won': (n) => plural(n, 'hand', 'hands'),
    'highest-stack': (n) => plural(n, 'chip', 'chips'),
    'most-all-ins': (n) => plural(n, 'all-in', 'all-ins'),
    'tomato-magnet': (n) => plural(n, 'tomato', 'tomatoes'),
    'most-roses': (n) => plural(n, 'rose', 'roses'),
};
const awardLine = (id: AwardId, winners: readonly string[], n: number): string => `${AWARD_LABELS[id]}: ${names(winners)}, ${AWARD_FIGURES[id](n)}`;

export const SUMMARY_COPY = {
    heading: "That's a wrap",
    when: summaryWhen,
    length: summaryLength,
    standings: 'Final counts',
    columns: {player: 'Player', chipsIn: 'Chips in', finished: 'Finished with', net: 'Net'},
    removed: REMOVED,
    copy: 'Copy summary',
    copied: 'Summary copied.',
    blocked: 'The clipboard is blocked: copy the summary from the box.',
    again: 'Start another table',
    lobby: 'Back to poker night',
    home: TABLE_COPY.home,
    // navigator.share, on phones: the summary's own text under this title.
    share: 'Share',
    shareTitle: (table: string): string => `${isolate(table)}: the final counts`,
    guestNudge: 'With an account, the nights you play are kept under Recent nights.',
    guestNudgeLink: 'Create an account',
    footer: SUMMARY_FOOTER,
    awardsHeading: 'Awards',
    awards: AWARD_LABELS,
    awardFigure: (id: AwardId, n: number): string => AWARD_FIGURES[id](n),
    // "Biggest pot: Ana, 1,200 chips in one hand"; a tie names everyone: "Most all-ins: Ben and Cy, 3 all-ins".
    award: awardLine,
    text: ({table, date, hands, minutes, standings, awards = []}: SummaryTextInput): string => [
        summaryWhen(table, date),
        summaryLength(hands, minutes),
        ...standings.map((row) => `${isolate(row.name)}: ${signed(row.net)}${row.removed ? ` (${REMOVED.toLowerCase()})` : ''}`),
        ...awards.map((a) => awardLine(a.id, a.names, a.value)),
        SUMMARY_FOOTER,
    ].join('\n'),
} as const;

// ==== P3: the lobby's panels and forms (components/poker-night/lobby, lib/actions/poker-night) ====

// What the lobby's panels say beyond POKER_NIGHT_COPY: the start panel and its form, closing an
// open table, joining with a code, and My look. The form's own labels are the host drawer's
// (HOST_COPY), so a setting reads the same in the lobby and at the table.
export const LOBBY_COPY = {
    startHeading: 'Host a table',

    // The form under "Set it up first". Starting chips set both ends of the range (the config's
    // buyInMin and buyInMax); the host can widen it at the table.
    blinds: HOST_COPY.blinds,
    chips: HOST_COPY.startingChips,
    chipsHint: 'Each player sits down with this many. The host can widen the range at the table.',
    seatsHint: 'The number of seats is fixed once the table opens.',
    rebuys: HOST_COPY.rebuys,
    timer: HOST_COPY.timer,
    showToFriends: HOST_COPY.showToFriends,
    showToFriendsHint: HOST_COPY.showToFriendsHint,
    badConfig: REFUSAL_COPY['bad-config'],

    // Your open tables: ending one from the lobby.
    end: HOST_COPY.end,
    endTitle: (table: string): string => `End the night at ${isolate(table)}?`,
    endBody: HOST_COPY.endBody,
    ended: 'The night ends once any hand in play finishes.',
    copyLink: INVITE_COPY.copy,
    copied: INVITE_COPY.copied,
    blocked: INVITE_COPY.blocked,

    // Join with a code.
    joinLead: 'Type the code a friend gave you to open their table.',

    // Recent nights: a closed table's page is its summary.
    summary: 'See the summary',

    // My look: what an account sits down as at every table it joins from now on.
    lookHeading: 'My look',
    lookLead: 'The name and look you sit down with. Everyone at the table sees them.',
    save: 'Save my look',
    saving: 'Saving…',
    saved: 'Saved. A table you are at already keeps the look you sat down with.',
    // The name and look this browser kept from a table it joined (localStorage), offered once it
    // differs from the account's.
    fromBrowserHeading: 'From this browser',
    fromBrowser: (name: string | null): string =>
        name === null ? 'This browser kept a look from a table you joined.' : `This browser kept the look you used at a table, as ${isolate(name)}.`,
    saveToAccount: 'Save to my account',

    // What an action answers when it cannot run.
    signedOut: POKER_NIGHT_ERRORS.needs_account,
    tooFast: POKER_NIGHT_ERRORS.rate_limited,
    unreachable: POKER_NIGHT_ERRORS.unavailable,
} as const;

// ==== P3: the table's overlays (components/poker-night: TableOverlays, TopBar, JoinCard, ==========
// InviteSheet, BankPanel, HostDrawer, RemovePlayerDialog, HandLog, MyLookDrawer, NightSummary) =====

// What the overlays say beyond the tables above, which they quote for everything else: the drawers'
// shared words, the top bar's own-seat choices, a watcher taking a seat, the look drawer's name
// panel (the rest is LOOKS_COPY), the bank's own-chips panel, the host drawer's section list and the
// summary's place column.
export const OVERLAY_COPY = {
    close: 'Close',
    loading: 'Loading…',
    // The top bar: the code as a label ("Code K7Q XM4") and the viewer's seat choices.
    code: (code: string): string => `Code ${INVITE_COPY.codeGrouped(code)}`,
    myLook: LOBBY_COPY.lookHeading,
    takeSeat: 'Take a seat',
    takeSeatLead: 'An open seat is dealt in from the next hand.',
    watching: 'Watching',
    connection: (state: string): string => `Connection: ${state.toLowerCase()}`,

    // My look's name panel (MyLookDrawer): the name and the look the table sees.
    lookLead: 'Your name and look, as everyone at this table sees them. They change between hands.',
    lookSave: 'Save',
    lookSaved: 'Saved.',

    // My look's keyboard switch (WCAG 2.1.4: single-key shortcuts can be turned off), kept in this
    // browser only.
    shortcuts: 'Single-key shortcuts',
    shortcutsHint: 'F folds, C checks or calls, R opens a bet or a raise, A sets all in (the pot in PLO), 1 to 4 pick a size, and in Triple T 1 to 3 pick the card to throw away. Off, only the buttons act; Enter and Escape still work.',

    // The bank's own-chips panel.
    yourChips: 'Your chips',
    addChips: 'Add chips',

    // The host drawer's sections, as a list of tabs.
    sectionsLabel: 'Host control sections',

    // The night summary's first column.
    place: 'Place',
} as const;

// ==== P3: the felt (components/poker-night PotDisplay) ===========================================

// What the felt says beyond TABLE_COPY, where the pots' full words have no room
// (lib/poker-night/stage.potPlan): the main pot and each side pot in short ("Main 600", "Side 1:
// 1,350"), the side pots past the few that fit gathered in one pill ("2 more: 5,050"), and, with room
// for one pill only, every pot in it ("4 pots: 6,250") — each count as a seat's plate prints it
// (lib/poker-night/chips.compactChips: "125k", "1.25M" from 100,000 on).
export const FELT_COPY = {
    mainPot: (n: number): string => `Main ${compactChips(n)}`,
    sidePot: (i: number, n: number): string => `Side ${count(i)}: ${compactChips(n)}`,
    morePots: (pots: number, chips: number): string => `${count(pots)} more: ${compactChips(chips)}`,
    allPots: (pots: number, chips: number): string => `${plural(pots, 'pot', 'pots')}: ${compactChips(chips)}`,
} as const;

// ==== P5: the looks (lib/poker-night/looks, personal; components/poker-night LookPicker, ==========
// PersonalLookControls, MyLookDrawer, HostDrawer's Look section, lobby/MyLookPanel) ================

// Every id in lib/poker-night/looks' registries has its name here (the copy test holds the keys
// equal): the host's scenes and felts, each player's card backs, card faces and chip sets. Then the
// words of the pickers and switches: what each choice does, said once beside it.
export const LOOKS_COPY = {
    scenes: {
        'casino-classic': 'Casino', 'midnight-lounge': 'Midnight lounge', 'neon-city': 'Neon city', 'beach-sunset': 'Beach sunset',
        'deep-space': 'Deep space', 'log-cabin': 'Log cabin', 'garden-party': 'Garden party', 'my-theme': 'My theme',
    } satisfies Record<SceneId, string>,
    // One line under each scene's name in the picker.
    sceneNotes: {
        'casino-classic': 'Gold damask under a chandelier.',
        'midnight-lounge': 'Lamplight and a slow haze.',
        'neon-city': 'A skyline whose windows flicker.',
        'beach-sunset': 'Palms, and the waves rolling in.',
        'deep-space': 'Planets among twinkling stars.',
        'log-cabin': 'A fire crackling in the hearth.',
        'garden-party': 'String lights over a lawn, in daylight.',
        'my-theme': "Each player sees their own app's colours.",
    } satisfies Record<SceneId, string>,
    felts: {
        emerald: 'Emerald', 'royal-blue': 'Royal blue', burgundy: 'Burgundy', charcoal: 'Charcoal', violet: 'Violet', teal: 'Teal',
        tangerine: 'Tangerine', rose: 'Rose',
    } satisfies Record<FeltId, string>,
    backs: {
        'classic-red': 'Classic red', 'classic-blue': 'Classic blue', aero: 'AeroTrade', checker: 'Checker', starfield: 'Starfield', waves: 'Waves',
        'neon-grid': 'Neon grid', tartan: 'Tartan',
    } satisfies Record<CardBackId, string>,
    faces: {classic: 'Classic', large: 'Large print'} satisfies Record<CardFaceId, string>,
    faceNotes: {
        classic: 'Small corners and a big pip in the middle.',
        large: 'A big rank in the corner, easy to read on a phone.',
    } satisfies Record<CardFaceId, string>,
    chips: {classic: 'Classic', pastel: 'Pastel', neon: 'Neon', mono: 'Mono'} satisfies Record<ChipSetId, string>,

    // A preview's name: "Deep space, violet felt".
    previewOf: (scene: string, felt: string): string => `${scene}, ${felt.toLowerCase()} felt`,

    // The host's Look section (HostDrawer): the room's settings, applied at once for everyone.
    hostTab: 'Look',
    hostLead: 'Everyone at the table sees the scene and felt you pick, straight away.',
    hostSaved: 'Your next tables open with this look too.',
    scene: 'Scene',
    felt: 'Felt',
    sceneFelt: 'A new scene brings its own felt; any felt can go with it after.',
    throwables: 'Throwables',
    throwablesHint: "Players can toss a tomato, a rose or confetti onto someone's seat. Off, reactions and phrases still work.",

    // The join card's way into the builder, and back out of it.
    customize: 'Change my look',
    customizeDone: 'Done',

    // My look (MyLookDrawer): the player's name and look for everyone, then what only they see.
    youHeading: 'You at the table',
    // A seated player's name and look wait for the hand in play to end (MyLookDrawer): the draft is
    // kept while the drawer is shut, and a save made now goes on the table by itself at the hand's end.
    betweenHands: 'This hand is still being played. A save now goes on the table when it ends.',
    queued: 'Saved. It goes on the table when this hand ends.',
    queuedDone: 'Your new name and look are on the table.',
    viewHeading: 'Only you see these',
    viewLead: 'Kept in this browser and used at every table you open here.',
    cardBack: 'Card back',
    cardFace: 'Card face',
    chipSet: 'Chip colours',
    fourColour: 'Four-colour deck',
    fourColourHint: 'Clubs green and diamonds blue, so each suit has a colour of its own.',
    sound: 'Sound',
    soundHint: 'Cards, chips and a chime on your turn. Your turn always shows on screen too.',
    buzz: 'Vibrate on my turn',
    buzzHint: 'On a phone that can.',
    keepAwake: 'Keep the screen on',
    keepAwakeHint: 'While this table is open, so the phone does not lock mid-hand.',
    handHints: 'Name my hand',
    handHintsHint: 'The name of what your cards make, such as "Pair of queens", under your cards.',
    muteEmotes: 'Mute emotes',
    muteEmotesHint: "Hides other players' reactions, phrases and throws.",
    // Peek (HoleCards): the viewer's own cards face down in the dock until a press, for a screen
    // others can see. Never a sentence that opens on "Hold".
    peek: 'Hide my cards until I press them',
    peekHint: 'Your cards stay face down until you press on them, for a screen others can see.',
    peekPrompt: 'Press on your cards to peek.',
    peekLabel: 'Your cards, face down: press to peek',
    shortcuts: OVERLAY_COPY.shortcuts,
    shortcutsHint: OVERLAY_COPY.shortcutsHint,
    // Asks to see a hand (ASK_COPY): the room keeps it for the player's seat.
    allowAsks: ASK_COPY.allow,
    allowAsksHint: ASK_COPY.allowHint,

    // The lobby's My look (lobby/MyLookPanel): the same, saved with the account.
    personalHeading: 'At every table',
    personalLead: 'Only you see these. Saved with your account, they follow you to any browser.',
    tablesHeading: 'Your tables',
    tablesLead: 'The scene and felt each new table of yours opens with. At the table you can change them for everyone.',
} as const;

// ==== P6: emotes (lib/poker-night/emotes.ts; components/poker-night EmoteLayer, EmotePicker, SeatMenu) ====

// Every id in lib/poker-night/emotes' registries has its words here (the copy test holds the keys
// equal). The phrases are friendly table talk, said as the player who sends them: never a verdict
// on a play ("good call"), never a comparison. A throwable's phrase is how a sentence names it.
const THROW_WORDS: Record<ThrowId, {label: string; phrase: string}> = {
    tomato: {label: 'Tomato', phrase: 'a tomato'},
    rose: {label: 'Rose', phrase: 'a rose'},
    soda: {label: 'Soda', phrase: 'a soda'},
    confetti: {label: 'Confetti', phrase: 'confetti'},
    cake: {label: 'Cake', phrase: 'a slice of cake'},
    egg: {label: 'Egg', phrase: 'an egg'},
    'tennis-ball': {label: 'Tennis ball', phrase: 'a tennis ball'},
    popcorn: {label: 'Popcorn', phrase: 'some popcorn'},
    heart: {label: 'Heart', phrase: 'a heart'},
    fish: {label: 'Fish', phrase: 'a fish'},
};

const REACTION_WORDS: Record<ReactionId, string> = {
    laugh: 'Laughing', wow: 'Surprised', cool: 'Cool', fire: 'On fire', clap: 'Applause', cry: 'Crying',
    think: 'Thinking', grimace: 'Grimacing', peek: "Can't look", party: 'Party', huff: 'Huffing', mad: 'Mad', sleepy: 'Sleepy',
};

const PHRASE_WORDS: Record<PhraseId, string> = {
    hi: 'Hi all', 'good-luck': 'Good luck', 'nice-hand': 'Nice hand', 'well-played': 'Well played', unlucky: 'Unlucky',
    'so-close': 'So close', wow: 'Wow', think: 'Thinking…', 'your-move': 'Your move', bluff: 'Was that a bluff?',
    'ship-it': 'Ship it', brb: 'Be right back', 'one-more': 'One more hand', thanks: 'Thanks', gg: 'GG', 'good-night': 'Good night',
};

// A phrase closed as a sentence: its own "?" or "…" kept, else a full stop.
const closed = (text: string): string => (/[.?!…]$/.test(text) ? text : `${text}.`);

export const EMOTE_COPY = {
    // The dock's button and the picker's three tabs.
    open: 'Emotes',
    tabsLabel: 'Kinds of emote',
    tabs: {react: 'React', say: 'Say', throw: 'Throw'},
    reactions: REACTION_WORDS,
    phrases: PHRASE_WORDS,
    throwables: THROW_WORDS,
    // Throwing from the picker: the thing first, then who gets it.
    pickTarget: (item: ThrowId): string => `Who gets ${THROW_WORDS[item].phrase}?`,
    noTargets: 'Nobody else is seated yet.',
    back: 'Back',
    // The host's switch is off: the Throw tab is not offered, and the picker says why.
    off: 'The host turned throwables off.',
    // A second emote inside the 1.2-second cooldown.
    cooldown: 'One moment before the next one.',
    seatedOnly: 'Take a seat to send emotes.',
    // A plate's menu (another player): one-tap throws and a mute for this visit.
    seatMenu: (name: string): string => `${isolate(name)}: emotes`,
    throwAt: (name: string): string => `Throw at ${isolate(name)}`,
    throwItemAt: (item: ThrowId, name: string): string => `Throw ${THROW_WORDS[item].phrase} at ${isolate(name)}`,
    mutePlayer: (name: string): string => `Mute ${isolate(name)}'s emotes`,
    showPlayer: (name: string): string => `Show ${isolate(name)}'s emotes`,
    muted: (name: string): string => `${isolate(name)}'s emotes are hidden until you leave the table.`,
    shown: (name: string): string => `${isolate(name)}'s emotes show again.`,
    // The personal switch (My look): every other player's emotes hidden and silent; your own still show.
    muteAll: 'Mute emotes',
    muteAllHint: "Hides every other player's reactions, phrases and throws on this screen. Yours still show.",
    // What a screen reader hears (the bursts themselves are hidden from it).
    reacted: (name: string, item: ReactionId): string => `${isolate(name)} reacts: ${REACTION_WORDS[item].toLowerCase()}.`,
    said: (name: string, item: PhraseId): string => `${isolate(name)} says: ${closed(PHRASE_WORDS[item])}`,
    threw: (from: string, item: ThrowId, to: string): string => `${isolate(from)} throws ${THROW_WORDS[item].phrase} at ${isolate(to)}.`,
    threwAtYou: (from: string, item: ThrowId): string => `${isolate(from)} throws ${THROW_WORDS[item].phrase} at you.`,
} as const;

// ---- keys (lib/poker-night/keys.ts SHORTCUTS; components/poker-night ShortcutsDialog) -----------

export const SHORTCUTS_COPY = {
    title: 'Keyboard shortcuts',
    open: 'Keyboard shortcuts',
    lead: 'With the focus on the table, one key does each of these. The question mark opens this list.',
    off: 'Single-key shortcuts are off in My look: only Enter and Escape act, in the raise panel and while throwing a card away.',
    groups: {turn: 'On your turn', discard: 'While throwing away a card', table: 'At the table'} satisfies Record<ShortcutGroup, string>,
    does: {
        fold: 'Fold',
        'check-call': 'Check or call',
        raise: 'Open a bet or a raise',
        'all-in': 'Set the raise to all in, or to the pot in PLO',
        sizes: 'A quick size, with the raise panel open',
        confirm: 'Confirm the raise',
        close: 'Close the raise panel',
        pick: 'Pick the first, second or third card',
        throw: 'Throw away the card picked',
        unpick: 'Pick again',
        emotes: 'Emotes',
        log: 'Hand log',
        bank: 'Bank',
        hands: 'Hand rankings and the rules',
        mute: 'Sounds on or off',
        shortcuts: 'This list',
    } satisfies Record<ShortcutId, string>,
    // The M key's answer.
    soundOn: 'Sounds on.',
    soundOff: 'Sounds off.',
} as const;

// ==== The Hands guide (lib/poker-night/hands-guide; components/poker-night HandsGuide, HandsDrawer; ====
// the lobby's Hands tab, app/(root)/poker-night ?tab=hands) ========================================

// What the guide says beyond the glossary entries it quotes word for word wherever it says what a
// term means (hand-rankings, kicker, texas-holdem, omaha, pot-limit in lib/learn/glossary.ts): the lobby's two views,
// the rankings' names in the guide's order (hands-guide RANKING_SLOTS), what the lifted cards are,
// the ties a kicker does not settle, and what each game is like at this table. An example's own
// hand is named by HAND_COPY.label. lib/learn/__tests__/poker-night-copy.test.ts holds these lines
// to say only what the quoted entries do not: no run of five words shared with any of them.
export const HANDS_COPY = {
    // The lobby's two views (?tab=), the table's menu item and its drawer.
    tabs: {play: 'Play', hands: 'Hands'},
    tabsLabel: 'Poker night views',
    menu: 'Hands',
    sheetTitle: 'Hands and games',

    // The rankings.
    heading: 'Hand rankings',
    lead: 'Strongest first. In each example, the cards that make the hand are lifted and outlined.',
    categories: {
        'royal-flush': 'Royal flush', 'straight-flush': 'Straight flush', 'four-of-a-kind': 'Four of a kind', 'full-house': 'Full house',
        flush: 'Flush', straight: 'Straight', 'three-of-a-kind': 'Three of a kind', 'two-pair': 'Two pair', pair: 'Pair', 'high-card': 'High card',
    } satisfies Record<RankingSlot, string>,
    // An example's five cards read aloud, then the ones that make the hand: "Queen of clubs, …, queen
    // of spades and seven of diamonds. The four queens make the hand." is said as the cards' names.
    example: (cards: readonly Card[], makes: readonly Card[]): string => {
        const all = capitalize(words(cards.map(cardWords)));
        if (makes.length === cards.length) return `${all}. All five make the hand.`;
        return `${all}. The ${words(makes.map(cardWords))} ${makes.length === 1 ? 'makes' : 'make'} the hand.`;
    },

    // Ties and kickers: the kicker's entry, an example of two hands it separates, then the ties.
    tiesHeading: 'Ties and kickers',
    firstHand: 'First hand',
    secondHand: 'Second hand',
    kickerCaption: 'Both hands make a pair of aces. The king is higher than the queen, so the first hand wins.',
    ties: [
        'When the board makes the strongest five for both players, they split the pot: a sixth or a seventh card never breaks a tie.',
        'Two hands exactly alike split the pot, whatever their suits.',
        'An ace counts high or low in a straight, but a straight never wraps round it: queen, king, ace, two, three is not one.',
    ],

    // The games: the one the table deals first, "At this table", then the others.
    gamesHeading: 'The games',
    atThisTable: 'At this table',
    games: {
        holdem: {
            name: "Texas hold'em",
            facts: [
                'The host sets the blinds, any ante and the turn timer; a change starts with the next hand.',
                'At a showdown every hand still in is shown, and the cards that play light up.',
                'A player who folded may still show their cards while the result is on screen.',
            ],
        },
        plo: {
            name: 'Pot-limit Omaha',
            facts: [
                'A flush needs two cards of the suit in your hand: one is not enough, however many the board shows.',
                'The strongest hand wins the pot; there is no low half.',
                'With two or three boards, each board is played on its own and the pot is split evenly between them: the strongest hand on each board wins that share, so one player can win one board, some or all of them.',
                'An odd chip goes to the first boards: board 1, then board 2.',
                'In the raise panel, Pot sets the largest bet or raise the limit allows, and A on a keyboard does the same.',
                'The host can switch the table to another game; the change starts with the next hand.',
            ],
        },
        'triple-t': {
            name: 'Triple T poker',
            facts: [
                'The blinds and any ante are posted first. Then every player still in throws a card away at the same time, and nobody sees the cards thrown away.',
                `The throw-away runs on the turn timer, never above ${numberWord(DISCARD_MAX_SECONDS)} seconds. If time runs out, a card is thrown away for you: the odd one out when two match, else the lowest.`,
                'A card thrown away for you does not count toward sitting you out.',
                'The betting then starts with the player after the big blind, as in Texas hold\'em.',
            ],
        },
    } satisfies Record<GuideGame, {name: string; facts: readonly string[]}>,
    // PLO's example (hands-guide PLO_EXAMPLE): four cards in hand, five on the board, the five that play
    // lifted.
    ploHand: 'In hand',
    ploBoard: 'On the board',
    ploExample: 'Four hearts on the board and one in this hand: no flush. This hand plays as a pair of aces.',
} as const;
