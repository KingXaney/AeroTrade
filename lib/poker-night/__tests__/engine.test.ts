// The engine on stacked decks: a walk, a check-down, an odd chip split, three all-ins with side pots
// won by different players, the run-out's streets, a short big blind and an all-in ante; players
// leaving or being removed mid-hand (facing a bet they fold, otherwise they stay in, away, and are
// cashed out at the end with whatever they won); posting to play; the blinds moving past busted
// seats; timeouts, away and sitting out; every rebuy policy; the host's operations; showing cards;
// the reveal timing the next deal; no-ops handing back the same state; and seeded random nights
// that keep every invariant without ever mutating their input.

import {describe, expect, it} from 'vitest';
import {readEntry} from '@/lib/poker-night/betting';
import {TIMING} from '@/lib/poker-night/config';
import {createTable, forceClose, reduce} from '@/lib/poker-night/engine';
import {conservation, ledgerEvents, ledgerRow} from '@/lib/poker-night/ledger';
import type {HandEntry, TableAction, TableState} from '@/lib/poker-night/types';
import {
    A, C, F, R, X, actBy, checkInvariants, deal, deepFreeze, host, moves, nowOf, ok, pidOf, play, randomNight, runOut, table, T0,
} from './fixtures';

const entries = (s: TableState): HandEntry[] => s.hand!.log.map((e) => readEntry(s.hand!, e));
const said = (s: TableState) => entries(s).map((e) => `${e.seat}:${e.kind}${e.amount ? ` ${e.amount}` : ''}${e.auto ? ' (auto)' : ''}${e.timeout ? ' (timeout)' : ''}`);
const stacks = (s: TableState) => s.seats.map((seat) => seat?.stack ?? null);
const events = (s: TableState, seat: number) => ledgerEvents(s, ledgerRow(s, pidOf(seat))!).map((e) => [e.kind, e.amount]);
const by = (s: TableState, type: 'leave' | 'sit-out' | 'sit-in' | 'show', seat: number): TableAction => ({type, by: pidOf(seat), at: nowOf(s)});
const buy = (s: TableState, seat: number, amount: number): TableAction => ({type: 'buy', by: pidOf(seat), amount, at: nowOf(s)});
const timeoutOf = (s: TableState): Extract<TableAction, {type: 'timeout'}> => ({type: 'timeout', turn: s.turn, at: s.hand!.deadline! + TIMING.TURN_GRACE_MS});

// Three players, blinds 10/20: seat 0 the small blind, 1 the big blind, 2 the button (first to act).
const three = (stacks3: [number, number, number] = [1000, 1000, 1000], config = {}) =>
    table({0: stacks3[0], 1: stacks3[1], 2: stacks3[2]}, {config, lastBigBlind: 0});

const SMALL = {smallBlind: 1, bigBlind: 2, buyInMin: 2, buyInMax: 1000};

