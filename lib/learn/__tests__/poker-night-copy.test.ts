// Poker night's sentences (lib/learn/copy/poker-night.ts), each rendered over the inputs it meets and
// held to the 'copy' tier of the no-advice list and to a currency ban (play chips have no cash
// value), with the strings the table shows pinned word for word. One describe block per copy table;
// the error codes are covered both ways against lib/poker-night/http.ts.

import {describe, expect, it} from 'vitest';
import {findBanned, stripProhibitions} from '@/lib/learn/banned';
import {
    ACTION_COPY, ANNOUNCE_COPY, AVATAR_COPY, BANK_COPY, FELT_COPY, HAND_COPY, HOST_COPY, INVITE_COPY, isolate, JOIN_COPY, LOBBY_COPY, LOG_COPY,
    OVERLAY_COPY, POKER_NIGHT_COPY, POKER_NIGHT_ERRORS, REFUSAL_COPY, SUIT_GLYPHS, SUIT_NAMES, SUMMARY_COPY, TABLE_COPY,
} from '@/lib/learn/copy/poker-night';
import {FACE_IDS} from '@/lib/poker-night/avatar';
import {ERROR_CODES, refusalToCode} from '@/lib/poker-night/http';
import {checkConfig, DEFAULT_CONFIG, ENTRY_KINDS, LEDGER_KINDS} from '@/lib/poker-night/config';
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

// ==== P3: the lobby, the table and its overlays ==================================================

// What a sentence meets: counts at the edges and the largest a table holds, and names in more than
// one script (an emoji, Hebrew and Arabic, which run right to left).
const NS = [0, 1, 2, 1_250_000];
const NAMES = ['Ana', 'Zoë 🎲', 'שרה', 'محمد', 'Fox 2', 'WWWWWWWWWWWWWWWW'];
const FSI = String.fromCodePoint(0x2068);
const PDI = String.fromCodePoint(0x2069);
const plain = (text: string) => text.split(FSI).join('').split(PDI).join('');
const cards = (text: string) => text.match(/../g)!.map((t) => parseCard(t)!);
const ALL_CARDS = Array.from({length: 52}, (_, i) => i);
const MINUS = String.fromCodePoint(0x2212);
const glyph = (suit: number) => SUIT_GLYPHS[suit];

type Renders = Record<string, () => string[]>;

const functionKeys = (table: object) => Object.entries(table).filter(([, v]) => typeof v === 'function').map(([k]) => k).sort();

// Every function of a table rendered over its inputs, and every one listed: a function added to the
// table without inputs here fails the first expectation.
const covers = (table: object, renders: Renders) => {
    expect(Object.keys(renders).sort()).toEqual(functionKeys(table));
    for (const [key, render] of Object.entries(renders)) {
        const out = render();
        expect(out.length, key).toBeGreaterThan(0);
        for (const text of out) clean(text);
    }
};

// A function over every name, each output carrying the name set apart (isolate).
const named = (render: (name: string) => string | string[]): string[] =>
    NAMES.flatMap((name) => {
        const out = [render(name)].flat();
        for (const text of out) expect(text, text).toContain(`${FSI}${name}${PDI}`);
        return out;
    });
const each = (render: (n: number) => string): string[] => NS.map(render);
const pairs = (render: (a: number, b: number) => string): string[] => NS.flatMap((a) => NS.map((b) => render(a, b)));
const signedNs = [...NS, -1, -300, -1_250_000];

describe('the lobby and the game card', () => {
    it('says every line over the inputs it meets', () => {
        for (const text of strings(POKER_NIGHT_COPY)) clean(text);
        covers(POKER_NIGHT_COPY, {
            quickStartHint: () => [2, 8, 9].flatMap((seats) => NS.map((n) => POKER_NIGHT_COPY.quickStartHint(n, n * 2, n * 100, seats))),
            // A field's default value, not a sentence: the name goes in as typed.
            tableNameDefault: () => NAMES.map((name) => {
                const text = POKER_NIGHT_COPY.tableNameDefault(name);
                expect(text).not.toContain(FSI);
                return text;
            }),
            openRow: () => NS.flatMap((hands) => pairs((seated, seats) => POKER_NIGHT_COPY.openRow(seated, seats, hands))),
            friendsRow: () => named((name) => NS.map((n) => POKER_NIGHT_COPY.friendsRow(name, n, 9))),
            recentRow: () => NS.flatMap((hands) => signedNs.map((net) => POKER_NIGHT_COPY.recentRow(hands, net))),
        });
    });

    it('reads as the lobby prints it', () => {
        const hint = 'Blinds 10/20, 2,000 chips each, up to eight seats. Everything can be changed at the table.';
        expect(POKER_NIGHT_COPY.title).toBe('Poker night');
        expect(POKER_NIGHT_COPY.subtitle).toBe("Texas hold'em with friends: start a table, share the link, and play for chips.");
        expect(POKER_NIGHT_COPY.note).toBe('Play chips only. No cash value, and nothing is paid out.');
        expect(POKER_NIGHT_COPY.quickStart).toBe('Start a table');
        expect(POKER_NIGHT_COPY.quickStartHint(10, 20, 2000, 8)).toBe(hint);
        expect(POKER_NIGHT_COPY.quickStartHint(DEFAULT_CONFIG.smallBlind, DEFAULT_CONFIG.bigBlind, DEFAULT_CONFIG.buyInMax, DEFAULT_CONFIG.seats)).toBe(hint);
        expect(POKER_NIGHT_COPY.joinHeading).toBe('Join with a code');
        expect(POKER_NIGHT_COPY.codePlaceholder).toBe('Six characters');
        expect(POKER_NIGHT_COPY.codeInvalid).toBe('A table code is six letters and digits, with no 0, O, 1 or I.');
        expect(POKER_NIGHT_COPY.openEmpty).toBe('No table is open. Start one and share the link.');
        expect(POKER_NIGHT_COPY.openRow(3, 8, 0)).toBe('3 of 8 seats taken · no hand dealt yet');
        expect(POKER_NIGHT_COPY.openRow(3, 8, 1)).toBe('3 of 8 seats taken · 1 hand played');
        expect(plain(POKER_NIGHT_COPY.friendsRow('Ana', 3, 8))).toBe('Hosted by Ana · 3 of 8 seats taken');
        expect(POKER_NIGHT_COPY.recentRow(42, 1250)).toBe('42 hands · net +1,250');
        expect(POKER_NIGHT_COPY.recentRow(1, -300)).toBe(`1 hand · net ${MINUS}300`);
        expect(POKER_NIGHT_COPY.recentRow(7, 0)).toBe('7 hands · net 0');
        expect(POKER_NIGHT_COPY.tableNameDefault('Ana')).toBe("Ana's poker night");
    });
});

