// Seats and positions: the clockwise walk, who is eligible, and the big blind that always moves on
// one eligible seat — through a full orbit, heads-up (the button posts the small blind), the drop
// from three players to two, a player sitting out and coming back in time to land on the button
// (they post), and the documented cost of the rule, the small blind posted twice when the big blind
// leaves.

import {describe, expect, it} from 'vitest';
import {clockwiseAfter, eligibleSeats, firstAfter, isEligible, lastBefore, positions} from '@/lib/poker-night/seats';
import type {TableState} from '@/lib/poker-night/types';
import {ENTRY_KINDS} from '@/lib/poker-night/config';
import {F, deal, freshSeat, moves, nowOf, pidOf, play, table} from './fixtures';

// Everyone folds to the big blind.
const walk = (s: TableState): TableState => {
    let state = s;
    while (state.hand && state.hand.phase === 'betting') state = moves(state, F);
    return state;
};

const blinds = (s: TableState) => ({button: s.hand!.button, sb: s.hand!.smallBlindSeat, bb: s.hand!.bigBlindSeat});

const posted = (s: TableState) => s.hand!.log
    .filter((e) => ['small-blind', 'big-blind', 'post'].includes(ENTRY_KINDS[e[1]]))
    .map((e) => [e[0], ENTRY_KINDS[e[1]], e[2]]);

describe('the clockwise walk', () => {
    it('orders seats from the one after `from`, `from` last', () => {
        expect(clockwiseAfter(5, [0, 2, 5, 7], 9)).toEqual([7, 0, 2, 5]);
        expect(clockwiseAfter(3, [0, 2, 5, 7], 9)).toEqual([5, 7, 0, 2]);
        expect(firstAfter(5, [0, 2, 5, 7], 9)).toBe(7);
        expect(firstAfter(7, [0, 2, 5, 7], 9)).toBe(0);
        expect(lastBefore(5, [0, 2, 5, 7], 9)).toBe(2);
        expect(lastBefore(0, [0, 2, 5, 7], 9)).toBe(7);
        expect(lastBefore(3, [0, 2, 5, 7], 9)).toBe(2);
    });

    it('deals in only occupied seats with chips that are not leaving or sitting out', () => {
        const s = table({0: 100, 1: 100, 2: 100, 3: 100, 4: 100, 5: 100});
        s.seats[1]!.sittingOut = true;
        s.seats[2]!.sitOutNext = true;
        s.seats[3]!.away = true;
        s.seats[4]!.leaving = true;
        s.seats[5]!.stack = 0;
        expect(eligibleSeats(s)).toEqual([0]);
        expect(isEligible(null)).toBe(false);
        expect(isEligible(freshSeat('x', 1))).toBe(true);
    });
});

describe('positions', () => {
    it('draws the first big blind and puts the small blind and the button behind it', () => {
        const s = table({1: 100, 3: 100, 4: 100, 6: 100}, {config: {seats: 9}});
        expect(positions(s, [1, 3, 4, 6], 6)).toEqual({bb: 4, sb: 3, button: 1, order: [3, 4, 6, 1]});
        expect(positions({...s, lastBigBlind: 4}, [1, 3, 4, 6], 6)).toEqual({bb: 6, sb: 4, button: 3, order: [4, 6, 1, 3]});
    });

    it('moves the big blind one eligible seat a hand, round a full orbit', () => {
        let s = table({0: 1000, 1: 1000, 2: 1000, 3: 1000}, {lastBigBlind: 0});
        const seen: number[] = [];
        for (let k = 0; k < 8; k++) {
            s = deal(s);
            const {button, sb, bb} = blinds(s);
            expect([button, sb]).toEqual([(bb + 2) % 4, (bb + 3) % 4]);
            seen.push(bb);
            s = walk(s);
        }
        expect(seen).toEqual([1, 2, 3, 0, 1, 2, 3, 0]);
    });

    it('heads-up: the button posts the small blind, acts first before the flop and last after', () => {
        let s = table({2: 1000, 5: 1000}, {lastBigBlind: 2});
        s = deal(s);
        expect(blinds(s)).toEqual({button: 2, sb: 2, bb: 5});
        expect(s.hand!.seats.map((p) => p.seat)).toEqual([5, 2]);
        expect(s.hand!.actor).toBe(2);
        s = moves(s, {kind: 'call'}, {kind: 'check'});
        expect(s.hand!.street).toBe('flop');
        expect(s.hand!.actor).toBe(5);
    });

    it('from three players to two: the old big blind becomes the button, nobody pays the big blind twice', () => {
        let s = table({0: 1000, 1: 1000, 2: 1000}, {lastBigBlind: 1});
        s = deal(s);
        expect(blinds(s)).toEqual({button: 0, sb: 1, bb: 2});
        s = walk(s);
        s = play(s, {type: 'leave', by: pidOf(0), at: nowOf(s)});
        s = deal(s);
        expect(blinds(s)).toEqual({button: 2, sb: 2, bb: 1});
    });

    it('a player who sits out and comes back on the button posts a big blind; nobody pays the big blind twice', () => {
        let s = table({0: 1000, 1: 1000, 2: 1000, 3: 1000}, {lastBigBlind: 1});
        s = deal(s);
        expect(blinds(s)).toEqual({button: 0, sb: 1, bb: 2});
        s = walk(s);
        s = play(s, {type: 'sit-out', by: pidOf(3), at: nowOf(s)});
        s = deal(s);
        expect(blinds(s)).toEqual({button: 1, sb: 2, bb: 0});
        expect(s.seats[3]!.owesPost).toBe(true);
        s = walk(s);
        s = play(s, {type: 'sit-in', by: pidOf(3), at: nowOf(s)});
        s = deal(s);
        expect(blinds(s)).toEqual({button: 3, sb: 0, bb: 1});
        expect(posted(s)).toEqual([[0, 'small-blind', 10], [1, 'big-blind', 20], [3, 'post', 20]]);
        expect(s.seats[3]!.owesPost).toBe(false);
    });

    it('costs half a big blind when the big blind leaves: the seat before it posts the small blind again', () => {
        let s = table({0: 1000, 1: 1000, 2: 1000, 3: 1000}, {lastBigBlind: 1});
        s = deal(s);
        expect(blinds(s)).toEqual({button: 0, sb: 1, bb: 2});
        s = walk(s);
        s = play(s, {type: 'leave', by: pidOf(2), at: nowOf(s)});
        s = deal(s);
        expect(blinds(s)).toEqual({button: 0, sb: 1, bb: 3});
    });
});
