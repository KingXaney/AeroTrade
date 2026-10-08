// The only way a table's state leaves the server: every payload a browser gets — a route's response,
// the page's first render, the Ably message — is built by one of these projections, field by field
// from a whitelist, never by spreading a server object. The decks, other players' hole cards,
// thrown-away cards and pre-actions, a seat's plan to leave after the hand, the asks to see a hand
// (but to their two players), who turned asks off and the cooldowns, and unshown history holes are
// never read into a view but the viewer's own — less, to a player who could ask someone, that this
// one turned asks off or is cooling down from them (MeView.askBlocked: what the engine's refusal
// would say). Pure, so the room layer passes in what only it knows
// (names, presence, the version, the viewer's nudge count) as a meta argument.

import {ASK_SHOWN, answerAt, askChoices, askDeadline, placeOf} from '@/lib/poker-night/asks';
import {NO_HAND_SNAPSHOT, readEntry, type BettingSnapshot} from '@/lib/poker-night/betting';
import {ENTRY_KINDS, KEEP} from '@/lib/poker-night/config';
import {ledgerEvents} from '@/lib/poker-night/ledger';
import {buildPots} from '@/lib/poker-night/pots';
import {handSeatAt, isLive, seatOf} from '@/lib/poker-night/seats';
import {limitOf} from '@/lib/poker-night/variants';
import type {Hand, HandResult, HandSeat, HandSummary, LedgerRow, Seat, SettledPot, ShownHand, TableState} from '@/lib/poker-night/types';
import type {
    AskBlock, AskView, BankDetailRowView, BankRowView, CardsView, EmoteView, HandEntryView, HandResultView, HandSummaryView, HandView, LedgerRowView, LedgerView, PaidPotView, People,
    OwnNext, PeopleView, PlayerMeta, PlayerView, PotView, Presence, SeatState, SeatView, SettledPotView, ShownCardsView, TableView, ViewMeta, WireEntry, WireView,
} from '@/lib/poker-night/view-types';

// A WireEntry's kind indexes this list.
export const WIRE_KINDS = ENTRY_KINDS;

// The pots as they stand: what earlier streets put in, this street's bets still in front of the
// players. Once betting closes the bets are swept, so this is every pot.
export const livePots = (hand: Hand): PotView[] =>
    buildPots(hand.seats.map((p) => ({seat: p.seat, amount: p.committed - p.streetBet, folded: p.folded})))
        .map((pot) => ({amount: pot.amount, eligible: [...pot.eligible]}));

const seatState = (seat: Seat, p: HandSeat | null, live: boolean): SeatState => {
    if (p && live) {
        if (p.folded) return 'folded';
        if (p.allIn) return 'all-in';
        if (seat.leaving) return 'leaving';
        return seat.away ? 'away' : 'in-hand';
    }
    if (seat.leaving) return 'leaving';
    if (seat.away) return 'away';
    if (seat.sittingOut || seat.sitOutNext) return 'sitting-out';
    if (seat.stack === 0 && seat.pendingBuy === 0) return 'busted';
    return 'waiting';
};

// Face up once shown; none once folded; else how many are face down.
const cardsView = (p: HandSeat | null): CardsView => {
    if (!p) return 'none';
    if (p.shown) return [...p.hole];
    return p.folded ? 'none' : p.hole.length;
};

const seatView = (state: TableState, i: number, seat: Seat, presence: Presence): SeatView => {
    const p = handSeatAt(state, i);
    const inPlay = p !== null && isLive(state.hand) ? p : null;
    return {
        pid: seat.pid, chips: seat.stack, bet: inPlay ? inPlay.streetBet : 0, acted: inPlay ? inPlay.actedAtBet : null,
        inPot: inPlay ? inPlay.committed : 0,
        state: seatState(seat, p, inPlay !== null), cards: cardsView(p), owesPost: seat.owesPost, pendingBuy: seat.pendingBuy,
        timeouts: seat.timeouts, presence,
    };
};

const nested = (lists: readonly (readonly number[])[]): number[][] => lists.map((list) => [...list]);

const paidPotView = (pot: SettledPot): PaidPotView => ({amount: pot.amount, winners: nested(pot.winners)});

const settledPotView = (pot: SettledPot): SettledPotView =>
    ({amount: pot.amount, eligible: [...pot.eligible], winners: nested(pot.winners), shares: nested(pot.shares)});

