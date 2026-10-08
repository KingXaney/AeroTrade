// The hand log as the drawer prints it: the moves in order with each street led by its cards (a
// run-out's streets too), a raise read as its total, the clock's moves said so; then the shown hands
// with their names, a hand that plays the board, and each pot's winners — one pot plainly, several by
// number, a split share by share, an uncontested pot as everyone else folding; the viewer's own
// cards when they were never shown, and a hand shown to the viewer alone; a seat the room no longer
// knows by its number.

import {describe, expect, it} from 'vitest';
import {HAND_COPY, LOG_COPY, TABLE_COPY} from '@/lib/learn/copy/poker-night';
import {reduce} from '@/lib/poker-night/engine';
import {currentHandLog, historyHandLog, seatNamer} from '@/lib/poker-night/hand-log';
import type {HandSummary, TableState} from '@/lib/poker-night/types';
import type {People} from '@/lib/poker-night/view-types';
import {handLogView, historyView, publicView} from '@/lib/poker-night/views';
import {A, C, F, R, X, actBy, actorPid, cards, deal, moves, ok, pidOf, runOut, table} from './fixtures';

const FSI = String.fromCodePoint(0x2068);
const PDI = String.fromCodePoint(0x2069);
const plain = (text: string) => text.split(FSI).join('').split(PDI).join('');

const people = (n: number): People => Object.fromEntries(Array.from({length: n}, (_, i) => [pidOf(i), {name: `P${i}`, avatar: 'v1:fox:tangerine:none:none'}]));

// The move that completes the hand, with the summary history keeps.
const finish = (s: TableState, ...list: Parameters<typeof moves>[1][]): {state: TableState; summary: HandSummary} => {
    let state = s;
    for (const move of list) {
        const r = reduce(state, actBy(state, actorPid(state), move));
        if (!r.ok) throw new Error(r.reason);
        state = r.state;
        if (r.hands.length > 0) return {state, summary: r.hands[0]};
    }
    throw new Error('the hand did not complete');
};

const three = () => table({0: 1000, 1: 1000, 2: 1000}, {lastBigBlind: 0});

describe('the current hand', () => {
    it('prints each move in order, the streets led by their cards, a raise as its total', () => {
        let s = deal(three(), {holes: {0: 'AhKh', 1: '7c2d', 2: 'QsQd'}, board: '2c5d9hJs3c'});
        s = moves(s, R(60), C, C, X, X, X);
        const view = publicView(s);
        const nameOf = seatNamer((seat) => view.seats[seat]?.pid ?? null, people(3));
        const log = currentHandLog(s.hand!.no, handLogView(s), view.hand!, null, nameOf);
        const text = log.lines.map((l) => plain(l.text));
        expect(log.title).toBe('Hand 1');
        expect(text.slice(0, 2).every((t) => /posts the (small|big) blind/.test(t))).toBe(true);
        expect(text.slice(2, 5)).toEqual(['P2 raises to 60.', 'P0 calls 50.', 'P1 calls 40.']);
        expect(text).toContain(`Flop: ${HAND_COPY.cardsShort(cards('2c5d9h'))}`);
        // The turn card is out, with no move on it yet.
        expect(log.lines.filter((l) => l.kind === 'street').map((l) => plain(l.text))).toEqual([`Flop: ${HAND_COPY.cardsShort(cards('2c5d9h'))}`, `Turn: ${HAND_COPY.cardsShort(cards('Js'))}`]);
        expect(text.indexOf(`Flop: ${HAND_COPY.cardsShort(cards('2c5d9h'))}`)).toBeLessThan(text.findIndex((t) => t.endsWith('checks.')));
        expect(new Set(log.lines.map((l) => l.key)).size).toBe(log.lines.length);
    });

    it('shows a run-out\'s streets with no move of their own, then the result', () => {
        let s = deal(table({0: 500, 1: 500}, {lastBigBlind: 0}), {holes: {0: 'AhAd', 1: 'KcKd'}, board: '2c5d9hJs3c'});
        s = moves(s, A, C);
        s = runOut(s);
        const view = publicView(s);
        const nameOf = seatNamer((seat) => view.seats[seat]?.pid ?? null, people(2));
        const log = currentHandLog(s.hand!.no, handLogView(s), view.hand!, view.hand!.result, nameOf);
        const streets = log.lines.filter((l) => l.kind === 'street').map((l) => plain(l.text));
        expect(streets).toEqual([
            `Flop: ${HAND_COPY.cardsShort(cards('2c5d9h'))}`, `Turn: ${HAND_COPY.cardsShort(cards('Js'))}`, `River: ${HAND_COPY.cardsShort(cards('3c'))}`,
        ]);
        expect(log.lines.filter((l) => l.kind === 'show')).toHaveLength(2);
        const result = log.lines.filter((l) => l.kind === 'result').map((l) => plain(l.text));
        expect(result).toEqual([`${plain(nameOf(0))} wins 1,000 with a pair of aces.`]);
    });

    it('reads a seat the room let go of as its seat', () => {
        expect(seatNamer(() => null, {})(2)).toBe(TABLE_COPY.seat(2));
        expect(seatNamer(() => 'gone', {})(4)).toBe(TABLE_COPY.seat(4));
    });
});

