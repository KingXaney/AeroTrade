// The viewer's dock, on real engine states: the action bar on their turn with exactly the moves the
// server would take (legalFor) and the raise panel's sizing; the early choices while someone else
// acts (what they cost, which one is chosen); what their cards make so far, before the flop and
// after; the seat's own controls (sit out, deal me in, I'm back), showing their cards in the pause,
// the rebuy once the stack is empty, and the host's first deal.

import {describe, expect, it} from 'vitest';
import {legalFor, snapshotFromState} from '@/lib/poker-night/betting';
import {nextDueAt} from '@/lib/poker-night/clock';
import {boardStrengths, dockView, handStrength, preOptions, preRowKey, rebuyTap, samePre, throwAwayCount} from '@/lib/poker-night/dock';
import {homeAsks} from '@/lib/poker-night/overlays';
import {reduce} from '@/lib/poker-night/engine';
import type {TableState} from '@/lib/poker-night/types';
import type {PlayerView} from '@/lib/poker-night/view-types';
import {clockLeaderOf, playerView} from '@/lib/poker-night/views';
import {A, C, F, R, X, T0, cards, deal, moves, nowOf, ok, pidOf, table} from './fixtures';

const as = (s: TableState, seat: number): PlayerView => playerView(s, pidOf(seat), {
    code: 'K7QXM4', seq: 1, serverNow: nowOf(s), nextDueAt: nextDueAt(s), clockLeader: clockLeaderOf(s, {}), presence: {}, watchers: 0, realtimeOk: true, peopleV: 1,
    people: {}, removed: [], hasAccount: false, emotes: [], emoteSeq: 0, pass: null, nudge: 0,
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

    it('in PLO: four cards, the server\'s pot-limit moves, the pot as the top size, no hand named before the flop', () => {
        const s = deal(three([1000, 1000, 1000], {variant: 'plo'}), {holes: {2: 'AhAdKcQs'}});
        const dock = dockView(as(s, 2));
        expect(dock.hole).toEqual(cards('AhAdKcQs'));
        expect(dock.legal).toEqual(legalFor(snapshotFromState(s), 2));
        expect(dock.legal!.raise).toEqual({kind: 'raise', min: 40, max: 70});
        expect(dock.sizing).toMatchObject({min: 40, max: 70, cap: 'pot'});
        expect(dock.strength).toBeNull();
        let flop = deal(three([1000, 1000, 1000], {variant: 'plo'}), {holes: {0: 'AhAdKcQs'}, board: 'As7c2dKd3s'});
        flop = moves(flop, C, C, X);
        // Two aces in hand with the flop's three: three aces, the seven and the two — never the king in hand.
        expect(dockView(as(flop, 0)).strength).toEqual({category: 3, ranks: [12, 5, 0]});
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

    it('offers none once the viewer has folded, and names no hand', () => {
        let s = deal(three());
        s = moves(s, C, F);
        const dock = dockView(as(s, 0));
        expect(dock.folded).toBe(true);
        expect(dock.pre).toBeNull();
        expect(dock.dealtIn).toBe(false);
        expect(dock.strength).toBeNull();
    });
});

describe('a folded hand', () => {
    it('stays the viewer\'s to see, dimmed, through the hand and its pause, until the next deal', () => {
        let s = deal(three(), {holes: {0: '7c2d'}, board: 'AsKd9h4c3s'});
        s = moves(s, C, F);
        const folded = dockView(as(s, 0));
        expect(folded).toMatchObject({folded: true, mucked: true, dealtIn: false, hole: cards('7c2d')});
        // Nobody else sees them.
        for (const other of [1, 2]) expect(as(s, other).seats[0]!.cards).toBe('none');
        s = moves(s, X, X, X, X, X, X, X);
        expect(s.hand!.phase).toBe('complete');
        const pause = dockView(as(s, 0));
        expect(pause).toMatchObject({folded: false, mucked: true, hole: cards('7c2d'), canShow: true});
        // Shown, they are no longer mucked: everyone sees them.
        s = ok(reduce(s, {type: 'show', by: pidOf(0), at: nowOf(s)}));
        expect(dockView(as(s, 0))).toMatchObject({mucked: false, canShow: false});
        expect(as(s, 1).seats[0]!.cards).toEqual(cards('7c2d'));
        // The next deal brings new cards.
        s = deal(s, {holes: {0: 'AhAd'}});
        expect(dockView(as(s, 0))).toMatchObject({mucked: false, hole: cards('AhAd')});
    });

    it('never mucks a hand still being played, nor one a watcher never had', () => {
        const s = deal(three());
        for (const seat of [0, 1, 2]) expect(dockView(as(s, seat)).mucked).toBe(false);
        expect(dockView(as(s, 5)).mucked).toBe(false);
    });
});

describe('the break', () => {
    it('offers Sit out and Leave to a player who reached the showdown, in the pause', () => {
        let s = deal(three(), {board: 'AsKd9h4c3s'});
        s = moves(s, C, C, X, X, X, X, X, X, X, X, X, X);
        expect(s.hand!.result!.showdown).toBe(true);
        for (const seat of [0, 1, 2]) {
            const dock = dockView(as(s, seat));
            expect(dock.dealtIn).toBe(true);
            expect(dock).toMatchObject({live: false, sitOut: true, leave: true});
        }
    });

    it('offers them once folded, and never while the hand is still the viewer\'s to play', () => {
        let s = deal(three());
        for (const seat of [0, 1, 2]) expect(dockView(as(s, seat))).toMatchObject({sitOut: false, leave: false});
        s = moves(s, F);
        expect(dockView(as(s, 2))).toMatchObject({folded: true, sitOut: true, leave: true});
        expect(dockView(as(s, 0))).toMatchObject({sitOut: false, leave: false});
    });

    it('offers them between hands, Leave beside a rebuy, and neither beside the host\'s first deal', () => {
        const s = three();
        expect(dockView(as(s, 1))).toMatchObject({sitOut: true, leave: true});
        const broke = structuredClone(s);
        broke.seats[0]!.stack = 0;
        expect(dockView(as(broke, 0))).toMatchObject({leave: true});
        const out = ok(reduce(s, {type: 'sit-out', by: pidOf(1), at: nowOf(s)}));
        expect(dockView(as(out, 1))).toMatchObject({control: 'sit-in', sitOut: false, leave: true});
        const fresh = structuredClone(s);
        fresh.status = 'open';
        expect(dockView(as(fresh, 0))).toMatchObject({deal: true, sitOut: false, leave: false});
        expect(dockView(as(fresh, 1))).toMatchObject({deal: false, sitOut: true, leave: true});
    });

    it('offers nothing to a player already leaving, or at a closed table', () => {
        let s = deal(three());
        // The big blind, owing nothing, stays in the hand, away, until it ends.
        s = ok(reduce(s, {type: 'leave', by: pidOf(1), at: nowOf(s)}));
        expect(as(s, 1).seats[1]!.state).toBe('leaving');
        expect(dockView(as(s, 1))).toMatchObject({sitOut: false, leave: false});
        const closed = structuredClone(three());
        closed.status = 'closed';
        expect(dockView(as(closed, 0))).toMatchObject({sitOut: false, leave: false});
    });

    it('knows a folded player who left is leaving, though the plate still reads Folded: nothing more to tap', () => {
        let s = deal(three());
        s = moves(s, F);
        expect(dockView(as(s, 2))).toMatchObject({folded: true, sitOut: true, leave: true, leaving: false});
        s = ok(reduce(s, {type: 'leave', by: pidOf(2), at: nowOf(s)}));
        expect(s.seats[2]!.leaving).toBe(true);
        const view = as(s, 2);
        expect(view.seats[2]!.state).toBe('folded');
        expect(dockView(view)).toMatchObject({leaving: true, sitOut: false, leave: false, control: null, takeBack: false, sitOutNext: false});
        expect(homeAsks(view)).toBe(false);
        // All in and then gone: the same.
        let a = deal(three([1000, 1000, 300]));
        a = moves(a, A);
        a = ok(reduce(a, {type: 'leave', by: pidOf(2), at: nowOf(a)}));
        expect(as(a, 2).seats[2]!.state).toBe('all-in');
        expect(dockView(as(a, 2))).toMatchObject({leaving: true, leave: false, sitOut: false});
    });

    it('says a "Sit out next hand" waits, and offers to take it back, once the viewer folded', () => {
        let s = deal(three());
        s = moves(s, F);
        s = ok(reduce(s, {type: 'sit-out', by: pidOf(2), at: nowOf(s)}));
        expect(dockView(as(s, 2))).toMatchObject({sitOutNext: true, sitOut: false, takeBack: true, leave: true});
        // Still playing the hand: the dock says so, the menu takes it back (no row for it).
        let p = deal(three());
        p = ok(reduce(p, {type: 'sit-out', by: pidOf(0), at: nowOf(p)}));
        expect(dockView(as(p, 0))).toMatchObject({sitOutNext: true, takeBack: false, sitOut: false});
        // Taken back: offered again.
        const back = ok(reduce(s, {type: 'sit-in', by: pidOf(2), at: nowOf(s)}));
        expect(dockView(as(back, 2))).toMatchObject({sitOutNext: false, sitOut: true, takeBack: false});
    });

    it('keys the early choices by the hand and the choices, so a deal or a changed choice mounts them afresh', () => {
        const quiet = preOptions(0);
        const facing = preOptions(40);
        expect(preRowKey(7, quiet)).toBe('7:check-fold,check,call-any');
        expect(preRowKey(7, facing)).toBe('7:check-fold,call-40,call-any');
        expect(preRowKey(8, quiet)).not.toBe(preRowKey(7, quiet));
        expect(preRowKey(7, preOptions(60))).not.toBe(preRowKey(7, facing));
        expect(preRowKey(null, quiet)).toBe('0:check-fold,check,call-any');
    });

    it('reads the pre-action pairs', () => {
        expect(preOptions(0).map((p) => p.kind)).toEqual(['check-fold', 'check', 'call-any']);
        expect(samePre({kind: 'call', amount: 40}, {kind: 'call', amount: 40})).toBe(true);
        expect(samePre({kind: 'call', amount: 40}, {kind: 'call', amount: 60})).toBe(false);
        expect(samePre({kind: 'check'}, null)).toBe(false);
    });
});

describe('what the cards make', () => {
    it('names a pair or the high card before the flop, the hand the cards make after', () => {
        expect(handStrength('holdem', cards('9c9d'), [])).toEqual({category: 1, ranks: [7]});
        expect(handStrength('holdem', cards('Kc4d'), [])).toEqual({category: 0, ranks: [11, 2]});
        expect(handStrength('holdem', cards('AhKh'), cards('QhJhTh'))).toEqual({category: 8, ranks: [12]});
        expect(handStrength('holdem', null, [])).toBeNull();
        // Triple T reads only once it holds two.
        expect(handStrength('triple-t', cards('9c9dKs'), [])).toBeNull();
        expect(handStrength('triple-t', cards('9c9d'), [])).toEqual({category: 1, ranks: [7]});
    });

    it('in PLO, names nothing before the flop, then exactly two of the four with three from the board', () => {
        expect(handStrength('plo', cards('AhAc7s3d'), [])).toBeNull();
        // One heart in hand on four on the board: no flush, a pair of aces.
        expect(handStrength('plo', cards('AhAc7s3d'), cards('Kh9h6h2h'))).toEqual({category: 1, ranks: [12, 11, 7, 4]});
        expect(handStrength('holdem', cards('AhAc'), cards('Kh9h6h2h'))).toMatchObject({category: 5});
        expect(handStrength('plo', cards('AhAc'), cards('Kh9h6h'))).toBeNull();
    });

    it('follows the board as it comes', () => {
        let s = deal(three(), {holes: {0: 'AhKh'}, board: 'As7c2dKd3s'});
        expect(dockView(as(s, 0)).strength).toEqual({category: 0, ranks: [12, 11]});
        s = moves(s, C, C, X);
        expect(dockView(as(s, 0)).strength).toEqual({category: 1, ranks: [12, 11, 5, 0]});
        s = moves(s, X, X, X);
        expect(dockView(as(s, 0)).strength).toEqual({category: 2, ranks: [12, 11, 5]});
        expect(dockView(as(s, 0)).strengths).toBeNull();
    });

    it('says what the cards make on each of two or three boards, once the flop is out', () => {
        const holes = {0: 'JsTs4h5h', 1: '9c9d8h7h', 2: '6c6d2s3s'};
        let s = deal(three([1000, 1000, 1000], {variant: 'plo', boards: 3}), {holes, boards: ['AsKsQs2d3c', '9h9s4c4d5c', '8d8c7d7c2h']});
        expect(dockView(as(s, 0)).strengths).toBeNull();
        s = moves(s, C, C, X);
        const flop = dockView(as(s, 0));
        expect(flop.strengths!.map((d) => d.category)).toEqual([8, 2, 1]);
        expect(flop.strength).toEqual(flop.strengths![0]);
        s = moves(s, X, X, X, X, X, X);
        expect(dockView(as(s, 1)).strengths!.map((d) => d.category)).toEqual([1, 7, 6]);
        // A watcher, and a folded hand, see nothing.
        expect(boardStrengths('plo', null, [cards('AsKsQs')])).toBeNull();
        expect(boardStrengths('plo', cards(holes[0]), [cards('AsKsQs'), []])).toBeNull();
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
        expect(dockView(as(broke, 0)).buy).toEqual({min: 1000, max: 2000, topUp: 2000, rebuy: true, first: false});
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

describe('leaving after this hand, and chips that wait for the host', () => {
    it('offers it in one tap while the viewer plays a hand, then says so with Stay, the early choices still theirs', () => {
        let s = deal(three());
        const before = dockView(as(s, 0));
        expect(before).toMatchObject({leaveAfter: 'offer', leavingAfter: false, leaving: false});
        expect(before.pre).not.toBeNull();
        s = ok(reduce(s, {type: 'leave-after', by: pidOf(0), on: true, at: nowOf(s)}));
        const after = dockView(as(s, 0));
        expect(after).toMatchObject({leaveAfter: 'set', leavingAfter: true, leaving: false, sitOut: false, leave: false});
        // Play goes on as usual: the early choices, then the action bar on their turn.
        expect(after.pre).not.toBeNull();
        s = moves(s, C);
        expect(dockView(as(s, 0))).toMatchObject({myTurn: true, leavingAfter: true});
        // Stay takes it back.
        const back = ok(reduce(s, {type: 'leave-after', by: pidOf(0), on: false, at: nowOf(s)}));
        expect(dockView(as(back, 0))).toMatchObject({leaveAfter: 'offer', leavingAfter: false});
        // Leaving now overrides it, for good.
        const gone = ok(reduce(s, {type: 'leave', by: pidOf(0), at: nowOf(s)}));
        expect(dockView(as(gone, 0))).toMatchObject({leaveAfter: null, leavingAfter: false, leaving: true});
    });

    it('lets a folded player leave as the hand ends with the break\'s Leave, and an all-in one with its own button', () => {
        let s = deal(three());
        s = moves(s, F);
        expect(dockView(as(s, 2))).toMatchObject({folded: true, leave: true, leaveAfter: null});
        s = ok(reduce(s, {type: 'leave-after', by: pidOf(2), on: true, at: nowOf(s)}));
        expect(dockView(as(s, 2))).toMatchObject({leavingAfter: true, leaveAfter: 'set', leave: false, sitOut: false});
        let a = deal(three([1000, 1000, 300]));
        a = moves(a, A);
        const allIn = dockView(as(a, 2));
        expect(allIn).toMatchObject({pre: null, myTurn: false, leaveAfter: 'offer'});
    });

    it('leaves at once between hands (nothing to offer then but the break\'s Leave)', () => {
        const s = three();
        expect(dockView(as(s, 1))).toMatchObject({leaveAfter: null, leave: true});
        const left = ok(reduce(s, {type: 'leave-after', by: pidOf(1), on: true, at: nowOf(s)}));
        expect(left.seats[1]).toBeNull();
    });

    it('says chips wait for the host once the game has started, with Cancel in place of a rebuy', () => {
        let s = deal(three());
        s = moves(s, F, F);
        s = ok(reduce(s, {type: 'sit', by: pidOf(5), seat: 5, buyIn: 2000, at: nowOf(s)}));
        const dock = dockView(as(s, 5));
        expect(dock).toMatchObject({waitingChips: true, request: 2000, buy: null, sitOut: false, leave: true});
        // Taken back: the offer comes back in its place — while a hand Dee is not in is played too.
        const live = ok(reduce(deal(ok(reduce(s, {type: 'sit', by: pidOf(6), seat: 6, buyIn: 2000, at: nowOf(s)}))), {type: 'withdraw', by: pidOf(5), at: T0}));
        expect(live.hand!.phase).toBe('betting');
        expect(dockView(as(live, 5)).buy).not.toBeNull();
        const back = ok(reduce(s, {type: 'withdraw', by: pidOf(5), at: nowOf(s)}));
        expect(dockView(as(back, 5))).toMatchObject({waitingChips: false, request: null});
        expect(dockView(as(back, 5)).buy).not.toBeNull();
        // The host's own chips never wait.
        const host = ok(reduce(s, {type: 'leave', by: pidOf(0), at: nowOf(s)}));
        const again = ok(reduce(host, {type: 'sit', by: pidOf(0), seat: 6, buyIn: 2000, at: nowOf(host)}));
        expect(dockView(as(again, 6))).toMatchObject({waitingChips: false, request: null});
    });
});

// Triple T's throw-away (P7): the three cards to pick one from, the clock, the wait for the others,
// then the two kept as any hand; the felt's count.
describe('Triple T\'s throw-away', () => {
    const tt = () => deal(three([1000, 1000, 1000], {variant: 'triple-t'}), {holes: {0: 'AhKd7c', 1: 'QsQd2h', 2: '9c8c3s'}});
    const throwOf = (s: TableState, seat: number, card: string) => ({type: 'discard' as const, by: pidOf(seat), turn: s.turn, card: cards(card)[0], at: nowOf(s)});

    it('gives every player dealt in the three to pick from and the one clock, no moves, no early choices and no hand named', () => {
        const s = tt();
        for (const seat of [0, 1, 2]) {
            const d = dockView(as(s, seat));
            expect(d.discard).toMatchObject({pending: true, thrown: null, deadline: s.hand!.deadline, waiting: 2});
            expect(d.discard!.cards).toHaveLength(3);
            expect([d.myTurn, d.pre, d.legal, d.strength, d.sitOut, d.leave]).toEqual([false, null, null, null, false, false]);
            expect(d.leaveAfter).toBe('offer');
        }
        expect(throwAwayCount(as(s, 0))).toEqual({done: 0, of: 3});
    });

    it('once thrown: the two kept and their name, the card thrown away the viewer\'s alone, how many the table waits for', () => {
        let s = ok(reduce(tt(), throwOf(tt(), 0, '7c')));
        const mine = dockView(as(s, 0));
        expect(mine.discard).toMatchObject({pending: false, cards: null, thrown: cards('7c')[0], waiting: 2});
        expect(mine.hole).toEqual(cards('AhKd'));
        expect(mine.strength).toEqual({category: 0, ranks: [12, 11]});
        expect(dockView(as(s, 1)).discard).toMatchObject({pending: true, thrown: null, waiting: 1});
        expect(throwAwayCount(as(s, 1))).toEqual({done: 1, of: 3});
        s = ok(reduce(s, throwOf(s, 1, '2h')));
        s = ok(reduce(s, throwOf(s, 2, '3s')));
        // The betting: the throw-away gone from the dock, Texas hold'em's moves for the first to act.
        const first = dockView(as(s, 2));
        expect(first.discard).toBeNull();
        expect(first.myTurn).toBe(true);
        expect(throwAwayCount(as(s, 2))).toBeNull();
        expect(dockView(as(s, 1)).strength).toEqual({category: 1, ranks: [10]});
    });

    it('gives nothing to throw to a watcher or a player who left facing the blind', () => {
        let s = tt();
        s = ok(reduce(s, {type: 'leave', by: pidOf(2), at: nowOf(s)}));
        expect(dockView(as(s, 2)).discard).toBeNull();
        expect(throwAwayCount(as(s, 0))).toEqual({done: 0, of: 2});
    });
});

describe("the dock's one-tap rebuy", () => {
    it('offers the whole buy-in the table allows in one tap, asked of the host where it says yes first, and the bank only when there is another amount', () => {
        const rebuy = {min: 1000, max: 2000, topUp: 2000, rebuy: true, first: false};
        expect(rebuyTap(rebuy, false)).toEqual({amount: 2000, asks: false, other: true});
        expect(rebuyTap(rebuy, true)).toEqual({amount: 2000, asks: true, other: true});
        expect(rebuyTap({...rebuy, min: 2000}, false)).toEqual({amount: 2000, asks: false, other: false});
        // A seat that never had chips here asks for its first (FirstChips), never a rebuy; nothing offered, nothing.
        expect(rebuyTap({...rebuy, first: true, rebuy: false}, false)).toBeNull();
        expect(rebuyTap(null, true)).toBeNull();
    });
});