const shownCardsView = (h: ShownHand): ShownCardsView => ({seat: h.seat, cards: [...h.cards]});

// A result's seats whose player has gone since the deal: empty, or now someone else's.
const goneSeats = (state: TableState, hand: Hand): [number, string][] =>
    hand.seats.filter((p) => state.seats[p.seat]?.pid !== p.pid).map((p): [number, string] => [p.seat, p.pid]);

const resultView = (state: TableState, hand: Hand, r: HandResult): HandResultView => ({
    completedAt: r.completedAt, showdown: r.showdown, refund: r.refund ? {seat: r.refund.seat, amount: r.refund.amount} : null,
    pots: r.pots.map(paidPotView), hands: r.hands.map(shownCardsView), nets: r.nets.map((n) => ({seat: n.seat, net: n.net})),
    revealMs: r.revealMs, gone: goneSeats(state, hand),
});

// Triple T: the seats still to throw a card away.
const toDiscard = (hand: Hand): number[] =>
    hand.phase === 'discard' ? hand.seats.filter((p) => !p.folded && p.hole.length === 3).map((p) => p.seat) : [];

const handView = (state: TableState, hand: Hand): HandView => ({
    no: hand.no, variant: hand.variant, phase: hand.phase, street: hand.street, boards: hand.boards.map((b) => [...b]), toDiscard: toDiscard(hand),
    pots: hand.phase === 'complete' ? [] : livePots(hand),
    currentBet: hand.currentBet, increment: hand.increment, actor: hand.actor, deadline: hand.deadline, nextStreetAt: hand.nextStreetAt,
    button: hand.button, sb: hand.smallBlindSeat, bb: hand.bigBlindSeat,
    logTail: hand.log.slice(-KEEP.LOG_TAIL).map((e): WireEntry => [e[0], e[1], e[2], e[3], e[4], e[5]]),
    logLength: hand.logDropped + hand.log.length,
    result: hand.result ? resultView(state, hand, hand.result) : null,
});

const ledgerView = (row: LedgerRow): LedgerView => [row.pid, row.bought, row.cashedOut, row.buys];

// The bank's totals as rows, read off the wire's tuples.
export const ledgerRows = (view: Pick<TableView, 'ledger'>): LedgerRowView[] =>
    view.ledger.map(([pid, bought, cashedOut, buys]) => ({pid, bought, cashedOut, buys}));

// One player's totals, or null when they have bought nothing here.
export const ledgerRowOf = (view: Pick<TableView, 'ledger'>, pid: string): LedgerRowView | null => {
    const row = view.ledger.find(([p]) => p === pid);
    return row ? {pid: row[0], bought: row[1], cashedOut: row[2], buys: row[3]} : null;
};

// The table as everyone may see it, from the state alone; presence comes from the room.
export const publicView = (state: TableState, presence: Readonly<Record<string, Presence>> = {}): TableView => ({
    v: 2, status: state.status, closing: state.closing,
    settings: {...state.settings},
    configV: state.configV, hostPid: state.hostPid, handNo: state.handNo, turn: state.turn, nextHandAt: state.nextHandAt,
    seats: state.seats.map((seat, i) => (seat ? seatView(state, i, seat, presence[seat.pid] ?? 'offline') : null)),
    hand: state.hand ? handView(state, state.hand) : null,
    ledger: state.ledger.map(ledgerView),
    requests: state.requests.map((r) => ({pid: r.pid, amount: r.amount})),
});

export const wireView = (state: TableState, meta: ViewMeta): WireView => ({
    ...publicView(state, meta.presence),
    seq: meta.seq, serverNow: meta.serverNow, nextDueAt: meta.nextDueAt, code: meta.code, clockLeader: meta.clockLeader,
    peopleV: meta.peopleV, watchers: meta.watchers, realtimeOk: meta.realtimeOk,
});

// The people part, copied name by name: what rides beside the wire view in every response.
export const peopleView = (people: Readonly<People>, removed: readonly string[]): PeopleView => ({
    people: Object.fromEntries(Object.entries(people).map(([pid, p]) => [pid, {name: p.name, avatar: p.avatar}])),
    removed: [...removed],
});

const emoteView = (e: EmoteView): EmoteView =>
    e.kind === 'throw'
        ? {kind: 'throw', item: e.item, to: e.to, id: e.id, seq: e.seq, from: e.from, at: e.at}
        : {kind: e.kind, item: e.item, id: e.id, seq: e.seq, from: e.from, at: e.at};

