// The animations' timeline, on events from real engine states: the cards dealt round one at a
// time, the chips going out one player after another, the street's bets sweeping in only once they
// have landed and the next cards turning after the sweep, a showdown's hands flipping before the
// five cards that play lift, the pots paid side pots first and the main pot last with each pot's
// stream split by its winners' shares, each winner's stack counting up as its chips land, confetti
// on a big win only, a result the table had already shown drawn in place, an overlong batch
// played faster, and a batch never more than MAX_LAG_MS behind the one before.

import {describe, expect, it} from 'vitest';
import {nextDueAt} from '@/lib/poker-night/clock';
import {BEAT, batchStart, MAX_LAG_MS, scheduleBatch, type Scheduled} from '@/lib/poker-night/choreography';
import {diffViews, type DiffableView, type TableEvent} from '@/lib/poker-night/events';
import type {TableState} from '@/lib/poker-night/types';
import {clockLeaderOf, wireView} from '@/lib/poker-night/views';
import {A, C, F, R, X, deal, moves, nowOf, runOut, table} from './fixtures';

let seq = 0;
const view = (s: TableState, serverNow = nowOf(s)): DiffableView => wireView(s, {
    code: 'K7QXM4', seq: ++seq, serverNow, nextDueAt: nextDueAt(s), clockLeader: clockLeaderOf(s, {}), presence: {}, watchers: 0, realtimeOk: true, peopleV: 1,
});
const three = (stacks: [number, number, number] = [1000, 1000, 1000], config = {}) => table({0: stacks[0], 1: stacks[1], 2: stacks[2]}, {config, lastBigBlind: 0});
const byKind = (items: Scheduled[], kind: TableEvent['kind']) => items.filter((s) => s.event.kind === kind);