describe('hands to the end', () => {
    it('a walk: the big blind takes the blinds and gets its uncalled excess back, nothing shown', () => {
        let s = deal(three());
        expect(s.hand!.actor).toBe(2);
        s = moves(s, F, F);
        const result = s.hand!.result!;
        expect(result).toMatchObject({showdown: false, refund: {seat: 1, amount: 10}, hands: [], revealMs: 1500});
        expect(result.pots).toEqual([{amount: 20, eligible: [1], winners: [1], shares: [20]}]);
        expect(result.nets).toEqual([{seat: 0, net: -10}, {seat: 1, net: 10}, {seat: 2, net: 0}]);
        expect(stacks(s)).toEqual([990, 1010, 1000, null, null, null, null, null]);
        expect(s.hand!.seats.some((p) => p.shown)).toBe(false);
        expect(said(s)).toEqual(['0:small-blind 10', '1:big-blind 20', '2:fold', '0:fold', '1:refund 10']);
        expect(s.nextHandAt).toBe(result.completedAt + 5000);
        checkInvariants(s);
    });

    it('a check-down: every live hand shows, from the first seat left of the button', () => {
        let s = deal(three(), {holes: {0: 'AhKh', 1: '7c2d', 2: 'QsQd'}, board: '2c5d9hJs3c'});
        s = moves(s, C, C, X);
        for (const street of ['flop', 'turn', 'river']) {
            expect(s.hand!.street).toBe(street);
            s = moves(s, X, X, X);
        }
        const result = s.hand!.result!;
        expect(result.showdown).toBe(true);
        expect(result.pots).toEqual([{amount: 60, eligible: [0, 1, 2], winners: [2], shares: [60]}]);
        expect(result.showOrder).toEqual([0, 1, 2]);
        expect(result.hands.map((h) => h.seat)).toEqual([0, 1, 2]);
        expect(result.hands.every((h) => h.value !== null && h.best.length === 5)).toBe(true);
        expect(stacks(s).slice(0, 3)).toEqual([980, 980, 1040]);
        expect(result.revealMs).toBe(3000);
    });

    it('splits a pot with an odd chip, the extra chip to the first winner left of the button', () => {
        let s = deal(three([100, 100, 100], {...SMALL, ante: 1}), {holes: {0: '2c3c', 1: '2d3d', 2: '2h3h'}, board: 'AsKsQsJsTs'});
        s = moves(s, F, C, X, X, X, X, X, X, X);
        expect(s.hand!.result!.pots).toEqual([{amount: 7, eligible: [0, 1], winners: [0, 1], shares: [4, 3]}]);
        expect(stacks(s).slice(0, 3)).toEqual([101, 100, 99]);
    });

    it('three all-ins: the uncalled top comes back, the main and side pots go to different players, the board runs out', () => {
        let s = deal(three([100, 200, 300], SMALL), {holes: {0: 'AhAd', 1: 'KhKd', 2: 'QhQd'}, board: '2c7d9s3s4c'});
        s = moves(s, A, A, A);
        const hand = s.hand!;
        expect(hand.phase).toBe('runout');
        expect(hand.board).toEqual([]);
        expect(hand.seats.every((p) => p.shown)).toBe(true);
        const t = nowOf(s);
        expect(hand.nextStreetAt).toBe(t);
        // Each street on the clock, 1.5 s apart.
        s = ok(reduce(s, {type: 'deal-street', at: t}));
        expect([s.hand!.street, s.hand!.board.length, s.hand!.nextStreetAt]).toEqual(['flop', 3, t + 1500]);
        expect(reduce(s, {type: 'deal-street', at: t + 1499})).toEqual({ok: false, reason: 'not-due'});
        s = ok(reduce(s, {type: 'deal-street', at: t + 1500}));
        expect([s.hand!.street, s.hand!.board.length]).toEqual(['turn', 4]);
        s = ok(reduce(s, {type: 'deal-street', at: t + 3000}));
        const result = s.hand!.result!;
        expect(s.hand!.phase).toBe('complete');
        expect(result.refund).toEqual({seat: 2, amount: 100});
        expect(result.pots).toEqual([
            {amount: 300, eligible: [0, 1, 2], winners: [0], shares: [300]},
            {amount: 200, eligible: [1, 2], winners: [1], shares: [200]},
        ]);
        expect(stacks(s).slice(0, 3)).toEqual([300, 200, 100]);
        expect(result.revealMs).toBe(4200);
        expect(s.nextHandAt).toBe(t + 3000 + 5000);
        checkInvariants(s);
    });

    it('times the next deal by the reveal when it outlasts the pause', () => {
        let s = deal(three([100, 200, 300], {...SMALL, pauseSeconds: 3}), {holes: {0: 'AhAd', 1: 'KhKd', 2: 'QhQd'}, board: '2c7d9s3s4c'});
        s = runOut(moves(s, A, A, A));
        expect(s.nextHandAt).toBe(s.hand!.result!.completedAt + 4200);
    });

    it('a buy that brings back a second player keeps the pause and the reveal, then a short delay once they are over', () => {
        const board = '3h4h9cJdQc';
        const buyAt = (s: TableState, seat: number, after: number): TableAction =>
            ({type: 'buy', by: pidOf(seat), amount: 1000, at: s.hand!.result!.completedAt + after});
        // Heads-up with the longest pause: the loser busts, so no deal is timed until they buy again.
        let s = deal(table({0: 500, 1: 1000}, {config: {buyInMin: 100, buyInMax: 2000, pauseSeconds: 15}, lastBigBlind: 0}), {holes: {0: '7c2d', 1: 'AsAd'}, board});
        s = runOut(moves(s, A, C));
        const done = s.hand!.result!.completedAt;
        expect(s.nextHandAt).toBeNull();
        expect(play(s, buyAt(s, 0, 100)).nextHandAt).toBe(done + 15_000);
        expect(play(s, buyAt(s, 0, 60_000)).nextHandAt).toBe(done + 60_000 + TIMING.START_DELAY_MS);
        // Bought while paused and resumed straight away: the same floor.
        const paused = play(ok(host(s, {op: 'pause'}, done + 50)), buyAt(s, 0, 100));
        expect(paused.nextHandAt).toBeNull();
        expect(ok(host(paused, {op: 'resume'}, done + 200)).nextHandAt).toBe(done + 15_000);
        // Two pots, a 4.2-second reveal over a 3-second pause, and two players bust.
        s = deal(three([300, 600, 1000], {buyInMin: 100, buyInMax: 2000, pauseSeconds: 3}), {holes: {0: '7c2d', 1: 'KsKd', 2: 'AsAd'}, board});
        s = runOut(moves(s, A, A, A));
        const result = s.hand!.result!;
        expect(result.revealMs).toBe(4200);
        expect(s.nextHandAt).toBeNull();
        s = play(s, buyAt(s, 0, 200));
        expect(s.nextHandAt).toBe(result.completedAt + 4200);
        checkInvariants(s);
    });

    it('a short big blind: the others still owe the full blind, and the excess forms a side pot', () => {
        let s = deal(table({0: 1000, 1: 1000, 2: 15}, {lastBigBlind: 1}), {holes: {0: 'KhKd', 1: 'QhQd', 2: 'AhAd'}, board: '2c7d9s3s4c'});
        expect(s.hand!.currentBet).toBe(20);
        expect(s.hand!.seats.find((p) => p.seat === 2)).toMatchObject({committed: 15, allIn: true});
        s = moves(s, C, C);
        expect(s.hand!.street).toBe('flop');
        s = moves(s, X, X, X, X, X, X);
        expect(s.hand!.result!.pots).toEqual([
            {amount: 45, eligible: [1, 2, 0], winners: [2], shares: [45]},
            {amount: 10, eligible: [1, 0], winners: [0], shares: [10]},
        ]);
        expect(stacks(s).slice(0, 3)).toEqual([990, 980, 45]);
    });

    it('an ante that puts a player all in: they play for the antes only', () => {
        let s = deal(table({0: 5, 1: 1000, 2: 1000}, {config: {ante: 5}, lastBigBlind: 1}), {holes: {0: 'AhAd', 1: 'KhKd', 2: 'QhQd'}, board: '2c7d9s3s4c'});
        expect(said(s)).toEqual(['1:ante 5', '2:ante 5', '0:ante 5', '1:small-blind 10', '2:big-blind 20']);
        expect(entries(s)[2].allIn).toBe(true);
        expect(s.hand!.actor).toBe(1);
        s = moves(s, C, X, X, X, X, X, X, X);
        expect(s.hand!.result!.pots).toEqual([
            {amount: 15, eligible: [1, 2, 0], winners: [0], shares: [15]},
            {amount: 40, eligible: [1, 2], winners: [1], shares: [40]},
        ]);
        expect(stacks(s).slice(0, 3)).toEqual([15, 1015, 975]);
        checkInvariants(s);
    });
});

