// The games poker night deals, as functions of the variant: how a hand is valued on a board, the five
// cards that play, how a shown hand reads on each board, which betting limit applies, and the card a
// Triple T player's clock throws away for them. Pure and client-safe — the engine picks winners with
// handValue and the browser reads a shown hand with readShown, the same functions, so the page shows
// exactly what the server decided (variants.test.ts holds the two equal).
//
// Texas hold'em and Triple T (after its throw-away) make the strongest five of the hole cards and
// the board; PLO uses exactly two of its four hole cards with exactly three from the board. No call
// here hands the evaluator more than seven cards.

import {rankOf, type Card} from '@/lib/poker/cards';
import {evaluateCards, type HandValue} from '@/lib/poker/evaluator';
import {PLAYING_CARDS} from '@/lib/poker-night/config';
import {bestFive, bestOmaha, playsBoard} from '@/lib/poker-night/hand-name';
import type {GameConfig, Hand, Variant} from '@/lib/poker-night/types';

export type BettingLimit = 'no-limit' | 'pot-limit';

export const limitOf = (v: Variant): BettingLimit => (v === 'plo' ? 'pot-limit' : 'no-limit');

// A hand's value on one board (at least three cards out).
export const handValue = (v: Variant, hole: readonly Card[], board: readonly Card[]): HandValue =>
    v === 'plo' ? bestOmaha(hole, board).value : evaluateCards([...board, ...hole]);

// The value and the five cards that play on one board.
export const bestHand = (v: Variant, hole: readonly Card[], board: readonly Card[]): {value: HandValue; cards: Card[]} =>
    v === 'plo' ? bestOmaha(hole, board) : bestFive([...board, ...hole], hole);

export type BoardRead = {value: HandValue; best: Card[]};
export type ShownRead = {seat: number; cards: Card[]; reads: BoardRead[]};

// A shown hand read on every board: its value and five cards that play on each, once three board
// cards are out and the hand holds the cards its game plays (a Triple T hand that never threw one
// away reads as nothing).
export const readShown = (v: Variant, boards: readonly (readonly Card[])[], shown: {seat: number; cards: readonly Card[]}): ShownRead => {
    const cards = [...shown.cards];
    const readable = cards.length === PLAYING_CARDS[v] && boards.length > 0 && boards.every((b) => b.length >= 3);
    return {
        seat: shown.seat, cards,
        reads: readable ? boards.map((board) => {
            const r = bestHand(v, cards, board);
            return {value: r.value, best: r.cards};
        }) : [],
    };
};

// "Plays the board": never in PLO, where two hole cards always play.
export const playsBoardFor = (v: Variant, board: readonly Card[], value: HandValue): boolean => v !== 'plo' && playsBoard(board, value);

// The card a Triple T player's clock throws away for them, from the cards alone: when two match in
// rank, the odd one out (all three alike: the last dealt); otherwise the lowest.
export const autoDiscard = (hole: readonly Card[]): Card => {
    if (hole.length !== 3) throw new RangeError(`a throw-away is one of three cards, not ${hole.length}`);
    const [a, b, c] = hole.map(rankOf);
    if (a === b) return hole[2];
    if (a === c) return hole[1];
    if (b === c) return hole[0];
    let low = 0;
    for (let i = 1; i < 3; i++) if (rankOf(hole[i]) < rankOf(hole[low])) low = i;
    return hole[low];
};

export type Mode = {variant: Variant; boards: number};

// The game a table is playing: the hand's own while there is one, else what the config deals next.
export const modeOf = (hand: Pick<Hand, 'variant' | 'boards'> | null, config: Pick<GameConfig, 'variant' | 'boards'>): Mode =>
    hand ? {variant: hand.variant, boards: hand.boards.length} : nextModeOf(config);

// What the config deals from the next hand: more than one board only in PLO.
export const nextModeOf = (config: Pick<GameConfig, 'variant' | 'boards'>): Mode =>
    ({variant: config.variant, boards: config.variant === 'plo' ? config.boards : 1});

// Between hands: the host picked another game (or board count) than the hand on the table played,
// so the next deal changes it. Never while a hand is being played, which keeps its own.
export const modeChanged = (hand: (Pick<Hand, 'variant' | 'boards'> & {phase: string}) | null, config: Pick<GameConfig, 'variant' | 'boards'>): boolean => {
    if (!hand || hand.phase !== 'complete') return false;
    const next = nextModeOf(config);
    return hand.variant !== next.variant || hand.boards.length !== next.boards;
};