describe('the invite', () => {
    it('says every line over the inputs it meets', () => {
        for (const text of strings(INVITE_COPY)) clean(text);
        covers(INVITE_COPY, {
            shareTitle: () => named(INVITE_COPY.shareTitle),
            shareText: () => named(INVITE_COPY.shareText),
            codeGrouped: () => ['K7QXM4', 'ABCDEF'].map(INVITE_COPY.codeGrouped),
        });
    });

    it('reads as the invite sheet prints it', () => {
        expect(INVITE_COPY.copy).toBe('Copy link');
        expect(INVITE_COPY.copied).toBe('Link copied.');
        expect(INVITE_COPY.blocked).toBe('The clipboard is blocked: copy the link from the box.');
        expect(INVITE_COPY.share).toBe('Share');
        expect(INVITE_COPY.deal).toBe('Deal the first hand');
        expect(INVITE_COPY.needTwo).toBe('The first hand is dealt once two players are seated.');
        expect(INVITE_COPY.codeGrouped('K7QXM4')).toBe('K7Q XM4');
        expect(plain(INVITE_COPY.shareText("Ana's poker night"))).toBe("Pull up a chair at Ana's poker night. Play chips only.");
        expect(INVITE_COPY.ogDescription).toBe("Texas hold'em for play chips. Open the link to take a seat.");
    });
});

describe('the join card', () => {
    it('says every function over the inputs it meets', () => {
        const faces = Object.values(AVATAR_COPY.faces);
        covers(JOIN_COPY, {
            blankName: () => faces.map(JOIN_COPY.blankName),
            renamed: () => named(JOIN_COPY.renamed),
            terms: () => pairs((a, b) => JOIN_COPY.terms(a, a * 2, b)),
            lookLabel: () => faces.map(JOIN_COPY.lookLabel),
            sitIn: () => Array.from({length: 9}, (_, seat) => JOIN_COPY.sitIn(seat)),
            chipsInRule: () => pairs(JOIN_COPY.chipsInRule),
        });
    });

    it('reads as the join card prints it', () => {
        expect(JOIN_COPY.nameLabel).toBe('Your name');
        expect(JOIN_COPY.nameRule).toBe('Up to sixteen characters.');
        expect(JOIN_COPY.roll).toBe('Roll a new look');
        expect(JOIN_COPY.sit).toBe('Sit down');
        expect(JOIN_COPY.watch).toBe('Just watch');
        expect(JOIN_COPY.chipsInLabel).toBe('Chips in');
        expect(JOIN_COPY.terms(10, 20, 2000)).toBe('Blinds 10/20 · 2,000 chips to start');
        expect(JOIN_COPY.sitIn(0)).toBe('Sit in seat 1');
        expect(JOIN_COPY.sitIn(8)).toBe('Sit in seat 9');
        expect(JOIN_COPY.chipsInRule(1000, 5000)).toBe('From 1,000 to 5,000 chips.');
    });
});

