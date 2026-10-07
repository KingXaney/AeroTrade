// Who sits where and who is dealt in: the clockwise walk round the table and the positions of a new
// hand. Pure.
//
// The big blind always moves on to the next eligible seat; the small blind is the eligible seat
// before it and the button the one before that (heads-up, the other seat is both). Nobody skips the
// big blind by sitting out at the right moment. The known cost: when the last big blind leaves, the
// seat before it can post the small blind twice running — half a big blind, documented in
// seats.test.ts.

import type {Hand, HandSeat, Seat, TableState} from '@/lib/poker-night/types';

// A hand still being played: dealt, and its result not yet in.
export const isLive = (hand: Hand | null): hand is Hand => hand !== null && hand.phase !== 'complete';

// The seat index a player sits in, or null.
export const seatOf = (state: Pick<TableState, 'seats'>, pid: string): number | null => {
    const i = state.seats.findIndex((seat) => seat !== null && seat.pid === pid);
    return i < 0 ? null : i;
};

// The player's place in the running hand, or null when no hand is live or they were not dealt in.
export const liveSeatOf = (state: Pick<TableState, 'hand'>, pid: string): HandSeat | null =>
    isLive(state.hand) ? state.hand.seats.find((p) => p.pid === pid) ?? null : null;

// The place in the hand (live or complete) of whoever sits in seat i now: a seat freed and taken
// again during the results pause is somebody else.
export const handSeatAt = (state: Pick<TableState, 'hand' | 'seats'>, i: number): HandSeat | null => {
    const seat = state.seats[i];
    if (!seat || !state.hand) return null;
    return state.hand.seats.find((p) => p.seat === i && p.pid === seat.pid) ?? null;
};

const distance = (from: number, to: number, size: number): number => (((to - from - 1) % size) + size) % size;

// The seats in clockwise order starting after `from`; `from` itself, if listed, comes last.
export const clockwiseAfter = (from: number, seats: readonly number[], size: number): number[] =>
    [...seats].sort((a, b) => distance(from, a, size) - distance(from, b, size));

// The first listed seat clockwise after `from` (not `from` itself unless it is the only one).
export const firstAfter = (from: number, seats: readonly number[], size: number): number =>
    clockwiseAfter(from, seats, size)[0];

// The listed seat just before `from`, going round the other way.
export const lastBefore = (from: number, seats: readonly number[], size: number): number => {
    const others = clockwiseAfter(from, seats, size).filter((seat) => seat !== from);
    return others.length > 0 ? others[others.length - 1] : from;
};

// Dealt into the next hand: occupied, holding chips, not leaving, not sitting out and not about to
// be (a sit-out asked for during a hand, or away), which the deal turns into sitting out.
export const isEligible = (seat: Seat | null): seat is Seat =>
    seat !== null && seat.stack > 0 && !seat.leaving && !seat.sittingOut && !seat.sitOutNext && !seat.away;

export const eligibleSeats = (state: Pick<TableState, 'seats'>): number[] => {
    const out: number[] = [];
    state.seats.forEach((seat, i) => {
        if (isEligible(seat)) out.push(i);
    });
    return out;
};

// The positions of the next hand over the eligible seats (two or more, in seat order). The first
// hand's big blind is drawn: eligible[draw % n].
export const positions = (
    state: Pick<TableState, 'seats' | 'lastBigBlind'>,
    eligible: readonly number[],
    draw: number,
): {bb: number; sb: number; button: number; order: number[]} => {
    const size = state.seats.length;
    const n = eligible.length;
    if (n < 2) throw new RangeError(`positions need two seats, not ${n}`);
    const bb = state.lastBigBlind === null ? eligible[draw % n] : firstAfter(state.lastBigBlind, eligible, size);
    const sb = lastBefore(bb, eligible, size);
    const button = n === 2 ? sb : lastBefore(sb, eligible, size);
    return {bb, sb, button, order: clockwiseAfter(button, eligible, size)};
};
