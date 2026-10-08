// The games as functions: Omaha's two-and-three against a brute force over every way to make five
// cards from exactly two hole cards and exactly three board cards, its named traps (a four-flush
// board, quads and a straight on the board), a shown hand read on every board equal to the value
// the engine picks winners with, the betting limit of each game, a board that plays never in PLO,
// and Triple T's throw-away by its rule over every three-card hand.

import {describe, expect, it} from 'vitest';
import {rankOf, type Card} from '@/lib/poker/cards';
import {evaluateCards} from '@/lib/poker/evaluator';
import {bestOmaha, describeHand} from '@/lib/poker-night/hand-name';
import {autoDiscard, bestHand, handValue, limitOf, modeOf, playsBoardFor, readShown} from '@/lib/poker-night/variants';
import {mulberry32} from '@/lib/random';
import {cards} from './fixtures';

// Every five of exactly two hole cards and exactly three board cards, the highest value.
const bruteOmaha = (hole: readonly Card[], board: readonly Card[]): number => {
    let top = -1;
    for (let a = 0; a < hole.length; a++) for (let b = a + 1; b < hole.length; b++) {
        for (let c = 0; c < board.length; c++) for (let d = c + 1; d < board.length; d++) for (let e = d + 1; e < board.length; e++) {
            top = Math.max(top, evaluateCards([hole[a], hole[b], board[c], board[d], board[e]]));
        }
    }
    return top;
};

const deal = (random: () => number, n: number): Card[] => {
    const deck = Array.from({length: 52}, (_, c) => c);
    for (let i = 51; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck.slice(0, n);
};

describe('Omaha: exactly two hole cards and exactly three from the board', () => {
    it('matches a brute force over every two-and-three, on the flop, the turn and the river', () => {
        const random = mulberry32(7);
        for (let k = 0; k < 20_000; k++) {
            const boardSize = 3 + (k % 3);
            const cs = deal(random, 4 + boardSize);
            const hole = cs.slice(0, 4);
            const board = cs.slice(4);
            const best = bestOmaha(hole, board);
            expect(best.value).toBe(bruteOmaha(hole, board));
            // The five that play: three from the board in its order, then two of the hole.
            expect(best.cards.slice(0, 3).every((c) => board.includes(c))).toBe(true);
            expect(best.cards.slice(3).every((c) => hole.includes(c))).toBe(true);
            expect(evaluateCards(best.cards)).toBe(best.value);
            expect(handValue('plo', hole, board)).toBe(best.value);
        }
    });

    it('makes no flush from one suited hole card on a four-flush board, no quads from the board\'s, no straight from the board\'s', () => {
        // Four hearts on the board, one in the hand: a pair of aces, not a flush.
        expect(describeHand(handValue('plo', cards('AhAc7s3d'), cards('Kh9h6h2hJc'))).category).toBe(1);
        expect(describeHand(handValue('holdem', cards('AhAc'), cards('Kh9h6h2hJc'))).category).toBe(5);
        // Quads on the board are no quads: three of its nines and the pair in hand, a full house.
        expect(describeHand(handValue('plo', cards('KcKd2c3d'), cards('9h9c9d9s5h'))).category).toBe(6);
        // A straight on the board needs two hole cards that keep it.
        expect(describeHand(handValue('plo', cards('2c2d3h3s'), cards('5h6c7d8s9h'))).category).toBeLessThan(4);
    });

    it('refuses fewer than three board cards', () => {
        expect(() => bestOmaha(cards('AhAcKdKs'), cards('2c3d'))).toThrow(RangeError);
    });
});

describe('a shown hand, read', () => {
    it('reads every board as the engine values it, and nothing before the flop or of a hand that never threw one away', () => {
        const random = mulberry32(11);
        for (let k = 0; k < 2000; k++) {
            const cs = deal(random, 4 + 15);
            const boards = [cs.slice(4, 9), cs.slice(9, 14), cs.slice(14, 19)].slice(0, 1 + (k % 3));
            const plo = readShown('plo', boards, {seat: 3, cards: cs.slice(0, 4)});
            expect(plo.reads.map((r) => r.value)).toEqual(boards.map((b) => handValue('plo', cs.slice(0, 4), b)));
            const holdem = readShown('holdem', [boards[0]], {seat: 1, cards: cs.slice(0, 2)});
            expect(holdem.reads[0].value).toBe(handValue('holdem', cs.slice(0, 2), boards[0]));
            expect(holdem.reads[0].best).toEqual(bestHand('holdem', cs.slice(0, 2), boards[0]).cards);
        }
        expect(readShown('holdem', [cards('2c3d')], {seat: 0, cards: cards('AhAd')}).reads).toEqual([]);
        expect(readShown('triple-t', [cards('2c3d4h5s9c')], {seat: 0, cards: cards('AhAdKc')}).reads).toEqual([]);
        expect(readShown('triple-t', [cards('2c3d4h5s9c')], {seat: 0, cards: cards('AhAd')}).reads).toHaveLength(1);
    });

    it('bets pot limit in PLO alone, and never plays the board there', () => {
        expect([limitOf('holdem'), limitOf('plo'), limitOf('triple-t')]).toEqual(['no-limit', 'pot-limit', 'no-limit']);
        const board = cards('AsKsQsJsTs');
        expect(playsBoardFor('holdem', board, evaluateCards(board))).toBe(true);
        expect(playsBoardFor('plo', board, evaluateCards(board))).toBe(false);
    });

    it('names the game in play: the hand\'s own, else what the config deals next', () => {
        expect(modeOf(null, {variant: 'plo', boards: 2})).toEqual({variant: 'plo', boards: 2});
        expect(modeOf({variant: 'holdem', boards: [[]]}, {variant: 'plo', boards: 2})).toEqual({variant: 'holdem', boards: 1});
    });
});

describe('Triple T\'s throw-away for a player out of time', () => {
    it('throws the odd one out of a pair, the last dealt of three alike, else the lowest — over every three cards', () => {
        let checked = 0;
        for (let a = 0; a < 52; a++) for (let b = a + 1; b < 52; b++) for (let c = b + 1; c < 52; c++) {
            const hole = [a, b, c];
            const r = hole.map(rankOf);
            const thrown = autoDiscard(hole);
            if (r[0] === r[1] && r[1] === r[2]) expect(thrown).toBe(c);
            else if (r[0] === r[1]) expect(thrown).toBe(c);
            else if (r[0] === r[2]) expect(thrown).toBe(b);
            else if (r[1] === r[2]) expect(thrown).toBe(a);
            else expect(rankOf(thrown)).toBe(Math.min(...r));
            checked++;
        }
        expect(checked).toBe(22_100);
        expect(() => autoDiscard(cards('AhAd'))).toThrow(RangeError);
    });
});
