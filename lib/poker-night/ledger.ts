// The bank: what each player brought to the table, what they hold, what they took away. Pure.
//
// A row per player stays for the whole night, through leaving and sitting down again. Chips are
// recorded only when they land — a buy that waits for the hand to end is not bought until it does —
// so one sum always holds (conservation):
//
//     Σ stacks + Σ committed to a live hand + Σ cashed out = Σ bought
//
// A player's chips are their stack plus what they have in a live hand, steady while they bet; their
// net is chips + cashed out − bought, and what is in the pot is shown beside it, never taken off.
//
// The mutating helpers (recordBuy, cashOut) work on the reducer's private copy (a Work); the reads
// take any state.

import {KEEP, LEDGER_KINDS} from '@/lib/poker-night/config';
import {liveSeatOf, seatOf} from '@/lib/poker-night/seats';
import type {BuyKind, LedgerKind, LedgerRow, TableState, Work} from '@/lib/poker-night/types';

export const ledgerRow = (state: Pick<TableState, 'ledger'>, pid: string): LedgerRow | null =>
    state.ledger.find((row) => row.pid === pid) ?? null;

const rowFor = (w: Work, pid: string): LedgerRow => {
    const found = ledgerRow(w.state, pid);
    if (found) return found;
    const row: LedgerRow = {pid, bought: 0, cashedOut: 0, buys: 0, events: [], hands: 0, wins: 0, biggestWin: 0, allIns: 0, peakChips: 0};
    w.state.ledger.push(row);
    return row;
};

const pushEvent = (w: Work, row: LedgerRow, kind: LedgerKind, amount: number) => {
    row.events.push([w.at - w.state.createdAt, LEDGER_KINDS.indexOf(kind), amount]);
    if (row.events.length > KEEP.LEDGER_EVENTS) row.events.splice(0, row.events.length - KEEP.LEDGER_EVENTS);
};

// A row's kept events, read back with their times.
export const ledgerEvents = (state: Pick<TableState, 'createdAt'>, row: LedgerRow): {at: number; kind: LedgerKind; amount: number}[] =>
    row.events.map(([at, kind, amount]) => ({at: state.createdAt + at, kind: LEDGER_KINDS[kind], amount}));

// Chips that have just landed on the player's seat: called after the stack grew, with the amount
// that landed and the kind decided as it landed.
export const recordBuy = (w: Work, pid: string, amount: number, kind: BuyKind): void => {
    const row = rowFor(w, pid);
    if (kind !== 'buy-in') row.buys++;
    row.bought += amount;
    pushEvent(w, row, kind, amount);
    row.peakChips = Math.max(row.peakChips, chipsOf(w.state, pid));
    w.ledgerDirty = true;
};

// The player in seat i takes their stack away and the seat empties; their requests go with them.
export const cashOut = (w: Work, i: number, kind: 'cash-out' | 'removed'): void => {
    const seat = w.state.seats[i];
    if (!seat) return;
    const row = rowFor(w, seat.pid);
    row.cashedOut += seat.stack;
    pushEvent(w, row, kind, seat.stack);
    w.state.seats[i] = null;
    w.state.requests = w.state.requests.filter((r) => r.pid !== seat.pid);
    w.ledgerDirty = true;
};

export const inPotOf = (state: Pick<TableState, 'hand'>, pid: string): number => liveSeatOf(state, pid)?.committed ?? 0;

export const chipsOf = (state: Pick<TableState, 'hand' | 'seats'>, pid: string): number => {
    const seat = seatOf(state, pid);
    return seat === null ? 0 : state.seats[seat]!.stack + inPotOf(state, pid);
};

export const netOf = (state: Pick<TableState, 'hand' | 'seats' | 'ledger'>, pid: string): number => {
    const row = ledgerRow(state, pid);
    return row ? chipsOf(state, pid) + row.cashedOut - row.bought : 0;
};

export const conservation = (state: Pick<TableState, 'hand' | 'seats' | 'ledger'>) => {
    let bought = 0;
    let cashedOut = 0;
    for (const row of state.ledger) {
        bought += row.bought;
        cashedOut += row.cashedOut;
    }
    let stacks = 0;
    for (const seat of state.seats) stacks += seat?.stack ?? 0;
    let inPot = 0;
    if (state.hand && state.hand.phase !== 'complete') for (const p of state.hand.seats) inPot += p.committed;
    return {bought, stacks, inPot, cashedOut, ok: stacks + inPot + cashedOut === bought};
};

export type LedgerDigest = {pid: string; bought: number; cashedOut: number; chips: number; net: number; buys: number;
    hands: number; wins: number; biggestWin: number; allIns: number; peakChips: number};

// Every figure a night's result row carries, per player: two digests differ exactly when one of
// those figures moved (the results store writes only then).
export const ledgerDigest = (state: Pick<TableState, 'hand' | 'seats' | 'ledger'>): LedgerDigest[] =>
    state.ledger.map((row) => ({
        pid: row.pid, bought: row.bought, cashedOut: row.cashedOut, chips: chipsOf(state, row.pid), net: netOf(state, row.pid),
        buys: row.buys, hands: row.hands, wins: row.wins, biggestWin: row.biggestWin, allIns: row.allIns, peakChips: row.peakChips,
    }));

// The chips a seated player may add now (a rebuy at zero, a top-up above it), or null when they may
// not: the policy is off, the rebuy limit is reached, they are leaving or already at the cap.
export const buyRange = (state: Pick<TableState, 'seats' | 'ledger' | 'config'>, pid: string): {min: number; max: number} | null => {
    const i = seatOf(state, pid);
    if (i === null) return null;
    const seat = state.seats[i]!;
    const {rebuys, maxRebuys, buyInMin, buyInMax} = state.config;
    if (seat.leaving || rebuys === 'off') return null;
    const row = ledgerRow(state, pid);
    if (row && maxRebuys !== null && row.buys >= maxRebuys) return null;
    const held = seat.stack + seat.pendingBuy;
    const min = Math.max(1, buyInMin - held);
    const max = buyInMax - held;
    return max >= min ? {min, max} : null;
};