describe('leaving and removal mid-hand', () => {
    it('facing a bet: folds at once, out of turn, and is cashed out when the hand ends', () => {
        let s = deal(three());
        s = moves(s, R(60));
        expect(s.hand!.actor).toBe(0);
        s = play(s, by(s, 'leave', 1));
        expect(s.hand!.seats.find((p) => p.seat === 1)!.folded).toBe(true);
        expect(s.seats[1]).toMatchObject({leaving: true, away: true});
        expect(s.hand!.actor).toBe(0);
        s = moves(s, C, X, X, X, X, X, X);
        expect(s.hand!.phase).toBe('complete');
        expect(s.seats[1]).toBeNull();
        expect(ledgerRow(s, 'p1')!.cashedOut).toBe(980);
        expect(events(s, 1).slice(-1)).toEqual([['cash-out', 980]]);
        checkInvariants(s);
    });

    it('not facing a bet: stays in, away — the clock checks while free and folds to a bet — then is cashed out', () => {
        let s = moves(deal(three()), C, C, X);
        expect(s.hand!.street).toBe('flop');
        expect(s.hand!.actor).toBe(0);
        s = play(s, by(s, 'leave', 1));
        expect(s.hand!.seats.find((p) => p.seat === 1)!.folded).toBe(false);
        s = moves(s, X);
        // Seat 1 checked for itself; the button bets, seat 0 calls, seat 1 folds for itself.
        expect(s.hand!.actor).toBe(2);
        s = moves(s, R(100), C);
        expect(said(s).slice(-5)).toEqual(['0:check', '1:check (auto)', '2:bet 100', '0:call 100', '1:fold (auto)']);
        expect(s.hand!.street).toBe('turn');
        s = moves(s, X, X, X, X);
        expect(s.seats[1]).toBeNull();
        expect(ledgerRow(s, 'p1')!.cashedOut).toBe(980);
    });

    it('the actor leaving when checking is free checks at once', () => {
        let s = moves(deal(three()), C, C, X);
        s = play(s, by(s, 'leave', 0));
        expect(said(s).slice(-1)).toEqual(['0:check (auto)']);
        expect(s.hand!.actor).toBe(1);
    });

    it('an all-in player who leaves stays in the hand and is cashed out with what they won', () => {
        let s = deal(three([1000, 1000, 300]), {holes: {0: 'KhKd', 1: 'QhQd', 2: 'AhAd'}, board: '2c7d9s3s4c'});
        s = moves(s, A, C, C);
        expect(s.hand!.street).toBe('flop');
        s = play(s, by(s, 'leave', 2));
        expect(s.hand!.seats.find((p) => p.seat === 2)).toMatchObject({folded: false, allIn: true});
        s = moves(s, X, X, X, X, X, X);
        expect(s.hand!.result!.pots[0]).toEqual({amount: 900, eligible: [0, 1, 2], winners: [2], shares: [900]});
        expect(s.seats[2]).toBeNull();
        expect(events(s, 2).slice(-1)).toEqual([['cash-out', 900]]);
        checkInvariants(s);
    });

    it('a bettor removed before the callers act stays in: the others fold, the bet comes back, the ledger says removed', () => {
        let s = moves(deal(three()), C, C, X, X);
        expect(s.hand!.actor).toBe(1);
        s = moves(s, R(500));
        const r = host(s, {op: 'kick', pid: 'p1'});
        expect(r.ok && r.kicked).toBe('p1');
        s = ok(r);
        expect(s.seats[1]).toMatchObject({leaving: true, away: true, removed: true});
        expect(s.hand!.seats.find((p) => p.seat === 1)!.folded).toBe(false);
        s = moves(s, F, F);
        const result = s.hand!.result!;
        expect(result.refund).toEqual({seat: 1, amount: 500});
        expect(result.pots).toEqual([{amount: 60, eligible: [1], winners: [1], shares: [60]}]);
        expect(s.seats[1]).toBeNull();
        expect(events(s, 1).slice(-1)).toEqual([['removed', 1040]]);
        checkInvariants(s);
    });

    it('a buy waiting on a leaving seat is dropped, not bought and cashed out', () => {
        let s = deal(three([1000, 1000, 1000], {buyInMin: 200, buyInMax: 2000}));
        s = play(s, buy(s, 2, 500));
        expect(s.seats[2]!.pendingBuy).toBe(500);
        s = play(s, by(s, 'leave', 2));
        expect(s.seats[2]!.pendingBuy).toBe(0);
        s = moves(s, C, X);
        s = moves(s, X, X, X, X, X, X);
        expect(events(s, 2)).toEqual([['buy-in', 1000], ['cash-out', 1000]]);
        expect(ledgerRow(s, 'p2')).toMatchObject({bought: 1000, cashedOut: 1000, buys: 0});
    });

    it('a buy waiting when the host ends is dropped, and no request is approved once the table is closing', () => {
        let s = deal(three([1000, 1000, 1000], {buyInMin: 100, buyInMax: 2000}));
        s = play(s, buy(s, 2, 500));
        expect(s.seats[2]!.pendingBuy).toBe(500);
        s = ok(host(s, {op: 'end'}));
        expect(s.seats[2]!.pendingBuy).toBe(0);
        s = moves(s, F, F);
        expect(s.status).toBe('closed');
        expect(events(s, 2)).toEqual([['buy-in', 1000], ['cash-out', 1000]]);
        expect(ledgerRow(s, 'p2')).toMatchObject({bought: 1000, cashedOut: 1000, buys: 0});

        let a = deal(three([1000, 1000, 1000], {rebuys: 'approve', buyInMin: 100, buyInMax: 2000}));
        a = play(a, buy(a, 2, 500));
        expect(a.requests).toHaveLength(1);
        a = ok(host(a, {op: 'end'}));
        expect(a.requests).toEqual([]);
        expect(host(a, {op: 'approve', pid: 'p2'})).toEqual({ok: false, reason: 'not-now'});
        a = moves(a, F, F);
        expect(a.status).toBe('closed');
        expect(events(a, 2)).toEqual([['buy-in', 1000], ['cash-out', 1000]]);
        expect(ledgerRow(a, 'p2')).toMatchObject({bought: 1000, cashedOut: 1000, buys: 0});
    });
});

