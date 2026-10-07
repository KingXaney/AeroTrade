// Poker night's sentences (lib/learn/copy/poker-night.ts), each rendered over the inputs it meets and
// held to the 'copy' tier of the no-advice list and to a currency ban (play chips have no cash
// value), with the strings the table shows pinned word for word. One describe block per copy table;
// the error codes are covered both ways against lib/poker-night/http.ts.

import {describe, expect, it} from 'vitest';
import {findBanned, stripProhibitions} from '@/lib/learn/banned';
import {
    ACTION_COPY, AVATAR_COPY, HAND_COPY, isolate, JOIN_COPY, POKER_NIGHT_ERRORS, REFUSAL_COPY, SUIT_GLYPHS, SUIT_NAMES,
} from '@/lib/learn/copy/poker-night';
import {FACE_IDS} from '@/lib/poker-night/avatar';
import {ERROR_CODES, refusalToCode} from '@/lib/poker-night/http';
import {ENTRY_KINDS} from '@/lib/poker-night/config';
import {describeHand, isRoyal, type HandDescription} from '@/lib/poker-night/hand-name';
import {parseCard} from '@/lib/poker/cards';
import {CATEGORY, evaluateCards} from '@/lib/poker/evaluator';
import {mulberry32} from '@/lib/random';

