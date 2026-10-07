// Poker night's server state: one table, its seats, the hand in play, the night's ledger, and the
// actions that move it. Types only.
//
// The state is plain JSON all the way down, so it survives a Mongo round trip unchanged: no
// undefined, Map, Set or NaN; keyed collections are arrays; every chip amount is a safe integer
// (tsconfig targets ES2017, so no bigint). Its private parts — the deck, every unshown hole card,
// every pre-action — never leave the server: lib/poker-night/views.ts is the only way out, and the
// client's types are declared on their own in lib/poker-night/view-types.ts.
//
// Two lists are stored as number tuples to keep the room document small (budget.test.ts): a hand's
// log (LogEntry, read back as a HandEntry) and a ledger row's events (LedgerEvent).

import type {Card} from '@/lib/poker/cards';
import type {HandValue} from '@/lib/poker/evaluator';
import type {ENTRY_KINDS, FELT_IDS, LEDGER_KINDS, SCENE_IDS, STREETS} from '@/lib/poker-night/config';
import type {SettledPot} from '@/lib/poker-night/pots';

export type {Contribution, Pot, SettledPot} from '@/lib/poker-night/pots';
export type {HandDescription} from '@/lib/poker-night/hand-name';
export type {DeckSource} from '@/lib/poker-night/deck';

export type Street = (typeof STREETS)[number];
export type TableStatus = 'open' | 'playing' | 'paused' | 'closed';
export type RebuyPolicy = 'off' | 'auto' | 'approve';
export type SceneId = (typeof SCENE_IDS)[number];
export type FeltId = (typeof FELT_IDS)[number];

export type PreAction = {kind: 'check-fold'} | {kind: 'check'} | {kind: 'call'; amount: number} | {kind: 'call-any'};

// What the host sets: the seat count is fixed at creation, the rest applies from the next hand
// (the blinds and ante are copied into a hand when it is dealt).
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
};

// What everyone sees and the host changes at once.
export type RoomSettings = {name: string; scene: SceneId; felt: FeltId; throwables: boolean; locked: boolean; showToFriends: boolean};

export type Seat = {
    pid: string;
    stack: number; // chips behind: the only home of a seated player's chips outside the pot
    sittingOut: boolean; // not dealt in
    sitOutNext: boolean; // asked during a hand; sat out at the next deal
    away: boolean; // checks or folds at once; sat out at the next deal
    timeouts: number; // consecutive; any move of their own resets it
    owesPost: boolean; // posts one big blind when next dealt in
    leaving: boolean; // left or removed during a hand; cashed out when it completes
    removed: boolean; // the leaving was the host's removal (the ledger says "removed")
    pendingBuy: number; // chips that land when the running hand completes
};

export type BuyKind = 'buy-in' | 'rebuy' | 'top-up';
export type LedgerKind = (typeof LEDGER_KINDS)[number];

// [at, kind, amount]: at in ms since the table was created, kind an index into LEDGER_KINDS.
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
    hole: [Card, Card]; // PRIVATE until shown
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
// The first six fields are the wire's WireEntry. A 'void' entry belongs to the table: seat −1.
export type LogEntry = [seat: number, kind: number, amount: number, to: number, flags: number, street: number, at: number];

// The same line read back.
export type HandEntry = {seat: number; street: Street; kind: EntryKind; amount: number; to: number; allIn: boolean; timeout: boolean; auto: boolean; at: number};

// value null when fewer than three board cards were out; best the five cards that play.
export type ShownHand = {seat: number; cards: [Card, Card]; value: HandValue | null; best: Card[]};

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
    button: number;
    smallBlindSeat: number;
    bigBlindSeat: number;
    smallBlind: number;
    bigBlind: number;
    ante: number;
    seats: HandSeat[]; // hand order: clockwise from the seat after the button, the button last
    deck: Card[]; // PRIVATE: the five board cards, revealed street by street
    board: Card[];
    street: Street;
    phase: 'betting' | 'runout' | 'complete';
    currentBet: number; // preflop the big blind, even when the big blind is short
    increment: number; // the last full bet or raise this street; starts at the big blind
    lastAggressor: number | null;
    actor: number | null;
    deadline: number | null;
    nextStreetAt: number | null;
    log: LogEntry[]; // the latest KEEP.LOG_SUMMARY entries
    logDropped: number; // entries dropped from the front to keep that cap
    result: HandResult | null;
};

// A completed hand as history keeps it (PokerHand). Every dealt hole is here, so it is PRIVATE:
// historyView keeps only the shown ones and the viewer's own.
export type HandSummary = {
    no: number;
    startedAt: number;
    completedAt: number;
    button: number;
    smallBlind: number;
    bigBlind: number;
    ante: number;
    board: Card[]; // the revealed board only
    players: {seat: number; pid: string; startStack: number; net: number; hole: [Card, Card]; shown: boolean}[];
    log: HandEntry[]; // at most KEEP.LOG_SUMMARY, the latest
    truncated: boolean;
    pots: SettledPot[];
    hands: ShownHand[];
};

export type TableState = {
    v: 1;
    status: TableStatus;
    closing: boolean;
    config: GameConfig;
    configV: number;
    settings: RoomSettings;
    hostPid: string;
    seats: (Seat | null)[];
    ledger: LedgerRow[];
    requests: {pid: string; amount: number; at: number}[]; // one per player, waiting for the host
    lastBigBlind: number | null;
    button: number | null;
    handNo: number;
    turn: number; // bumps every time a player is put on the clock
    hand: Hand | null; // running, or the last complete one (shown in the pause)
    nextHandAt: number | null;
    createdAt: number;
};

export type Move = {kind: 'fold'} | {kind: 'check'} | {kind: 'call'} | {kind: 'raise'; to: number} | {kind: 'all-in'};

export type HostOp =
    | {op: 'start' | 'pause' | 'resume' | 'end'}
    | {op: 'config'; patch: Partial<Omit<GameConfig, 'seats'>>}
    | {op: 'settings'; patch: Partial<RoomSettings>}
    | {op: 'approve' | 'deny' | 'kick'; pid: string};

export type TableAction =
    | {type: 'sit'; by: string; seat: number; buyIn: number; at: number}
    | {type: 'leave' | 'sit-out' | 'sit-in' | 'show'; by: string; at: number}
    | {type: 'buy'; by: string; amount: number; at: number}
    | {type: 'act'; by: string; turn: number; move: Move; at: number}
    | {type: 'pre'; by: string; pre: PreAction | null; at: number}
    | {type: 'host'; by: string; op: HostOp; at: number}
    // Clock only: built by lib/poker-night/clock.advance, never parsed from a request.
    | {type: 'timeout'; turn: number; at: number}
    | {type: 'deal-street'; at: number}
    | {type: 'start-hand'; deck: Card[]; draw: number; at: number};

export type Refusal =
    | 'closed' | 'not-now' | 'not-host' | 'not-seated' | 'already-seated' | 'seat-taken' | 'bad-seat' | 'bad-amount'
    | 'below-buy-in' | 'over-cap' | 'rebuys-off' | 'rebuy-cap' | 'no-request' | 'not-your-turn' | 'stale' | 'illegal'
    | 'below-min-raise' | 'bad-config' | 'bad-deck' | 'not-due';

// hands: every hand this step completed (or showed cards in), for PokerHand. ledgerDirty: a figure
// a PokerResult row carries moved. kicked: the pid the host just removed, for the room to ban.
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
