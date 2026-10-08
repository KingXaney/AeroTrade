// Reading a stored table state back: the room keeps it as a Mixed field, so this is the one place
// that checks its shape before the engine trusts it. A state of the current version comes back as it
// is (the same object) when every field has the right shape; one of an older version is checked
// against that version's own frozen shape and stepped forward, then checked again; a state from a
// newer version — a deploy rolling back, or a document from the future — or of no version is
// refused (null), which the room store turns into a reload (newer) or a closed table rather than a
// crash. A stored field never changes meaning without bumping STATE_VERSION and adding a step here.
//
// Version 2 holds every field the modes, leaving after a hand, the host-approved buys and the asks
// need, and accepts every variant, board count and the 'discard' phase from the start, so a later
// phase that deals them never needs another bump and a rollback never closes a live table
// (lib/poker-night/config ENABLED gates only the input paths and the deal).
//
// PokerHand rows (a HandSummary each) carry no version: migrateSummary reads one written before
// version 2 — a single board, flat pots — as today's.

import {z} from 'zod';
import {ASK_ANSWERS, ENTRY_KINDS, GAME_CONFIG_SHAPE, GameConfigSchema, refineConfig, RoomSettingsSchema, STATE_VERSION, STREETS, VARIANTS} from '@/lib/poker-night/config';
import type {GameConfig, Hand, HandSummary, LedgerRow, Seat, TableState} from '@/lib/poker-night/types';

const int = z.number().int();
const nat = int.min(0);
const card = int.min(0).max(51);
const cards5 = z.array(card).max(5);
const pid = z.string().min(1);

const preAction = z.union([
    z.object({kind: z.enum(['check-fold', 'check', 'call-any']), atBet: nat}),
    z.object({kind: z.literal('call'), amount: nat, atBet: nat}),
]);

const seatFields = {
    pid, stack: nat, sittingOut: z.boolean(), sitOutNext: z.boolean(), away: z.boolean(), timeouts: nat,
    owesPost: z.boolean(), leaving: z.boolean(), removed: z.boolean(), pendingBuy: nat,
};

const ledgerRow = z.object({
    pid, bought: nat, cashedOut: nat, buys: nat, events: z.array(z.tuple([int, nat, nat])),
    hands: nat, wins: nat, biggestWin: nat, allIns: nat, peakChips: nat,
});

const handSeatFields = {
    seat: nat, pid, startStack: nat, committed: nat, streetBet: nat, actedAtBet: nat.nullable(),
    folded: z.boolean(), allIn: z.boolean(), shown: z.boolean(), pre: preAction.nullable(),
};

const resultFields = {
    completedAt: nat, showdown: z.boolean(), refund: z.object({seat: nat, amount: nat}).nullable(),
    showOrder: z.array(nat), nets: z.array(z.object({seat: nat, net: int})), revealMs: nat,
};

const handFields = {
    no: nat, startedAt: nat, button: nat, smallBlindSeat: nat, bigBlindSeat: nat, smallBlind: nat, bigBlind: nat, ante: nat,
    street: z.enum(STREETS), currentBet: nat, increment: nat, lastAggressor: nat.nullable(),
    actor: nat.nullable(), deadline: nat.nullable(), nextStreetAt: nat.nullable(),
    // A log line's time is relative to the hand's start, and a request received just before the deal
    // but processed after it lands a little below zero.
    log: z.array(z.tuple([int, nat, nat, nat, nat, nat, int])), logDropped: nat,
};

const stateFields = {
    status: z.enum(['open', 'playing', 'paused', 'closed']), closing: z.boolean(), configV: nat, settings: RoomSettingsSchema, hostPid: pid,
    lastBigBlind: nat.nullable(), button: nat.nullable(), handNo: nat, turn: nat, nextHandAt: nat.nullable(), createdAt: nat,
};

// ── version 1, frozen: what live tables held before version 2 ──

