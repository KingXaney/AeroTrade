// Poker night's server state: one table, its seats, the hand in play, the night's ledger, and the
// actions that move it. Types only.
//
// The state is plain JSON all the way down, so it survives a Mongo round trip unchanged: no
// undefined, Map, Set or NaN; keyed collections are arrays; every chip amount is a safe integer
// (tsconfig targets ES2017, so no bigint). Its private parts — the decks, every unshown hole card,
// every thrown-away card, every pre-action, a seat's plan to leave after the hand, the asks to see
// a hand and who turned asks off — never leave the server: lib/poker-night/views.ts is the only way
// out, and the client's types are declared on their own in lib/poker-night/view-types.ts.
//
// Three lists are stored as number tuples to keep the room document small (budget.test.ts): a hand's
// log (LogEntry, read back as a HandEntry), a ledger row's events (LedgerEvent) and a hand's asks
// (AskEntry).

import type {Card} from '@/lib/poker/cards';
import type {HandValue} from '@/lib/poker/evaluator';
import type {ASK_ANSWERS, ENTRY_KINDS, FELT_IDS, LEDGER_KINDS, REBUY_POLICIES, SCENE_IDS, STREETS, VARIANTS} from '@/lib/poker-night/config';
import type {SettledPot} from '@/lib/poker-night/pots';

export type {Contribution, Pot, SettledPot} from '@/lib/poker-night/pots';
export type {HandDescription} from '@/lib/poker-night/hand-name';
export type {DeckSource} from '@/lib/poker-night/deck';

export type Street = (typeof STREETS)[number];
export type TableStatus = 'open' | 'playing' | 'paused' | 'closed';
export type RebuyPolicy = (typeof REBUY_POLICIES)[number];
export type Variant = (typeof VARIANTS)[number];
export type BoardCount = 1 | 2 | 3;
export type SceneId = (typeof SCENE_IDS)[number];
export type FeltId = (typeof FELT_IDS)[number];

export type PreAction = {kind: 'check-fold'} | {kind: 'check'} | {kind: 'call'; amount: number} | {kind: 'call-any'};

// What the host sets: the seat count is fixed at creation, the rest applies from the next hand
// (the blinds, the ante and the game are copied into a hand when it is dealt).
export type GameConfig = {
    seats: number;
    smallBlind: number;
    bigBlind: number;
    ante: number;
    buyInMin: number;
    buyInMax: number; // also the cap a top-up may reach
    rebuys: RebuyPolicy;
    maxRebuys: number | null;
    turnSeconds: number;
    pauseSeconds: number;
    sitOutAfter: number; // consecutive timeouts that make a player away
    variant: Variant;
    boards: BoardCount; // more than one for PLO only
};

// What everyone sees and the host changes at once.
export type RoomSettings = {name: string; scene: SceneId; felt: FeltId; throwables: boolean; locked: boolean; showToFriends: boolean};

export type Seat = {
    pid: string;
    stack: number; // chips behind: the only home of a seated player's chips outside the pot
    sittingOut: boolean; // not dealt in
    sitOutNext: boolean; // asked during a hand; sat out at the next deal. PRIVATE while the hand is live
    away: boolean; // checks or folds at once; sat out at the next deal
    timeouts: number; // consecutive; any move of their own resets it
    owesPost: boolean; // posts one big blind when next dealt in
    leaving: boolean; // left or removed during a hand; cashed out when it completes
    removed: boolean; // the leaving was the host's removal (the ledger says "removed")
    pendingBuy: number; // chips that land when the running hand completes
    // PRIVATE: plays the live hand out as usual and is cashed out when it completes. Set only while
    // dealt into a live hand; never with sitOutNext.
    leaveAfter: boolean;
};

export type BuyKind = 'buy-in' | 'rebuy' | 'top-up';
export type LedgerKind = (typeof LEDGER_KINDS)[number];

// [at, kind, amount]: at in whole seconds since the table was created, kind an index into
// LEDGER_KINDS. (Version 1 kept milliseconds; migrate.v1ToV2 divides.)
export type LedgerEvent = [at: number, kind: number, amount: number];

export type LedgerRow = {
    pid: string;
    bought: number;
    cashedOut: number;
    buys: number; // buys after the first: rebuys, top-ups, re-sits
    events: LedgerEvent[]; // the last KEEP.LEDGER_EVENTS; the totals stay exact
    hands: number; // hands dealt in
    wins: number; // hands that paid them something
    biggestWin: number; // the most chips one hand paid them
    allIns: number; // hands in which they were all in
    peakChips: number; // the most chips they held between hands
};

