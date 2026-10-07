// The animations' events, read from the difference between two views of real engine states: the
// deal and the blinds, chips going out, checks and folds, a street's bets sweeping into the pot
// and the next street's cards, the showdown's revealed hands with the five cards that play, the
// pots paid side pots first and the main pot last, the run-out's streets, a timeout, a seat taken
// and given up. Every id is the hand number and the log index (or the street, the turn, the seq),
// so a replay, an older view or the same view twice fires nothing, and a jump past a whole hand
// snaps instead of animating.

import {describe, expect, it} from 'vitest';
import {nextDueAt} from '@/lib/poker-night/clock';
import {TIMING} from '@/lib/poker-night/config';
import {reduce} from '@/lib/poker-night/engine';
import {bestFive} from '@/lib/poker-night/hand-name';
import {diffViews, EVENT_KINDS, type DiffableView, type TableEvent} from '@/lib/poker-night/events';
import type {TableState} from '@/lib/poker-night/types';
import {clockLeaderOf, wireView} from '@/lib/poker-night/views';
import {A, C, F, R, X, cards, deal, moves, nowOf, ok, pidOf, runOut, table} from './fixtures';

let seq = 0;
// A view of the state as the room would send it, each a version newer than the last, read at the
// state's own "now".
const view = (s: TableState, serverNow = nowOf(s)): DiffableView => wireView(s, {
    code: 'K7QXM4', seq: ++seq, serverNow, nextDueAt: nextDueAt(s), clockLeader: clockLeaderOf(s, {}), presence: {}, watchers: 0, realtimeOk: true, peopleV: 1,
});

const kinds = (events: TableEvent[]) => events.map((e) => e.kind);
const only = <K extends TableEvent['kind']>(events: TableEvent[], kind: K) => events.filter((e): e is Extract<TableEvent, {kind: K}> => e.kind === kind);

// Three players, blinds 10/20: seat 0 the small blind, 1 the big blind, 2 the button.
const three = (stacks: [number, number, number] = [1000, 1000, 1000], config = {}) =>
    table({0: stacks[0], 1: stacks[1], 2: stacks[2]}, {config, lastBigBlind: 0});

