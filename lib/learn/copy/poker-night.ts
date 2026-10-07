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
import type {FaceId} from "@/lib/poker-night/avatar";
import {CODE_LENGTH} from "@/lib/poker-night/code";
import {KEEP, TABLE_LIMITS} from "@/lib/poker-night/config";
import type {HandDescription} from "@/lib/poker-night/hand-name";
import type {PokerNightErrorCode} from "@/lib/poker-night/http";
import {LIMITS} from "@/lib/poker-night/limits";
import {NAME_MAX_GRAPHEMES} from "@/lib/poker-night/names";
import type {EntryKind, LedgerKind, PreAction, RebuyPolicy, Refusal, Street} from "@/lib/poker-night/types";
import type {SeatState} from "@/lib/poker-night/view-types";
import {capitalize, numberWord} from "@/lib/text";

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

    // The join card (a Panel over the live table): the table's terms, a name prefilled from the
    // account or this browser, a pre-rolled look, and one tap to sit.
    lead: 'Pick a name and a look, then take a seat.',
    terms: (smallBlind: number, bigBlind: number, chips: number): string => `Blinds ${count(smallBlind)}/${count(bigBlind)} · ${count(chips)} chips to start`,
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

// ==== P3: the lobby, the table and its overlays ================================================

// ---- the lobby and the /games card (app/(root)/poker-night, components/poker-night/lobby) ------

export const POKER_NIGHT_COPY = {
    title: 'Poker night',
    subtitle: "Texas hold'em with friends: start a table, share the link, and play for chips.",
    note: 'Play chips only. No cash value, and nothing is paid out.',
    // POKER_NIGHT_ENABLED=false.
    off: 'Poker night is switched off for now.',

    // The card on /games.
    cardTitle: 'Poker night',
    cardBody: "Texas hold'em for play chips at a table you share by link: friends join from a phone, with no account needed.",
    cardCta: 'Open poker night',

    // Starting a table: one tap with the defaults, or the form first.
    quickStart: 'Start a table',
    quickStartHint: (smallBlind: number, bigBlind: number, chips: number, seats: number): string =>
        `Blinds ${count(smallBlind)}/${count(bigBlind)}, ${count(chips)} chips each, up to ${numberWord(seats)} seats. Everything can be changed at the table.`,
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

    // The host's own open tables.
    openHeading: 'Your open tables',
    openEmpty: 'No table is open. Start one and share the link.',
    openRow: (seated: number, seats: number, hands: number): string =>
        `${count(seated)} of ${count(seats)} seats taken · ${hands === 0 ? 'no hand dealt yet' : `${plural(hands, 'hand', 'hands')} played`}`,
    open: 'Open',

    // Open tables friends chose to show to friends (the panel is hidden when there are none).
    friendsHeading: "Friends' tables",
    friendsLead: 'Open tables your friends chose to show you.',
    friendsRow: (host: string, seated: number, seats: number): string => `Hosted by ${isolate(host)} · ${count(seated)} of ${count(seats)} seats taken`,

    // The reader's own nights (PokerResult rows), as hands played and net chips.
    recentHeading: 'Recent nights',
    recentEmpty: 'A night shows here once its table closes.',
    recentRow: (hands: number, net: number): string => `${plural(hands, 'hand', 'hands')} · net ${signed(net)}`,
    recentOpen: 'Still open',
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
    shareText: (table: string): string => `Pull up a chair at ${isolate(table)}. Play chips only.`,
    qrLabel: 'QR code of the table link',
    qrCaption: 'Point a phone camera here to open the table.',
    qrShow: 'Show QR code',
    qrHide: 'Hide QR code',
    codeLabel: 'Table code',
    // The code in two groups of three, for reading aloud: "K7Q XM4".
    codeGrouped: (code: string): string => `${code.slice(0, 3)} ${code.slice(3)}`,
    deal: 'Deal the first hand',
    needTwo: 'The first hand is dealt once two players are seated.',
    ogDescription: "Texas hold'em for play chips. Open the link to take a seat.",
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

    // The top bar and its menu.
    menu: 'Table menu',
    invite: INVITE_COPY.open,
    bank: 'Bank',
    log: 'Hand log',
    host: 'Host controls',
    leaveTable: 'Leave table',
    handNo: (n: number): string => `Hand ${count(n)}`,
    watchers: (n: number): string => plural(n, 'watcher', 'watchers'),
    connection: {live: 'Live', polling: 'Updating every few seconds', reconnecting: 'Reconnecting…', back: 'Back online.'},

    // The seats (a list labelled "Seats"). A seat is its index, printed from 1.
    seatsLabel: 'Seats',
    seat: (seat: number): string => `Seat ${seatNo(seat)}`,
    openSeat: 'Open seat',
    openSeatLabel: (seat: number): string => `Seat ${seatNo(seat)}, open`,
    sitHere: 'Sit here',
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

    // The winner's banner; the hand's name sits under it (HAND_COPY.label).
    banner: (name: string, n: number): string => `${isolate(name)} wins ${count(n)}`,
    bannerYou: (n: number): string => `You win ${count(n)}`,
    bannerSplit: (players: readonly string[]): string => `Split pot: ${names(players)}`,

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
    showCards: 'Show my cards',

    // Leaving.
    leaveTitle: 'Leave the table?',
    leaveBody: (n: number): string => `Your ${plural(n, 'chip is', 'chips are')} counted in the bank as you leave.`,
    leaveInHand: 'Your hand folds the next time it faces a bet, and your chips are counted once it ends.',
    leave: 'Leave',
    stay: 'Stay',

    // The error page (app/(play)/error.tsx), an unknown code (not-found.tsx) and a newer deploy.
    errorTitle: 'The table could not load',
    errorBody: 'Your seat and your chips are kept at the table. Try again to load it.',
    retry: 'Try again',
    notFoundTitle: 'No table here',
    notFound: POKER_NIGHT_ERRORS.not_found,
    toLobby: 'Back to poker night',
    reload: 'Reload',
} as const;

