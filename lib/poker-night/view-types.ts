// What a browser is sent about a poker night table: the client's contract. Declared here on their
// own, never derived from the server's state types (no Omit<> of a TableState), so a field added to
// the server state never reaches a client by accident — and there is no deck, no thrown-away card
// but the viewer's own and no ask but the viewer's own anywhere in them (the one thing a view says
// of another player's asks setting is, to a player who could ask them, that they turned asks off —
// what the engine's refusal would say). Every value of these types
// is built field by field in lib/poker-night/views.ts.
//
// Version 2 (TableView.v, http.PN_PROTOCOL 2): the boards, the game, face-down cards as a count,
// paid pots board by board without their shares (pots.paidParts rebuilds them), shown hands as
// their cards alone, and the viewer's own plan to leave, thrown-away card, asks and nudge.

import type {Card} from '@/lib/poker/cards';
import type {ErrorBody} from '@/lib/poker-night/http';
import type {AskAnswer, BoardCount, EntryKind, GameConfig, LedgerKind, PreAction, RoomSettings, Street, TableStatus, Variant} from '@/lib/poker-night/types';

export type SeatState = 'waiting' | 'in-hand' | 'folded' | 'all-in' | 'sitting-out' | 'away' | 'busted' | 'leaving';
// A seat's cards: none (not dealt in, or folded), that many face down, or face up.
export type CardsView = 'none' | number | Card[];
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
// winners[k], shares[k]: board k's part of the pot (lib/poker-night/pots.paidParts).
export type SettledPotView = PotView & {winners: number[][]; shares: number[][]};
// A pot as the result pays it, the main pot first: each board's winners in hand order. The part
// each board holds and every winner's share follow from the amount (pots.paidParts, the server's
// own split), so the wire carries neither.
export type PaidPotView = {amount: number; winners: number[][]};
// A shown hand on the wire is its cards: the value and the five cards that play on each board
// follow from them, the game and the boards (variants.readShown runs the server's own functions).
export type ShownCardsView = {seat: number; cards: Card[]};

export type HandResultView = {
    completedAt: number;
    showdown: boolean;
    refund: {seat: number; amount: number} | null;
    pots: PaidPotView[];
    hands: ShownCardsView[]; // shown only, in show order
    nets: {seat: number; net: number}[];
    revealMs: number;
    // The dealt seats whose player has gone since the deal — cashed out as the hand completed, or
    // the seat taken by someone new in the pause — each with the pid that played it, so the result
    // names who won (views.resultView; reveal.playerAt). Usually empty. A view from a server older
    // than this field has none: read it with `?? []`.
    gone: [seat: number, pid: string][];
};