// The hand's asks `pid` made or was asked (only those two see one), read at `now`.
const asksOf = (hand: Hand, pid: string, now: number): AskView[] => {
    const me = placeOf(hand, pid);
    if (!me) return [];
    const pidAt = (seat: number) => hand.seats.find((p) => p.seat === seat)?.pid ?? '';
    return hand.asks.filter((e) => e[0] === me.seat || e[1] === me.seat).map((e): AskView => ({
        from: pidAt(e[0]), to: pidAt(e[1]), fromSeat: e[0], toSeat: e[1], at: hand.startedAt + e[2], until: askDeadline(hand, e), answer: answerAt(hand, e, now),
    }));
};

// The hands shown to `pid` alone, answering their asks.
const shownTo = (hand: Hand, pid: string): ShownCardsView[] => {
    const me = placeOf(hand, pid);
    if (!me) return [];
    return hand.asks.filter((e) => e[0] === me.seat && e[3] === ASK_SHOWN).flatMap((e) => {
        const them = hand.seats.find((p) => p.seat === e[1]);
        return them ? [{seat: them.seat, cards: [...them.hole]}] : [];
    });
};

// What a seat does when the hand in play ends, as its own player's view says it: 'leave' once they
// left mid-hand (nothing takes it back), 'leave-after' while they play it out having chosen to leave
// after it, 'sit-out' while a sit-out waits for the deal.
const ownNext = (seat: Seat | null): OwnNext =>
    !seat ? null : seat.leaving ? 'leave' : seat.leaveAfter ? 'leave-after' : seat.sitOutNext ? 'sit-out' : null;

// The wire view plus what only this viewer may see: the config, their own seat, cards, pre-action,
// thrown-away card, what their seat does when the hand ends (`next`: leaving, now or after the hand,
// or sitting out from the next deal), their asks to see a hand and the hands shown to them alone, and
// their nudge count. Their cards stay theirs to see after they fold, through the results pause,
// until the next deal: nobody else sees a folded hand unless its player shows it — or shows it to
// them, answering their ask.
export const playerView = (state: TableState, pid: string, meta: PlayerMeta): PlayerView => {
    const i = seatOf(state, pid);
    const own = i === null ? null : handSeatAt(state, i);
    const seat = i === null ? null : state.seats[i];
    const hand = state.hand;
    const discard = own && hand ? hand.discards.find(([s]) => s === own.seat)?.[1] ?? null : null;
    const choices = askChoices(state, pid, meta.serverNow);
    return {
        ...wireView(state, meta),
        ...peopleView(meta.people, meta.removed),
        config: {...state.config},
        me: {
            pid, seat: i, role: i === null ? 'watching' : 'seated', isHost: state.hostPid === pid, hasAccount: meta.hasAccount,
            hole: own ? [...own.hole] : null,
            pre: own?.pre && isLive(state.hand) ? (own.pre.kind === 'call' ? {kind: 'call', amount: own.pre.amount} : {kind: own.pre.kind}) : null,
            next: ownNext(seat),
            discard,
            allowAsks: !state.noAsks.includes(pid),
            asks: hand ? asksOf(hand, pid, meta.serverNow) : [],
            canAsk: choices.filter((c) => c.block === null).map((c) => c.pid),
            askBlocked: choices.flatMap((c): [string, AskBlock][] => (c.block === null ? [] : [[c.pid, c.block]])),
            shownToMe: hand ? shownTo(hand, pid) : [],
            hostAwayAt: meta.hostAwayAt ?? null,
        },
        emotes: meta.emotes.map(emoteView),
        emoteSeq: meta.emoteSeq,
        pass: meta.pass,
        nudge: meta.nudge,
    };
};

// What of `pid`'s own view another player's write can change without the public table showing it:
// their seat's plan for the end of the hand (the host's sit-out) and the asks they made or were
// asked. A write that changes it for anyone but its author nudges them (lib/poker-night/mutation).
export const nudgeKey = (state: TableState, pid: string): string => {
    const i = seatOf(state, pid);
    const seat = i === null ? null : state.seats[i];
    const next = ownNext(seat);
    const hand = state.hand;
    const me = hand ? placeOf(hand, pid) : null;
    const asks = hand && me ? hand.asks.filter((e) => e[0] === me.seat || e[1] === me.seat) : [];
    return JSON.stringify([next, asks]);
};