// ---- the hand log (components/poker-night/HandLog) ---------------------------------------------

// Which pot a line is about: null when the hand had one pot, 0 the main pot, 1 the first side pot.
export type PotIndex = number | null;
const fromPot = (pot: PotIndex): string => (pot === null ? '' : pot === 0 ? ' from the main pot' : ` from side pot ${count(pot)}`);
const splitName = (pot: PotIndex): string => (pot === null ? 'Split pot' : pot === 0 ? 'Main pot split' : `Side pot ${count(pot)} split`);

export const LOG_COPY = {
    heading: 'Hand log',
    empty: 'The log fills in once a hand is dealt.',
    hand: (n: number): string => `Hand ${count(n)}`,
    blinds: (smallBlind: number, bigBlind: number, ante: number): string =>
        `Blinds ${count(smallBlind)}/${count(bigBlind)}${ante ? `, ante ${count(ante)}` : ''}`,
    street: (street: Exclude<Street, 'preflop'>, cards: string): string => `${capitalize(street)}: ${cards}`,
    // One line: "Ana calls 40.", "Ana raises to 340, all in.", "Ben folds as time ran out."; a hand
    // called off is the table's own line and takes no name.
    line: (name: string, kind: EntryKind, amount: number, allIn: boolean, timedOut = false): string =>
        kind === 'void'
            ? `${capitalize(DOES.void(''))}.`
            : `${isolate(name)} ${ACTION_COPY.does(kind, amount, allIn)}${timedOut ? ' as time ran out' : ''}.`,
    shows: (name: string, cards: string, phrase: string | null): string => `${isolate(name)} shows ${cards}${phrase ? `: ${phrase}` : ''}.`,
    youHeld: (cards: string): string => `You held ${cards}.`,
    // "Ana wins 1,200 with two pair, kings and sevens.", "Ben wins 400 from side pot 1."
    wins: (name: string, n: number, phrase: string | null, pot: PotIndex = null): string =>
        `${isolate(name)} wins ${count(n)}${fromPot(pot)}${phrase ? ` with ${phrase}` : ''}.`,
    // Share by share, never "each": an odd chip makes the shares differ.
    split: (shares: readonly {name: string; amount: number}[], pot: PotIndex = null): string =>
        `${splitName(pot)}: ${shares.map((s) => `${isolate(s.name)} takes ${count(s.amount)}`).join(', ')}.`,
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
    dealt: ([a, b]: readonly [Card, Card]): string => `You have the ${cardWords(a)} and the ${cardWords(b)}.`,
    street: (street: Exclude<Street, 'preflop'>, cards: readonly Card[]): string => `${capitalize(street)}: ${words(cards.map(cardWords))}.`,
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

// ---- the host drawer (components/poker-night/HostDrawer, RemovePlayerDialog) -------------------

const REMOVED = 'Removed by host';

// The rebuy policy as the drawer's segmented control reads it (GameConfig.rebuys).
const REBUY_POLICY: Record<RebuyPolicy, string> = {off: 'Off', auto: 'On', approve: 'Host approves'};

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
    },

    // Rebuys, and the requests waiting on the host (a dot on the menu icon, rows in the bank).
    rebuys: 'Rebuys',
    rebuysValue: REBUY_POLICY,
    rebuyLimitLabel: 'Rebuys per player',
    rebuyLimit: (n: number | null): string => (n === null ? 'No limit' : `Up to ${count(n)} each`),
    requestsHeading: 'Waiting for you',
    requests: (n: number): string => `${plural(n, 'request', 'requests')} waiting`,
    request: (name: string, n: number): string => `${isolate(name)} asks for ${plural(n, 'chip', 'chips')}.`,
    approve: 'Approve',
    decline: 'Decline',

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
    ownInPot: (n: number): string => `Counting ${count(n)} in this pot.`,
    addChips: (n: number): string => `Add ${plural(n, 'chip', 'chips')}`,
    otherAmount: 'Other amount',
    amountLabel: 'Chips to add',
    amountRule: (min: number, max: number): string => `From ${count(min)} to ${count(max)}.`,
    requested: (n: number): string => `Asked the host for ${plural(n, 'chip', 'chips')}.`,
    pending: (n: number): string => `${plural(n, 'chip joins', 'chips join')} your stack when this hand ends.`,
    approved: (n: number): string => `${plural(n, 'chip', 'chips')} added to your stack.`,
    declined: 'The host declined the request.',
    rebuysUsed: (used: number, max: number): string => `Rebuys used: ${count(used)} of ${count(max)}.`,
} as const;

