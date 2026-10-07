// A finished hand as the table shows it: the winners with their totals over every pot, each shown
// hand's name and whether it plays the board, the winners' five cards that play lit and every other
// card dimmed — and nothing lit or dimmed for a pot nobody contested.

import {describe, expect, it} from 'vitest';
import {nextDueAt} from '@/lib/poker-night/clock';
import {bestFive} from '@/lib/poker-night/hand-name';
import {bannerShows, cardLook, resultLook} from '@/lib/poker-night/reveal';
import type {TableState} from '@/lib/poker-night/types';
import {clockLeaderOf, wireView} from '@/lib/poker-night/views';
import {A, C, F, X, cards, deal, moves, nowOf, runOut, table} from './fixtures';

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