describe('the table', () => {
    it('says every line over the inputs it meets', () => {
        for (const text of strings(TABLE_COPY)) clean(text);
        const statuses = [null, ...Object.values(TABLE_COPY.status), TABLE_COPY.thinking, ...Object.values(TABLE_COPY.presence)];
        const seats = Array.from({length: 9}, (_, seat) => seat);
        covers(TABLE_COPY, {
            name: () => ['', "Ana's poker night"].map((name) => TABLE_COPY.name(name, 'K7QXM4')),
            region: () => named(TABLE_COPY.region),
            documentTitle: () => named((table) => [TABLE_COPY.documentTitle(table, false), TABLE_COPY.documentTitle(table, true)]),
            handNo: () => each(TABLE_COPY.handNo),
            watchers: () => each(TABLE_COPY.watchers),
            seat: () => seats.map(TABLE_COPY.seat),
            openSeatLabel: () => seats.map(TABLE_COPY.openSeatLabel),
            pendingBuy: () => each(TABLE_COPY.pendingBuy),
            seatLabel: () => named((name) => statuses.flatMap((status) => NS.flatMap((chips) =>
                [null, ACTION_COPY.does('raise', chips, true)].map((last) => TABLE_COPY.seatLabel(name, 8, chips, status, last))))),
            chips: () => each(TABLE_COPY.chips),
            pot: () => each(TABLE_COPY.pot),
            mainPot: () => each(TABLE_COPY.mainPot),
            sidePot: () => pairs((i, n) => TABLE_COPY.sidePot(i + 1, n)),
            board: () => [TABLE_COPY.board(HAND_COPY.cardsSpoken(cards('AsKh7c')))],
            banner: () => named((name) => NS.map((n) => TABLE_COPY.banner(name, n))),
            bannerYou: () => each(TABLE_COPY.bannerYou),
            bannerSplit: () => [NAMES.slice(0, 2), NAMES].map((players) => {
                const text = TABLE_COPY.bannerSplit(players);
                for (const name of players) expect(text).toContain(isolate(name));
                return text;
            }),
            waitingFor: () => named(TABLE_COPY.waitingFor),
            secondsLeft: () => each(TABLE_COPY.secondsLeft),
            nextHandIn: () => each(TABLE_COPY.nextHandIn),
            awayNote: () => [1, 2, 3, 4, 5].map(TABLE_COPY.awayNote),
            leaveBody: () => each(TABLE_COPY.leaveBody),
        });
    });

    it('reads as the table prints it', () => {
        expect(TABLE_COPY.status).toEqual({
            waiting: 'Next hand', folded: 'Folded', 'all-in': 'All in', 'sitting-out': 'Sitting out', away: 'Away', busted: 'Out of chips', leaving: 'Leaving',
        });
        expect(TABLE_COPY.thinking).toBe('Thinking');
        expect(TABLE_COPY.yourTurn).toBe('Your turn');
        expect(TABLE_COPY.back).toBe("I'm back");
        expect(TABLE_COPY.awayNote(2)).toBe('Sat out after two timeouts. "I\'m back" deals you in again.');
        expect(TABLE_COPY.awayNote(1)).toBe('Sat out after one timeout. "I\'m back" deals you in again.');
        expect(TABLE_COPY.leaveBody(2000)).toBe('Your 2,000 chips are counted in the bank as you leave.');
        expect(TABLE_COPY.leaveBody(1)).toBe('Your 1 chip is counted in the bank as you leave.');
        expect(TABLE_COPY.sitOut).toBe('Sit out next hand');
        expect(TABLE_COPY.connection.polling).toBe('Updating every few seconds');
        expect(TABLE_COPY.connection.reconnecting).toBe('Reconnecting…');
        expect(TABLE_COPY.paused).toBe('Paused by the host.');
        expect(TABLE_COPY.resumed).toBe('The game is back on.');
        expect(TABLE_COPY.ended).toBe('The host ended the night.');
        expect(TABLE_COPY.notFound).toBe(POKER_NIGHT_ERRORS.not_found);
        expect(TABLE_COPY.closed).toBe(REFUSAL_COPY.closed);
        // Seats are numbered from 1; the index is the view's.
        expect(TABLE_COPY.seat(0)).toBe('Seat 1');
        expect(plain(TABLE_COPY.seatLabel('Ana', 2, 1250, TABLE_COPY.status['all-in'], ACTION_COPY.does('call', 40, false))))
            .toBe('Ana, seat 3, 1,250 chips, all in, calls 40');
        expect(plain(TABLE_COPY.seatLabel('Ana', 0, 1, null, null))).toBe('Ana, seat 1, 1 chip');
        expect(TABLE_COPY.name('', 'K7QXM4')).toBe('Table K7QXM4');
        expect(TABLE_COPY.sidePot(1, 400)).toBe('Side pot 1: 400');
        expect(plain(TABLE_COPY.banner('Ana', 1200))).toBe('Ana wins 1,200');
        expect(plain(TABLE_COPY.bannerSplit(['Ana', 'Ben', 'Cy']))).toBe('Split pot: Ana, Ben and Cy');
        expect(TABLE_COPY.documentTitle('Friday', true)).toBe(`Your turn · ${FSI}Friday${PDI}`);
    });
});

