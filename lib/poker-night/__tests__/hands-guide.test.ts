// The Hands guide's examples (lib/poker-night/hands-guide.ts), held to the evaluator: each example is
// the hand its slot names, strongest first, with exactly the cards that make it lifted, and the kicker
// pair is separated by its first kicker alone.

import {describe, expect, it} from 'vitest';
import {rankOf, type Card} from '@/lib/poker/cards';
import {categoryOf, evaluateCards} from '@/lib/poker/evaluator';
import {describeHand, isRoyal} from '@/lib/poker-night/hand-name';
import {cardsThatMake, GUIDE_GAMES, guideGames, HANDS_TERMS, KICKER_EXAMPLE, RANKING_EXAMPLES, RANKING_SLOTS, SLOT_CATEGORY} from '@/lib/poker-night/hands-guide';
import {HANDS_COPY} from '@/lib/learn/copy/poker-night';
import {isGlossaryKey} from '@/lib/learn/glossary';

const value = (cards: readonly Card[]) => evaluateCards(cards, cards.length);

// The cards that make a five-card hand, worked out from its ranks alone: every card for a straight, a
// flush or a straight flush (and a full house, whose two groups are all five); the matched ranks for
// four of a kind, three of a kind, two pair and a pair; the highest card for high card.
const making = (cards: readonly Card[]): Card[] => {
    const category = categoryOf(value(cards));
    if (category === 4 || category === 5 || category === 8) return [...cards];
    if (category === 0) return [cards.reduce((a, b) => (rankOf(b) > rankOf(a) ? b : a))];
    const counts = new Map<number, number>();
    for (const card of cards) counts.set(rankOf(card), (counts.get(rankOf(card)) ?? 0) + 1);
    return cards.filter((card) => (counts.get(rankOf(card)) ?? 0) >= 2);
};

const sorted = (cards: readonly Card[]) => [...cards].sort((a, b) => a - b);

describe('the ranking examples', () => {
    it('are ten, one per slot, strongest first', () => {
        expect(RANKING_EXAMPLES.map((example) => example.slot)).toEqual([...RANKING_SLOTS]);
        expect(RANKING_SLOTS).toHaveLength(10);
    });

    it('each make the hand their slot names, by the evaluator', () => {
        for (const example of RANKING_EXAMPLES) {
            expect(example.cards, example.slot).toHaveLength(5);
            expect(new Set(example.cards).size, example.slot).toBe(5);
            const v = value(example.cards);
            expect(categoryOf(v), example.slot).toBe(SLOT_CATEGORY[example.slot]);
            expect(isRoyal(describeHand(v)), example.slot).toBe(example.slot === 'royal-flush');
            expect(example.description, example.slot).toEqual(describeHand(v));
        }
        // Every category of the evaluator's, the straight flush twice (the royal one first).
        expect(new Set(RANKING_EXAMPLES.map((example) => categoryOf(value(example.cards))))).toEqual(new Set([0, 1, 2, 3, 4, 5, 6, 7, 8]));
    });

    it('are strictly descending: each example wins against the next', () => {
        for (let i = 0; i + 1 < RANKING_EXAMPLES.length; i++) {
            expect(value(RANKING_EXAMPLES[i].cards), RANKING_EXAMPLES[i].slot).toBeGreaterThan(value(RANKING_EXAMPLES[i + 1].cards));
        }
    });

    it('lift exactly the cards that make each hand', () => {
        for (const example of RANKING_EXAMPLES) {
            for (const card of example.makes) expect(example.cards, example.slot).toContain(card);
            expect(sorted(example.makes), example.slot).toEqual(sorted(making(example.cards)));
        }
        const count = (slot: string) => RANKING_EXAMPLES.find((example) => example.slot === slot)!.makes.length;
        expect([count('four-of-a-kind'), count('three-of-a-kind'), count('two-pair'), count('pair'), count('high-card'), count('full-house')]).toEqual([4, 3, 4, 2, 1, 5]);
    });
});

describe('the kicker example', () => {
    it('makes the same pair of aces twice, and the first kicker that differs decides', () => {
        const first = describeHand(value(KICKER_EXAMPLE.first));
        const second = describeHand(value(KICKER_EXAMPLE.second));
        expect([first.category, second.category]).toEqual([1, 1]);
        expect([first.ranks[0], second.ranks[0]]).toEqual([12, 12]);
        // The king against the queen: the first wins, though the second's later kickers are higher.
        expect([first.ranks[1], second.ranks[1]]).toEqual([11, 10]);
        expect(second.ranks[2]).toBeGreaterThan(first.ranks[2]);
        expect(value(KICKER_EXAMPLE.first)).toBeGreaterThan(value(KICKER_EXAMPLE.second));
    });

    it('lifts each hand\'s pair, and no card is in both hands', () => {
        expect(new Set([...KICKER_EXAMPLE.first, ...KICKER_EXAMPLE.second]).size).toBe(10);
        expect(sorted(KICKER_EXAMPLE.makes)).toEqual(sorted([...making(KICKER_EXAMPLE.first), ...making(KICKER_EXAMPLE.second)]));
        expect(sorted(cardsThatMake(KICKER_EXAMPLE.first, KICKER_EXAMPLE.makes))).toEqual(sorted(making(KICKER_EXAMPLE.first)));
        expect(sorted(cardsThatMake(KICKER_EXAMPLE.second, KICKER_EXAMPLE.makes))).toEqual(sorted(making(KICKER_EXAMPLE.second)));
    });

    it('names, in each hand\u2019s picture, only the cards in that hand', () => {
        // As components/poker-night/HandsGuide labels them: the hand's own pair, never the other's aces.
        const label = (hand: typeof KICKER_EXAMPLE.first) => HANDS_COPY.example(hand, cardsThatMake(hand, KICKER_EXAMPLE.makes));
        expect(label(KICKER_EXAMPLE.first)).toBe('Ace of hearts, ace of spades, king of diamonds, nine of clubs and four of hearts. The ace of hearts and ace of spades make the hand.');
        expect(label(KICKER_EXAMPLE.second)).toBe('Ace of clubs, ace of diamonds, queen of hearts, jack of clubs and ten of spades. The ace of clubs and ace of diamonds make the hand.');
        // A ranking's own makes are all in its hand: unchanged.
        for (const example of RANKING_EXAMPLES) expect(cardsThatMake(example.cards, example.makes)).toEqual([...example.makes]);
    });
});

describe('the games', () => {
    it('put the table\'s own game first and list the rest under The games', () => {
        expect(guideGames(null)).toEqual({here: null, others: [...GUIDE_GAMES]});
        expect(guideGames('holdem')).toEqual({here: GUIDE_GAMES[0], others: []});
        expect(GUIDE_GAMES.map((game) => game.anchor)).toEqual(['texas-holdem']);
    });

    it('quote glossary entries only, each once', () => {
        expect([...HANDS_TERMS]).toEqual(['hand-rankings', 'kicker', 'texas-holdem']);
        for (const key of HANDS_TERMS) expect(isGlossaryKey(key), key).toBe(true);
        expect(new Set(HANDS_TERMS).size).toBe(HANDS_TERMS.length);
    });
});
