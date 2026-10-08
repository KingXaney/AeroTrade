// A finished hand as the table shows it: the winners with their totals over every pot, each shown
// hand's name and whether it plays the board, the winners' five cards that play lit and every other
// card dimmed — and nothing lit or dimmed for a pot nobody contested.

import {describe, expect, it} from 'vitest';
import {nextDueAt} from '@/lib/poker-night/clock';
import {bestFive} from '@/lib/poker-night/hand-name';
import {HAND_COPY, TABLE_COPY} from '@/lib/learn/copy/poker-night';
import {reduce} from '@/lib/poker-night/engine';
import {bannerLines, bannerShows, cardLook, liftBoardOf, playerAt, resultLook, scoopOf, viewerSeatIn} from '@/lib/poker-night/reveal';
import {bestHand} from '@/lib/poker-night/variants';
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

    it('in PLO, lights exactly two of the winner\'s four with three from the board, and never says the board plays', () => {
        // A royal flush on the board: in Texas hold'em everyone plays it; in PLO each hand plays two of its own.
        let s = deal(three([1000, 1000, 1000], {variant: 'plo'}), {holes: {0: 'AhAc7s3d', 1: 'KcQd8s4c', 2: 'Th8h5d5c'}, board: 'Kh9h6h2hJc'});
        s = moves(s, C, C, X, X, X, X, X, X, X, X, X, X);
        const look = resultLook(view(s).hand)!;
        expect(look.winners).toEqual([{seat: 2, amount: 60, description: expect.objectContaining({category: 5}), playsBoard: false}]);
        expect(look.playing.filter((c) => cards('Th8h5d5c').includes(c)).sort()).toEqual(cards('Th8h').sort());
        expect(look.playing.filter((c) => cards('Kh9h6h2hJc').includes(c))).toHaveLength(3);
        for (const card of cards('5d5c')) expect(cardLook(look, card)).toBe('dim');
        // The ace of hearts alone makes no flush: a pair of aces.
        expect(look.shown.find((h) => h.seat === 0)!.description).toMatchObject({category: 1, ranks: [12, 11, 9, 7]});
        let board = deal(three([1000, 1000, 1000], {variant: 'plo'}), {holes: {0: '2h3d4c5s', 1: '2c3s4d5h', 2: '6c7d8h9s'}, board: 'AsKsQsJsTs'});
        board = moves(board, C, C, X, X, X, X, X, X, X, X, X, X);
        expect(resultLook(view(board).hand)!.shown.every((h) => !h.playsBoard)).toBe(true);
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
        expect(bannerLines(look, () => 'Ana', 2)).toEqual([{key: 'seat:2', seat: 2, board: null, mine: true, head: TABLE_COPY.bannerYou(60), hand: pair}]);
        expect(bannerLines(look, () => 'Ana', 0)).toEqual([{key: 'seat:2', seat: 2, board: null, mine: false, head: TABLE_COPY.banner('Ana', 60), hand: pair}]);
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
        const winners = [0, 1, 2, 3].map((seat) => ({seat, amount: 10, description: null, playsBoard: false}));
        const many = {handNo: 1, showdown: true, shown: [], playing: [], winners, boards: [{index: 0, winners, playing: []}]};
        expect(bannerLines(many, () => 'Bo', null).map((l) => l.seat)).toEqual([0, 1, 2]);
        let t = deal(three(), {board: '2c7d9s3s4c'});
        t = moves(t, F, F);
        expect(bannerLines(resultLook(view(t).hand)!, () => 'Bo', null)[0].hand).toBeNull();
    });
});

// ── PLO on two and three boards (P6) ──

// Three players check a three-board PLO hand down: the pot of 60 splits 20 a board.
const threeBoards = (holes: Record<number, string>, boards: string[]): TableState => {
    const s = deal(three([1000, 1000, 1000], {variant: 'plo', boards: boards.length as 2 | 3}), {holes, boards});
    return moves(s, C, C, X, X, X, X, X, X, X, X, X, X);
};
// Seat 0 makes a royal flush on board 1, seat 1 four nines on board 2 and a full house on board 3.
const SPLIT = {holes: {0: 'JsTs4h5h', 1: '9c9d8h7h', 2: '6c6d2s3s'}, boards: ['AsKsQs2d3c', '9h9s4c4d5c', '8d8c7d7c2h']};
// Seat 0 makes three aces, three kings and three aces: every board.
const SCOOP = {holes: {0: 'AsAhKsKh', 1: '2c2d7h8h', 2: '3c3s9c9d'}, boards: ['Ad7c8d9s2h', 'Kd6c3h4c9h', 'Ac5d6hTsJc']};

