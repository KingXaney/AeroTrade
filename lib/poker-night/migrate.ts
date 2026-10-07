// Reading a stored table state back: the room keeps it as a Mixed field, so this is the one place
// that checks its shape before the engine trusts it. Version 1 is the only version: it comes back as
// it is (the same object) when every field has the right shape, and a state from a newer version —
// a deploy rolling back, or a document from the future — is refused (null), which the room store
// turns into a closed table rather than a crash. A stored field never changes meaning without
// bumping STATE_VERSION and adding a step here.

import {z} from 'zod';
import {GameConfigSchema, RoomSettingsSchema, STATE_VERSION} from '@/lib/poker-night/config';
import type {TableState} from '@/lib/poker-night/types';

const int = z.number().int();
const nat = int.min(0);
const card = int.min(0).max(51);
const hole = z.tuple([card, card]);
const cards = z.array(card).max(5);

const preAction = z.union([
    z.object({kind: z.enum(['check-fold', 'check', 'call-any']), atBet: nat}),
    z.object({kind: z.literal('call'), amount: nat, atBet: nat}),
]);

const seat = z.object({
    pid: z.string().min(1), stack: nat, sittingOut: z.boolean(), sitOutNext: z.boolean(), away: z.boolean(), timeouts: nat,
    owesPost: z.boolean(), leaving: z.boolean(), removed: z.boolean(), pendingBuy: nat,
});

const ledgerRow = z.object({
    pid: z.string().min(1), bought: nat, cashedOut: nat, buys: nat, events: z.array(z.tuple([int, nat, nat])),
    hands: nat, wins: nat, biggestWin: nat, allIns: nat, peakChips: nat,
});

const handSeat = z.object({
    seat: nat, pid: z.string().min(1), hole, startStack: nat, committed: nat, streetBet: nat, actedAtBet: nat.nullable(),
    folded: z.boolean(), allIn: z.boolean(), shown: z.boolean(), pre: preAction.nullable(),
});

const settledPot = z.object({amount: nat, eligible: z.array(nat), winners: z.array(nat), shares: z.array(nat)});
const shownHand = z.object({seat: nat, cards: hole, value: nat.nullable(), best: cards});

const result = z.object({
    completedAt: nat, showdown: z.boolean(), refund: z.object({seat: nat, amount: nat}).nullable(),
    pots: z.array(settledPot), hands: z.array(shownHand), showOrder: z.array(nat),
    nets: z.array(z.object({seat: nat, net: int})), revealMs: nat,
});

const hand = z.object({
    no: nat, startedAt: nat, button: nat, smallBlindSeat: nat, bigBlindSeat: nat, smallBlind: nat, bigBlind: nat, ante: nat,
    seats: z.array(handSeat).min(2), deck: cards, board: cards, street: z.enum(['preflop', 'flop', 'turn', 'river']),
    phase: z.enum(['betting', 'runout', 'complete']), currentBet: nat, increment: nat, lastAggressor: nat.nullable(),
    actor: nat.nullable(), deadline: nat.nullable(), nextStreetAt: nat.nullable(),
    // A log line's time is relative to the hand's start, and a request received just before the deal
    // but processed after it lands a little below zero.
    log: z.array(z.tuple([int, nat, nat, nat, nat, nat, int])), logDropped: nat, result: result.nullable(),
});

const TableStateV1 = z.object({
    v: z.literal(1), status: z.enum(['open', 'playing', 'paused', 'closed']), closing: z.boolean(),
    config: GameConfigSchema, configV: nat, settings: RoomSettingsSchema, hostPid: z.string().min(1),
    seats: z.array(seat.nullable()), ledger: z.array(ledgerRow),
    requests: z.array(z.object({pid: z.string().min(1), amount: nat, at: nat})),
    lastBigBlind: nat.nullable(), button: nat.nullable(), handNo: nat, turn: nat, hand: hand.nullable(),
    nextHandAt: nat.nullable(), createdAt: nat,
}).refine((s) => s.seats.length === s.config.seats);

export const migrateState = (raw: unknown): TableState | null => {
    if (typeof raw !== 'object' || raw === null || (raw as {v?: unknown}).v !== STATE_VERSION) return null;
    return TableStateV1.safeParse(raw).success ? (raw as TableState) : null;
};