const clean = (text: string) => {
    expect(text, text).not.toMatch(/undefined|NaN|null|\[object|Infinity/);
    expect(findBanned(text, 'copy'), text).toEqual([]);
    // No sentence opens on the game's name, "Hold" or "Buy": findBanned reads them as orders.
    expect(text, text).not.toMatch(/(^|[.!?:;]\s*)(hold'em|hold|buy)\b/i);
    // Play chips have no cash value: no currency word, outside a clause that says "No …".
    expect(stripProhibitions(text), text).not.toMatch(/\b(money|cash|dollars?)\b|[$€£]/i);
};

const strings = (table: object): string[] =>
    Object.values(table).flatMap((value) => (typeof value === 'string' ? [value] : Array.isArray(value) ? value.filter((v) => typeof v === 'string') : typeof value === 'object' && value ? strings(value) : []));

const hand = (text: string): HandDescription => describeHand(evaluateCards(text.match(/../g)!.map((t) => parseCard(t)!)));

// How many ranks each category names, from high card to straight flush (lib/poker-night/hand-name.ts).
const RANK_COUNT = [5, 4, 3, 3, 1, 5, 2, 2, 1];

// Every description the copy can be handed, as far as its words go: each category with every first
// rank and every different second rank, the rest filled with other ranks.
const everyDescription = (): HandDescription[] => {
    const out: HandDescription[] = [];
    for (let category = 0; category < CATEGORY.length; category++) {
        for (let first = 0; first < 13; first++) {
            for (let second = 0; second < 13; second++) {
                if (second === first) continue;
                const rest = [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0].filter((r) => r !== first && r !== second);
                out.push({category, ranks: [first, second, ...rest].slice(0, RANK_COUNT[category])});
            }
        }
    }
    return out;
};

describe('the hand names', () => {
    it('say every fixed line in plain words', () => {
        for (const text of [...strings(HAND_COPY), ...SUIT_GLYPHS, ...SUIT_NAMES]) clean(text);
    });

    it('name every category and rank, as a label and inside a sentence', () => {
        const all = everyDescription();
        expect(all).toHaveLength(9 * 13 * 12);
        for (const d of all) {
            const label = HAND_COPY.label(d);
            const phrase = HAND_COPY.phrase(d);
            clean(label);
            clean(phrase);
            expect(label[0], label).toBe(label[0].toUpperCase());
            expect(phrase, phrase).toBe(phrase.toLowerCase());
            expect(phrase.replace(/^a /, ''), phrase).toBe(label.toLowerCase());
            expect(label === 'Royal flush', label).toBe(isRoyal(d));
        }
    });

    it('name the hands the evaluator makes', () => {
        const random = mulberry32(2026);
        const deck = Array.from({length: 52}, (_, i) => i);
        for (let n = 0; n < 20_000; n++) {
            for (let i = 0; i < 7; i++) {
                const j = i + Math.floor(random() * (52 - i));
                [deck[i], deck[j]] = [deck[j], deck[i]];
            }
            const d = describeHand(evaluateCards(deck, 7));
            clean(HAND_COPY.label(d));
            clean(HAND_COPY.phrase(d));
        }
    });

    it('read as the table prints them', () => {
        const pinned: [string, string, string][] = [
            ['AsKsQsJsTs', 'Royal flush', 'a royal flush'],
            ['5s4s3s2sAs', 'Straight flush, five high', 'a straight flush, five high'],
            ['AhAdAcAs2d', 'Four of a kind, aces', 'four of a kind, aces'],
            ['KhKdKc2s2d', 'Full house, kings full of twos', 'a full house, kings full of twos'],
            ['Ah9h7h4h2h', 'Flush, ace high', 'a flush, ace high'],
            ['Th9d8c7s6s', 'Straight, ten high', 'a straight, ten high'],
            ['9h9d9c4s2d', 'Three of a kind, nines', 'three of a kind, nines'],
            ['KhKd7c7s2d', 'Two pair, kings and sevens', 'two pair, kings and sevens'],
            ['QhQd7c4s2d', 'Pair of queens', 'a pair of queens'],
            ['Ah9d7c4s2d', 'Ace high', 'ace high'],
        ];
        for (const [cards, label, phrase] of pinned) {
            expect(HAND_COPY.label(hand(cards)), cards).toBe(label);
            expect(HAND_COPY.phrase(hand(cards)), cards).toBe(phrase);
        }
        expect(HAND_COPY.label(hand('6s6d6c6h3d'))).toBe('Four of a kind, sixes');
        expect(HAND_COPY.label(hand('5h4d3c2sAs'))).toBe('Straight, five high');
        expect(HAND_COPY.playsBoard).toBe('Plays the board');
        expect(HAND_COPY.fiveCards).toBe('The five cards that play');
    });

    it('name the ranks two to ace, one and many', () => {
        expect(HAND_COPY.rankName).toEqual(['two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'jack', 'queen', 'king', 'ace']);
        expect(HAND_COPY.rankPlural).toEqual(['twos', 'threes', 'fours', 'fives', 'sixes', 'sevens', 'eights', 'nines', 'tens', 'jacks', 'queens', 'kings', 'aces']);
    });

    it('draw the suits as text, in the cards module order', () => {
        expect(SUIT_GLYPHS).toEqual(['♣︎', '♦︎', '♥︎', '♠︎']);
        expect(SUIT_NAMES).toEqual(['clubs', 'diamonds', 'hearts', 'spades']);
    });
});

describe('the hand log', () => {
    it('says every kind of line, all in or not, over the amounts it meets', () => {
        for (const kind of ENTRY_KINDS) {
            for (const allIn of [false, true]) {
                for (const n of [0, 1, 2, 1_250_000]) clean(ACTION_COPY.does(kind, n, allIn));
            }
        }
    });

    it('reads as the log prints it', () => {
        const pinned: [Parameters<typeof ACTION_COPY.does>, string][] = [
            [['small-blind', 10, false], 'posts the small blind, 10'],
            [['big-blind', 20, false], 'posts the big blind, 20'],
            [['ante', 5, false], 'posts an ante, 5'],
            [['post', 20, false], 'posts a big blind to play, 20'],
            [['fold', 0, false], 'folds'],
            [['check', 0, false], 'checks'],
            [['call', 40, false], 'calls 40'],
            [['bet', 100, false], 'bets 100'],
            [['raise', 340, false], 'raises to 340'],
            [['refund', 150, false], 'gets back 150 uncalled'],
            [['show', 0, false], 'shows'],
            [['void', 3000, false], 'the hand is called off'],
            [['call', 35, true], 'calls 35, all in'],
            [['raise', 1_250_000, true], 'raises to 1,250,000, all in'],
        ];
        for (const [args, text] of pinned) expect(ACTION_COPY.does(...args)).toBe(text);
        expect(new Set(pinned.map(([[kind]]) => kind))).toEqual(new Set(ENTRY_KINDS));
    });
});

describe('the refusals', () => {
    it('give every refusal one short sentence in plain words', () => {
        expect(Object.keys(REFUSAL_COPY).sort()).toEqual([
            'already-seated', 'bad-amount', 'bad-config', 'bad-deck', 'bad-seat', 'below-buy-in', 'below-min-raise', 'closed',
            'illegal', 'no-request', 'not-due', 'not-host', 'not-now', 'not-seated', 'not-your-turn', 'over-cap', 'rebuy-cap',
            'rebuys-off', 'seat-taken', 'stale',
        ]);
        for (const text of Object.values(REFUSAL_COPY)) {
            clean(text);
            expect(text, text).toMatch(/^[A-Z][^.]*\.$/);
        }
    });

    it('read as the table says them', () => {
        expect(REFUSAL_COPY.stale).toBe('The table moved on before that arrived.');
        expect(REFUSAL_COPY['not-your-turn']).toBe('It is not your turn yet.');
        expect(REFUSAL_COPY['below-min-raise']).toBe('That raise is under the minimum.');
        expect(REFUSAL_COPY['rebuys-off']).toBe('Rebuys are off at this table.');
        expect(REFUSAL_COPY['over-cap']).toBe("That is over the table's chip cap.");
    });
});

describe('the errors', () => {
    it('give every code the routes answer with one sentence, and no other', () => {
        expect(Object.keys(POKER_NIGHT_ERRORS).sort()).toEqual([...ERROR_CODES].sort());
        for (const code of ERROR_CODES) {
            const text = POKER_NIGHT_ERRORS[code];
            clean(text);
            expect(text, code).toMatch(/^[A-Z].*\.$/);
        }
    });

    it('say what the refusal says when a code is named after one', () => {
        for (const [reason, text] of Object.entries(REFUSAL_COPY) as [keyof typeof REFUSAL_COPY, string][]) {
            const code = refusalToCode(reason);
            if (code === 'invalid_action') continue;
            expect(POKER_NIGHT_ERRORS[code], reason).toBe(text);
        }
        expect(POKER_NIGHT_ERRORS.invalid_action).toBe(REFUSAL_COPY.illegal);
    });

    it('read as the table says them', () => {
        expect(POKER_NIGHT_ERRORS.stale).toBe('The table moved on before that arrived.');
        expect(POKER_NIGHT_ERRORS.rate_limited).toBe('One moment: actions are coming in fast.');
        expect(POKER_NIGHT_ERRORS.reload).toBe('This table was updated. Reload to keep playing.');
        expect(POKER_NIGHT_ERRORS.banned).toBe(JOIN_COPY.banned);
        expect(POKER_NIGHT_ERRORS.locked).toBe(JOIN_COPY.locked);
        expect(POKER_NIGHT_ERRORS.host_cap).toBe('You have three open tables already. Close one to start another.');
    });
});

describe('joining', () => {
    it('says every fixed line and every name it is handed in plain words', () => {
        for (const text of strings(JOIN_COPY)) clean(text);
        for (const face of Object.values(AVATAR_COPY.faces)) {
            clean(JOIN_COPY.blankName(face));
            clean(JOIN_COPY.renamed(`${face} 2`));
        }
    });

    it('reads as the join card prints it', () => {
        expect(JOIN_COPY.heading).toBe('Pull up a chair');
        expect(JOIN_COPY.blankName('Fox')).toBe('Leave it blank to sit as Fox.');
        expect(JOIN_COPY.seatTaken).toBe('That seat was just taken, so you have the next free one.');
        expect(JOIN_COPY.full).toBe('The table is full. You can watch, and a seat opens when someone leaves.');
        expect(JOIN_COPY.locked).toBe('The host closed this table to new players.');
        expect(JOIN_COPY.banned).toBe('The host removed you from this table.');
        expect(JOIN_COPY.seated).toBe('Seated. You are dealt in from the next hand.');
        expect(JOIN_COPY.posting).toBe('You post one big blind when you are dealt in.');
    });

    it("sets a player's name apart from the sentence around it", () => {
        const fsi = String.fromCodePoint(0x2068);
        const pdi = String.fromCodePoint(0x2069);
        expect(isolate('Ana')).toBe(`${fsi}Ana${pdi}`);
        expect(JOIN_COPY.renamed('Ana 2')).toBe(`That name is taken here, so you sit as ${fsi}Ana 2${pdi}.`);
    });
});

describe('the avatars', () => {
    it('name every face the builder offers, and only those', () => {
        expect(Object.keys(AVATAR_COPY.faces)).toEqual(FACE_IDS);
        for (const name of Object.values(AVATAR_COPY.faces)) {
            clean(name);
            expect(name, name).toMatch(/^[A-Z][a-z]+$/);
        }
        expect(new Set(Object.values(AVATAR_COPY.faces)).size).toBe(FACE_IDS.length);
    });
});