describe('the action bar', () => {
    it('says every function over the inputs it meets', () => {
        for (const text of strings(ACTION_COPY)) clean(text);
        const flags = [false, true];
        covers(ACTION_COPY, {
            does: () => ENTRY_KINDS.flatMap((kind) => flags.flatMap((allIn) => NS.map((n) => ACTION_COPY.does(kind, n, allIn)))),
            tag: () => ENTRY_KINDS.flatMap((kind) => flags.flatMap((allIn) => NS.map((n) => ACTION_COPY.tag(kind, n, allIn)))),
            call: () => each(ACTION_COPY.call),
            callAllIn: () => each(ACTION_COPY.callAllIn),
            bet: () => each(ACTION_COPY.bet),
            raiseTo: () => each(ACTION_COPY.raiseTo),
            allIn: () => each(ACTION_COPY.allIn),
            toCall: () => each(ACTION_COPY.toCall),
            amountRule: () => pairs(ACTION_COPY.amountRule),
            pre: () => [
                ACTION_COPY.pre({kind: 'check-fold'}), ACTION_COPY.pre({kind: 'check'}), ACTION_COPY.pre({kind: 'call-any'}),
                ...NS.map((amount) => ACTION_COPY.pre({kind: 'call', amount})),
            ],
        });
    });

    it('reads as the action bar prints it', () => {
        expect(ACTION_COPY.fold).toBe('Fold');
        expect(ACTION_COPY.check).toBe('Check');
        expect(ACTION_COPY.call(40)).toBe('Call 40');
        expect(ACTION_COPY.callAllIn(35)).toBe('Call 35, all in');
        expect(ACTION_COPY.bet(100)).toBe('Bet 100');
        expect(ACTION_COPY.raiseTo(340)).toBe('Raise to 340');
        expect(ACTION_COPY.allIn(1_250_000)).toBe('All in for 1,250,000');
        expect(ACTION_COPY.sizes).toEqual({min: 'Min', half: '½ pot', 'three-quarters': '¾ pot', pot: 'Pot', 'all-in': 'All in'});
        expect(ACTION_COPY.amountLabel).toBe('Amount');
        expect(ACTION_COPY.foldFree).toBe('Checking is free here.');
        expect(ACTION_COPY.foldConfirm).toBe('Fold anyway');
        expect(ACTION_COPY.checkInstead).toBe('Check instead');
        expect(ACTION_COPY.pre({kind: 'check-fold'})).toBe('Check/fold');
        expect(ACTION_COPY.pre({kind: 'check'})).toBe('Check');
        expect(ACTION_COPY.pre({kind: 'call', amount: 40})).toBe('Call 40');
        expect(ACTION_COPY.pre({kind: 'call-any'})).toBe('Call any');
        expect(ACTION_COPY.timeUp.checked).toBe("Time's up: checked for you.");
        expect(ACTION_COPY.timeUp.folded).toBe("Time's up: folded for you.");
        expect(ACTION_COPY.tag('raise', 340, false)).toBe('Raise to 340');
        expect(ACTION_COPY.tag('call', 35, true)).toBe('All in 35');
        expect(ACTION_COPY.tag('fold', 0, false)).toBe('Fold');
    });
});

describe('the cards', () => {
    it('name every card, as a picture, in a sentence and as its corner', () => {
        covers(HAND_COPY, {
            label: () => [HAND_COPY.label(hand('AsKsQsJsTs')), HAND_COPY.label(hand('Ah9d7c4s2d'))],
            phrase: () => [HAND_COPY.phrase(hand('AsKsQsJsTs')), HAND_COPY.phrase(hand('Ah9d7c4s2d'))],
            card: () => ALL_CARDS.map(HAND_COPY.card),
            cardSpoken: () => ALL_CARDS.map(HAND_COPY.cardSpoken),
            cardShort: () => ALL_CARDS.map(HAND_COPY.cardShort),
            cardsSpoken: () => [[], cards('As'), cards('AsKh'), cards('AsKh7c2d9s')].map(HAND_COPY.cardsSpoken),
            cardsShort: () => [cards('As'), cards('AsKh7c2d9s')].map(HAND_COPY.cardsShort),
        });
        expect(new Set(ALL_CARDS.map(HAND_COPY.card)).size).toBe(52);
        expect(new Set(ALL_CARDS.map(HAND_COPY.cardShort)).size).toBe(52);
    });

    it('read as the table prints them', () => {
        expect(HAND_COPY.card(parseCard('As')!)).toBe('Ace of spades');
        expect(HAND_COPY.cardSpoken(parseCard('2c')!)).toBe('two of clubs');
        expect(HAND_COPY.cardShort(parseCard('As')!)).toBe(`A${glyph(3)}`);
        expect(HAND_COPY.cardShort(parseCard('Th')!)).toBe(`10${glyph(2)}`);
        expect(HAND_COPY.cardsSpoken(cards('AsKh7c'))).toBe('ace of spades, king of hearts and seven of clubs');
        expect(HAND_COPY.cardsShort(cards('AsKh'))).toBe(`A${glyph(3)} K${glyph(2)}`);
        expect(HAND_COPY.rankShort).toEqual(['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']);
        expect(HAND_COPY.faceDown).toBe('Face-down card');
    });
});

