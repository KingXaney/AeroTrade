// The only way a table's state leaves the server: every payload a browser gets — a route's response,
// the page's first render, the Ably message — is built by one of these projections, field by field
// from a whitelist, never by spreading a server object. The deck, other players' hole cards and
// pre-actions, and unshown history holes are never read into a view. Pure, so the room layer passes
// in what only it knows (names, presence, the version) as a meta argument.

import {evaluateCards} from '@/lib/poker/evaluator';
import {readEntry, type BettingSnapshot} from '@/lib/poker-night/betting';
import {ENTRY_KINDS, KEEP} from '@/lib/poker-night/config';
import {bestFive} from '@/lib/poker-night/hand-name';
import {ledgerEvents} from '@/lib/poker-night/ledger';
import {buildPots} from '@/lib/poker-night/pots';
import {handSeatAt, isLive, seatOf} from '@/lib/poker-night/seats';
import type {Hand, HandResult, HandSeat, HandSummary, LedgerRow, Seat, SettledPot, ShownHand, TableState} from '@/lib/poker-night/types';
import type {
    BankDetailRowView, BankRowView, CardsView, EmoteView, HandEntryView, HandResultView, HandSummaryView, HandView, LedgerView, PaidPotView, People, PeopleView, PlayerMeta, PlayerView,
    PotView, Presence, SeatState, SeatView, SettledPotView, ShownCardsView, ShownHandView, TableView, ViewMeta, WireEntry, WireView,
} from '@/lib/poker-night/view-types';

// A WireEntry's kind indexes this list.
export const WIRE_KINDS = ENTRY_KINDS;

const pair = (cards: readonly number[]): [number, number] => [cards[0], cards[1]];

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

