// The Hands guide (P2): the ten hand rankings strongest first, each with one five-card example and
// the cards in it that make the hand; a pair of hands that only a kicker separates; and the games a
// poker night table deals, each named by its glossary entry. Pure and client-safe — the lobby's Hands
// tab (app/(root)/poker-night, ?tab=hands) renders it on the server, the table's Hands drawer in the
// browser, both through components/poker-night/HandsGuide — and its words are HANDS_COPY in
// lib/learn/copy/poker-night.ts, never here.
//
// lib/poker-night/__tests__/hands-guide.test.ts holds every example to the evaluator: each one's
// category is its slot's (the royal flush the straight flush to the ace), the list is strictly
// descending, `makes` is exactly the cards that make the hand, and the kicker pair differs at its
// first kicker alone.

import {parseCard, type Card} from "@/lib/poker/cards";
import {evaluateCards} from "@/lib/poker/evaluator";
import {describeHand, type HandDescription} from "@/lib/poker-night/hand-name";

// The ten rankings, strongest first: the order the guide lists them in and HANDS_COPY.categories
// names them in.
export const RANKING_SLOTS = [
    'royal-flush', 'straight-flush', 'four-of-a-kind', 'full-house', 'flush',
    'straight', 'three-of-a-kind', 'two-pair', 'pair', 'high-card',
] as const;
export type RankingSlot = (typeof RANKING_SLOTS)[number];

// Each slot's category in lib/poker/evaluator's CATEGORY (0 high card … 8 straight flush); the royal
// flush is the straight flush to the ace, the evaluator's category 8 too.
export const SLOT_CATEGORY: Readonly<Record<RankingSlot, number>> = {
    'royal-flush': 8, 'straight-flush': 8, 'four-of-a-kind': 7, 'full-house': 6, flush: 5,
    straight: 4, 'three-of-a-kind': 3, 'two-pair': 2, pair: 1, 'high-card': 0,
};

export type RankingExample = {
    slot: RankingSlot;
    cards: readonly Card[]; // the five, as they are drawn
    makes: readonly Card[]; // the cards among them that make the hand, lifted on the page
    description: HandDescription; // what the evaluator reads, for HAND_COPY.label ("Full house, eights full of fours")
};

// Cards as written on them, "Qh Ts": a rank then a suit, the ten as T (lib/poker/cards.parseCard).
const cards = (text: string): Card[] =>
    text.split(' ').map((token) => {
        const card = parseCard(token);
        if (card === null) throw new Error(`not a card: ${token}`);
        return card;
    });

const example = (slot: RankingSlot, all: string, makes: string): RankingExample => {
    const five = cards(all);
    return {slot, cards: five, makes: cards(makes), description: describeHand(evaluateCards(five))};
};

export const RANKING_EXAMPLES: readonly RankingExample[] = [
    example('royal-flush', 'As Ks Qs Js Ts', 'As Ks Qs Js Ts'),
    example('straight-flush', '9h 8h 7h 6h 5h', '9h 8h 7h 6h 5h'),
    example('four-of-a-kind', 'Qc Qd Qh Qs 7d', 'Qc Qd Qh Qs'),
    example('full-house', '8s 8d 8h 4c 4s', '8s 8d 8h 4c 4s'),
    example('flush', 'Kd Td 7d 6d 2d', 'Kd Td 7d 6d 2d'),
    example('straight', 'Tc 9d 8s 7h 6c', 'Tc 9d 8s 7h 6c'),
    example('three-of-a-kind', 'Js Jh Jc Ad 4s', 'Js Jh Jc'),
    example('two-pair', 'Ah Ac 9s 9d 5h', 'Ah Ac 9s 9d'),
    example('pair', 'Th Ts Kc 6d 3s', 'Th Ts'),
    example('high-card', 'Ad Jc 8h 5s 2d', 'Ad'),
];

// Two hands that make the same pair of aces and differ only at their first kicker, a king against a
// queen: the first wins, though the second's later kickers are higher. The pair is lifted in each.
export const KICKER_EXAMPLE: {
    first: readonly Card[];
    second: readonly Card[];
    makes: readonly Card[]; // both hands' pairs
} = {
    first: cards('Ah As Kd 9c 4h'),
    second: cards('Ac Ad Qh Jc Ts'),
    makes: cards('Ah As Ac Ad'),
};

// The cards of `makes` that are in this hand: what one example lifts and its picture names. The kicker
// pair's `makes` covers both hands, and each hand is drawn, and read out, with only its own pair.
export const cardsThatMake = (hand: readonly Card[], makes: readonly Card[]): Card[] => makes.filter((card) => hand.includes(card));

// The games the guide explains, in the order it lists them, each with the glossary entry its section
// quotes and the anchor that section carries (/poker-night?tab=hands#texas-holdem). PLO (glossary
// `omaha`, anchor `plo`) and Triple T (`triple-t`) join this list in later phases, as the table
// learns to deal them.
export const GUIDE_GAMES = [
    {id: 'holdem', term: 'texas-holdem', anchor: 'texas-holdem'},
] as const;
export type GuideGame = (typeof GUIDE_GAMES)[number]['id'];
export type GuideGameEntry = (typeof GUIDE_GAMES)[number];

// Where the games go on the guide: at the table, the game it deals comes first, under "At this
// table", and "The games" lists only the others (a section with nothing in it is not drawn); in the
// lobby, nothing is first and every game is listed.
export const guideGames = (focus: GuideGame | null): {here: GuideGameEntry | null; others: GuideGameEntry[]} => {
    const here = focus === null ? null : GUIDE_GAMES.find((game) => game.id === focus) ?? null;
    return {here, others: GUIDE_GAMES.filter((game) => game !== here)};
};

// The glossary entries the guide quotes, each once: the rankings, the kicker, then every game. The
// lobby's Hands tab lists exactly these in its one "What these mean".
export const HANDS_TERMS = ['hand-rankings', 'kicker', ...GUIDE_GAMES.map((game) => game.term)] as const;