describe('the hand log', () => {
    it('says every line over the inputs it meets', () => {
        for (const text of strings(LOG_COPY)) clean(text);
        const phrases = [null, HAND_COPY.phrase(hand('KhKd7c7s2d')), HAND_COPY.phrase(hand('AsKsQsJsTs'))];
        const pots = [null, 0, 1, 2];
        const flags = [false, true];
        covers(LOG_COPY, {
            hand: () => each(LOG_COPY.hand),
            blinds: () => NS.flatMap((ante) => pairs((sb, bb) => LOG_COPY.blinds(sb, bb, ante))),
            street: () => (['flop', 'turn', 'river'] as const).map((street) => LOG_COPY.street(street, HAND_COPY.cardsShort(cards('AsKh7c')))),
            line: () => [
                ...named((name) => ENTRY_KINDS.filter((kind) => kind !== 'void').flatMap((kind) =>
                    flags.flatMap((allIn) => flags.flatMap((timedOut) => NS.map((n) => LOG_COPY.line(name, kind, n, allIn, timedOut)))))),
                ...NAMES.map((name) => LOG_COPY.line(name, 'void', 3000, false)),
            ],
            shows: () => named((name) => phrases.map((phrase) => LOG_COPY.shows(name, HAND_COPY.cardsShort(cards('AsKs')), phrase))),
            youHeld: () => [LOG_COPY.youHeld(HAND_COPY.cardsShort(cards('AsKs')))],
            wins: () => named((name) => NS.flatMap((n) => phrases.flatMap((phrase) => pots.map((pot) => LOG_COPY.wins(name, n, phrase, pot))))),
            split: () => pots.flatMap((pot) => [NAMES.slice(0, 2), NAMES].map((players) => {
                const text = LOG_COPY.split(players.map((name, i) => ({name, amount: NS[i % NS.length]})), pot);
                for (const name of players) expect(text).toContain(isolate(name));
                return text;
            })),
            uncontested: () => named((name) => NS.map((n) => LOG_COPY.uncontested(name, n))),
            refund: () => named((name) => NS.map((n) => LOG_COPY.refund(name, n))),
            playsBoard: () => named(LOG_COPY.playsBoard),
        });
    });

    it('reads as the log prints it', () => {
        const twoPair = HAND_COPY.phrase(hand('KhKd7c7s2d'));
        expect(plain(LOG_COPY.wins('Ana', 1200, twoPair))).toBe('Ana wins 1,200 with two pair, kings and sevens.');
        expect(LOG_COPY.wins('Ana', 1200, twoPair)).toBe(`${FSI}Ana${PDI} wins 1,200 with two pair, kings and sevens.`);
        expect(plain(LOG_COPY.wins('Ben', 400, null, 1))).toBe('Ben wins 400 from side pot 1.');
        expect(plain(LOG_COPY.wins('Cy', 900, HAND_COPY.phrase(hand('Ah9h7h4h2h')), 0))).toBe('Cy wins 900 from the main pot with a flush, ace high.');
        expect(plain(LOG_COPY.split([{name: 'Ana', amount: 51}, {name: 'Ben', amount: 50}]))).toBe('Split pot: Ana takes 51, Ben takes 50.');
        expect(plain(LOG_COPY.split([{name: 'Ana', amount: 51}, {name: 'Ben', amount: 50}], 1))).toBe('Side pot 1 split: Ana takes 51, Ben takes 50.');
        expect(plain(LOG_COPY.uncontested('Ana', 300))).toBe('Everyone else folded: Ana takes 300.');
        expect(plain(LOG_COPY.refund('Ana', 150))).toBe('Ana gets back 150 uncalled.');
        expect(plain(LOG_COPY.line('Ana', 'raise', 340, true))).toBe('Ana raises to 340, all in.');
        expect(plain(LOG_COPY.line('Ben', 'fold', 0, false, true))).toBe('Ben folds as time ran out.');
        expect(LOG_COPY.line('Ana', 'void', 3000, false)).toBe('The hand is called off.');
        expect(LOG_COPY.blinds(10, 20, 5)).toBe('Blinds 10/20, ante 5');
        expect(LOG_COPY.street('flop', HAND_COPY.cardsShort(cards('AsKh7c')))).toBe(`Flop: A${glyph(3)} K${glyph(2)} 7${glyph(0)}`);
        // Every showdown shows every live hand: there is no line for a hand that is not shown.
        expect(Object.keys(LOG_COPY)).not.toContain('mucks');
    });
});