describe('posting to play', () => {
    const seatFour = (s: TableState, seat: number, pid = pidOf(seat)): TableState => play(s, {type: 'sit', by: pid, seat, buyIn: 2000, at: nowOf(s)});
    const posts = (s: TableState) => said(s).filter((line) => /blind|post|ante/.test(line));

    it('a player who sat down during a hand posts a big blind when dealt in, and keeps the option', () => {
        let s = deal(three([2000, 2000, 2000]));
        s = seatFour(s, 3);
        expect(s.seats[3]).toMatchObject({owesPost: true, stack: 2000});
        s = moves(s, F, F);
        s = deal(s);
        expect([s.hand!.button, s.hand!.smallBlindSeat, s.hand!.bigBlindSeat]).toEqual([0, 1, 2]);
        expect(posts(s)).toEqual(['1:small-blind 10', '2:big-blind 20', '3:post 20']);
        expect(s.seats[3]!.owesPost).toBe(false);
        expect(s.hand!.seats.find((p) => p.seat === 3)!.actedAtBet).toBeNull();
    });

    it('landing in the big blind posts just the big blind', () => {
        let s = deal(table({0: 2000, 1: 2000, 2: 2000}, {lastBigBlind: 1}));
        s = seatFour(s, 3);
        s = moves(s, F, F);
        s = deal(s);
        expect(s.hand!.bigBlindSeat).toBe(3);
        expect(posts(s)).toEqual(['2:small-blind 10', '3:big-blind 20']);
    });

    it('landing in the small blind posts a full big blind instead', () => {
        let s = deal(table({0: 2000, 1: 2000, 2: 2000, 3: 2000}, {lastBigBlind: 1}));
        s = moves(s, F, F, F);
        s = play(s, by(s, 'leave', 2));
        s = seatFour(s, 2, 'p9');
        s = deal(s);
        expect([s.hand!.smallBlindSeat, s.hand!.bigBlindSeat]).toEqual([2, 3]);
        expect(posts(s)).toEqual(['2:post 20', '3:big-blind 20']);
    });

    it('a fresh start posts nothing extra; a sit-out taken back before the deal owes nothing', () => {
        let s = createTable({hostPid: 'p0', at: T0});
        for (const seat of [0, 1, 2]) s = seatFour(s, seat);
        s = ok(host(s, {op: 'start'}));
        expect(s.nextHandAt).toBe(T0 + TIMING.START_DELAY_MS);
        s = deal(s);
        expect(posts(s).length).toBe(2);
        expect(s.seats.slice(0, 3).every((seat) => !seat!.owesPost)).toBe(true);
        s = play(s, by(s, 'sit-out', 1));
        expect(s.seats[1]).toMatchObject({sitOutNext: true, sittingOut: false});
        s = play(s, by(s, 'sit-in', 1));
        while (s.hand!.phase === 'betting') s = moves(s, F);
        s = deal(s);
        expect(posts(s).length).toBe(2);
        expect(s.hand!.seats.length).toBe(3);
    });
});

