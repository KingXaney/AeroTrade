// What a screen reader hears, on events from real engine states: the viewer's turn said at once
// with its price and the pot; the cards they are dealt, each street, the other players' moves (a
// move the clock made said as such, the viewer's own and the blinds not repeated), each winner with
// their hand, an uncontested pot, and players sitting down and leaving — every line ANNOUNCE_COPY's,
// none with a hole in it.

import {describe, expect, it} from 'vitest';
import {announcementsFor, type AnnounceContext} from '@/lib/poker-night/announce';
import {nextDueAt} from '@/lib/poker-night/clock';
import {TIMING} from '@/lib/poker-night/config';
import {reduce} from '@/lib/poker-night/engine';
import {diffViews, type DiffableView} from '@/lib/poker-night/events';
import type {TableState} from '@/lib/poker-night/types';
import {clockLeaderOf, wireView} from '@/lib/poker-night/views';
import {C, F, R, X, cards, deal, moves, nowOf, ok, pidOf, table} from './fixtures';

let seq = 0;
const view = (s: TableState, serverNow = nowOf(s)): DiffableView => wireView(s, {
    code: 'K7QXM4', seq: ++seq, serverNow, nextDueAt: nextDueAt(s), clockLeader: clockLeaderOf(s, {}), presence: {}, watchers: 0, realtimeOk: true, peopleV: 1,
});
const three = () => table({0: 1000, 1: 1000, 2: 1000}, {lastBigBlind: 0});
const people = {p0: {name: 'Ana', avatar: ''}, p1: {name: 'Ben', avatar: ''}, p2: {name: 'Cy', avatar: ''}, p4: {name: 'Dee', avatar: ''}};
const ctx = (v: DiffableView, mySeat: number | null, hole: AnnounceContext['hole'] = null): AnnounceContext => ({view: v, people, mySeat, hole});
const clean = (lines: string[]) => {
    for (const line of lines) expect(line).not.toMatch(/undefined|NaN|null|\[object/);
};

describe('the viewer\'s turn and cards', () => {
    it('says the deal and the turn, the turn at once', () => {
        const s0 = three();
        const v0 = view(s0);
        const s1 = deal(s0, {holes: {2: 'AhKd'}});
        const v1 = view(s1);
        const said = announcementsFor(diffViews(v0, v1, {mySeat: 2}), ctx(v1, 2, [cards('Ah')[0], cards('Kd')[0]]));
        expect(said.polite).toEqual(['You have the ace of hearts and the king of diamonds.']);
        expect(said.assertive).toEqual(['Your turn: 20 to call, pot 30.']);
    });

    it('says a new game from its first deal, then the four cards of a PLO hand', () => {
        let s = deal(three());
        s = moves(s, F, F);
        s = ok(reduce(s, {type: 'host', by: pidOf(0), op: {op: 'config', patch: {variant: 'plo'}}, at: nowOf(s)}));
        const before = view(s);
        s = deal(s, {holes: {2: 'AhKdQcJs'}});
        const after = view(s);
        const said = announcementsFor(diffViews(before, after, {mySeat: 2}), ctx(after, 2, cards('AhKdQcJs')));
        expect(said.polite).toEqual([
            'New game from this hand: Pot-limit Omaha.',
            'You have the ace of hearts, the king of diamonds, the queen of clubs and the jack of spades.',
        ]);
        // The next PLO hand is no news.
        s = moves(s, F, F);
        const again = view(s);
        s = deal(s);
        expect(announcementsFor(diffViews(again, view(s), {mySeat: 2}), ctx(view(s), 2, null)).polite).toEqual([]);
    });

    it('says nothing of the viewer\'s own move, and checking is free when it is', () => {
        let s = deal(three());
        s = moves(s, C, C);
        const prev = view(s);
        s = moves(s, X);
        const v = view(s);
        const said = announcementsFor(diffViews(prev, v, {mySeat: 0}), ctx(v, 0));
        expect(said.polite).toEqual(['\u2068Ben\u2069 checks.', 'Flop: ' + said.polite[1].slice(6)]);
        expect(said.assertive).toEqual(['Your turn: checking is free, pot 60.']);
    });
});

describe('the others', () => {
    it('reads each move as the log does, the clock\'s as such', () => {
        let s = deal(three());
        const prev = view(s);
        s = moves(s, R(60));
        s = ok(reduce(s, {type: 'timeout', turn: s.turn, at: s.hand!.deadline! + TIMING.TURN_GRACE_MS}));
        const v = view(s);
        const said = announcementsFor(diffViews(prev, v, {mySeat: 1}), ctx(v, 1));
        expect(said.polite).toEqual(['\u2068Cy\u2069 raises to 60.', '\u2068Ana\u2069 folds as time ran out.']);
        clean(said.polite);
    });

    it('names each winner with their hand, and an uncontested pot as such', () => {
        let s = deal(three(), {holes: {0: 'AhKh', 1: '7c2d', 2: 'QsQd'}, board: '2c5d9hJs3c'});
        s = moves(s, C, C, X, X, X, X, X, X, X, X, X);
        const prev = view(s);
        s = moves(s, X);
        const v = view(s, s.hand!.result!.completedAt);
        const said = announcementsFor(diffViews(prev, v, {mySeat: 0}), ctx(v, 0));
        expect(said.polite.at(-1)).toBe('\u2068Cy\u2069 wins 60 with a pair of queens.');
        const mine = announcementsFor(diffViews(prev, view(s, s.hand!.result!.completedAt), {mySeat: 2}), ctx(v, 2));
        expect(mine.polite.at(-1)).toBe('You win 60 with a pair of queens.');

        let t = deal(three());
        const before = view(t);
        t = moves(t, F, F);
        const tv = view(t);
        const folded = announcementsFor(diffViews(before, tv, {mySeat: 2}), ctx(tv, 2));
        expect(folded.polite.at(-1)).toBe('Everyone else folded: \u2068Ben\u2069 takes 20.');
    });

    it('says each board\'s cards and each board\'s winners in turn, on two or three boards', () => {
        const holes = {0: 'JsTs4h5h', 1: '9c9d8h7h', 2: '6c6d2s3s'};
        let s = deal(table({0: 1000, 1: 1000, 2: 1000}, {lastBigBlind: 0, config: {variant: 'plo', boards: 3}}), {holes, boards: ['AsKsQs2d3c', '9h9s4c4d5c', '8d8c7d7c2h']});
        s = moves(s, C, C);
        const preflop = view(s);
        s = moves(s, X);
        const flop = announcementsFor(diffViews(preflop, view(s), {mySeat: 0}), ctx(view(s), 0));
        expect(flop.polite.slice(-3)).toEqual([
            'Flop, board 1: ace of spades, king of spades and queen of spades.',
            'Flop, board 2: nine of hearts, nine of spades and four of clubs.',
            'Flop, board 3: eight of diamonds, eight of clubs and seven of diamonds.',
        ]);
        s = moves(s, X, X, X, X, X, X, X, X);
        const prev = view(s);
        s = moves(s, X);
        const v = view(s, s.hand!.result!.completedAt);
        const said = announcementsFor(diffViews(prev, v, {mySeat: 1}), ctx(v, 1));
        clean(said.polite);
        expect(said.polite.slice(-3)).toEqual([
            'Board 1: \u2068Ana\u2069 wins 20 with a royal flush.',
            'Board 2: you win 20 with four of a kind, nines.',
            'Board 3: you win 20 with a full house, eights full of sevens.',
        ]);
    });

    it('says who sits down and who leaves', () => {
        const s = three();
        const prev = view(s);
        const sat = ok(reduce(s, {type: 'sit', by: pidOf(4), seat: 4, buyIn: 2000, at: nowOf(s)}));
        const satView = view(sat);
        expect(announcementsFor(diffViews(prev, satView), ctx(satView, 0)).polite).toEqual(['\u2068Dee\u2069 sat down.']);
        const left = ok(reduce(sat, {type: 'leave', by: pidOf(4), at: nowOf(sat)}));
        const leftView = view(left);
        expect(announcementsFor(diffViews(satView, leftView), ctx(leftView, 0)).polite).toEqual(['\u2068Dee\u2069 left the table.']);
    });
});

// Triple T (P7): the three cards to throw one of away, said at once; the viewer's own throw (or the
// clock's) with its card, the others' without; the throw-away over.
describe('Triple T\'s throw-away', () => {
    it('says the three cards at once, each throw, the clock\'s card for the viewer, and the throw-away over', () => {
        const s0 = table({0: 1000, 1: 1000, 2: 1000}, {lastBigBlind: 0, config: {variant: 'triple-t'}});
        const v0 = view(s0);
        let s = deal(s0, {holes: {0: 'AhKd7c', 1: 'QsQd2h', 2: '9c8c3s'}});
        const v1 = view(s);
        const dealt = announcementsFor(diffViews(v0, v1), ctx(v1, 0, cards('AhKd7c')));
        expect(dealt.assertive).toEqual(['Throw away one of your three cards: the ace of hearts, the king of diamonds and the seven of clubs.']);
        expect(dealt.polite).toEqual([]);
        s = ok(reduce(s, {type: 'discard', by: pidOf(1), turn: s.turn, card: cards('2h')[0], at: nowOf(s)}));
        const v2 = view(s);
        const other = announcementsFor(diffViews(v1, v2), {...ctx(v2, 0, cards('AhKd7c')), discard: null});
        expect(other.polite.map((l) => l.replace(/[\u2068\u2069]/g, ''))).toEqual(['Ben throws away a card.']);
        s = ok(reduce(s, {type: 'timeout', turn: s.turn, at: s.hand!.deadline! + TIMING.TURN_GRACE_MS}));
        const v3 = view(s);
        const rest = announcementsFor(diffViews(v2, v3), {...ctx(v3, 0, cards('AhKd')), discard: cards('7c')[0]});
        const lines = rest.polite.map((l) => l.replace(/[\u2068\u2069]/g, ''));
        expect(lines).toEqual(['Time ran out: the seven of clubs was thrown away for you.', 'Cy throws away a card as time ran out.', 'Everyone has thrown away a card.']);
        clean([...dealt.assertive, ...lines]);
        // Nobody else's card is ever said.
        expect(lines.join(' ')).not.toMatch(/two of hearts|three of spades/);
    });
});