describe('the announcements', () => {
    it('say every function over the inputs it meets', () => {
        for (const text of strings(ANNOUNCE_COPY)) clean(text);
        covers(ANNOUNCE_COPY, {
            yourTurn: () => pairs(ANNOUNCE_COPY.yourTurn),
            timeLow: () => [1, 5, 10].map(ANNOUNCE_COPY.timeLow),
            dealt: () => [ANNOUNCE_COPY.dealt([parseCard('As')!, parseCard('Kh')!]), ANNOUNCE_COPY.dealt([parseCard('2c')!, parseCard('2d')!])],
            street: () => [ANNOUNCE_COPY.street('flop', cards('AsKh7c')), ANNOUNCE_COPY.street('river', cards('2d'))],
            move: () => named((name) => ENTRY_KINDS.filter((kind) => kind !== 'void').map((kind) => ANNOUNCE_COPY.move(name, kind, 40, false))),
            wins: () => named((name) => [ANNOUNCE_COPY.wins(name, 1200, null)]),
            split: () => [ANNOUNCE_COPY.split(NAMES.map((name) => ({name, amount: 50})))],
            uncontested: () => named((name) => [ANNOUNCE_COPY.uncontested(name, 300)]),
            youWin: () => NS.flatMap((n) => [null, HAND_COPY.phrase(hand('Ah9h7h4h2h'))].map((phrase) => ANNOUNCE_COPY.youWin(n, phrase))),
            joined: () => named(ANNOUNCE_COPY.joined),
            left: () => named(ANNOUNCE_COPY.left),
            removed: () => named(ANNOUNCE_COPY.removed),
            host: () => named(ANNOUNCE_COPY.host),
        });
    });

    it('read as a screen reader hears them', () => {
        expect(ANNOUNCE_COPY.yourTurn(40, 300)).toBe('Your turn: 40 to call, pot 300.');
        expect(ANNOUNCE_COPY.yourTurn(0, 300)).toBe('Your turn: checking is free, pot 300.');
        expect(ANNOUNCE_COPY.timeLow(10)).toBe('10 seconds left.');
        expect(ANNOUNCE_COPY.timeLow(1)).toBe('1 second left.');
        expect(ANNOUNCE_COPY.dealt([parseCard('As')!, parseCard('Kh')!])).toBe('You have the ace of spades and the king of hearts.');
        expect(ANNOUNCE_COPY.street('flop', cards('AsKh7c'))).toBe('Flop: ace of spades, king of hearts and seven of clubs.');
        expect(ANNOUNCE_COPY.youWin(1200, 'a flush, ace high')).toBe('You win 1,200 with a flush, ace high.');
        expect(plain(ANNOUNCE_COPY.move('Ana', 'call', 40, false))).toBe('Ana calls 40.');
    });
});

describe('the host drawer', () => {
    it('says every line over the inputs it meets', () => {
        for (const text of strings(HOST_COPY)) clean(text);
        covers(HOST_COPY, {
            blindsValue: () => pairs(HOST_COPY.blindsValue),
            timerValue: () => [15, 30, 45, 60, 120].map(HOST_COPY.timerValue),
            rebuyLimit: () => [null, 1, 2, 20].map(HOST_COPY.rebuyLimit),
            requests: () => each(HOST_COPY.requests),
            request: () => named((name) => NS.map((n) => HOST_COPY.request(name, n))),
            moreFor: () => named(HOST_COPY.moreFor),
            handOverTitle: () => named(HOST_COPY.handOverTitle),
            removeTitle: () => named(HOST_COPY.removeTitle),
            removeBody: () => named((name) => NS.map((n) => HOST_COPY.removeBody(name, n))),
            removeBodyInHand: () => named(HOST_COPY.removeBodyInHand),
            removing: () => named(HOST_COPY.removing),
            removedDone: () => named(HOST_COPY.removedDone),
            letBackInDone: () => named(HOST_COPY.letBackInDone),
        });
    });

    it('words every reason checkConfig turns a change down', () => {
        const base = {...DEFAULT_CONFIG};
        const refused = [
            {...base, smallBlind: 50, bigBlind: 20},
            {...base, ante: 40},
            {...base, buyInMin: 10, buyInMax: 2000},
            {...base, buyInMin: 2000, buyInMax: 1000},
            {...base, buyInMax: 20 * 501},
        ];
        const messages = new Set<string>();
        for (const config of refused) {
            const checked = checkConfig(config);
            expect(checked.ok).toBe(false);
            if (!checked.ok) for (const issue of checked.issues) messages.add(issue.message);
        }
        expect([...messages].sort()).toEqual(Object.keys(HOST_COPY.issues).sort());
    });

    it('reads as the drawer prints it', () => {
        expect(HOST_COPY.fromNextHand).toBe('Changes apply from the next hand.');
        expect(HOST_COPY.sections).toEqual({game: 'Game', rebuys: 'Rebuys', players: 'Players', table: 'Table'});
        expect(HOST_COPY.timerValue(30)).toBe('30 s');
        expect(HOST_COPY.rebuysValue).toEqual({off: 'Off', auto: 'On', approve: 'Host approves'});
        expect(HOST_COPY.rebuyLimit(3)).toBe('Up to 3 each');
        expect(HOST_COPY.rebuyLimit(null)).toBe('No limit');
        expect(HOST_COPY.startingChips).toBe('Starting chips');
        expect(HOST_COPY.chipCap).toBe('Chip cap');
        expect(HOST_COPY.handOver).toBe('Hand over host');
        expect(HOST_COPY.more).toBe('More');
        expect(HOST_COPY.removeFromTable).toBe('Remove from table');
        expect(plain(HOST_COPY.removeTitle('Ana'))).toBe('Remove Ana?');
        expect(plain(HOST_COPY.removeBody('Ana', 2000)))
            .toBe("Ana leaves the table now. Their 2,000 chips are cashed out, and they can't rejoin unless you let them back in.");
        expect(HOST_COPY.pressAndHold).toBe('Press and hold to remove');
        // A player in the hand leaves when it ends: no figure promised, and the fold said once.
        expect(plain(HOST_COPY.removeBodyInHand('Ana')))
            .toBe("Ana leaves at the end of this hand, and their chips are cashed out then. They can't rejoin unless you let them back in.");
        expect(HOST_COPY.removeInHand).toBe('Their hand folds whenever it faces a bet.');
        expect(HOST_COPY.removed).toBe('Removed by host');
        expect(HOST_COPY.letBackIn).toBe('Let back in');
        expect(HOST_COPY.lockToo).toBe('And lock the table');
        expect(HOST_COPY.claimHostNote).toBe('The host has been away for over ten minutes.');
        expect(HOST_COPY.issues['above-cap']).toBe('The chip cap is at most 500 big blinds.');
    });
});