describe('the blinds past busted seats', () => {
    it('skips a busted big blind, and the rebuy that missed a hand posts from the button', () => {
        let s = deal(table({0: 2000, 1: 2000, 2: 500, 3: 2000}, {config: {buyInMax: 2000}, lastBigBlind: 1}), {holes: {0: 'AhAd', 2: '7c2d'}, board: 'KsQsJd5h4c'});
        // Seat 3 folds, the button (0) puts seat 2 all in; the small blind folds.
        s = moves(s, F, R(500), F, C);
        s = runOut(s);
        expect(s.seats[2]!.stack).toBe(0);
        s = deal(s);
        expect([s.hand!.button, s.hand!.smallBlindSeat, s.hand!.bigBlindSeat]).toEqual([0, 1, 3]);
        expect(s.seats[2]!.owesPost).toBe(true);
        s = moves(s, F, F);
        s = play(s, buy(s, 2, 2000));
        expect(events(s, 2).slice(-1)).toEqual([['rebuy', 2000]]);
        s = deal(s);
        expect([s.hand!.button, s.hand!.smallBlindSeat, s.hand!.bigBlindSeat]).toEqual([2, 3, 0]);
        expect(said(s).filter((line) => line.includes('post'))).toEqual(['2:post 20']);
    });
});

describe('timeouts and away', () => {
    it('checks or folds when time runs out; enough in a row and the player is away, then sat out until back', () => {
        let s = deal(three(), {});
        expect(s.hand!.actor).toBe(2);
        expect(reduce(s, {...timeoutOf(s), at: s.hand!.deadline! + TIMING.TURN_GRACE_MS - 1})).toEqual({ok: false, reason: 'not-due'});
        expect(reduce(s, {...timeoutOf(s), turn: s.turn - 1})).toEqual({ok: false, reason: 'stale'});
        s = play(s, timeoutOf(s));
        expect(said(s).slice(-1)).toEqual(['2:fold (timeout)']);
        expect(s.seats[2]!.timeouts).toBe(1);
        s = moves(s, F);
        s = deal(s);
        // Seat 2 is the big blind now. Seat 1's time runs out (a fold), then seat 2's (a check, its
        // second in a row): away, as sitOutAfter is 2.
        s = moves(s, C);
        expect(s.hand!.actor).toBe(1);
        s = play(s, timeoutOf(s));
        expect(s.seats[1]!.timeouts).toBe(1);
        expect(s.hand!.actor).toBe(2);
        s = play(s, timeoutOf(s));
        expect(s.seats[2]).toMatchObject({timeouts: 2, away: true});
        // Away: it checks for itself at once on the flop, and on every street after, with nobody waiting on it.
        expect(said(s).slice(-2)).toEqual(['2:check (timeout)', '2:check (auto)']);
        s = moves(s, X, X);
        expect(said(s).slice(-2)).toEqual(['0:check', '2:check (auto)']);
        while (s.hand!.phase === 'betting') s = moves(s, X);
        s = deal(s);
        expect(s.seats[2]).toMatchObject({sittingOut: true, away: true});
        expect(s.hand!.seats.map((p) => p.seat)).not.toContain(2);
        s = play(s, by(s, 'sit-in', 2));
        expect(s.seats[2]).toMatchObject({sittingOut: false, away: false, timeouts: 0, owesPost: true});
    });

    it('a move of their own resets the count', () => {
        let s = deal(three());
        s = play(s, timeoutOf(s));
        expect(s.seats[2]!.timeouts).toBe(1);
        s = moves(s, F);
        s = deal(s);
        s = moves(s, C, C, X);
        expect(s.seats[2]!.timeouts).toBe(0);
    });
});