export type HandSeat = {
    seat: number;
    pid: string;
    hole: Card[]; // PRIVATE until shown: 2 (hold'em), 4 (PLO), 3 then 2 (Triple T), in dealt order
    startStack: number; // before antes and blinds
    committed: number; // every street, antes included
    streetBet: number;
    actedAtBet: number | null; // the hand's current bet right after this player's last move this street
    folded: boolean;
    allIn: boolean;
    shown: boolean;
    pre: (PreAction & {atBet: number}) | null; // PRIVATE
};

export type EntryKind = (typeof ENTRY_KINDS)[number];

// One line of a hand's log as stored: kind and street are indexes into ENTRY_KINDS and STREETS,
// flags are ENTRY_FLAGS, `to` is the seat's street bet after it, and at is ms since the hand started
// (a request received just before the deal but processed after it lands a little below zero).
// The first six fields are the wire's WireEntry. A 'void' entry belongs to the table: seat −1. A
// 'discard' line never names the card.
export type LogEntry = [seat: number, kind: number, amount: number, to: number, flags: number, street: number, at: number];

// The same line read back.
export type HandEntry = {seat: number; street: Street; kind: EntryKind; amount: number; to: number; allIn: boolean; timeout: boolean; auto: boolean; at: number};

// A hand turned face up: its cards. Its value and the five cards that play on each board follow from
// them and the boards (lib/poker-night/variants.readShown), never stored. A Triple T hand shows the
// two it kept — never the card thrown away.
export type ShownHand = {seat: number; cards: Card[]};

export type AskAnswer = (typeof ASK_ANSWERS)[number];

// PRIVATE: one ask to see a hand once it completed — [from, to, at, answer]: the seats (in the
// hand) of the player who asked and the player asked, ms since the hand started, an index into
// ASK_ANSWERS. Only the two of them ever see it; 'shown' lets the one who asked see the other's
// cards, in their view and their history. Every ask ends with the hand (the next deal).
export type AskEntry = [from: number, to: number, at: number, answer: number];

// PRIVATE: after a no (or no answer), `from` may not ask `to` again until a hand numbered above
// `untilHand` has completed.
export type AskCooldown = [from: string, to: string, untilHand: number];

export type HandResult = {
    completedAt: number;
    showdown: boolean;
    refund: {seat: number; amount: number} | null;
    pots: SettledPot[];
    hands: ShownHand[]; // shown hands only, in show order
    showOrder: number[];
    nets: {seat: number; net: number}[];
    revealMs: number;
};

export type Hand = {
    no: number;
    startedAt: number;
    variant: Variant; // the hand's own game, copied from the config at the deal
    button: number;
    smallBlindSeat: number;
    bigBlindSeat: number;
    smallBlind: number;
    bigBlind: number;
    ante: number;
    seats: HandSeat[]; // hand order: clockwise from the seat after the button, the button last
    deck: Card[][]; // PRIVATE: one five-card run per board, revealed street by street
    boards: Card[][]; // what is out of each run: all the same length, 0, 3, 4 or 5
    discards: [seat: number, card: Card][]; // PRIVATE: Triple T's thrown-away cards, in the order thrown
    street: Street;
    phase: 'discard' | 'betting' | 'runout' | 'complete';
    currentBet: number; // preflop the big blind, even when the big blind is short
    increment: number; // the last full bet or raise this street; starts at the big blind
    lastAggressor: number | null;
    actor: number | null;
    deadline: number | null;
    nextStreetAt: number | null;
    log: LogEntry[]; // the latest KEEP.LOG_SUMMARY entries
    logDropped: number; // entries dropped from the front to keep that cap
    result: HandResult | null;
    asks: AskEntry[]; // PRIVATE: asks to see a hand, made once it completed
};

// A completed hand as history keeps it (PokerHand). Every dealt hole is here, so it is PRIVATE:
// historyView keeps only the shown ones, the viewer's own and those shown to the viewer alone
// (seenBy), and a thrown-away card only for its owner.
export type HandSummary = {
    no: number;
    startedAt: number;
    completedAt: number;
    variant: Variant;
    button: number;
    smallBlind: number;
    bigBlind: number;
    ante: number;
    boards: Card[][]; // the revealed boards only
    players: {
        seat: number; pid: string; startStack: number; net: number; hole: Card[]; shown: boolean;
        discard: Card | null; // Triple T: the card thrown away
        seenBy: string[]; // who this hand was shown to alone, answering their ask
    }[];
    log: HandEntry[]; // at most KEEP.LOG_SUMMARY, the latest
    truncated: boolean;
    pots: SettledPot[];
    hands: ShownHand[];
};