describe('a hand from history', () => {
    it('says everyone else folded for an uncontested pot, and the viewer\'s own unshown cards', () => {
        const s = deal(three(), {holes: {0: 'AhKh', 1: '7c2d', 2: 'QsQd'}, board: '2c5d9hJs3c'});
        const opener = s.hand!.actor!;
        const {summary} = finish(s, R(100), F, F);
        const log = historyHandLog(historyView(summary, pidOf(opener)), people(3), pidOf(opener));
        const text = log.lines.map((l) => plain(l.text));
        expect(log.blinds).toBe(LOG_COPY.blinds(10, 20, 0));
        expect(text).toContain(`P${opener} gets back 80 uncalled.`);
        expect(text).toContain(`Everyone else folded: P${opener} takes 50.`);
        expect(text[text.length - 1]).toMatch(/^You held /);
        expect(log.lines.filter((l) => l.kind === 'show')).toHaveLength(0);
    });

    it('names the shown hands, the board player, and splits a pot share by share', () => {
        let s = deal(table({0: 1000, 1: 1000}, {lastBigBlind: 0}), {holes: {0: '2h3d', 1: '4c5s'}, board: 'AhKhQhJhTh'});
        s = moves(s, C, X, X, X, X, X);
        const {summary} = finish(s, X, X, X);
        const log = historyHandLog(historyView(summary, null), people(2), null);
        const text = log.lines.map((l) => plain(l.text));
        expect(text.filter((t) => t.includes('shows'))).toHaveLength(2);
        expect(text.filter((t) => t.endsWith('plays the board.'))).toHaveLength(2);
        expect(text).toContain('Split pot: P1 takes 20, P0 takes 20.');
        expect(text.some((t) => t.includes('royal flush'))).toBe(true);
        expect(text.some((t) => t.startsWith('You held'))).toBe(false);
    });

    it('says what was shown to the viewer alone, to them and to nobody else', () => {
        // Seats 2 and 0 fold to seat 1, which seat 2 asks to see, and is shown alone.
        let s = moves(deal(three(), {holes: {0: 'AhKh', 1: '7c2d', 2: 'QsQd'}}), F, F);
        const at = s.hand!.result!.completedAt;
        s = ok(reduce(s, {type: 'ask', by: 'p2', to: 'p1', at: at + 100}));
        const r = reduce(s, {type: 'reply', by: 'p1', to: 'p2', show: 'one', at: at + 200});
        if (!r.ok) throw new Error(r.reason);
        const summary = r.hands[0];
        const mine = historyHandLog(historyView(summary, 'p2'), people(3), 'p2').lines.map((l) => plain(l.text));
        expect(mine).toContain(`Shown to you: P1 held ${HAND_COPY.cardsShort(cards('7c2d'))}.`);
        const theirs = historyHandLog(historyView(summary, 'p0'), people(3), 'p0').lines.map((l) => plain(l.text));
        expect(theirs.some((t) => t.includes('Shown to you'))).toBe(false);
        expect(historyView(summary, 'p0').players.find((p) => p.pid === 'p1')!.hole).toBeNull();
    });

    it('numbers the pots when there are side pots, the main pot first', () => {
        // Everyone all in or calling: a main pot for the short stack and a side pot for the rest.
        const s = moves(deal(table({0: 300, 1: 1000, 2: 1000}, {lastBigBlind: 0}), {holes: {0: 'AhAd', 1: 'KcKd', 2: 'QcQd'}, board: '2c5d9hJs3c'}), A, A, C);
        const done = runOut(s);
        expect(done.hand!.result!.pots.length).toBeGreaterThan(1);
        const view = publicView(done);
        const nameOf = seatNamer((seat) => view.seats[seat]?.pid ?? null, people(3));
        const lines = currentHandLog(done.hand!.no, handLogView(done), view.hand!, view.hand!.result, nameOf).lines
            .filter((l) => l.kind === 'result').map((l) => plain(l.text));
        expect(lines[0]).toMatch(/from the main pot/);
        expect(lines[1]).toMatch(/from side pot 1/);
    });
});

describe('a hand shown to the viewer alone', () => {
    it('is said in the hand just ended from the view, and in its history row before the row has it', () => {
        let s = moves(deal(three(), {holes: {0: 'AhKh', 1: '7c2d', 2: 'QsQd'}}), F, F);
        const at = s.hand!.result!.completedAt;
        s = ok(reduce(s, {type: 'ask', by: 'p2', to: 'p1', at: at + 100}));
        const r = reduce(s, {type: 'reply', by: 'p1', to: 'p2', show: 'one', at: at + 200});
        if (!r.ok) throw new Error(r.reason);
        const view = publicView(r.state);
        const nameOf = seatNamer((seat) => view.seats[seat]?.pid ?? null, people(3));
        const seen = [{seat: 1, cards: cards('7c2d')}];
        const now = currentHandLog(1, handLogView(r.state), view.hand!, view.hand!.result, nameOf, seen).lines.map((l) => plain(l.text));
        expect(now).toContain(`Shown to you: P1 held ${HAND_COPY.cardsShort(cards('7c2d'))}.`);
        expect(currentHandLog(1, handLogView(r.state), view.hand!, view.hand!.result, nameOf).lines.some((l) => l.text.includes('Shown to you'))).toBe(false);
        // The history row written as the hand completed (before the answer) holds no hole: the view brings it.
        const early = historyHandLog(historyView(r.hands[0], null), people(3), 'p2', seen);
        expect(early.lines.filter((l) => l.text.includes('Shown to you'))).toHaveLength(1);
        const twice = historyHandLog(historyView(r.hands[0], 'p2'), people(3), 'p2', seen);
        expect(twice.lines.filter((l) => l.text.includes('Shown to you'))).toHaveLength(1);
    });
});