export type HandView = {
    no: number;
    variant: Variant; // the hand's own game
    phase: 'discard' | 'betting' | 'runout' | 'complete';
    street: Street;
    boards: Card[][]; // what is out of each board, all the same length
    toDiscard: number[]; // Triple T: the seats still to throw a card away (the 'discard' phase only)
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

// The bank's totals per player, on the wire as a tuple (the wire's budget: views.ledgerRows reads
// them back as rows). Their chips, what is in the pot and the net follow from the seats
// (views.bankOf), so the wire carries each figure once.
export type LedgerView = [pid: string, bought: number, cashedOut: number, buys: number];
export type LedgerRowView = {pid: string; bought: number; cashedOut: number; buys: number};
export type BankRowView = LedgerRowView & {chips: number; inPot: number; net: number; seated: boolean};

// The table as the engine alone can describe it.
export type TableView = {
    v: 2;
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
    // The room's public version (lib/poker-night/room-doc.publicSeq): it moves with every write
    // anyone but its author can see, and never for a pre-action alone.
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

// An ask to see a hand, as only its two players see it: who asked whom (pids, and the seats they
// played the hand from), when it was made and when it runs out, and how it stands — 'expired' once
// it ran out unanswered (taken as a no).
export type AskView = {from: string; to: string; fromSeat: number; toSeat: number; at: number; until: number; answer: AskAnswer};

export type MeView = {
    pid: string;
    seat: number | null;
    role: 'seated' | 'watching';
    isHost: boolean;
    hasAccount: boolean;
    hole: Card[] | null;
    pre: PreAction | null;
    // What the viewer's own seat does when the hand in play ends: 'leave' once they left it mid-hand
    // (folded, all in, or still in it, away — the plate may still read Folded: nothing takes it back),
    // 'leave-after' while they play it out as usual having chosen to leave after it (a 'leave-after'
    // action with on: false takes it back), 'sit-out' while a "Sit out next hand" waits for the deal
    // (theirs or the host's: the view never says whose). Private, never on the wire: the table sees
    // none of them until the hand ends.
    next: OwnNext;
    // Triple T: the card the viewer threw away this hand (never anyone else's).
    discard: Card | null;
    // "Let others ask to see my cards": on unless the viewer turned it off.
    allowAsks: boolean;
    // This hand's asks the viewer made or was asked, oldest first; every one ends at the next deal.
    asks: AskView[];
    // Who the viewer may ask to see their cards now (pids): the hand complete, the viewer folded it,
    // the player's cards not shown and their asks on, no ask of the viewer's waiting, under the
    // limits (lib/poker-night/config ASKS).
    canAsk: string[];
    // The other players the viewer could ask but for a rule (lib/poker-night/asks.askChoices), each
    // with why not: so the seat menu greys the ask and says why. Only the viewer's own; empty while
    // they may ask nobody at all.
    askBlocked: [pid: string, block: AskBlock][];
    // Hands shown to the viewer alone this hand, answering their ask.
    shownToMe: ShownCardsView[];
};

export type OwnNext = 'sit-out' | 'leave' | 'leave-after' | null;

// Why the viewer may not ask a player to see their cards now: the player turned asks off, the viewer
// is cooling down from them (a no, or no answer, within the last few hands), an ask of the viewer's
// still waits for its answer, the viewer made every ask a hand allows, or the table holds as many
// cooldowns and waiting asks as it keeps (lib/poker-night/asks.asksFull) — said of no one in particular.
export type AskBlock = 'asks-off' | 'cooldown' | 'waiting' | 'limit' | 'full';

// What the viewer's own requests add to the meta: the people, who the viewer is to the room, its
// emotes, and the viewer's nudge count.
export type PlayerMeta = ViewMeta & PeopleView & {
    hasAccount: boolean; emotes: EmoteView[]; emoteSeq: number; pass: string | null; nudge: number;
};

// nudge: how many times a write by someone else changed what only this viewer sees (an ask to see
// their cards, its answer, a sit-out the host set) — the room counts it per player
// (PokerRoom.nudge), a GET state sends the count it holds (nsince), and a count above it reads the
// whole view even when the public seq did not move.
export type PlayerView = RoomView & {
    config: GameConfig; me: MeView; emotes: EmoteView[]; emoteSeq: number; pass: string | null; nudge: number; duplicate?: boolean;
};

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
    variant: Variant; // the game the next hand deals
    boards: BoardCount;
    needsApproval: boolean; // the first hand has been dealt: chips wait for the host's yes
};

// The /play page's first render: the viewer's own view once they have joined, else the public
// table behind the join card.
export type PlayPageView = {view: PlayerView} | {preview: RoomView; join: JoinView};

// A poll or a tick when the table has not moved since the client's seq: the time, the clock, any
// emotes newer than its emoteSeq, and a fresh seat pass when the request had to read the identity
// in full (null when it came with a pass). A seq or emoteSeq above the client's says a GET state is due
// (a tick answers without reading the emotes).
export type Unchanged = {
    unchanged: true; seq: number; emoteSeq: number; serverNow: number; nextDueAt: number | null; emotes: EmoteView[]; pass: string | null;
    realtimeOk: boolean; // as a view says it: whether a realtime publish failed within the window (read from the head)
    nudge: number; // the viewer's nudge count (PlayerView.nudge): above the one held, a GET state is due
};

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
    variant: Variant;
    boards: Card[][];
    // hole: shown, the viewer's own, or shown to the viewer alone (answering their ask); discard: the
    // viewer's own thrown-away card, for no one else.
    players: {seat: number; pid: string; startStack: number; net: number; hole: Card[] | null; shown: boolean; discard: Card | null}[];
    log: HandEntryView[];
    truncated: boolean;
    pots: SettledPotView[];
    hands: ShownCardsView[];
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

// A realtime token as GET token hands it over: Ably's TokenDetails, copied field by field. Its
// capability is subscribe on the room's channel alone; its clientId is the viewer's pid.
export type RealtimeTokenView = {token: string; expires: number; issued: number; capability: string; clientId: string};

// GET token: whether this table goes live over Ably and, when it does, the channel (poker-night:
// <env>:<room id>, lib/poker-night/channel) and a token for it. Off: the table polls.
// `private` is the viewer's own channel (poker-night:<env>:<room id>:<pid>), on which the room's
// nudges for them alone come ('nudge' messages: lib/poker-night/channel).
export type TokenReply = {realtime: false} | {realtime: true; channel: string; private: string; token: RealtimeTokenView};

// POST emote's answer: the emote as the room stored it (its seq the room's new emoteSeq), so the
// sender's own table draws it at once.
export type EmoteReply = {ok: true; emoteSeq: number; emote: EmoteView};

// Everything a poker night route answers with — lib/poker-night/route-kit's json() takes nothing
// else, so a server object (a room, a state) cannot be sent by mistake.
export type ResponseBody = PlayerView | JoinReply | Unchanged | DetailView | TokenReply | EmoteReply | ErrorBody;
