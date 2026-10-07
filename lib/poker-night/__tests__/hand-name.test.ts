// Poker night's hand names: describeHand reads every field of an evaluator value back (a test-local
// encoder rebuilds the value from the description over 200,000 seeded seven-card hands), bestFive
// finds five cards worth the whole hand and leans to the hole cards on a tie, and "plays the board"
// means the board alone makes the hand. Named hands pin each category's ranks.

import {describe, expect, it} from 'vitest';
import {bestFive, describeHand, isRoyal, playsBoard, startingHand, type HandDescription} from '@/lib/poker-night/hand-name';
import {parseCard, type Card} from '@/lib/poker/cards';
import {evaluateCards} from '@/lib/poker/evaluator';
import {mulberry32} from '@/lib/random';

const cards = (text: string): Card[] => text.match(/../g)!.map((t) => parseCard(t)!);
const describe7 = (text: string) => describeHand(evaluateCards(cards(text)));

// The evaluator's layout (lib/poker/evaluator.ts), written out independently: category << 26 over a
// detail per category.
const mask = (ranks: readonly number[]) => ranks.reduce((m, rank) => m | (1 << rank), 0);
const encode = ({category, ranks}: HandDescription): number => {
    const [a, b] = ranks;
    switch (category) {
        case 8: case 4: return (category << 26) | (a + 1);
        case 7: case 6: return (category << 26) | (a << 4) | b;
        case 3: case 1: return (category << 26) | (a << 13) | mask(ranks.slice(1));
        case 2: return (category << 26) | (mask([a, b]) << 13) | mask(ranks.slice(2));
        default: return (category << 26) | mask(ranks);
    }
};
// How many ranks each category names, from high card to straight flush.
const RANK_COUNT = [5, 4, 3, 3, 1, 5, 2, 2, 1];

const check = (ok: boolean, message: () => string) => {
    if (!ok) throw new Error(message());
};

describe('describeHand', () => {
    it('names the ranks that matter in each category', () => {
        expect(describe7('AsKsQsJsTs2h3h')).toEqual({category: 8, ranks: [12]});
        expect(describe7('5s4s3s2sAsKdQh')).toEqual({category: 8, ranks: [3]});
        expect(describe7('7h7d7c7sAdAh2c')).toEqual({category: 7, ranks: [5, 12]});
        // Two sets of trips: the higher three and two of the lower.
        expect(describe7('9h9d9cKsKdKh2c')).toEqual({category: 6, ranks: [11, 7]});
        // Six hearts: the five highest play.
        expect(describe7('Ah9h7h4h3h2hKd')).toEqual({category: 5, ranks: [12, 7, 5, 2, 1]});
        // The wheel: the five is the top card.
        expect(describe7('5h4d3c2sAsKdKh')).toEqual({category: 4, ranks: [3]});
        expect(describe7('9h9d9cKs4d3h2c')).toEqual({category: 3, ranks: [7, 11, 2]});
        expect(describe7('9h9d7c4s2dKhJc')).toEqual({category: 1, ranks: [7, 11, 9, 5]});
        expect(describe7('Kh9d7c4s2dJh3c')).toEqual({category: 0, ranks: [11, 9, 7, 5, 2]});
    });

    it('names the top two of three pairs, the kicker the highest card left', () => {
        // The third pair's rank is the kicker…
        expect(describe7('AhAdKcKs8d8h2c')).toEqual({category: 2, ranks: [12, 11, 6]});
        // …unless a single card outranks it.
        expect(describe7('AhAdKcKs8d8hQc')).toEqual({category: 2, ranks: [12, 11, 10]});
        expect(describe7('AhAdKcKs2d2h8c')).toEqual({category: 2, ranks: [12, 11, 6]});
    });

    it('knows the royal flush from the other straight flushes', () => {
        expect(isRoyal(describe7('AsKsQsJsTs2h3h'))).toBe(true);
        expect(isRoyal(describe7('KsQsJsTs9s2h3h'))).toBe(false);
        expect(isRoyal(describe7('5s4s3s2sAsKdQh'))).toBe(false);
        expect(isRoyal(describe7('AhKdQcJsTs2h3h'))).toBe(false);
    });

    it('refuses what is not a hand value', () => {
        for (const value of [-1, 1.5, Number.NaN, 9 << 26, 2 ** 32]) expect(() => describeHand(value), String(value)).toThrow(RangeError);
    });
});