describe('the bank', () => {
    it('says every line over the inputs it meets', () => {
        for (const text of strings(BANK_COPY)) clean(text);
        covers(BANK_COPY, {
            net: () => signedNs.map(BANK_COPY.net),
            inPot: () => each(BANK_COPY.inPot),
            leftWith: () => each(BANK_COPY.leftWith),
            check: () => NS.flatMap((cashedOut) => pairs((onTable, broughtIn) => BANK_COPY.check(onTable, broughtIn, cashedOut))),
            event: () => LEDGER_KINDS.flatMap((kind) => NS.map((n) => BANK_COPY.event(kind, n))),
            topUp: () => each(BANK_COPY.topUp),
            amountRule: () => pairs(BANK_COPY.amountRule),
            requested: () => each(BANK_COPY.requested),
            pending: () => each(BANK_COPY.pending),
            approved: () => each(BANK_COPY.approved),
            rebuysUsed: () => pairs(BANK_COPY.rebuysUsed),
            ownInPot: () => each(BANK_COPY.ownInPot),
            addChips: () => each(BANK_COPY.addChips),
        });
    });

    it('reads as the bank prints it', () => {
        expect(BANK_COPY.lead).toBe('Play chips only. No cash value: the bank counts what each player brought to the table and what they hold now.');
        expect(BANK_COPY.columns).toEqual({player: 'Player', chipsIn: 'Chips in', rebuys: 'Rebuys', stack: 'Stack', net: 'Net'});
        expect(BANK_COPY.check(4000, 6000, 2000)).toBe('Every chip is accounted for: 6,000 brought in.');
        expect(BANK_COPY.check(3900, 6000, 2000)).toBe('Counted 5,900 of the 6,000 chips brought in.');
        expect(BANK_COPY.net(1250)).toBe('+1,250');
        expect(BANK_COPY.net(-300)).toBe(`${MINUS}300`);
        expect(BANK_COPY.net(0)).toBe('0');
        expect(BANK_COPY.inPot(300)).toBe('300 in the pot');
        expect(BANK_COPY.rebuy).toBe('Rebuy');
        expect(BANK_COPY.topUp(2000)).toBe('Top up to 2,000');
        expect(BANK_COPY.ownInPot(20)).toBe('Counting 20 in this pot.');
        expect(BANK_COPY.addChips(20)).toBe('Add 20 chips');
        expect(BANK_COPY.addChips(1)).toBe('Add 1 chip');
        expect(BANK_COPY.requested(1000)).toBe('Asked the host for 1,000 chips.');
        expect(BANK_COPY.approved(1000)).toBe('1,000 chips added to your stack.');
        expect(BANK_COPY.pending(1000)).toBe('1,000 chips join your stack when this hand ends.');
        expect(BANK_COPY.declined).toBe('The host declined the request.');
        expect(BANK_COPY.event('buy-in', 2000)).toBe('Sat down with 2,000');
        expect(BANK_COPY.event('removed', 1200)).toBe('Removed by host, left with 1,200');
        expect(BANK_COPY.removed).toBe(HOST_COPY.removed);
    });

    it('never calls the chips a player brings "buy-ins"', () => {
        const every = [...strings(BANK_COPY), ...strings(HOST_COPY), ...strings(SUMMARY_COPY), ...strings(JOIN_COPY),
            ...LEDGER_KINDS.map((kind) => BANK_COPY.event(kind, 2000))];
        for (const text of every) expect(text, text).not.toMatch(/\bbuy-?ins?\b/i);
    });
});

