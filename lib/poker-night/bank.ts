// The bank as the table draws it (components/poker-night BankPanel): one row per player who has
// sat tonight — what they brought in, their rebuys, the chips they have at the table, what they
// left with, their net — and the footer check that every chip is accounted for. Pure and
// client-safe: the figures are views.bankOf's (the server's own ledger arithmetic, rebuilt from the
// view), the names the people part's, and the latest events come from GET detail?part=bank when
// the panel asks for them.
//
// A seated player's stack counts what they have in a live pot: the bank shows "300 in the pot"
// beside it and never takes it off the net, so a net stays steady through a hand.

import type {GameConfig} from '@/lib/poker-night/types';
import type {BankDetailRowView, BankEventView, People, SeatView, TableView} from '@/lib/poker-night/view-types';
import {bankOf} from '@/lib/poker-night/views';

export type BankRow = {
    pid: string;
    name: string;
    avatar: string | null;
    seat: number | null;
    seated: boolean;
    removed: boolean; // the host removed them ("Removed by host")
    me: boolean;
    chipsIn: number; // every chip bought tonight: the first chips in, rebuys and top-ups
    rebuys: number; // buys after the first
    stack: number; // chips at the table, what is in a live pot included; 0 once they have left
    inPot: number; // of the stack, what is in a live pot
    cashedOut: number; // what they left the table with, every time they left
    net: number; // stack + cashedOut − chipsIn
    pendingBuy: number; // chips that land when the hand ends
    events: BankEventView[]; // the latest, oldest first; empty until the detail is read
};

export type BankView = {
    rows: BankRow[];
    showRebuys: boolean; // the Rebuys column, hidden while nobody has rebought (invariant 8)
    broughtIn: number;
    onTable: number; // every chip at the table, live pots included
    inPot: number;
    cashedOut: number;
    balanced: boolean; // onTable + cashedOut = broughtIn: BANK_COPY.check's first sentence
    requests: {pid: string; name: string; amount: number}[]; // rebuys waiting for the host
};

export type BankInput = Pick<TableView, 'seats' | 'ledger' | 'requests'> & {people: People; removed: readonly string[]};

const nameOf = (people: People, pid: string): string => people[pid]?.name ?? '';

// The bank from a view (a RoomView or a PlayerView), the viewer's own row marked, with the latest
// events from GET detail?part=bank when the panel has read them.
export const bankView = (view: BankInput, opts: {me?: string | null; detail?: readonly BankDetailRowView[] | null} = {}): BankView => {
    const removed = new Set(view.removed);
    const events = new Map((opts.detail ?? []).map((row) => [row.pid, row.events]));
    const seatOf = new Map<string, number>();
    view.seats.forEach((s, i) => s && seatOf.set(s.pid, i));
    const rows = bankOf(view).map((row): BankRow => {
        const seat = seatOf.get(row.pid) ?? null;
        return {
            pid: row.pid, name: nameOf(view.people, row.pid), avatar: view.people[row.pid]?.avatar ?? null,
            seat, seated: row.seated, removed: removed.has(row.pid), me: opts.me !== undefined && opts.me !== null && row.pid === opts.me,
            chipsIn: row.bought, rebuys: row.buys, stack: row.chips, inPot: row.inPot, cashedOut: row.cashedOut, net: row.net,
            pendingBuy: seat === null ? 0 : view.seats[seat]?.pendingBuy ?? 0,
            events: [...(events.get(row.pid) ?? [])],
        };
    });
    // Seated players in seat order, then everyone who has left, in the order they first sat.
    const ordered = [
        ...rows.filter((r) => r.seat !== null).sort((a, b) => a.seat! - b.seat!),
        ...rows.filter((r) => r.seat === null),
    ];
    const sum = (pick: (r: BankRow) => number) => rows.reduce((total, r) => total + pick(r), 0);
    const broughtIn = sum((r) => r.chipsIn);
    const onTable = sum((r) => r.stack);
    const cashedOut = sum((r) => r.cashedOut);
    return {
        rows: ordered,
        showRebuys: rows.some((r) => r.rebuys > 0),
        broughtIn, onTable, inPot: sum((r) => r.inPot), cashedOut,
        balanced: onTable + cashedOut === broughtIn,
        requests: view.requests.map((r) => ({pid: r.pid, name: nameOf(view.people, r.pid), amount: r.amount})),
    };
};

// What a seated player may add to their stack now, by the table's rules — the client's copy of
// lib/poker-night/ledger.buyRange, which the server checks with: nothing while leaving (now, or
// after the hand in play: the viewer's own me.next), and for anything after their first buy-in
// (their ledger row has bought chips) nothing while rebuys are off or once they are used up; else at
// least what brings the stack (behind, plus any chips already waiting) to the table's minimum and at
// most what brings it to the cap. topUp is the "Top up to the cap" amount; rebuy says the stack is
// empty after chips were bought, so the button reads "Rebuy"; first says no chips were bought here
// tonight (a newcomer whose request was taken back or declined), so nothing reads as a rebuy.
export const buyOptions = (
    config: Pick<GameConfig, 'buyInMin' | 'buyInMax' | 'rebuys' | 'maxRebuys'>,
    seat: Pick<SeatView, 'chips' | 'pendingBuy' | 'state'> | null,
    row: {buys: number; bought: number} | null,
    leavingAfter = false,
): {min: number; max: number; topUp: number; rebuy: boolean; first: boolean} | null => {
    if (!seat || seat.state === 'leaving' || leavingAfter) return null;
    const bought = row !== null && row.bought > 0;
    if (bought && (config.rebuys === 'off' || (config.maxRebuys !== null && row!.buys >= config.maxRebuys))) return null;
    const held = seat.chips + seat.pendingBuy;
    const min = Math.max(1, config.buyInMin - held);
    const max = config.buyInMax - held;
    return max >= min ? {min, max, topUp: max, rebuy: held === 0 && bought, first: !bought} : null;
};
