// What a browser is sent about a poker night table: the client's contract. Declared here on their
// own, never derived from the server's state types (no Omit<> of a TableState), so a field added to
// the server state never reaches a client by accident — and there is no deck anywhere in them. Every
// value of these types is built field by field in lib/poker-night/views.ts.

import type {Card} from '@/lib/poker/cards';
import type {ErrorBody} from '@/lib/poker-night/http';
import type {EntryKind, GameConfig, LedgerKind, PreAction, RoomSettings, Street, TableStatus} from '@/lib/poker-night/types';

export type SeatState = 'waiting' | 'in-hand' | 'folded' | 'all-in' | 'sitting-out' | 'away' | 'busted' | 'leaving';
export type CardsView = 'hidden' | 'none' | [Card, Card];
export type Presence = 'here' | 'hidden' | 'offline';

// A seat's number is its index in TableView.seats.
export type SeatView = {
    pid: string;
    chips: number; // the stack behind
    bet: number; // this street
    acted: number | null; // the bet they last acted at this street
    inPot: number; // everything they have put into the live hand, every street
    state: SeatState;
    cards: CardsView;
    owesPost: boolean;
    pendingBuy: number;
    timeouts: number;
    presence: Presence;
};

// [seat, kind, amount, to, flags, street]: kind an index into WIRE_KINDS, flags 1 all in, 2 the
// clock's move, 4 made for them (away or a pre-action), street 0–3.
export type WireEntry = [seat: number, kind: number, amount: number, to: number, flags: number, street: number];

export type PotView = {amount: number; eligible: number[]};
export type SettledPotView = PotView & {winners: number[]; shares: number[]};
// A pot as the result pays it: the shares line up with the winners, the main pot first.
export type PaidPotView = {amount: number; winners: number[]; shares: number[]};
// A shown hand on the wire is its cards: the value and the five cards that play follow from them
// and the board (views.readShownHand runs the server's own hand-name functions).
export type ShownCardsView = {seat: number; cards: [Card, Card]};
export type ShownHandView = ShownCardsView & {value: number | null; best: Card[]};

export type HandResultView = {
    completedAt: number;
    showdown: boolean;
    refund: {seat: number; amount: number} | null;
    pots: PaidPotView[];
    hands: ShownCardsView[]; // shown only, in show order
    nets: {seat: number; net: number}[];
    revealMs: number;
};

export type HandView = {
    no: number;
    phase: 'betting' | 'runout' | 'complete';
    street: Street;
    board: Card[];
    pots: PotView[]; // as they stand; none once the hand is complete (the result holds what each paid)
    currentBet: number;
    increment: number;
    actor: number | null;
    deadline: number | null;
    nextStreetAt: number | null;
    button: number; // seat numbers of the button and the blinds
    sb: number;
    bb: number;
    logTail: WireEntry[];
    logLength: number;
    result: HandResultView | null;
};

// The bank's totals per player. Their chips, what is in the pot and the net follow from the seats
// (views.bankOf), so the wire carries each figure once.
export type LedgerView = {pid: string; bought: number; cashedOut: number; buys: number};
export type BankRowView = LedgerView & {chips: number; inPot: number; net: number; seated: boolean};

// The table as the engine alone can describe it.
export type TableView = {
    v: 1;
    status: TableStatus;
    closing: boolean;
    settings: RoomSettings;
    configV: number;
    hostPid: string;
    handNo: number;
    turn: number;
    nextHandAt: number | null;
    seats: (SeatView | null)[];
    hand: HandView | null;
    ledger: LedgerView[];
    requests: {pid: string; amount: number}[];
};

export type Person = {name: string; avatar: string};
export type People = Record<string, Person>;

// What the room adds: its code and version, the time, who is here, who leads the clock, and the
// version of its people (peopleV).
export type ViewMeta = {
    code: string;
    seq: number;
    serverNow: number;
    nextDueAt: number | null;
    clockLeader: string | null;
    presence: Record<string, Presence>;
    watchers: number;
    realtimeOk: boolean;
    peopleV: number;
};

// The public table, the same for every viewer: the Ably message and the base of every response.
// Names and looks are not in it: they travel beside it as the people part (PeopleView), versioned
// by peopleV, so the message keeps to its budget and a client that has the people refetches them
// only when peopleV moves.
export type WireView = TableView & {
    seq: number;
    serverNow: number;
    nextDueAt: number | null;
    code: string;
    clockLeader: string | null;
    peopleV: number;
    watchers: number;
    realtimeOk: boolean;
};