describe('the night summary', () => {
    const night = {
        table: "Ana's poker night",
        date: 'Oct 7',
        hands: 42,
        minutes: 134,
        standings: [{name: 'Ana', net: 1250, removed: false}, {name: 'Ben', net: 0, removed: false}, {name: 'Cy', net: -1250, removed: true}],
    };

    it('says every line over the inputs it meets', () => {
        for (const text of strings(SUMMARY_COPY)) clean(text);
        covers(SUMMARY_COPY, {
            when: () => named((table) => SUMMARY_COPY.when(table, 'Oct 7')),
            length: () => NS.flatMap((hands) => [0, 1, 59, 60, 61, 134, 600].map((minutes) => SUMMARY_COPY.length(hands, minutes))),
            text: () => [
                SUMMARY_COPY.text(night),
                SUMMARY_COPY.text({...night, standings: NAMES.map((name, i) => ({name, net: signedNs[i], removed: i % 2 === 0}))}),
            ],
        });
    });

    it('reads as the summary prints it', () => {
        expect(SUMMARY_COPY.heading).toBe("That's a wrap");
        expect(SUMMARY_COPY.footer).toBe('Play chips only. No cash value.');
        expect(SUMMARY_COPY.length(42, 134)).toBe('42 hands in 2 h 14 min');
        expect(SUMMARY_COPY.length(1, 45)).toBe('1 hand in 45 min');
        expect(SUMMARY_COPY.length(3, 120)).toBe('3 hands in 2 h');
        expect(SUMMARY_COPY.copy).toBe('Copy summary');
        expect(SUMMARY_COPY.copied).toBe('Summary copied.');
        expect(SUMMARY_COPY.again).toBe('Start another table');
        expect(plain(SUMMARY_COPY.text(night))).toBe([
            "Ana's poker night · Oct 7",
            '42 hands in 2 h 14 min',
            'Ana: +1,250',
            'Ben: 0',
            `Cy: ${MINUS}1,250 (removed by host)`,
            'Play chips only. No cash value.',
        ].join('\n'));
    });
});

describe('the lobby\'s panels and forms', () => {
    it('says every line over the inputs it meets', () => {
        for (const text of strings(LOBBY_COPY)) clean(text);
        covers(LOBBY_COPY, {
            endTitle: () => named((table) => LOBBY_COPY.endTitle(table)),
            fromBrowser: () => [...named((name) => LOBBY_COPY.fromBrowser(name)), LOBBY_COPY.fromBrowser(null)],
        });
    });

    it('reads as the lobby prints it, in the host drawer\'s words for the same settings', () => {
        expect(LOBBY_COPY.chips).toBe('Starting chips');
        expect(LOBBY_COPY.blinds).toBe(HOST_COPY.blinds);
        expect(LOBBY_COPY.rebuys).toBe(HOST_COPY.rebuys);
        expect(LOBBY_COPY.timer).toBe(HOST_COPY.timer);
        expect(LOBBY_COPY.end).toBe('End the night');
        expect(plain(LOBBY_COPY.endTitle("Ana's poker night"))).toBe("End the night at Ana's poker night?");
        expect(LOBBY_COPY.saveToAccount).toBe('Save to my account');
        expect(plain(LOBBY_COPY.fromBrowser('Fox'))).toBe('This browser kept the look you used at a table, as Fox.');
        // No label or sentence calls the chips a player brings "buy-ins".
        for (const text of strings(LOBBY_COPY)) expect(text, text).not.toMatch(/buy-?ins?\b/i);
    });
});

// ---- the table's overlays (OVERLAY_COPY) ----------------------------------------------------------

describe("the table's overlays", () => {
    it('says every line over the inputs it meets', () => {
        for (const text of strings(OVERLAY_COPY)) clean(text);
        covers(OVERLAY_COPY, {
            code: () => ['K7QXM4', 'ABCDEF'].map(OVERLAY_COPY.code),
            connection: () => Object.values(TABLE_COPY.connection).map(OVERLAY_COPY.connection),
        });
    });

    it('reads as the overlays print it', () => {
        expect(OVERLAY_COPY.close).toBe('Close');
        expect(OVERLAY_COPY.myLook).toBe('My look');
        expect(OVERLAY_COPY.takeSeat).toBe('Take a seat');
        expect(OVERLAY_COPY.code('K7QXM4')).toBe('Code K7Q XM4');
        expect(OVERLAY_COPY.connection(TABLE_COPY.connection.polling)).toBe('Connection: updating every few seconds');
        expect(OVERLAY_COPY.shortcuts).toBe('Single-key shortcuts');
        // The join card's dead ends each say what reopens them, and offer a look.
        expect(JOIN_COPY.checkAgain).toBe('Check again');
        for (const text of [JOIN_COPY.bannedNext, JOIN_COPY.lockedNext, JOIN_COPY.fullNext]) clean(text);
        // The remove flow's button never opens on "Hold", and nothing asks for the player's name.
        expect(HOST_COPY.pressAndHold).toBe('Press and hold to remove');
        expect(HOST_COPY.pressAndHoldHint).not.toMatch(/type|name/i);
        for (const text of strings(OVERLAY_COPY)) expect(text, text).not.toMatch(/\bbuy-?ins?\b/i);
    });
});

// ---- the felt (FELT_COPY) ---------------------------------------------------------------------------

describe('the felt', () => {
    it('says every line over the inputs it meets', () => {
        covers(FELT_COPY, {
            morePots: () => [1, 2, 7].flatMap((pots) => [0, 1, 2340, 1_250_000].map((chips) => FELT_COPY.morePots(pots, chips))),
        });
    });

    it('reads as the pot prints it', () => {
        expect(FELT_COPY.morePots(3, 2340)).toBe('3 more side pots: 2,340');
        expect(FELT_COPY.morePots(1, 520)).toBe('1 more side pot: 520');
    });
});