describe('one batch', () => {
    it('deals two rounds of cards, one seat at a time, then the blinds go out', () => {
        const s0 = three();
        const s1 = deal(s0);
        const {items} = scheduleBatch(diffViews(view(s0), view(s1)));
        const dealt = byKind(items, 'deal')[0];
        expect(dealt.cards).toHaveLength(6);
        const times = dealt.cards!.map((c) => c.at);
        expect(times).toEqual([...times].sort((a, b) => a - b));
        expect(new Set(times).size).toBe(6);
        expect(dealt.cards!.map((c) => `${c.seat}:${c.index}`)).toEqual(['0:0', '1:0', '2:0', '0:1', '1:1', '2:1']);
        const blinds = byKind(items, 'chips-out');
        expect(blinds[0].at).toBeGreaterThan(times[times.length - 1]);
        expect(blinds[1].at).toBeGreaterThan(blinds[0].at);
    });

    it('sends the chips out in turn and sweeps only once the last have landed, then turns the flop', () => {
        let s = deal(three(), {board: '2c7d9s3s4c'});
        s = moves(s, R(60));
        const before = view(s);
        s = moves(s, C, C);
        const {items} = scheduleBatch(diffViews(before, view(s)));
        const [first, second] = byKind(items, 'chips-out');
        expect(second.at - first.at).toBeCloseTo(BEAT.MOVE_GAP);
        const sweep = byKind(items, 'street-sweep')[0];
        expect(sweep.at).toBeGreaterThanOrEqual(second.at + second.dur);
        const flop = byKind(items, 'board')[0];
        expect(flop.at).toBeGreaterThan(sweep.at);
        expect(flop.cards!.map((c) => c.index)).toEqual([0, 1, 2]);
        expect(flop.cards![1].at - flop.cards![0].at).toBeCloseTo(BEAT.BOARD_STAGGER);
        // Each move's tag stays a while after its chips land.
        expect(first.until).toBeGreaterThanOrEqual(first.at + BEAT.TAG_HOLD);
    });

    it('flips a showdown\'s hands, then lifts the cards that play, then pays the pot', () => {
        let s = deal(three(), {holes: {0: 'AhKh', 1: '7c2d', 2: 'QsQd'}, board: '2c5d9hJs3c'});
        s = moves(s, C, C, X, X, X, X, X, X, X);
        const prev = view(s);
        s = moves(s, R(40), F, C);
        const {items} = scheduleBatch(diffViews(prev, view(s, s.hand!.result!.completedAt), {bigBlind: 20}));
        const reveal = byKind(items, 'reveal')[0];
        const win = byKind(items, 'win')[0];
        expect(reveal.cards).toHaveLength(4);
        expect(reveal.liftAt).toBeGreaterThan(Math.max(...reveal.cards!.map((c) => c.at)));
        expect(win.bannerAt).toBeGreaterThan(reveal.liftAt!);
        expect(win.streams!.every((c) => c.seat === 2 && c.pot === 0)).toBe(true);
        expect(win.streams).toHaveLength(BEAT.STREAM_CHIPS);
        expect(win.counts).toEqual([expect.objectContaining({seat: 2, amount: 140})]);
        expect(win.confettiAt).toBeNull();
        expect(win.still).toBeUndefined();
    });

    it('pays side pots first and the main pot last, a pot\'s stream after the one before', () => {
        let s = deal(three([100, 200, 300], {smallBlind: 1, bigBlind: 2, buyInMin: 2, buyInMax: 1000}), {holes: {0: 'AhAd', 1: 'KhKd', 2: 'QhQd'}, board: '2c7d9s3s4c'});
        const before = view(s);
        s = runOut(moves(s, A, A, A));
        const {items} = scheduleBatch(diffViews(before, view(s, s.hand!.result!.completedAt), {bigBlind: 2}));
        const win = byKind(items, 'win')[0];
        expect(win.potsOut!.map((p) => p.pot)).toEqual([1, 0]);
        expect(win.potsOut![1].at - win.potsOut![0].at).toBeCloseTo(BEAT.POT_GAP);
        const side = win.streams!.filter((c) => c.pot === 1);
        const main = win.streams!.filter((c) => c.pot === 0);
        expect(side.every((c) => c.seat === 1)).toBe(true);
        expect(main.every((c) => c.seat === 0)).toBe(true);
        expect(Math.min(...main.map((c) => c.at))).toBeGreaterThan(Math.max(...side.map((c) => c.at)));
        // A big win (an all-in won): confetti, as the banner lands.
        expect(win.confettiAt).not.toBeNull();
        // The board's three streets turn before the reveal.
        const boards = byKind(items, 'board');
        expect(boards.map((b) => b.cards!.map((c) => c.index))).toEqual([[0, 1, 2], [3], [4]]);
        expect(byKind(items, 'reveal')[0].at).toBeGreaterThan(boards[2].at);
    });

    it('splits a pot\'s stream between its winners by share', () => {
        const event: TableEvent = {
            kind: 'win', id: '7:win', handNo: 7, uncontested: false, big: false, fresh: true,
            pots: [{pot: 0, amount: 300, winners: [{seat: 1, share: 150}, {seat: 4, share: 150}]}],
            totals: [{seat: 1, amount: 150}, {seat: 4, amount: 150}],
        };
        const win = scheduleBatch([event]).items[0];
        const to1 = win.streams!.filter((c) => c.seat === 1);
        const to4 = win.streams!.filter((c) => c.seat === 4);
        expect(to1).toHaveLength(3);
        expect(to4).toHaveLength(3);
        expect(new Set(win.streams!.map((c) => c.key)).size).toBe(win.streams!.length);
        expect(win.counts!.map((c) => c.seat)).toEqual([1, 4]);
    });

    it('draws a result the table had already shown in place', () => {
        const event: TableEvent = {
            kind: 'win', id: '7:win', handNo: 7, uncontested: true, big: true, fresh: false,
            pots: [{pot: 0, amount: 60, winners: [{seat: 1, share: 60}]}], totals: [{seat: 1, amount: 60}],
        };
        expect(scheduleBatch([event]).items).toEqual([expect.objectContaining({still: true, at: 0, dur: 0})]);
    });

    it('plays an overlong batch faster, keeping every time in proportion', () => {
        const folds: TableEvent[] = Array.from({length: 80}, (_, i) => ({kind: 'fold', id: `1:${i}`, handNo: 1, seat: i % 9}));
        const {items, length} = scheduleBatch(folds);
        expect(length).toBeCloseTo(BEAT.MAX_BATCH);
        expect(Math.max(...items.map((s) => s.until))).toBeCloseTo(BEAT.MAX_BATCH);
        expect(items[1].at / items[2].at).toBeCloseTo(1 / 2);
    });

    it('starts a seat\'s arrival at once, whatever else the batch holds', () => {
        const events: TableEvent[] = [{kind: 'join', id: 'seat:3:p3:9:join', handNo: 0, seat: 3, pid: 'p3'}];
        expect(scheduleBatch(events).items[0]).toMatchObject({at: 0, dur: BEAT.SEAT_IN});
    });
});

describe('batches in a row', () => {
    it('waits for the batch before, but never more than MAX_LAG_MS', () => {
        expect(batchStart(1000, 0)).toBe(1000);
        expect(batchStart(1000, 1500)).toBe(1500);
        expect(batchStart(1000, 1000 + MAX_LAG_MS * 3)).toBe(1000 + MAX_LAG_MS);
    });
});