// ---- the end of the night (components/poker-night/NightSummary) --------------------------------

// What "Copy summary" puts on the clipboard: the table and date, the length, one line per player
// by net, and the footer.
export type SummaryTextInput = {
    table: string;
    date: string;
    hands: number;
    minutes: number;
    standings: readonly {name: string; net: number; removed: boolean}[];
};

const SUMMARY_FOOTER = 'Play chips only. No cash value.';
const summaryWhen = (table: string, date: string): string => `${isolate(table)} · ${date}`;
const summaryLength = (hands: number, minutes: number): string => `${plural(hands, 'hand', 'hands')} in ${duration(minutes)}`;

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
    guestNudge: 'With an account, the nights you play are kept under Recent nights.',
    guestNudgeLink: 'Create an account',
    footer: SUMMARY_FOOTER,
    text: ({table, date, hands, minutes, standings}: SummaryTextInput): string => [
        summaryWhen(table, date),
        summaryLength(hands, minutes),
        ...standings.map((row) => `${isolate(row.name)}: ${signed(row.net)}${row.removed ? ` (${REMOVED.toLowerCase()})` : ''}`),
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
// InviteSheet, BankPanel, HostDrawer, RemovePlayerDialog, HandLog, MyLookSheet, NightSummary) ======

// What the overlays say beyond the tables above, which they quote for everything else: the drawers'
// shared words, the top bar's own-seat choices, a watcher taking a seat, the look drawer until the
// builder arrives (P5), the bank's own-chips panel, the host drawer's section list and the
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

    // My look, until the builder (P5): the name and the rolled look the table sees.
    lookLead: 'Your name and look, as everyone at this table sees them. They change between hands.',
    lookSave: 'Save',
    lookSaved: 'Saved.',

    // My look's keyboard switch (WCAG 2.1.4: single-key shortcuts can be turned off), kept in this
    // browser only.
    shortcuts: 'Single-key shortcuts',
    shortcutsHint: 'F folds, C checks or calls, R opens a bet or a raise, A sets all in, and 1 to 4 pick a size. Off, only the buttons act; Enter and Escape still work in the raise panel.',

    // The bank's own-chips panel.
    yourChips: 'Your chips',
    addChips: 'Add chips',

    // The host drawer's sections, as a list of tabs.
    sectionsLabel: 'Host control sections',

    // The night summary's first column.
    place: 'Place',
} as const;

// ==== P3: the felt (components/poker-night PotDisplay) ===========================================

// What the felt says beyond TABLE_COPY: the side pots past the few the pot's place has room for,
// in one pill ("3 more side pots: 2,340").
export const FELT_COPY = {
    morePots: (pots: number, chips: number): string => `${plural(pots, 'more side pot', 'more side pots')}: ${count(chips)}`,
} as const;