const cardsView = (p: HandSeat | null): CardsView => {
    if (!p) return 'none';
    if (p.shown) return pair(p.hole);
    return p.folded ? 'none' : 'hidden';
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

const paidPotView = (pot: SettledPot): PaidPotView => ({amount: pot.amount, winners: [...pot.winners], shares: [...pot.shares]});

const settledPotView = (pot: SettledPot): SettledPotView =>
    ({amount: pot.amount, eligible: [...pot.eligible], winners: [...pot.winners], shares: [...pot.shares]});

const shownCardsView = (h: ShownHand): ShownCardsView => ({seat: h.seat, cards: pair(h.cards)});
const shownHandView = (h: ShownHand): ShownHandView => ({seat: h.seat, cards: pair(h.cards), value: h.value, best: [...h.best]});

// A result's seats whose player has gone since the deal: empty, or now someone else's.
const goneSeats = (state: TableState, hand: Hand): [number, string][] =>
    hand.seats.filter((p) => state.seats[p.seat]?.pid !== p.pid).map((p): [number, string] => [p.seat, p.pid]);

const resultView = (state: TableState, hand: Hand, r: HandResult): HandResultView => ({
    completedAt: r.completedAt, showdown: r.showdown, refund: r.refund ? {seat: r.refund.seat, amount: r.refund.amount} : null,
    pots: r.pots.map(paidPotView), hands: r.hands.map(shownCardsView), nets: r.nets.map((n) => ({seat: n.seat, net: n.net})),
    revealMs: r.revealMs, gone: goneSeats(state, hand),
});

const handView = (state: TableState, hand: Hand): HandView => ({
    no: hand.no, phase: hand.phase, street: hand.street, board: [...hand.board], pots: hand.phase === 'complete' ? [] : livePots(hand),
    currentBet: hand.currentBet, increment: hand.increment, actor: hand.actor, deadline: hand.deadline, nextStreetAt: hand.nextStreetAt,
    button: hand.button, sb: hand.smallBlindSeat, bb: hand.bigBlindSeat,
    logTail: hand.log.slice(-KEEP.LOG_TAIL).map((e): WireEntry => [e[0], e[1], e[2], e[3], e[4], e[5]]),
    logLength: hand.logDropped + hand.log.length,
    result: hand.result ? resultView(state, hand, hand.result) : null,
});

const ledgerView = (row: LedgerRow): LedgerView => ({pid: row.pid, bought: row.bought, cashedOut: row.cashedOut, buys: row.buys});

// The table as everyone may see it, from the state alone; presence comes from the room.
export const publicView = (state: TableState, presence: Readonly<Record<string, Presence>> = {}): TableView => ({
    v: 1, status: state.status, closing: state.closing,
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

// The wire view plus what only this viewer may see: the config, their own seat, cards, pre-action
// and what their seat does when the hand ends (`next`: leaving, or sitting out from the next deal).
// Their cards stay theirs to see after they fold, through the results pause, until the next deal:
// nobody else sees a folded hand unless its player shows it.
export const playerView = (state: TableState, pid: string, meta: PlayerMeta): PlayerView => {
    const i = seatOf(state, pid);
    const own = i === null ? null : handSeatAt(state, i);
    const seat = i === null ? null : state.seats[i];
    return {
        ...wireView(state, meta),
        ...peopleView(meta.people, meta.removed),
        config: {...state.config},
        me: {
            pid, seat: i, role: i === null ? 'watching' : 'seated', isHost: state.hostPid === pid, hasAccount: meta.hasAccount,
            hole: own ? pair(own.hole) : null,
            pre: own?.pre && isLive(state.hand) ? (own.pre.kind === 'call' ? {kind: 'call', amount: own.pre.amount} : {kind: own.pre.kind}) : null,
            next: !seat ? null : seat.leaving ? 'leave' : seat.sitOutNext ? 'sit-out' : null,
        },
        emotes: meta.emotes.map(emoteView),
        emoteSeq: meta.emoteSeq,
        pass: meta.pass,
    };
};

// A completed hand for one viewer: hole cards only when shown, or the viewer's own.
export const historyView = (summary: HandSummary, viewerPid: string | null): HandSummaryView => ({
    no: summary.no, startedAt: summary.startedAt, completedAt: summary.completedAt, button: summary.button,
    smallBlind: summary.smallBlind, bigBlind: summary.bigBlind, ante: summary.ante, board: [...summary.board],
    players: summary.players.map((p) => ({
        seat: p.seat, pid: p.pid, startStack: p.startStack, net: p.net,
        hole: p.shown || (viewerPid !== null && p.pid === viewerPid) ? pair(p.hole) : null, shown: p.shown,
    })),
    log: summary.log.map((e) => ({seat: e.seat, street: e.street, kind: e.kind, amount: e.amount, to: e.to, allIn: e.allIn, timeout: e.timeout, auto: e.auto, at: e.at})),
    truncated: summary.truncated,
    pots: summary.pots.map(settledPotView),
    hands: summary.hands.map(shownHandView),
});

// The current hand's whole log, read back (GET detail?part=log). Public: holes never appear in it.
export const handLogView = (state: TableState): HandEntryView[] => (state.hand ? state.hand.log.map((e) => readEntry(state.hand!, e)) : []);

// The bank as the server's ledger figures it (ledger.chipsOf, inPotOf, netOf), rebuilt from a view:
// a seated player's chips are their stack plus what is in the live hand.
export const bankOf = (view: Pick<TableView, 'seats' | 'ledger'>): BankRowView[] => view.ledger.map((row) => {
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

// A shown hand's value and the five cards that play, as the server works them out at the showdown.
export const readShownHand = (board: readonly number[], shown: ShownCardsView): ShownHandView => {
    const cards = pair(shown.cards);
    if (board.length < 3) return {seat: shown.seat, cards, value: null, best: []};
    const all = [...board, ...cards];
    return {seat: shown.seat, cards, value: evaluateCards(all), best: bestFive(all, cards).cards};
};

// The client's betting snapshot, rebuilt from a view: with it, legalFor offers exactly the moves the
// server would (views.test.ts holds the two equal).
export const snapshotFromView = (view: Pick<TableView, 'hand' | 'seats'>): BettingSnapshot => {
    const hand = view.hand;
    if (!hand) return {phase: null, actor: null, currentBet: 0, increment: 0, seats: []};
    const seats: BettingSnapshot['seats'] = [];
    view.seats.forEach((v, seat) => {
        // Dealt in: folded, or holding cards (face down or shown).
        if (v && (v.state === 'folded' || v.cards !== 'none')) {
            seats.push({seat, streetBet: v.bet, actedAtBet: v.acted, folded: v.state === 'folded', allIn: v.state === 'all-in', stack: v.chips});
        }
    });
    return {phase: hand.phase, actor: hand.actor, currentBet: hand.currentBet, increment: hand.increment, seats};
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