// A completed hand for one viewer: hole cards only when shown, the viewer's own, or shown to the
// viewer alone answering their ask; a thrown-away card only the viewer's own.
export const historyView = (summary: HandSummary, viewerPid: string | null): HandSummaryView => ({
    no: summary.no, startedAt: summary.startedAt, completedAt: summary.completedAt, button: summary.button,
    smallBlind: summary.smallBlind, bigBlind: summary.bigBlind, ante: summary.ante, variant: summary.variant,
    boards: summary.boards.map((b) => [...b]),
    players: summary.players.map((p) => {
        const own = viewerPid !== null && p.pid === viewerPid;
        const seen = p.shown || own || (viewerPid !== null && p.seenBy.includes(viewerPid));
        return {
            seat: p.seat, pid: p.pid, startStack: p.startStack, net: p.net, hole: seen ? [...p.hole] : null, shown: p.shown,
            discard: own ? p.discard : null,
        };
    }),
    log: summary.log.map((e) => ({seat: e.seat, street: e.street, kind: e.kind, amount: e.amount, to: e.to, allIn: e.allIn, timeout: e.timeout, auto: e.auto, at: e.at})),
    truncated: summary.truncated,
    pots: summary.pots.map(settledPotView),
    hands: summary.hands.map(shownCardsView),
});

// The current hand's whole log, read back (GET detail?part=log). Public: holes never appear in it.
export const handLogView = (state: TableState): HandEntryView[] => (state.hand ? state.hand.log.map((e) => readEntry(state.hand!, e)) : []);

// The bank as the server's ledger figures it (ledger.chipsOf, inPotOf, netOf), rebuilt from a view:
// a seated player's chips are their stack plus what is in the live hand.
export const bankOf = (view: Pick<TableView, 'seats' | 'ledger'>): BankRowView[] => ledgerRows(view).map((row) => {
    const seat = view.seats.find((v) => v !== null && v.pid === row.pid) ?? null;
    const chips = seat ? seat.chips + seat.inPot : 0;
    return {...row, chips, inPot: seat ? seat.inPot : 0, net: chips + row.cashedOut - row.bought, seated: seat !== null};
});

// The bank in full (GET detail?part=bank): bankOf's figures for every row, with its kept events.
export const bankDetailView = (state: TableState): BankDetailRowView[] =>
    bankOf(publicView(state)).map((row, i) => ({
        ...row,
        events: ledgerEvents(state, state.ledger[i]).map((e) => ({at: e.at, kind: e.kind, amount: e.amount})),
    }));

// The client's betting snapshot, rebuilt from a view: with it, legalFor offers exactly the moves the
// server would (views.test.ts holds the two equal).
export const snapshotFromView = (view: Pick<TableView, 'hand' | 'seats'>): BettingSnapshot => {
    const hand = view.hand;
    if (!hand) return {...NO_HAND_SNAPSHOT, seats: []};
    const seats: BettingSnapshot['seats'] = [];
    let pot = 0;
    view.seats.forEach((v, seat) => {
        // Every chip in the live hand: a seat not dealt in has none (SeatView.inPot).
        pot += v?.inPot ?? 0;
        // Dealt in: folded, or holding cards (face down or shown).
        if (v && (v.state === 'folded' || v.cards !== 'none')) {
            seats.push({seat, streetBet: v.bet, actedAtBet: v.acted, folded: v.state === 'folded', allIn: v.state === 'all-in', stack: v.chips});
        }
    });
    return {phase: hand.phase, actor: hand.actor, currentBet: hand.currentBet, increment: hand.increment, limit: limitOf(hand.variant), pot, seats};
};

// Everyone a view names — the seats, the ledger (players who left included), the requests and the
// host — so the room can send each one's name and look in `people`.
export const peopleIds = (state: TableState): string[] => {
    const ids = new Set<string>();
    for (const seat of state.seats) if (seat) ids.add(seat.pid);
    for (const row of state.ledger) ids.add(row.pid);
    for (const r of state.requests) ids.add(r.pid);
    ids.add(state.hostPid);
    return [...ids];
};

// The client that ticks the clock: the seated player here now with the lowest seat number, else the
// host if here, else nobody (then every seated client ticks a little later as a fallback).
export const clockLeaderOf = (state: TableState, presence: Readonly<Record<string, Presence>>): string | null => {
    for (const seat of state.seats) if (seat && presence[seat.pid] === 'here') return seat.pid;
    return presence[state.hostPid] === 'here' ? state.hostPid : null;
};
