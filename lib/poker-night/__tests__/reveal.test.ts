// A finished hand as the table shows it: the winners with their totals over every pot, each shown
// hand's name and whether it plays the board, the winners' five cards that play lit and every other
// card dimmed — and nothing lit or dimmed for a pot nobody contested.

import {describe, expect, it} from 'vitest';
import {nextDueAt} from '@/lib/poker-night/clock';
import {bestFive} from '@/lib/poker-night/hand-name';
import {HAND_COPY, TABLE_COPY} from '@/lib/learn/copy/poker-night';
import {reduce} from '@/lib/poker-night/engine';
import {bannerLines, bannerShows, cardLook, playerAt, resultLook, viewerSeatIn} from '@/lib/poker-night/reveal';
import type {TableState} from '@/lib/poker-night/types';
import {clockLeaderOf, wireView} from '@/lib/poker-night/views';
import {A, C, F, X, cards, deal, moves, nowOf, ok, runOut, table} from './fixtures';

const view = (s: TableState) => wireView(s, {
    code: 'K7QXM4', seq: 1, serverNow: nowOf(s), nextDueAt: nextDueAt(s), clockLeader: clockLeaderOf(s, {}), presence: {}, watchers: 0, realtimeOk: true, peopleV: 1,
});
const three = (stacks: [number, number, number] = [1000, 1000, 1000], config = {}) => table({0: stacks[0], 1: stacks[1], 2: stacks[2]}, {config, lastBigBlind: 0});

describe('a showdown', () => {
    it('names the winner and lights the five cards that play, dimming the rest', () => {
        let s = deal(three(), {holes: {0: 'AhKh', 1: '7c2d', 2: 'QsQd'}, board: '2c5d9hJs3c'});
        s = moves(s, C, C, X, X, X, X, X, X, X, X, X, X);
        const look = resultLook(view(s).hand)!;
        expect(look.showdown).toBe(true);
        expect(look.winners).toEqual([{seat: 2, amount: 60, description: {category: 1, ranks: [10, 9, 7, 3]}, playsBoard: false}]);
        const board = cards('2c5d9hJs3c');
        const best = bestFive([...board, ...cards('QsQd')], cards('QsQd')).cards;
        expect([...look.playing].sort()).toEqual([...best].sort());
        for (const card of best) expect(cardLook(look, card)).toBe('win');
        for (const card of cards('AhKh 2c 3c')) expect(cardLook(look, card)).toBe('dim');
        expect(look.shown.map((h) => h.seat).sort()).toEqual([0, 1, 2]);
        expect(look.shown.find((h) => h.seat === 0)!.winner).toBe(false);
    });

    it('totals each winner over the side pots and the main pot, the most chips first', () => {
        let s = deal(three([100, 200, 300], {smallBlind: 1, bigBlind: 2, buyInMin: 2, buyInMax: 1000}), {holes: {0: 'AhAd', 1: 'KhKd', 2: 'QhQd'}, board: '2c7d9s3s4c'});
        s = runOut(moves(s, A, A, A));
        const look = resultLook(view(s).hand)!;
        expect(look.winners.map((w) => [w.seat, w.amount])).toEqual([[0, 300], [1, 200]]);
        expect(look.winners[0].description).toEqual({category: 1, ranks: [12, 7, 5, 2]});
        // Both winners' five cards light up.
        expect(look.playing).toEqual(expect.arrayContaining(cards('AhAd KhKd')));
        expect(cardLook(look, cards('Qh')[0])).toBe('dim');
    });

    it('says when the board plays', () => {
        let s = deal(three(), {holes: {0: '2h3d', 1: '2c3s', 2: '4h5d'}, board: 'AsKsQsJsTs'});
        s = moves(s, C, C, X, X, X, X, X, X, X, X, X, X);
        const look = resultLook(view(s).hand)!;
        expect(look.winners.every((w) => w.playsBoard)).toBe(true);
        expect(look.winners.map((w) => w.seat).sort()).toEqual([0, 1, 2]);
    });
});