// The config had no game yet, and a third rebuy policy, 'auto'.
const {variant: _variant, boards: _boards, ...CONFIG_V1_SHAPE} = GAME_CONFIG_SHAPE;
void _variant;
void _boards;
const configV1 = z.strictObject({...CONFIG_V1_SHAPE, rebuys: z.enum(['off', 'auto', 'approve'])}).superRefine(refineConfig);
const holeV1 = z.tuple([card, card]);
const settledPotV1 = z.object({amount: nat, eligible: z.array(nat), winners: z.array(nat), shares: z.array(nat)});
const shownHandV1 = z.object({seat: nat, cards: holeV1, value: nat.nullable(), best: cards5});
const handV1 = z.object({
    ...handFields,
    seats: z.array(z.object({...handSeatFields, hole: holeV1})).min(2), deck: cards5, board: cards5,
    phase: z.enum(['betting', 'runout', 'complete']),
    result: z.object({...resultFields, pots: z.array(settledPotV1), hands: z.array(shownHandV1)}).nullable(),
});
const TableStateV1 = z.object({
    ...stateFields, v: z.literal(1), config: configV1, requests: z.array(z.object({pid, amount: nat, at: nat})), seats: z.array(z.object(seatFields).nullable()), ledger: z.array(ledgerRow), hand: handV1.nullable(),
}).refine((s) => s.seats.length === s.config.seats);

type StateV1 = z.infer<typeof TableStateV1>;
type HandV1 = z.infer<typeof handV1>;

// ── version 2 ──

// Each board's winners and their shares, the same shape.
const settledPot = z.object({amount: nat, eligible: z.array(nat), winners: z.array(z.array(nat).min(1)).min(1).max(3), shares: z.array(z.array(nat)).min(1).max(3)})
    .refine((p) => p.winners.length === p.shares.length && p.winners.every((w, k) => w.length === p.shares[k].length));
const shownHand = z.object({seat: nat, cards: z.array(card).min(2).max(4)});
const BOARD_LENGTHS: readonly number[] = [0, 3, 4, 5];
const hand = z.object({
    ...handFields,
    variant: z.enum(VARIANTS),
    seats: z.array(z.object({...handSeatFields, hole: z.array(card).min(2).max(4)})).min(2),
    deck: z.array(z.array(card).length(5)).min(1).max(3),
    boards: z.array(cards5).min(1).max(3),
    discards: z.array(z.tuple([nat, card])),
    phase: z.enum(['discard', 'betting', 'runout', 'complete']),
    result: z.object({...resultFields, pots: z.array(settledPot), hands: z.array(shownHand)}).nullable(),
    asks: z.array(z.tuple([nat, nat, int, nat.max(ASK_ANSWERS.length - 1)])),
}).refine((h) => h.boards.length === h.deck.length && h.boards.every((b) => b.length === h.boards[0].length) && BOARD_LENGTHS.includes(h.boards[0].length));

const TableStateV2 = z.object({
    ...stateFields, v: z.literal(2), config: GameConfigSchema, requests: z.array(z.strictObject({pid, amount: nat})),
    seats: z.array(z.object({...seatFields, leaveAfter: z.boolean()}).nullable()), ledger: z.array(ledgerRow), hand: hand.nullable(),
    noAsks: z.array(pid), askCooldowns: z.array(z.tuple([pid, pid, nat])),
}).refine((s) => s.seats.length === s.config.seats);

// ── the steps ──

const handV1ToV2 = (h: HandV1): Hand => ({
    no: h.no, startedAt: h.startedAt, variant: 'holdem', button: h.button, smallBlindSeat: h.smallBlindSeat, bigBlindSeat: h.bigBlindSeat,
    smallBlind: h.smallBlind, bigBlind: h.bigBlind, ante: h.ante,
    seats: h.seats.map((p) => ({...p, hole: [...p.hole]})),
    deck: [[...h.deck]], boards: [[...h.board]], discards: [], street: h.street, phase: h.phase, currentBet: h.currentBet, increment: h.increment,
    lastAggressor: h.lastAggressor, actor: h.actor, deadline: h.deadline, nextStreetAt: h.nextStreetAt, log: h.log, logDropped: h.logDropped,
    result: h.result && {
        ...h.result,
        pots: h.result.pots.map((p) => ({amount: p.amount, eligible: p.eligible, winners: [p.winners], shares: [p.shares]})),
        hands: h.result.hands.map((x) => ({seat: x.seat, cards: [...x.cards]})),
    },
    asks: [],
});

