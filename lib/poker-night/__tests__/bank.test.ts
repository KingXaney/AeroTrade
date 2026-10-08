// The bank as the table draws it: every player who sat, with the chips they brought in, their
// rebuys, what they hold at the table (a live pot included, so the net holds steady through a hand)
// and what they left with; the footer's check that every chip is accounted for, on seeded nights
// whatever happened; the Rebuys column only once someone has rebought; the requests waiting for the
// host; and what the rebuy buttons offer, held to the server's own rule.

import {describe, expect, it} from 'vitest';
import {BANK_COPY} from '@/lib/learn/copy/poker-night';
import {bankView, buyOptions} from '@/lib/poker-night/bank';
import {nextDueAt} from '@/lib/poker-night/clock';
import {reduce} from '@/lib/poker-night/engine';
import {buyRange, ledgerRow} from '@/lib/poker-night/ledger';
import type {TableState} from '@/lib/poker-night/types';
import {bankDetailView, peopleIds, peopleView, publicView} from '@/lib/poker-night/views';
import {C, R, deal, moves, nowOf, ok, pidOf, randomNight, table} from './fixtures';

const viewOf = (s: TableState, removed: string[] = []) => ({
    ...publicView(s),
    ...peopleView(Object.fromEntries(peopleIds(s).map((pid) => [pid, {name: pid.toUpperCase(), avatar: 'v1:fox:tangerine:none:none'}])), removed),
    nextDueAt: nextDueAt(s),
});

const three = (config = {}) => table({0: 1000, 1: 1000, 2: 1000}, {config, lastBigBlind: 0});

describe('the bank', () => {
    it('counts a live pot in the stack, so the net stays steady through a hand', () => {
        let s = deal(three(), {board: '2c7d9s3s4c'});
        s = moves(s, R(60), C);
        const bank = bankView(viewOf(s), {me: pidOf(2)});
        const button = bank.rows.find((r) => r.pid === pidOf(2))!;
        expect(button).toMatchObject({seat: 2, seated: true, me: true, chipsIn: 1000, stack: 1000, inPot: 60, net: 0, name: 'P2'});
        expect(bank.inPot).toBe(60 + 60 + 20);
        expect(bank.balanced).toBe(true);
        expect(BANK_COPY.check(bank.onTable, bank.broughtIn, bank.cashedOut)).toBe('Every chip is accounted for: 3,000 brought in.');
    });

    it('lists seated players by seat, then those who left, with what they left with', () => {
        let s = three();
        s = ok(reduce(s, {type: 'leave', by: pidOf(1), at: nowOf(s)}));
        const bank = bankView(viewOf(s, [pidOf(1)]));
        expect(bank.rows.map((r) => r.pid)).toEqual([pidOf(0), pidOf(2), pidOf(1)]);
        expect(bank.rows[2]).toMatchObject({seated: false, seat: null, stack: 0, cashedOut: 1000, net: 0, removed: true});
        expect(bank.balanced).toBe(true);
    });

    it('shows the Rebuys column only once someone has rebought, and the requests by name', () => {
        // A hand has been dealt: the top-up waits for the host.
        let s = {...table({0: 1000, 1: 500, 2: 1000}, {lastBigBlind: 0, config: {rebuys: 'approve', buyInMin: 1000, buyInMax: 2000}}), handNo: 1};
        expect(bankView(viewOf(s)).showRebuys).toBe(false);
        s = ok(reduce(s, {type: 'buy', by: pidOf(1), amount: 500, at: nowOf(s)}));
        const waiting = bankView(viewOf(s));
        expect(waiting.requests).toEqual([{pid: pidOf(1), name: 'P1', amount: 500}]);
        s = ok(reduce(s, {type: 'host', by: pidOf(0), op: {op: 'approve', pid: pidOf(1)}, at: nowOf(s)}));
        const bank = bankView(viewOf(s));
        expect(bank.showRebuys).toBe(true);
        expect(bank.rows.find((r) => r.pid === pidOf(1))).toMatchObject({rebuys: 1, chipsIn: 1000, stack: 1000, net: 0});
    });

    it('takes the latest events from the bank detail', () => {
        const s = three();
        const bank = bankView(viewOf(s), {detail: bankDetailView(s)});
        expect(bank.rows[0].events).toEqual([{at: expect.any(Number), kind: 'buy-in', amount: 1000}]);
        expect(bankView(viewOf(s)).rows[0].events).toEqual([]);
    });

    it('balances on every state of seeded nights', () => {
        for (let seed = 1; seed <= 6; seed++) {
            for (const {state} of randomNight(seed, 300)) {
                const bank = bankView(viewOf(state));
                expect(bank.balanced, `seed ${seed}`).toBe(true);
                expect(bank.rows).toHaveLength(state.ledger.length);
            }
        }
    });
});

describe('what the rebuy buttons offer', () => {
    it('matches the server\'s own range for every seated player of seeded nights', () => {
        for (let seed = 1; seed <= 4; seed++) {
            for (const {state} of randomNight(seed, 200)) {
                const view = publicView(state);
                state.seats.forEach((seat, i) => {
                    if (!seat) return;
                    const offer = buyOptions(state.config, view.seats[i], ledgerRow(state, seat.pid), seat.leaveAfter);
                    const range = buyRange(state, seat.pid);
                    expect(offer ? {min: offer.min, max: offer.max} : null, `seed ${seed} seat ${i}`).toEqual(range);
                });
            }
        }
    });

    it('offers a rebuy at zero and a top-up to the cap above it, and a newcomer their first chips whatever the policy', () => {
        const config = {buyInMin: 1000, buyInMax: 2000, rebuys: 'approve' as const, maxRebuys: null};
        const row = {buys: 0, bought: 1000};
        expect(buyOptions(config, {chips: 0, pendingBuy: 0, state: 'busted'}, row)).toEqual({min: 1000, max: 2000, topUp: 2000, rebuy: true});
        expect(buyOptions(config, {chips: 1500, pendingBuy: 0, state: 'waiting'}, row)).toEqual({min: 1, max: 500, topUp: 500, rebuy: false});
        expect(buyOptions(config, {chips: 2000, pendingBuy: 0, state: 'waiting'}, row)).toBeNull();
        expect(buyOptions({...config, rebuys: 'off'}, {chips: 0, pendingBuy: 0, state: 'busted'}, row)).toBeNull();
        expect(buyOptions({...config, maxRebuys: 2}, {chips: 0, pendingBuy: 0, state: 'busted'}, {buys: 2, bought: 1000})).toBeNull();
        expect(buyOptions(config, null, row)).toBeNull();
        expect(buyOptions({...config, rebuys: 'off', maxRebuys: 1}, {chips: 0, pendingBuy: 0, state: 'busted'}, null)).toEqual({min: 1000, max: 2000, topUp: 2000, rebuy: false});
        expect(buyOptions(config, {chips: 500, pendingBuy: 0, state: 'waiting'}, row, true)).toBeNull();
    });
});