describe('no showdown', () => {
    it('lights and dims nothing for an uncontested pot', () => {
        let s = deal(three(), {board: '2c7d9s3s4c'});
        s = moves(s, F, F);
        const look = resultLook(view(s).hand)!;
        expect(look.showdown).toBe(false);
        expect(look.winners.map((w) => w.seat)).toEqual([1]);
        expect(look.playing).toEqual([]);
        expect(cardLook(look, cards('2c')[0])).toBeNull();
    });

    it('shows the banner once the hand is complete, for that hand only', () => {
        let s = deal(three(), {board: '2c7d9s3s4c'});
        s = moves(s, F, F);
        const hand = view(s).hand!;
        const look = resultLook(hand);
        expect(bannerShows(hand, look)).toBe(true);
        expect(bannerShows({...hand, no: hand.no + 1}, look)).toBe(false);
        expect(bannerShows({...hand, phase: 'betting'}, look)).toBe(false);
        expect(bannerShows(hand, null)).toBe(false);
        expect(bannerShows(null, look)).toBe(false);
    });

    it('is nothing while the hand is being played', () => {
        expect(resultLook(view(deal(three())).hand)).toBeNull();
        expect(resultLook(null)).toBeNull();
        expect(cardLook(null, 0)).toBeNull();
    });
});

describe("the banner's words", () => {
    it('says "You win" to the viewer, names everyone else (their seat before the people arrive) and the hand', () => {
        let s = deal(three(), {holes: {0: 'AhKh', 1: '7c2d', 2: 'QsQd'}, board: '2c5d9hJs3c'});
        s = moves(s, C, C, X, X, X, X, X, X, X, X, X, X);
        const look = resultLook(view(s).hand)!;
        const pair = HAND_COPY.label({category: 1, ranks: [10, 9, 7, 3]});
        expect(bannerLines(look, () => 'Ana', 2)).toEqual([{seat: 2, mine: true, head: TABLE_COPY.bannerYou(60), hand: pair}]);
        expect(bannerLines(look, () => 'Ana', 0)).toEqual([{seat: 2, mine: false, head: TABLE_COPY.banner('Ana', 60), hand: pair}]);
        expect(bannerLines(look, () => null, null)[0].head).toBe(TABLE_COPY.banner(TABLE_COPY.seat(2), 60));
    });

    it('never tells someone who took the winner\u2019s seat in the pause that they won', () => {
        let s = deal(three());
        // The big blind leaves owing nothing, stays in the hand away, and wins it uncontested.
        s = ok(reduce(s, {type: 'leave', by: 'p1', at: nowOf(s)}));
        s = moves(s, F, F);
        expect(s.hand!.phase).toBe('complete');
        s = ok(reduce(s, {type: 'sit', by: 'p7', seat: 1, buyIn: s.config.buyInMax, at: nowOf(s)}));
        const v = view(s);
        const look = resultLook(v.hand)!;
        expect(look.winners.map((w) => w.seat)).toEqual([1]);
        const nameOf = (seat: number) => (playerAt(v, seat) === 'p1' ? 'Ana' : 'Bo');
        // The newcomer at seat 1 played nothing: the banner names the player who won.
        expect(viewerSeatIn(v, 1, 'p7')).toBeNull();
        expect(bannerLines(look, nameOf, viewerSeatIn(v, 1, 'p7'))[0]).toMatchObject({mine: false, head: TABLE_COPY.banner('Ana', look.winners[0].amount)});
        // A player still in the seat they played keeps it; a watcher has none.
        expect(viewerSeatIn(v, 0, 'p0')).toBe(0);
        expect(viewerSeatIn(v, null, 'w1')).toBeNull();
        // Before anyone moved, the winner reading their own banner is told they won.
        let w = deal(three());
        w = moves(w, F, F);
        const wv = view(w);
        expect(bannerLines(resultLook(wv.hand)!, () => 'Bo', viewerSeatIn(wv, 1, 'p1'))[0].mine).toBe(true);
    });

    it('says when the board plays, names at most three winners, and no hand for an uncontested pot', () => {
        let s = deal(three(), {holes: {0: '2h3d', 1: '2c3s', 2: '4h5d'}, board: 'AsKsQsJsTs'});
        s = moves(s, C, C, X, X, X, X, X, X, X, X, X, X);
        const lines = bannerLines(resultLook(view(s).hand)!, () => 'Bo', null);
        expect(lines).toHaveLength(3);
        for (const line of lines) expect(line.hand).toBe(`${HAND_COPY.label({category: 8, ranks: [12]})} · ${HAND_COPY.playsBoard}`);
        const many = {handNo: 1, showdown: true, shown: [], playing: [], winners: [0, 1, 2, 3].map((seat) => ({seat, amount: 10, description: null, playsBoard: false}))};
        expect(bannerLines(many, () => 'Bo', null).map((l) => l.seat)).toEqual([0, 1, 2]);
        let t = deal(three(), {board: '2c7d9s3s4c'});
        t = moves(t, F, F);
        expect(bannerLines(resultLook(view(t).hand)!, () => 'Bo', null)[0].hand).toBeNull();
    });
});