describe('a hand, step by step', () => {
    it('deals, posts the blinds and puts the first player on the clock', () => {
        const s0 = three();
        const v0 = view(s0);
        const s1 = deal(s0);
        const events = diffViews(v0, view(s1), {mySeat: 2, bigBlind: 20});
        expect(kinds(events)).toEqual(['deal', 'chips-out', 'chips-out', 'turn']);
        expect(events[0]).toMatchObject({kind: 'deal', handNo: 1, seats: [0, 1, 2], id: '1:deal'});
        expect(events[1]).toMatchObject({kind: 'chips-out', seat: 0, move: 'small-blind', amount: 10, to: 10, allIn: false, id: '1:0'});
        expect(events[2]).toMatchObject({kind: 'chips-out', seat: 1, move: 'big-blind', amount: 20, to: 20, id: '1:1'});
        expect(events[3]).toMatchObject({kind: 'turn', seat: 2, mine: true, turn: s1.turn});
    });

    it('sends chips out to the bet line, then sweeps the street into the pot and turns the flop', () => {
        let s = deal(three(), {board: '2c7d9s3s4c'});
        const before = view(s);
        s = moves(s, R(60));
        const raised = view(s);
        const raise = diffViews(before, raised);
        expect(kinds(raise)).toEqual(['chips-out', 'turn']);
        expect(raise[0]).toMatchObject({seat: 2, move: 'raise', amount: 60, to: 60});
        s = moves(s, C, C);
        const flop = diffViews(raised, view(s));
        expect(kinds(flop)).toEqual(['chips-out', 'chips-out', 'street-sweep', 'board', 'turn']);
        expect(flop[0]).toMatchObject({seat: 0, move: 'call', amount: 50, to: 60});
        expect(flop[1]).toMatchObject({seat: 1, move: 'call', amount: 40, to: 60});
        expect(flop[2]).toMatchObject({street: 'preflop', total: 180, bets: [{seat: 0, amount: 60}, {seat: 1, amount: 60}, {seat: 2, amount: 60}]});
        expect(flop[3]).toMatchObject({kind: 'board', street: 'flop', cards: cards('2c7d9s'), from: 0});
        expect(flop[4]).toMatchObject({kind: 'turn', seat: 0});
    });

    it('checks, folds, the refund of an uncalled bet and an uncontested win', () => {
        let s = deal(three(), {board: '2c7d9s3s4c'});
        s = moves(s, C, C, X);
        let prev = view(s);
        s = moves(s, X, R(100));
        const bet = diffViews(prev, view(s));
        expect(kinds(bet)).toEqual(['check', 'chips-out', 'turn']);
        expect(bet[1]).toMatchObject({seat: 1, move: 'bet', amount: 100, to: 100});
        prev = view(s);
        s = moves(s, F, F);
        const end = diffViews(prev, view(s), {bigBlind: 20});
        expect(kinds(end)).toEqual(['fold', 'fold', 'refund', 'win']);
        expect(only(end, 'refund')[0]).toMatchObject({seat: 1, amount: 100});
        // The refund took the bet line back to nothing: there is nothing left to sweep.
        expect(only(end, 'win')[0]).toMatchObject({uncontested: true, big: false, pots: [{pot: 0, amount: 60, winners: [{seat: 1, share: 60}]}], totals: [{seat: 1, amount: 60}]});
    });

    it('sweeps a called bet on the river and reveals the showdown with the five cards that play', () => {
        let s = deal(three(), {holes: {0: 'AhKh', 1: '7c2d', 2: 'QsQd'}, board: '2c5d9hJs3c'});
        s = moves(s, C, C, X, X, X, X, X, X, X);
        const prev = view(s);
        s = moves(s, R(40), F, C);
        const last = view(s, s.hand!.result!.completedAt);
        const end = diffViews(prev, last, {bigBlind: 20});
        expect(kinds(end)).toEqual(['chips-out', 'fold', 'chips-out', 'street-sweep', 'reveal', 'win']);
        expect(only(end, 'street-sweep')[0]).toMatchObject({street: 'river', total: 80});
        const reveal = only(end, 'reveal')[0];
        expect(reveal.winners).toEqual([2]);
        expect(reveal.hands.map((h) => h.seat).sort()).toEqual([0, 2]);
        const winner = reveal.hands.find((h) => h.winner)!;
        const board = cards('2c5d9hJs3c');
        expect(winner.best.sort()).toEqual(bestFive([...board, ...cards('QsQd')], cards('QsQd')).cards.sort());
        expect(only(end, 'win')[0]).toMatchObject({uncontested: false, fresh: true, pots: [{pot: 0, amount: 140}]});
    });
});

describe('all in', () => {
    it('runs the board out street by street, then pays side pots first and the main pot last', () => {
        let s = deal(three([100, 200, 300], {smallBlind: 1, bigBlind: 2, buyInMin: 2, buyInMax: 1000}), {holes: {0: 'AhAd', 1: 'KhKd', 2: 'QhQd'}, board: '2c7d9s3s4c'});
        const before = view(s);
        s = moves(s, A, A, A);
        const allIn = view(s);
        const first = diffViews(before, allIn);
        expect(kinds(first)).toEqual(['chips-out', 'chips-out', 'chips-out', 'refund', 'street-sweep']);
        expect(only(first, 'chips-out').every((e) => e.allIn)).toBe(true);
        // One street at a time on the run-out's own clock.
        s = ok(reduce(s, {type: 'deal-street', at: s.hand!.nextStreetAt!}));
        const flop = view(s);
        expect(kinds(diffViews(allIn, flop))).toEqual(['board']);
        s = runOut(s);
        const end = diffViews(flop, view(s, s.hand!.result!.completedAt), {bigBlind: 2});
        expect(kinds(end)).toEqual(['board', 'board', 'reveal', 'win']);
        expect(only(end, 'board').map((e) => e.street)).toEqual(['turn', 'river']);
        const win = only(end, 'win')[0];
        expect(win.pots.map((p) => p.pot)).toEqual([1, 0]);
        expect(win.pots[1]).toMatchObject({pot: 0, amount: 300, winners: [{seat: 0, share: 300}]});
        expect(win.pots[0]).toMatchObject({pot: 1, amount: 200, winners: [{seat: 1, share: 200}]});
        expect(win.big).toBe(true);
    });

    it('reads a whole run-out in one jump the same way', () => {
        let s = deal(three([100, 200, 300], {smallBlind: 1, bigBlind: 2, buyInMin: 2, buyInMax: 1000}), {holes: {0: 'AhAd', 1: 'KhKd', 2: 'QhQd'}, board: '2c7d9s3s4c'});
        const before = view(s);
        s = runOut(moves(s, A, A, A));
        expect(kinds(diffViews(before, view(s)))).toEqual(['chips-out', 'chips-out', 'chips-out', 'refund', 'street-sweep', 'board', 'board', 'board', 'reveal', 'win']);
    });
});