// Version 1 to 2. The config gains its game (Texas hold'em, one board), last, as DEFAULT_CONFIG has
// it; its rebuy policy 'auto' — rebuys at once — becomes 'approve', which now means every buy but
// the host's waits for the host once the first hand is dealt. Each seat gains leaveAfter (off); each
// ledger event's time goes from milliseconds to whole seconds; a request drops its time, which
// nothing read; the hand gains its game, its one
// board as a run and a board, no throw-aways and no asks, and its result pays each pot on that one
// board, its shown hands as their cards alone. The table has no asks turned off and no cooldowns.
export const v1ToV2 = (s: StateV1): TableState => {
    const config = s.config;
    return {
        ...s,
        v: 2,
        config: {...config, rebuys: config.rebuys === 'auto' ? 'approve' : config.rebuys, variant: 'holdem', boards: 1} as GameConfig,
        seats: s.seats.map((seat): Seat | null => (seat ? {...seat, leaveAfter: false} : null)),
        requests: s.requests.map((r) => ({pid: r.pid, amount: r.amount})),
        ledger: s.ledger.map((row): LedgerRow => ({...row, events: row.events.map(([at, kind, amount]): [number, number, number] => [Math.floor(at / 1000), kind, amount])})),
        hand: s.hand ? handV1ToV2(s.hand) : null,
        noAsks: [],
        askCooldowns: [],
    };
};

export const migrateState = (raw: unknown): TableState | null => {
    if (typeof raw !== 'object' || raw === null) return null;
    const v = (raw as {v?: unknown}).v;
    if (v === STATE_VERSION) return TableStateV2.safeParse(raw).success ? (raw as TableState) : null;
    if (v === 1) {
        const old = TableStateV1.safeParse(raw);
        if (!old.success) return null;
        const next = v1ToV2(raw as StateV1);
        return TableStateV2.safeParse(next).success ? next : null;
    }
    return null;
};

// ── history ──

const entry = z.object({
    seat: int, street: z.enum(STREETS), kind: z.enum(ENTRY_KINDS), amount: nat, to: nat, allIn: z.boolean(), timeout: z.boolean(), auto: z.boolean(), at: int,
});
const summaryFields = {
    no: nat, startedAt: nat, completedAt: nat, button: nat, smallBlind: nat, bigBlind: nat, ante: nat,
    log: z.array(entry), truncated: z.boolean(),
};
const summaryPlayer = {seat: nat, pid, startStack: nat, net: int, shown: z.boolean()};
const SummaryV1 = z.object({
    ...summaryFields, board: cards5,
    players: z.array(z.object({...summaryPlayer, hole: holeV1})),
    pots: z.array(settledPotV1), hands: z.array(shownHandV1),
});
const SummaryV2 = z.object({
    ...summaryFields, variant: z.enum(VARIANTS), boards: z.array(cards5).min(1).max(3),
    players: z.array(z.object({...summaryPlayer, hole: z.array(card).min(2).max(4), discard: card.nullable(), seenBy: z.array(pid)})),
    pots: z.array(settledPot), hands: z.array(shownHand),
});

// A PokerHand row's summary as today's HandSummary: as it is when written by version 2 (it has
// `boards`), stepped forward when written before (one board, flat pots, shown hands with their
// value), null when it is neither.
export const migrateSummary = (raw: unknown): HandSummary | null => {
    if (typeof raw !== 'object' || raw === null) return null;
    if (Array.isArray((raw as {boards?: unknown}).boards)) return SummaryV2.safeParse(raw).success ? (raw as HandSummary) : null;
    const old = SummaryV1.safeParse(raw);
    if (!old.success) return null;
    const s = raw as z.infer<typeof SummaryV1>;
    return {
        no: s.no, startedAt: s.startedAt, completedAt: s.completedAt, variant: 'holdem', button: s.button,
        smallBlind: s.smallBlind, bigBlind: s.bigBlind, ante: s.ante, boards: [[...s.board]],
        players: s.players.map((p) => ({seat: p.seat, pid: p.pid, startStack: p.startStack, net: p.net, hole: [...p.hole], shown: p.shown, discard: null, seenBy: []})),
        log: s.log, truncated: s.truncated,
        pots: s.pots.map((p) => ({amount: p.amount, eligible: [...p.eligible], winners: [[...p.winners]], shares: [[...p.shares]]})),
        hands: s.hands.map((h) => ({seat: h.seat, cards: [...h.cards]})),
    };
};