describe('two and three boards', () => {
    it("names each board's winners and lights each board's cards that play for them, the hole cards with the first board they play on", () => {
        const s = threeBoards(SPLIT.holes, SPLIT.boards);
        const look = resultLook(view(s).hand)!;
        expect(look.boards.map((b) => b.winners.map((w) => [w.seat, w.amount]))).toEqual([[[0, 20]], [[1, 20]], [[1, 20]]]);
        expect(look.winners.map((w) => [w.seat, w.amount])).toEqual([[1, 40], [0, 20]]);
        expect(look.boards.map((b) => b.winners[0].description?.category)).toEqual([8, 7, 6]);
        // Each board's lit cards: its winner's five cards that play there (PLO's two and three).
        SPLIT.boards.forEach((board, k) => {
            const seat = [0, 1, 1][k];
            const best = bestHand('plo', cards(SPLIT.holes[seat as 0 | 1]), cards(board)).cards;
            expect([...look.boards[k].playing].sort()).toEqual([...best].sort());
            for (const card of cards(board)) expect(cardLook(look, card), `${board}`).toBe(best.includes(card) ? 'win' : 'dim');
        });
        expect(look.playing.sort()).toEqual([...new Set(look.boards.flatMap((b) => b.playing))].sort());
        // A hole card lights with the first board it plays on; one that plays on none, with the first.
        expect(cards('JsTs9c9d8h7h').map((c) => liftBoardOf(look, c))).toEqual([0, 0, 1, 1, 2, 2]);
        expect(liftBoardOf(look, cards('6c')[0])).toBe(0);
        expect(cardLook(look, cards('6c')[0])).toBe('dim');
        // Each shown hand read on every board.
        expect(look.shown.every((h) => h.reads.length === 3)).toBe(true);
        expect(scoopOf(look)).toBeNull();
    });

    it('says a board a line in the banner, with the hand on it, and one line when one player wins every board', () => {
        const s = threeBoards(SPLIT.holes, SPLIT.boards);
        const lines = bannerLines(resultLook(view(s).hand)!, (seat) => ['Ana', 'Ben', 'Cy'][seat], 1);
        expect(lines.map((l) => [l.key, l.seat, l.board, l.mine, l.head])).toEqual([
            ['board:0', 0, 0, false, TABLE_COPY.bannerBoard(0, 'Ana', 20)],
            ['board:1', 1, 1, true, TABLE_COPY.bannerBoardYou(1, 20)],
            ['board:2', 1, 2, true, TABLE_COPY.bannerBoardYou(2, 20)],
        ]);
        expect(lines.map((l) => l.hand)).toEqual([
            HAND_COPY.label({category: 8, ranks: [12]}), HAND_COPY.label({category: 7, ranks: [7, 3]}), HAND_COPY.label({category: 6, ranks: [6, 5]}),
        ]);
        const scoop = threeBoards(SCOOP.holes, SCOOP.boards);
        const look = resultLook(view(scoop).hand)!;
        expect(scoopOf(look)).toBe(0);
        expect(bannerLines(look, () => 'Ana', 0)).toEqual([{key: 'all:0', seat: 0, board: null, mine: true, head: TABLE_COPY.bannerScoopYou(60), hand: null}]);
        expect(bannerLines(look, () => 'Ana', null)[0].head).toBe(TABLE_COPY.bannerScoop('Ana', 60));
        // Two boards: the same, a line each.
        const two = threeBoards(SPLIT.holes, SPLIT.boards.slice(0, 2));
        expect(bannerLines(resultLook(view(two).hand)!, () => 'Bo', null).map((l) => l.board)).toEqual([0, 1]);
    });

    it("never says one line when someone else won a side pot, and names a board's chips player by player", () => {
        const board = (seat: number, amount: number) => ({seat, amount});
        // Ana won the main pot on every board; Ben the side pot on every board.
        const hand = {
            no: 4, variant: 'plo' as const, boards: SPLIT.boards.map(cards),
            result: {
                completedAt: 0, showdown: true, refund: null, revealMs: 7200, gone: [], nets: [],
                pots: [{amount: 300, winners: [[0], [0], [0]]}, {amount: 90, winners: [[1], [1], [1]]}],
                hands: [{seat: 0, cards: cards(SPLIT.holes[0])}, {seat: 1, cards: cards(SPLIT.holes[1])}],
            },
        };
        const look = resultLook(hand)!;
        expect(look.boards.map((b) => b.winners.map((w) => [w.seat, w.amount]))).toEqual([[board(0, 100), board(1, 30)], [board(0, 100), board(1, 30)], [board(0, 100), board(1, 30)]].map((b) => b.map((w) => [w.seat, w.amount])));
        expect(scoopOf(look)).toBeNull();
        const lines = bannerLines(look, (seat) => ['Ana', 'Ben'][seat], 1);
        expect(lines.map((l) => l.head)).toEqual([0, 1, 2].map((k) => TABLE_COPY.bannerBoardSplit(k, [{name: 'Ana', amount: 100}, {name: null, amount: 30}])));
        expect(lines.every((l) => !l.mine && l.seat === 0)).toBe(true);
        // A share of no chips (a pot of one chip over three boards) names nobody on its board.
        const odd = resultLook({...hand, result: {...hand.result, pots: [{amount: 1, winners: [[0], [1], [1]]}]}})!;
        expect(odd.boards.map((b) => b.winners.map((w) => w.seat))).toEqual([[0], [], []]);
        expect(bannerLines(odd, () => 'Ana', null)).toHaveLength(1);
    });
});