// Everyone the room knows, by pid: each one's name and look, and which of them the host removed.
// peopleV moves exactly when one of these does: a join, a pruned watcher, a rename, a new look, a
// removal, a "let back in".
export type PeopleView = {people: People; removed: string[]};

// The wire view with its people: what the page and every response carry.
export type RoomView = WireView & PeopleView;

export type EmoteView = ({kind: 'react' | 'say'; item: string} | {kind: 'throw'; item: string; to: string}) & {id: string; seq: number; from: string; at: number};

export type MeView = {
    pid: string;
    seat: number | null;
    role: 'seated' | 'watching';
    isHost: boolean;
    hasAccount: boolean;
    hole: [Card, Card] | null;
    pre: PreAction | null;
};

// What the viewer's own requests add to the meta: the people, who the viewer is to the room, and
// its emotes.
export type PlayerMeta = ViewMeta & PeopleView & {hasAccount: boolean; emotes: EmoteView[]; emoteSeq: number; pass: string | null};

export type PlayerView = RoomView & {config: GameConfig; me: MeView; emotes: EmoteView[]; emoteSeq: number; pass: string | null; duplicate?: boolean};

// How a join went: seated where asked (or in the first free seat), moved to the next free seat
// because the one asked for was just taken, watching because every seat is taken or by choice, or
// already at the table.
export type JoinOutcome = 'seated' | 'moved' | 'full' | 'watching' | 'returning';

// POST join's answer: the player's view, how the join went, and the name they sit under when it
// is not the one they asked for (someone here has it, or it is reserved).
export type JoinReply = PlayerView & {outcome: JoinOutcome; renamed: string | null};

// What the join card needs to know for a viewer the room has not seated or seen: whether they can
// join at all, how many seats are open and the buy-in's range.
export type JoinView = {
    banned: boolean; // the host removed this identity
    locked: boolean; // the host closed the table to new players
    seats: number;
    seatsFree: number;
    watchersFull: boolean;
    roomFull: boolean;
    buyIn: {min: number; max: number};
    hasAccount: boolean;
};

// The /play page's first render: the viewer's own view once they have joined, else the public
// table behind the join card.
export type PlayPageView = {view: PlayerView} | {preview: RoomView; join: JoinView};

// A poll or a tick when the table has not moved since the client's seq: the time, the clock, any
// emotes newer than its emoteSeq, and a fresh seat pass when the request had to read the identity
// in full (null when it came with a pass). A seq or emoteSeq above the client's says a GET state is due
// (a tick answers without reading the emotes).
export type Unchanged = {unchanged: true; seq: number; emoteSeq: number; serverNow: number; nextDueAt: number | null; emotes: EmoteView[]; pass: string | null};

export type HandEntryView = {seat: number; street: Street; kind: EntryKind; amount: number; to: number; allIn: boolean; timeout: boolean; auto: boolean; at: number};

// A completed hand from history: a hole card only when it was shown or is the viewer's own.
export type HandSummaryView = {
    no: number;
    startedAt: number;
    completedAt: number;
    button: number;
    smallBlind: number;
    bigBlind: number;
    ante: number;
    board: Card[];
    players: {seat: number; pid: string; startStack: number; net: number; hole: [Card, Card] | null; shown: boolean}[];
    log: HandEntryView[];
    truncated: boolean;
    pots: SettledPotView[];
    hands: ShownHandView[];
};

// The bank in full (GET detail?part=bank): each player's figures as bankOf works them out, with
// their latest events.
export type BankEventView = {at: number; kind: LedgerKind; amount: number};
export type BankDetailRowView = BankRowView & {events: BankEventView[]};

// GET detail: the whole log of a hand (the current one by default), a page of completed hands, or
// the bank.
export type DetailView =
    | {part: 'log'; hand: number | null; log: HandEntryView[]}
    | {part: 'history'; hands: HandSummaryView[]}
    | {part: 'bank'; bank: BankDetailRowView[]};

// Everything a poker night route answers with — lib/poker-night/route-kit's json() takes nothing
// else, so a server object (a room, a state) cannot be sent by mistake.
export type ResponseBody = PlayerView | JoinReply | Unchanged | DetailView | ErrorBody;
