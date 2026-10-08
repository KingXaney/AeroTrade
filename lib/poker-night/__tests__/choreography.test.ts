// The animations' timeline, on events from real engine states: the cards dealt round one at a
// time, the chips going out one player after another, the street's bets sweeping in only once they
// have landed and the next cards turning after the sweep, a showdown's hands flipping before the
// five cards that play lift, the pots paid side pots first and the main pot last with each pot's
// stream split by its winners' shares, each winner's stack counting up as its chips land, confetti
// on a big win only, a result the table had already shown drawn in place, an overlong batch
// played faster, and a batch never more than MAX_LAG_MS behind the one before.

import {describe, expect, it} from 'vitest';
import {nextDueAt} from '@/lib/poker-night/clock';
import {revealMs} from '@/lib/poker-night/config';
import {BEAT, batchStart, MAX_LAG_MS, scheduleBatch, UNIT_MS, type Scheduled} from '@/lib/poker-night/choreography';
import {diffViews, type DiffableView, type TableEvent} from '@/lib/poker-night/events';
import type {TableState} from '@/lib/poker-night/types';
import {clockLeaderOf, wireView} from '@/lib/poker-night/views';
import {reduce} from '@/lib/poker-night/engine';
import {A, C, F, R, X, deal, moves, nowOf, ok, runOut, table} from './fixtures';

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
        s = moves(s, A, A, A);
        // The run-out comes a street at a time: the river's view brings the showdown.
        while (s.hand!.boards[0].length < 4) s = ok(reduce(s, {type: 'deal-street', at: s.hand!.nextStreetAt!}), 'deal-street');
        const turn = view(s);
        s = runOut(s);
        const {items} = scheduleBatch(diffViews(turn, view(s, s.hand!.result!.completedAt), {bigBlind: 2}));
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
        // The river turns before the reveal; in one batch (a page that saw the hand go all in, then
        // its end) every street does, faster to end within the result's showing.
        expect(byKind(items, 'reveal')[0].at).toBeGreaterThan(byKind(items, 'board')[0].at);
        const whole = scheduleBatch(diffViews(before, view(s, s.hand!.result!.completedAt), {bigBlind: 2})).items;
        const boards = byKind(whole, 'board');
        expect(boards.map((b) => b.cards!.map((c) => c.index))).toEqual([[0, 1, 2], [3], [4]]);
        expect(byKind(whole, 'reveal')[0].at).toBeGreaterThan(boards[2].at);
        const paid = byKind(whole, 'win')[0];
        expect(paid.at + paid.dur).toBeCloseTo(s.hand!.result!.revealMs / UNIT_MS);
    });

    it('splits a pot\'s stream between its winners by share', () => {
        const event: TableEvent = {
            kind: 'win', id: '7:win', handNo: 7, uncontested: false, big: false, fresh: true, revealMs: 3000, boards: 1,
            pots: [{pot: 0, board: 0, amount: 300, winners: [{seat: 1, share: 150}, {seat: 4, share: 150}]}],
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
            kind: 'win', id: '7:win', handNo: 7, uncontested: true, big: true, fresh: false, revealMs: 1500, boards: 1,
            pots: [{pot: 0, board: 0, amount: 60, winners: [{seat: 1, share: 60}]}], totals: [{seat: 1, amount: 60}],
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

describe('PLO on three boards', () => {
    const HOLES = {0: 'JsTs4h5h', 1: '9c9d8h7h', 2: '6c6d2s3s'};
    const BOARDS = ['AsKsQs2d3c', '9h9s4c4d5c', '8d8c7d7c2h'];

    it("turns each street board after board, lifts each board's cards in turn, and splits each pot to the boards before it streams", () => {
        let s = deal(three([1000, 1000, 1000], {variant: 'plo', boards: 3}), {holes: HOLES, boards: BOARDS});
        s = moves(s, C, C);
        const preflop = view(s);
        s = moves(s, X);
        const flop = byKind(scheduleBatch(diffViews(preflop, view(s))).items, 'board');
        expect(flop.map((b) => b.cards!.map((c) => c.board))).toEqual([[0, 0, 0], [1, 1, 1], [2, 2, 2]]);
        expect(flop[1].at - flop[0].at).toBeCloseTo(BEAT.BOARD_TURN_GAP);
        expect(flop[2].at - flop[0].at).toBeCloseTo(2 * BEAT.BOARD_TURN_GAP);
        s = moves(s, X, X, X, X, X, X);
        const river = view(s);
        s = moves(s, X, X, X);
        const {items} = scheduleBatch(diffViews(river, view(s, s.hand!.result!.completedAt), {bigBlind: 20}));
        const reveal = byKind(items, 'reveal')[0];
        expect(reveal.lifts).toHaveLength(3);
        expect(reveal.lifts![0]).toBe(reveal.liftAt);
        expect(reveal.lifts![2] - reveal.lifts![1]).toBeCloseTo(BEAT.BOARD_LIFT_STAGGER);
        const win = byKind(items, 'win')[0];
        expect(win.bannerAt).toBeGreaterThan(reveal.lifts![2]);
        // One pot, its three shares flying to the boards as it leaves, then each board's stream from there.
        expect(win.splits!.map((p) => [p.pot, p.board, p.amount])).toEqual([[0, 0, 20], [0, 1, 20], [0, 2, 20]]);
        const leave = win.potsOut![0].at;
        expect(win.splits!.every((p) => p.at === leave)).toBe(true);
        for (const chip of win.streams!) {
            expect(chip.from).toBe('board');
            expect(chip.at).toBeGreaterThanOrEqual(leave + BEAT.SPLIT_LEAD + chip.board * BEAT.BOARD_STREAM_GAP - 1e-9);
        }
        expect(win.streams!.filter((c) => c.board === 0).every((c) => c.seat === 0)).toBe(true);
        expect(win.streams!.filter((c) => c.board > 0).every((c) => c.seat === 1)).toBe(true);
        expect(win.counts!.map((c) => [c.seat, c.amount])).toEqual([[0, 20], [1, 40]]);
        expect(win.at + win.dur).toBeLessThanOrEqual(s.hand!.result!.revealMs / UNIT_MS + 1e-9);
    });

    it("keeps a showdown's pay-out within the result's showing, five pots on three boards and nine hands shown included", () => {
        const showing = revealMs({showdown: true, pots: [1, 2, 3, 4, 5], boards: 3});
        const winners = (pot: number) => [{seat: pot % 9, share: 100}, {seat: (pot + 4) % 9, share: 100}];
        const event: TableEvent = {
            kind: 'win', id: '9:win', handNo: 9, uncontested: false, big: true, fresh: true, revealMs: showing, boards: 3,
            pots: [4, 3, 2, 1, 0].flatMap((pot) => [0, 1, 2].map((board) => ({pot, board, amount: 200, winners: winners(pot + board)}))),
            totals: Array.from({length: 9}, (_, seat) => ({seat, amount: 100})),
        };
        const hands = Array.from({length: 9}, (_, seat) => ({seat, cards: [0, 1, 2, 3].map((c) => seat * 4 + c), best: [[], [], []], values: [1, 1, 1], winner: true}));
        const reveal: TableEvent = {kind: 'reveal', id: '9:reveal', handNo: 9, boards: [[36, 37, 38, 39, 40], [41, 42, 43, 44, 45], [46, 47, 48, 49, 50]], hands, winners: []};
        const within = (batch: Scheduled[], cap: number) => {
            const win = byKind(batch, 'win')[0];
            expect(win.at + win.dur).toBeLessThanOrEqual(cap + 1e-9);
            for (const chip of win.streams!) expect(chip.at + BEAT.STREAM * (win.pace ?? 1)).toBeLessThanOrEqual(cap + 1e-9);
            for (const split of win.splits!) expect(split.at + BEAT.SPLIT * (win.pace ?? 1)).toBeLessThanOrEqual(cap + 1e-9);
            return win;
        };
        // At its own pace it ends in time: the reveal's figure leaves a second a board past the first.
        const paced = within(scheduleBatch([reveal, event]).items, showing / UNIT_MS);
        expect(paced.potsOut![1].at - paced.potsOut![0].at).toBeCloseTo(BEAT.POT_GAP);
        // A showing shorter than its pace plays it faster, every time in proportion, to end with it:
        // the pots still leave in order, side pots first, as far apart as each other.
        const short = within(scheduleBatch([reveal, {...event, revealMs: 3000}]).items, 3000 / UNIT_MS);
        expect(short.at + short.dur).toBeCloseTo(3000 / UNIT_MS);
        expect(short.potsOut!.map((p) => p.pot)).toEqual([4, 3, 2, 1, 0]);
        const gaps = short.potsOut!.slice(1).map((p, i) => p.at - short.potsOut![i].at);
        for (const gap of gaps) expect(gap).toBeCloseTo(gaps[0]);
        expect(gaps[0]).toBeLessThan(BEAT.POT_GAP);
    });
});