describe('rebuys', () => {
    it('off: no buys and no sitting down again; a busted seat is cashed out at the end of the hand', () => {
        let s = deal(three([1000, 1000, 500], {rebuys: 'off', buyInMax: 2000}), {holes: {0: 'AhAd', 2: '7c2d'}, board: 'KsQsJd5h4c'});
        expect(reduce(s, buy(s, 0, 100))).toEqual({ok: false, reason: 'rebuys-off'});
        s = moves(s, A, C, F);
        s = runOut(s);
        expect(s.seats[2]).toBeNull();
        expect(events(s, 2)).toEqual([['buy-in', 500], ['cash-out', 0]]);
        expect(reduce(s, {type: 'sit', by: 'p2', seat: 2, buyIn: 1000, at: nowOf(s)})).toEqual({ok: false, reason: 'rebuys-off'});
    });

    it('auto: a buy lands between hands, and waits as pending during one, clamped to the cap when it lands', () => {
        let s = three([1000, 300, 1000], {buyInMin: 200, buyInMax: 2000});
        s = play(s, buy(s, 2, 500));
        expect(s.seats[2]!.stack).toBe(1500);
        expect(events(s, 2).slice(-1)).toEqual([['top-up', 500]]);
        expect(reduce(s, buy(s, 2, 501))).toEqual({ok: false, reason: 'over-cap'});
        s = deal(s, {holes: {0: 'AhAd', 1: '7c2d', 2: '8c3d'}, board: 'KsQsJd5h4c'});
        s = play(s, buy(s, 1, 1000));
        expect(s.seats[1]).toMatchObject({stack: 280, pendingBuy: 1000});
        expect(ledgerRow(s, 'p1')!.bought).toBe(300);
        s = play(s, buy(s, 0, 1000));
        s = moves(s, F, R(300), C);
        s = runOut(s);
        // Seat 0 won 600 (990 − 290 + 600 = 1,300): its pending 1,000 lands only up to the cap.
        expect(s.seats[0]!.stack).toBe(2000);
        expect(events(s, 0).slice(-1)).toEqual([['top-up', 700]]);
        // Seat 1 lost it all: its 1,000 lands as a rebuy.
        expect(s.seats[1]).toMatchObject({stack: 1000, pendingBuy: 0});
        expect(events(s, 1).slice(-1)).toEqual([['rebuy', 1000]]);
        checkInvariants(s);
    });

    it('approve: a request the host approves or declines; the host\'s own buys need nobody', () => {
        let s = three([1000, 1000, 1000], {rebuys: 'approve', buyInMin: 200, buyInMax: 2000});
        s = play(s, buy(s, 1, 300));
        s = play(s, buy(s, 1, 400));
        expect(s.requests).toEqual([{pid: 'p1', amount: 400, at: nowOf(s)}]);
        expect(s.seats[1]!.stack).toBe(1000);
        expect(reduce(s, {type: 'host', by: 'p2', op: {op: 'approve', pid: 'p1'}, at: nowOf(s)})).toEqual({ok: false, reason: 'not-host'});
        s = ok(host(s, {op: 'approve', pid: 'p1'}));
        expect(s.requests).toEqual([]);
        expect(s.seats[1]!.stack).toBe(1400);
        expect(host(s, {op: 'approve', pid: 'p1'})).toEqual({ok: false, reason: 'no-request'});
        s = play(s, buy(s, 2, 100));
        s = ok(host(s, {op: 'deny', pid: 'p2'}));
        expect(s.requests).toEqual([]);
        s = play(s, buy(s, 0, 100));
        expect(s.seats[0]!.stack).toBe(1100);
        // Sitting down again asks too: seated with nothing until the host approves.
        s = play(s, by(s, 'leave', 2));
        s = play(s, {type: 'sit', by: 'p2', seat: 5, buyIn: 1500, at: nowOf(s)});
        expect(s.seats[5]).toMatchObject({stack: 0, owesPost: true});
        expect(s.requests).toEqual([{pid: 'p2', amount: 1500, at: nowOf(s)}]);
        s = ok(host(s, {op: 'approve', pid: 'p2'}));
        expect(s.seats[5]!.stack).toBe(1500);
        expect(events(s, 2)).toEqual([['buy-in', 1000], ['cash-out', 1000], ['rebuy', 1500]]);
    });

    it('stops at the rebuy limit and holds a buy between the minimum and the cap', () => {
        let s = three([1000, 1000, 1000], {buyInMin: 800, buyInMax: 2000, maxRebuys: 2});
        expect(reduce(s, buy(s, 0, 0))).toEqual({ok: false, reason: 'bad-amount'});
        expect(reduce(s, buy(s, 0, 1.5))).toEqual({ok: false, reason: 'bad-amount'});
        s = play(s, buy(s, 0, 100), buy(s, 0, 100));
        expect(reduce(s, buy(s, 0, 100))).toEqual({ok: false, reason: 'rebuy-cap'});
        s.seats[1]!.stack = 0;
        s.ledger.find((r) => r.pid === 'p1')!.bought = 0;
        expect(reduce(s, buy(s, 1, 700))).toEqual({ok: false, reason: 'below-buy-in'});
        expect(reduce(s, buy(s, 9, 700))).toEqual({ok: false, reason: 'not-seated'});
    });
});