describe('the clock and the seats', () => {
    it('marks a move the clock made', () => {
        const s = deal(three());
        const prev = view(s);
        const t = ok(reduce(s, {type: 'timeout', turn: s.turn, at: s.hand!.deadline! + TIMING.TURN_GRACE_MS}));
        const events = diffViews(prev, view(t));
        expect(kinds(events).slice(0, 2)).toEqual(['timeout', 'fold']);
        expect(events[0]).toMatchObject({seat: 2, move: 'fold'});
        expect(events[0].id).not.toBe(events[1].id);
    });

    it('sees a seat taken and given up', () => {
        const s = three();
        const prev = view(s);
        const sat = ok(reduce(s, {type: 'sit', by: pidOf(4), seat: 4, buyIn: 2000, at: nowOf(s)}));
        const satView = view(sat);
        expect(diffViews(prev, satView)).toEqual([expect.objectContaining({kind: 'join', seat: 4, pid: pidOf(4)})]);
        const left = ok(reduce(sat, {type: 'leave', by: pidOf(4), at: nowOf(sat)}));
        expect(diffViews(satView, view(left))).toEqual([expect.objectContaining({kind: 'leave', seat: 4, pid: pidOf(4)})]);
    });
});

describe('never twice', () => {
    it('fires nothing for a first view, the same view or an older one', () => {
        const s0 = three();
        const v0 = view(s0);
        const v1 = view(deal(s0));
        expect(diffViews(null, v1)).toEqual([]);
        expect(diffViews(v1, v1)).toEqual([]);
        expect(diffViews(v1, v0)).toEqual([]);
    });

    it('gives the same ids for the same entries, whichever views they are read between', () => {
        let s = deal(three(), {board: '2c7d9s3s4c'});
        const a = view(s);
        s = moves(s, R(60));
        const b = view(s);
        s = moves(s, C);
        const c = view(s);
        const stepwise = [...diffViews(a, b), ...diffViews(b, c)].filter((e) => e.kind !== 'turn').map((e) => e.id);
        const atOnce = diffViews(a, c).filter((e) => e.kind !== 'turn').map((e) => e.id);
        expect(atOnce).toEqual(stepwise);
        expect(new Set(stepwise).size).toBe(stepwise.length);
    });

    it('snaps past a jump of more than one hand', () => {
        let s = deal(three());
        const first = view(s);
        s = moves(s, F, F);
        s = deal(s, {at: s.nextHandAt!});
        s = moves(s, F, F);
        s = deal(s, {at: s.nextHandAt!});
        expect(s.hand!.no).toBe(3);
        expect(diffViews(first, view(s))).toEqual([]);
    });

    it('names every kind it can produce', () => {
        expect(new Set(EVENT_KINDS).size).toBe(EVENT_KINDS.length);
        expect(EVENT_KINDS).toContain('street-sweep');
        expect(EVENT_KINDS).toContain('win');
    });
});
