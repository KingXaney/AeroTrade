// The viewer's dock, on real engine states: the action bar on their turn with exactly the moves the
// server would take (legalFor) and the raise panel's sizing; the early choices while someone else
// acts (what they cost, which one is chosen); what their cards make so far, before the flop and
// after; the seat's own controls (sit out, deal me in, I'm back), showing their cards in the pause,
// the rebuy once the stack is empty, and the host's first deal.

import {describe, expect, it} from 'vitest';
import {legalFor, snapshotFromState} from '@/lib/poker-night/betting';
import {nextDueAt} from '@/lib/poker-night/clock';
import {dockView, handStrength, preOptions, samePre} from '@/lib/poker-night/dock';
import {reduce} from '@/lib/poker-night/engine';
import type {TableState} from '@/lib/poker-night/types';
import type {PlayerView} from '@/lib/poker-night/view-types';
import {clockLeaderOf, playerView} from '@/lib/poker-night/views';
import {C, F, R, X, cards, deal, moves, nowOf, ok, pidOf, table} from './fixtures';

const as = (s: TableState, seat: number): PlayerView => playerView(s, pidOf(seat), {
    code: 'K7QXM4', seq: 1, serverNow: nowOf(s), nextDueAt: nextDueAt(s), clockLeader: clockLeaderOf(s, {}), presence: {}, watchers: 0, realtimeOk: true, peopleV: 1,
    people: {}, removed: [], hasAccount: false, emotes: [], emoteSeq: 0, pass: null,
});
// Seat 0 the small blind, 1 the big blind, 2 the button (first to act before the flop).
const three = (stacks: [number, number, number] = [1000, 1000, 1000], config = {}) => table({0: stacks[0], 1: stacks[1], 2: stacks[2]}, {config, lastBigBlind: 0});

describe('on the viewer\'s turn', () => {
    it('offers the server\'s own moves and sizes a raise from them', () => {
        const s = deal(three(), {holes: {2: 'AhAd'}});
        const dock = dockView(as(s, 2));
        expect(dock.myTurn).toBe(true);
        expect(dock.legal).toEqual(legalFor(snapshotFromState(s), 2));
        expect(dock.legal).toMatchObject({check: false, call: 20});
        expect(dock.sizing).toMatchObject({kind: 'raise', min: 40, max: 1000, toCall: 20, unit: 10});
        expect(dock.pre).toBeNull();
        expect(dock.strength).toEqual({category: 1, ranks: [12]});
        expect(dock.hole).toEqual(cards('AhAd'));
    });

    it('is nobody\'s turn but theirs: the others see no moves', () => {
        const s = deal(three());
        expect(dockView(as(s, 0)).myTurn).toBe(false);
        expect(dockView(as(s, 0)).legal).toBeNull();
    });
});

describe('before the turn comes round', () => {
    it('offers the early choices, priced at what is owed', () => {
        const s = deal(three());
        // Seat 0 posted 10 and owes 10 more.
        expect(dockView(as(s, 0)).pre).toEqual({options: [{kind: 'check-fold'}, {kind: 'call', amount: 10}, {kind: 'call-any'}], selected: null});
        // The big blind owes nothing yet.
        expect(dockView(as(s, 1)).pre?.options).toEqual([{kind: 'check-fold'}, {kind: 'check'}, {kind: 'call-any'}]);
    });

    it('marks the choice the server holds', () => {
        let s = deal(three());
        s = ok(reduce(s, {type: 'pre', by: pidOf(1), pre: {kind: 'check'}, at: nowOf(s)}));
        expect(dockView(as(s, 1)).pre?.selected).toEqual({kind: 'check'});
    });

    it('offers none once the viewer has folded, and shows no cards', () => {
        let s = deal(three());
        s = moves(s, C, F);
        const dock = dockView(as(s, 0));
        expect(dock.folded).toBe(true);
        expect(dock.pre).toBeNull();
        expect(dock.dealtIn).toBe(false);
        expect(dock.strength).toBeNull();
    });

    it('reads the pre-action pairs', () => {
        expect(preOptions(0).map((p) => p.kind)).toEqual(['check-fold', 'check', 'call-any']);
        expect(samePre({kind: 'call', amount: 40}, {kind: 'call', amount: 40})).toBe(true);
        expect(samePre({kind: 'call', amount: 40}, {kind: 'call', amount: 60})).toBe(false);
        expect(samePre({kind: 'check'}, null)).toBe(false);
    });
});

