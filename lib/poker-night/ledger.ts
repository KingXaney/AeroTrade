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

// An event's time is kept in whole seconds since the table was created (ledgerEvents reads it back).
const pushEvent = (w: Work, row: LedgerRow, kind: LedgerKind, amount: number) => {
    row.events.push([Math.floor((w.at - w.state.createdAt) / 1000), LEDGER_KINDS.indexOf(kind), amount]);
    if (row.events.length > KEEP.LEDGER_EVENTS) row.events.splice(0, row.events.length - KEEP.LEDGER_EVENTS);
};

// A row the night no longer needs once its player is gone: never dealt a hand, and every chip
// bought cashed out again (a sit-down and a leave, a removal before the first deal). Its bought and
// cashed out are equal, so dropping it moves no sum in conservation (engine.forgetSettled).
export const isSettled = (row: LedgerRow): boolean => row.hands === 0 && row.bought === row.cashedOut;

// A row's kept events, read back with their times (to the second).
export const ledgerEvents = (state: Pick<TableState, 'createdAt'>, row: LedgerRow): {at: number; kind: LedgerKind; amount: number}[] =>
    row.events.map(([at, kind, amount]) => ({at: state.createdAt + at * 1000, kind: LEDGER_KINDS[kind], amount}));

// Whether a player has bought chips here tonight: their next buy (or sitting down again) is a rebuy
// or a top-up, under the rebuy policy; before that it is their first buy-in, which no policy stops.
export const hasBought = (row: LedgerRow | null): boolean => row !== null && row.bought > 0;

// Whether a buy by `pid` waits for the host: every buy but the host's own once the first hand has
// been dealt (a newcomer's first chips, a re-sit, a rebuy, a top-up). Before that, chips land at once.
export const needsHost = (state: Pick<TableState, 'hostPid' | 'handNo'>, pid: string): boolean => pid !== state.hostPid && state.handNo > 0;

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

// The player in seat i takes their stack away and the seat empties; their requests go with them, and
// so does their "no asks" setting unless they played the hand asks are about (it matters only to a
// seated player or one of that hand, so the list never names more than the seats and the hand's
// players; the next deal forgets the rest). A player who never had chips here (their first buy-in
// still waiting for the host) leaves no row.
export const cashOut = (w: Work, i: number, kind: 'cash-out' | 'removed'): void => {
    const seat = w.state.seats[i];
    if (!seat) return;
    const row = seat.stack > 0 ? rowFor(w, seat.pid) : ledgerRow(w.state, seat.pid);
    if (row) {
        row.cashedOut += seat.stack;
        pushEvent(w, row, kind, seat.stack);
        w.ledgerDirty = true;
    }
    w.state.seats[i] = null;
    w.state.requests = w.state.requests.filter((r) => r.pid !== seat.pid);
    if (w.state.noAsks.includes(seat.pid) && !(w.state.hand?.seats.some((p) => p.pid === seat.pid) ?? false)) {
        w.state.noAsks = w.state.noAsks.filter((pid) => pid !== seat.pid);
    }
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

// The chips a seated player may add now (their first buy-in, a rebuy at zero, a top-up above it),
// or null when they may not: they are leaving (now or after the hand in play), the policy is off or
// the rebuy limit reached (for anything after the first buy-in), or they are already at the cap.
export const buyRange = (state: Pick<TableState, 'seats' | 'ledger' | 'config'>, pid: string): {min: number; max: number} | null => {
    const i = seatOf(state, pid);
    if (i === null) return null;
    const seat = state.seats[i]!;
    const {rebuys, maxRebuys, buyInMin, buyInMax} = state.config;
    if (seat.leaving || seat.leaveAfter) return null;
    const row = ledgerRow(state, pid);
    if (hasBought(row) && (rebuys === 'off' || (maxRebuys !== null && row!.buys >= maxRebuys))) return null;
    const held = seat.stack + seat.pendingBuy;
    const min = Math.max(1, buyInMin - held);
    const max = buyInMax - held;
    return max >= min ? {min, max} : null;
};