describe('bestFive and playsBoard', () => {
    it('takes the five that make the hand', () => {
        const hand = cards('Ah9h7h4h3h2hKd');
        expect(bestFive(hand)).toEqual({value: evaluateCards(hand), cards: cards('Ah9h7h4h3h')});
        expect(bestFive(cards('AsKsQsJsTs'))).toEqual({value: evaluateCards(cards('AsKsQsJsTs')), cards: cards('AsKsQsJsTs')});
    });

    it('leans to the hole cards when the board makes the same hand', () => {
        // Broadway on the board, an ace in the hand: both fives are the same straight.
        const board = cards('AsKdQhJcTs');
        const hole = cards('Ah2c');
        const made = bestFive([...board, ...hole], hole);
        expect(made.cards).toEqual(cards('KdQhJcTsAh'));
        expect(playsBoard(board, made.value)).toBe(true);
        // With nothing preferred, the first five in order.
        expect(bestFive([...board, ...hole]).cards).toEqual(board);
        // A hole card of a rank the board already plays stands in for the board's card: the nine of
        // hearts tops the straight instead of the nine of spades…
        const straight = bestFive([...cards('9s8d7h6c5d'), ...cards('9h2c')], cards('9h2c'));
        expect(straight.cards).toEqual(cards('8d7h6c5d9h'));
        expect(playsBoard(cards('9s8d7h6c5d'), straight.value)).toBe(true);
        // …and the eight of hearts fills the full house, with the first board eight beside it.
        const full = bestFive([...cards('9s9d9h8c8d'), ...cards('8h2c')], cards('8h2c'));
        expect(full.cards).toEqual(cards('9s9d9h8c8h'));
        expect(playsBoard(cards('9s9d9h8c8d'), full.value)).toBe(true);
    });

    it('says the board plays only when the board alone makes the hand', () => {
        const board = cards('AsKdQhJc9s');
        const made = bestFive([...board, ...cards('Th2c')], cards('Th2c'));
        expect(describeHand(made.value)).toEqual({category: 4, ranks: [12]});
        expect(playsBoard(board, made.value)).toBe(false);
        expect(playsBoard(board.slice(0, 4), evaluateCards(board.slice(0, 4)))).toBe(false);
    });

    it('takes five to seven cards', () => {
        expect(() => bestFive(cards('AsKsQsJs'))).toThrow(RangeError);
        expect(() => bestFive(cards('AsKsQsJsTs9s8s7s'))).toThrow(RangeError);
    });
});

describe('200,000 seeded seven-card hands', () => {
    it('round-trip through the description, and the five cards that play are worth the hand', () => {
        const random = mulberry32(2026);
        const deck = Array.from({length: 52}, (_, i) => i);
        // The 21 five-card subsets of seven, as index lists sorted lexicographically, for the
        // tie-break reference.
        const subsets: number[][] = [];
        for (let a = 0; a < 7; a++) for (let b = a + 1; b < 7; b++) subsets.push([0, 1, 2, 3, 4, 5, 6].filter((i) => i !== a && i !== b));
        subsets.sort((x, y) => {
            const i = x.findIndex((v, k) => v !== y[k]);
            return i < 0 ? 0 : x[i] - y[i];
        });
        const seenCategories = new Set<number>();
        for (let n = 0; n < 200_000; n++) {
            for (let i = 0; i < 7; i++) {
                const j = i + Math.floor(random() * (52 - i));
                [deck[i], deck[j]] = [deck[j], deck[i]];
            }
            const hand = deck.slice(0, 7);
            const hole = hand.slice(0, 2);
            const board = hand.slice(2);
            const value = evaluateCards(hand);
            const label = () => `${hand} (${value})`;

            const d = describeHand(value);
            seenCategories.add(d.category);
            check(encode(d) === value, () => `encode ${JSON.stringify(d)} for ${label()}`);
            check(d.ranks.length === RANK_COUNT[d.category] && d.ranks.every((r) => Number.isInteger(r) && r >= 0 && r <= 12),
                () => `ranks ${JSON.stringify(d)} for ${label()}`);

            const made = bestFive(hand, hole);
            check(made.value === value, () => `bestFive value ${made.value} for ${label()}`);
            check(made.cards.length === 5 && new Set(made.cards).size === 5 && made.cards.every((c) => hand.includes(c)),
                () => `bestFive cards ${made.cards} for ${label()}`);
            check(evaluateCards(made.cards) === value, () => `bestFive cards ${made.cards} worth less than ${label()}`);

            const boardValue = evaluateCards(board);
            check(playsBoard(board, value) === (boardValue === value), () => `playsBoard for ${label()}`);
            check(boardValue <= value, () => `board worth more than the hand for ${label()}`);

            // Every tenth hand, the tie-break against a reference: of the subsets worth the hand,
            // the most hole cards, then the first in order.
            if (n % 10 === 0) {
                const worth = subsets.filter((s) => evaluateCards(s.map((i) => hand[i])) === value);
                const holeCount = (s: number[]) => s.filter((i) => i < 2).length;
                const most = Math.max(...worth.map(holeCount));
                const expected = worth.find((s) => holeCount(s) === most)!.map((i) => hand[i]);
                check(made.cards.join() === expected.join(), () => `tie-break ${made.cards} vs ${expected} for ${label()}`);
            }
        }
        expect([...seenCategories].sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    }, 60_000);
});

describe('startingHand', () => {
    it('reads two hole cards as high, low, pair and suited', () => {
        expect(startingHand(parseCard('Kh')!, parseCard('Ah')!)).toEqual({hi: 12, lo: 11, pair: false, suited: true});
        expect(startingHand(parseCard('7c')!, parseCard('7d')!)).toEqual({hi: 5, lo: 5, pair: true, suited: false});
        expect(startingHand(parseCard('2s')!, parseCard('9h')!)).toEqual({hi: 7, lo: 0, pair: false, suited: false});
    });
});
