// The hand evaluator, checked three ways: every five-card and every seven-card hand lands in its
// category the known number of times; a slow, obviously-correct evaluator (best of the 21 five-card
// subsets, by sorting and counting) orders random hands the same way; and the named edge cases.

import {describe, expect, it} from 'vitest';
import {CATEGORY, categoryOf, evaluateCards, evaluateMasks} from '@/lib/poker/evaluator';
import {mulberry32} from '@/lib/random';
import {parseCard} from '@/lib/poker/cards';

const cards = (text: string): number[] => text.match(/../g)!.map((t) => parseCard(t)!);

// Every hand of `size` cards from 52, with suit masks kept incrementally, handed to `visit`.
const everyHand = (size: number, visit: (value: number) => void) => {
    const masks = [0, 0, 0, 0];
    const go = (start: number, left: number) => {
        if (left === 0) {
            visit(evaluateMasks(masks[0], masks[1], masks[2], masks[3]));
            return;
        }
        for (let card = start; card <= 52 - left; card++) {
            masks[card & 3] ^= 1 << (card >> 2);
            go(card + 1, left - 1);
            masks[card & 3] ^= 1 << (card >> 2);
        }
    };
    go(0, size);
};

// The slow reference: a five-card hand as a comparable list, then the best of every five of seven.
const rank5 = (hand: readonly number[]): number[] => {
    const ranks = hand.map((c) => c >> 2).sort((a, b) => b - a);
    const suits = hand.map((c) => c & 3);
    const counts = new Map<number, number>();
    for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
    const groups = [...counts.entries()].sort((x, y) => y[1] - x[1] || y[0] - x[0]);
    const flush = suits.every((s) => s === suits[0]);
    const unique = [...new Set(ranks)];
    let straightTop = -1;
    if (unique.length === 5 && unique[0] - unique[4] === 4) straightTop = unique[0];
    if (unique.length === 5 && unique[0] === 12 && unique[1] === 3) straightTop = 3;
    const kickers = groups.map(([r]) => r);
    if (straightTop >= 0 && flush) return [8, straightTop];
    if (groups[0][1] === 4) return [7, ...kickers];
    if (groups[0][1] === 3 && groups[1][1] === 2) return [6, ...kickers];
    if (flush) return [5, ...ranks];
    if (straightTop >= 0) return [4, straightTop];
    if (groups[0][1] === 3) return [3, ...kickers];
    if (groups[0][1] === 2 && groups[1][1] === 2) return [2, ...kickers];
    if (groups[0][1] === 2) return [1, ...kickers];
    return [0, ...ranks];
};
const compareLists = (x: number[], y: number[]): number => {
    for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? -1) !== (y[i] ?? -1)) return (x[i] ?? -1) - (y[i] ?? -1);
    return 0;
};
const best7 = (hand: readonly number[]): number[] => {
    let best: number[] | null = null;
    for (let a = 0; a < 7; a++) for (let b = a + 1; b < 7; b++) {
        const five = hand.filter((_, i) => i !== a && i !== b);
        const r = rank5(five);
        if (!best || compareLists(r, best) > 0) best = r;
    }
    return best!;
};

describe('every hand', () => {
    it('lands five-card hands in their categories, with 7,462 distinct values', () => {
        const counts = new Array(9).fill(0);
        const seen = new Set<number>();
        everyHand(5, (v) => {
            counts[categoryOf(v)]++;
            seen.add(v);
        });
        expect(counts).toEqual([1_302_540, 1_098_240, 123_552, 54_912, 10_200, 5_108, 3_744, 624, 40]);
        expect(seen.size).toBe(7462);
    });

    it('lands seven-card hands in their categories, with 4,824 distinct values', () => {
        const counts = new Array(9).fill(0);
        const seen = new Set<number>();
        everyHand(7, (v) => {
            counts[v >>> 26]++;
            seen.add(v);
        });
        expect(counts).toEqual([23_294_460, 58_627_800, 31_433_400, 6_461_620, 6_180_020, 4_047_644, 3_473_184, 224_848, 41_584]);
        expect(seen.size).toBe(4824);
    }, 120_000);
});

describe('against a slow reference', () => {
    it('orders random seven-card hands the same way, ties included', () => {
        const random = mulberry32(2026);
        const deal = (): number[] => {
            const deck = Array.from({length: 52}, (_, i) => i);
            for (let i = 0; i < 7; i++) {
                const j = i + Math.floor(random() * (52 - i));
                [deck[i], deck[j]] = [deck[j], deck[i]];
            }
            return deck.slice(0, 7);
        };
        for (let n = 0; n < 20_000; n++) {
            const x = deal();
            const y = deal();
            const fast = Math.sign(evaluateCards(x) - evaluateCards(y));
            const slow = Math.sign(compareLists(best7(x), best7(y)));
            if (fast !== slow) throw new Error(`disagree on ${x} vs ${y}: fast ${fast}, slow ${slow}`);
        }
    }, 60_000);
});

describe('named hands', () => {
    const value = (text: string) => evaluateCards(cards(text));
    const category = (text: string) => CATEGORY[categoryOf(value(text))];

    it('reads the categories', () => {
        expect(category('AsKsQsJsTs')).toBe('straight flush');
        expect(category('5s4s3s2sAs')).toBe('straight flush');
        expect(category('AhAdAcAs2d')).toBe('four of a kind');
        expect(category('KhKdKc2s2d')).toBe('full house');
        expect(category('Ah9h7h4h2h')).toBe('flush');
        expect(category('5h4d3c2sAs')).toBe('straight');
        expect(category('9h9d9c4s2d')).toBe('three of a kind');
        expect(category('9h9d4c4s2d')).toBe('two pair');
        expect(category('9h9d7c4s2d')).toBe('pair');
        expect(category('Kh9d7c4s2d')).toBe('high card');
    });

    it('puts the wheel under a six-high straight, and the steel wheel under a six-high straight flush', () => {
        expect(value('5h4d3c2sAs')).toBeLessThan(value('6h5d4c3s2s'));
        expect(value('5s4s3s2sAs')).toBeLessThan(value('6s5s4s3s2s'));
    });

    it('plays the strongest five of seven', () => {
        // Three pairs: the two highest, and the highest other card — the third pair's rank here.
        expect(value('AhAdKcKs8d8h2c')).toBe(value('AhAdKcKs8d'));
        // Two sets of trips are a full house of the higher.
        expect(category('9h9d9cKsKdKh2c')).toBe('full house');
        expect(value('9h9d9cKsKdKh2c')).toBeGreaterThan(value('QhQdQc9s9d2h3c'));
        // Quads take their kicker from what is left, even a pair.
        expect(value('7h7d7c7sAdAh2c')).toBe(value('7h7d7c7sAd'));
        // Flushes compare down to the fifth card.
        expect(value('Ah9h7h4h3h')).toBeGreaterThan(value('Ad9d7d4d2d'));
        // The board plays: both hands are the same five.
        expect(value('AsKsQsJsTs2h3h')).toBe(value('AsKsQsJsTs4d5d'));
    });
});