describe('the host', () => {
    it('refuses every operation from anyone else', () => {
        const s = three();
        for (const op of [{op: 'pause'}, {op: 'end'}, {op: 'config', patch: {turnSeconds: 60}}, {op: 'kick', pid: 'p2'}] as const) {
            expect(reduce(s, {type: 'host', by: 'p1', op, at: T0})).toEqual({ok: false, reason: 'not-host'});
        }
    });

    it('pauses (the hand plays on, no new one is dealt) and resumes after a short delay', () => {
        let s = deal(three());
        s = ok(host(s, {op: 'pause'}));
        expect(s.status).toBe('paused');
        s = moves(s, F, F);
        const at = s.hand!.result!.completedAt;
        expect(reduce(s, {type: 'start-hand', deck: [], draw: 0, at})).toEqual({ok: false, reason: 'bad-deck'});
        expect(host(s, {op: 'pause'})).toEqual({ok: false, reason: 'not-now'});
        s = ok(host(s, {op: 'resume'}, at + 60_000));
        expect(s.status).toBe('playing');
        expect(s.nextHandAt).toBe(at + 60_000 + TIMING.START_DELAY_MS);
    });

    it('ends: at once between hands, or when the live hand completes, everyone cashed out', () => {
        let s = deal(three());
        s = ok(host(s, {op: 'end'}));
        expect(s).toMatchObject({closing: true, status: 'playing'});
        const again = host(s, {op: 'end'});
        expect(again.ok && again.state).toBe(s);
        s = moves(s, F, F);
        expect(s.status).toBe('closed');
        expect(s.seats.every((seat) => seat === null)).toBe(true);
        expect(conservation(s)).toMatchObject({stacks: 0, cashedOut: 3000, ok: true});
        expect(reduce(s, by(s, 'sit-in', 0))).toEqual({ok: false, reason: 'closed'});
        const quiet = ok(host(three(), {op: 'end'}));
        expect(quiet.status).toBe('closed');
    });

    it('changes the config from the next hand, refusing one out of limits or a new seat count', () => {
        let s = deal(three());
        expect(host(s, {op: 'config', patch: {bigBlind: 5}})).toEqual({ok: false, reason: 'bad-config'});
        expect(host(s, {op: 'config', patch: {seats: 9} as never})).toEqual({ok: false, reason: 'bad-config'});
        expect(host(s, {op: 'config', patch: {turnSeconds: 10}})).toEqual({ok: false, reason: 'bad-config'});
        s = ok(host(s, {op: 'config', patch: {smallBlind: 25, bigBlind: 50}}));
        expect(s.configV).toBe(2);
        expect(s.hand!.bigBlind).toBe(20);
        const same = host(s, {op: 'config', patch: {bigBlind: 50}});
        expect(same.ok && same.state).toBe(s);
        s = moves(s, F, F);
        s = deal(s);
        expect(s.hand!.bigBlind).toBe(50);
        expect(said(s).slice(0, 2)).toEqual(['1:small-blind 25', '2:big-blind 50']);
    });

    it('changes the room settings at once', () => {
        let s = deal(three());
        s = ok(host(s, {op: 'settings', patch: {scene: 'deep-space', name: 'Friday'}}));
        expect(s.settings).toMatchObject({scene: 'deep-space', name: 'Friday', felt: 'emerald'});
        expect(host(s, {op: 'settings', patch: {scene: 'moon' as never}})).toEqual({ok: false, reason: 'bad-config'});
        const same = host(s, {op: 'settings', patch: {name: 'Friday'}});
        expect(same.ok && same.state).toBe(s);
    });

    it('removes a player between hands at once, a watcher by name only, and never themself', () => {
        let s = three();
        s = play(s, buy(s, 1, 0 + 1000));
        const r = host(s, {op: 'kick', pid: 'p1'});
        expect(r.ok && r.kicked).toBe('p1');
        s = ok(r);
        expect(s.seats[1]).toBeNull();
        expect(events(s, 1).slice(-1)).toEqual([['removed', 2000]]);
        const watcher = host(s, {op: 'kick', pid: 'w1'});
        expect(watcher.ok && watcher.state === s && watcher.kicked).toBe('w1');
        expect(host(s, {op: 'kick', pid: 'p0'})).toEqual({ok: false, reason: 'illegal'});
    });

    it('closes a table by force, calling off the live hand: every chip in it goes back', () => {
        let s = deal(three());
        s = moves(s, R(100), C);
        const closed = forceClose(deepFreeze(s), nowOf(s));
        expect(closed.status).toBe('closed');
        expect(said(closed).slice(-1)).toEqual(['-1:void 220']);
        expect(conservation(closed)).toMatchObject({cashedOut: 3000, ok: true});
        expect(closed.ledger.map((r) => r.cashedOut)).toEqual([1000, 1000, 1000]);
        expect(forceClose(closed, nowOf(s))).toBe(closed);
    });
});