describe('what the cards make', () => {
    it('names a pair or the high card before the flop, the best hand after', () => {
        expect(handStrength(cards('9c9d'), [])).toEqual({category: 1, ranks: [7]});
        expect(handStrength(cards('Kc4d'), [])).toEqual({category: 0, ranks: [11, 2]});
        expect(handStrength(cards('AhKh'), cards('QhJhTh'))).toEqual({category: 8, ranks: [12]});
        expect(handStrength(null, [])).toBeNull();
    });

    it('follows the board as it comes', () => {
        let s = deal(three(), {holes: {0: 'AhKh'}, board: 'As7c2dKd3s'});
        expect(dockView(as(s, 0)).strength).toEqual({category: 0, ranks: [12, 11]});
        s = moves(s, C, C, X);
        expect(dockView(as(s, 0)).strength).toEqual({category: 1, ranks: [12, 11, 5, 0]});
        s = moves(s, X, X, X);
        expect(dockView(as(s, 0)).strength).toEqual({category: 2, ranks: [12, 11, 5]});
    });
});

describe('the seat\'s own controls', () => {
    it('offers sitting out to a player in the game, dealing back in to one sitting out, and "I\'m back" to one away', () => {
        const s = three();
        expect(dockView(as(s, 0)).control).toBe('sit-out');
        const out = ok(reduce(s, {type: 'sit-out', by: pidOf(0), at: nowOf(s)}));
        expect(dockView(as(out, 0)).control).toBe('sit-in');
        const away = structuredClone(s);
        away.seats[0]!.away = true;
        expect(dockView(as(away, 0)).control).toBe('back');
    });

    it('lets a dealt player show their cards in the pause, once', () => {
        let s = deal(three(), {board: '2c7d9s3s4c'});
        s = moves(s, F, F);
        expect(dockView(as(s, 1)).canShow).toBe(true);
        expect(dockView(as(s, 2)).canShow).toBe(true);
        const shown = ok(reduce(s, {type: 'show', by: pidOf(2), at: nowOf(s)}));
        expect(dockView(as(shown, 2)).canShow).toBe(false);
    });

    it('offers a rebuy once the stack is empty, by the table\'s rules', () => {
        const s = three([1000, 1000, 1000], {buyInMin: 1000, buyInMax: 2000});
        const broke = structuredClone(s);
        broke.seats[0]!.stack = 0;
        expect(dockView(as(broke, 0)).buy).toEqual({min: 1000, max: 2000, topUp: 2000, rebuy: true});
        expect(dockView(as(s, 0)).buy).toBeNull();
        const off = structuredClone(broke);
        off.config.rebuys = 'off';
        expect(dockView(as(off, 0)).buy).toBeNull();
    });

    it('lets the host deal the first hand once two are seated', () => {
        const s = three();
        const fresh = structuredClone(s);
        fresh.status = 'open';
        expect(dockView(as(fresh, 0)).deal).toBe(true);
        expect(dockView(as(fresh, 1)).deal).toBe(false);
        expect(dockView(as(s, 0)).deal).toBe(false);
        const alone = structuredClone(fresh);
        alone.seats[1] = null;
        alone.seats[2] = null;
        expect(dockView(as(alone, 0)).deal).toBe(false);
    });

    it('has no seat for a watcher', () => {
        const s = three();
        const v = as(s, 5);
        expect(v.me.seat).toBeNull();
        const dock = dockView(v);
        expect(dock.seat).toBeNull();
        expect(dock.control).toBeNull();
        expect(dock.myTurn).toBe(false);
    });

    it('sizes a bet with the pot when nobody has bet', () => {
        let s = deal(three());
        s = moves(s, C, C, X);
        const dock = dockView(as(s, 0));
        expect(dock.sizing).toMatchObject({kind: 'bet', min: 20, pot: 60});
        s = moves(s, R(40));
        expect(dockView(as(s, 1)).sizing).toMatchObject({kind: 'raise', min: 80, toCall: 40, pot: 100});
    });
});