export type TableState = {
    v: 2;
    status: TableStatus;
    closing: boolean;
    config: GameConfig;
    configV: number;
    settings: RoomSettings;
    hostPid: string;
    seats: (Seat | null)[];
    ledger: LedgerRow[];
    // One per player, waiting for the host: once the first hand is dealt, every buy but the host's
    // (a newcomer's first chips, a re-sit, a rebuy, a top-up) waits here until approved, declined,
    // withdrawn or its player leaves, in the order asked. (Version 1 stamped each with its time,
    // which nothing read: version 2 keeps none.)
    requests: {pid: string; amount: number}[];
    lastBigBlind: number | null;
    button: number | null;
    handNo: number;
    turn: number; // bumps every time a player is put on the clock
    hand: Hand | null; // running, or the last complete one (shown in the pause)
    nextHandAt: number | null;
    createdAt: number;
    noAsks: string[]; // PRIVATE: players who turned off "Let others ask to see my cards"
    askCooldowns: AskCooldown[]; // PRIVATE: with the waiting asks, at most ASKS.COOLDOWNS_KEPT (asks.asksFull)
};

export type Move = {kind: 'fold'} | {kind: 'check'} | {kind: 'call'} | {kind: 'raise'; to: number} | {kind: 'all-in'};

export type HostOp =
    | {op: 'start' | 'pause' | 'resume' | 'end'}
    | {op: 'config'; patch: Partial<Omit<GameConfig, 'seats'>>}
    | {op: 'settings'; patch: Partial<RoomSettings>}
    | {op: 'approve' | 'deny' | 'kick'; pid: string}
    // Sits a seated player other than the host out: from the next deal while they are in the hand in
    // play, at once between hands. Only ever out: the state never says who asked for a sit-out, so
    // nothing the host sends takes one back — dealing a player back in is theirs alone.
    | {op: 'sit-out'; pid: string};

// How an asked player answers: their cards to the one who asked alone, to everyone (a show), or no.
export type AskReply = 'one' | 'all' | 'none';

export type TableAction =
    // hostAway: set by the room alone (never parsed from a request) when the host has been away
    // LIMITS.hostTakeoverMs: the chips land without the host's yes.
    | {type: 'sit'; by: string; seat: number; buyIn: number; at: number; hostAway?: boolean}
    | {type: 'leave' | 'sit-out' | 'sit-in' | 'show' | 'withdraw'; by: string; at: number}
    | {type: 'buy'; by: string; amount: number; at: number; hostAway?: boolean}
    | {type: 'act'; by: string; turn: number; move: Move; at: number}
    | {type: 'pre'; by: string; pre: PreAction | null; at: number}
    | {type: 'host'; by: string; op: HostOp; at: number}
    // Leave the table when the hand in play completes (on), or stay after all (off).
    | {type: 'leave-after'; by: string; on: boolean; at: number}
    // Ask `to` to see their cards of the hand just completed; answer an ask from `to`.
    | {type: 'ask'; by: string; to: string; at: number}
    | {type: 'reply'; by: string; to: string; show: AskReply; at: number}
    // "Let others ask to see my cards", on or off.
    | {type: 'allow-asks'; by: string; on: boolean; at: number}
    // Clock only: built by lib/poker-night/clock.advance, never parsed from a request.
    | {type: 'timeout'; turn: number; at: number}
    | {type: 'deal-street'; at: number}
    | {type: 'start-hand'; deck: Card[]; draw: number; at: number};

export type Refusal =
    | 'closed' | 'not-now' | 'not-host' | 'not-seated' | 'already-seated' | 'seat-taken' | 'bad-seat' | 'bad-amount'
    | 'below-buy-in' | 'over-cap' | 'rebuys-off' | 'rebuy-cap' | 'no-request' | 'not-your-turn' | 'stale' | 'illegal'
    | 'below-min-raise' | 'bad-config' | 'bad-deck' | 'not-due'
    | 'asks-off' | 'ask-waiting' | 'ask-limit' | 'ask-cooldown' | 'asks-full';

// hands: every hand this step completed (or showed cards in, or answered an ask about), for
// PokerHand. ledgerDirty: a figure a PokerResult row carries moved. kicked: the pid the host just
// removed, for the room to ban.
export type Reduced =
    | {ok: true; state: TableState; hands: HandSummary[]; ledgerDirty: boolean; kicked: string | null}
    | {ok: false; reason: Refusal};

// raise.min and raise.max are street totals ("raise to").
export type Legal = {fold: true; check: boolean; call: number; callAllIn: boolean; raise: {kind: 'bet' | 'raise'; min: number; max: number} | null};

export type Due = {kind: 'timeout'; at: number; turn: number} | {kind: 'street'; at: number} | {kind: 'start'; at: number};

// The reducer's working copy: a private clone of the state that the step's helpers mutate, the
// time the step happens at, and what it produced. Nothing outside the engine holds one.
export type Work = {state: TableState; at: number; hands: HandSummary[]; ledgerDirty: boolean};

export type {Card, HandValue};