describe('showing cards', () => {
    it('lets any dealt player show in the pause, folded or not, once, and records it for history', () => {
        let s = deal(three(), {holes: {0: 'AhAd', 1: 'KhKd', 2: 'QhQd'}});
        expect(reduce(s, by(s, 'show', 0))).toEqual({ok: false, reason: 'not-now'});
        s = moves(s, F, F);
        const r = reduce(s, by(s, 'show', 2));
        expect(r.ok && r.hands.length).toBe(1);
        s = ok(r);
        expect(s.hand!.result!.hands).toEqual([{seat: 2, cards: [42, 41], value: null, best: []}]);
        expect(said(s).slice(-1)).toEqual(['2:show']);
        const again = reduce(s, by(s, 'show', 2));
        expect(again.ok && again.state).toBe(s);
        s = play(s, by(s, 'show', 1));
        expect(s.hand!.seats.filter((p) => p.shown).map((p) => p.seat)).toEqual([1, 2]);
        expect(reduce(s, {type: 'show', by: 'p7', at: nowOf(s)})).toEqual({ok: false, reason: 'not-seated'});
    });
});

describe('no-ops', () => {
    it('hand back the very state they were given', () => {
        const s = deepFreeze(deal(three()));
        const same = (action: TableAction) => {
            const r = reduce(s, action);
            expect(r.ok && r.state).toBe(s);
        };
        same(by(s, 'sit-in', 0));
        same({type: 'pre', by: 'p1', pre: null, at: nowOf(s)});
        const out = ok(reduce(s, by(s, 'sit-out', 0)));
        expect(ok(reduce(out, by(out, 'sit-out', 0)))).toBe(out);
        const leaving = ok(reduce(s, by(s, 'leave', 0)));
        expect(ok(reduce(leaving, by(leaving, 'leave', 0)))).toBe(leaving);
    });

    it('never mutate their input, refused or not', () => {
        const s = deepFreeze(deal(three()));
        expect(reduce(s, actBy(s, 'p0', C)).ok).toBe(false);
        expect(reduce(s, actBy(s, 'p2', R(60))).ok).toBe(true);
        expect(reduce(s, {type: 'host', by: 'p0', op: {op: 'kick', pid: 'p2'}, at: nowOf(s)}).ok).toBe(true);
    });
});

describe('seeded nights', () => {
    it('keep every invariant, refuse no legal move, and replay to the same state', () => {
        let hands = 0;
        for (let seed = 1; seed <= 40; seed++) {
            let last: TableState | null = null;
            for (const {state, action, refused} of randomNight(seed, 800)) {
                if (action !== 'clock' && action.type === 'act') expect(refused, `seed ${seed}`).toBeNull();
                checkInvariants(state);
                last = state;
            }
            hands += last!.handNo;
            const replay = [...randomNight(seed, 800)].pop()!.state;
            expect(replay).toEqual(last);
        }
        expect(hands).toBeGreaterThan(300);
    });
});
