// The betting rules on named hands: the minimum raise, short all-ins that reopen nobody until they
// add up to a full raise (the TDA rule), the checker facing an under-minimum opening all-in (the
// friendlier reading: they may raise; a caller of a full bet facing a later short all-in only
// calls), bets under the big blind, stacks short of a raise, no raise against all-in opponents, the
// call capped at what a short big blind put in, the big blind's option and a poster's, every
// pre-action, and the refusals a stale or wrong move meets.

import {describe, expect, it} from 'vitest';
import {legalFor, owed, snapshotFromState} from '@/lib/poker-night/betting';
import {TIMING} from '@/lib/poker-night/config';
import {reduce} from '@/lib/poker-night/engine';
import type {GameConfig, Legal, PreAction, TableState} from '@/lib/poker-night/types';
import {A, C, F, R, X, actBy, actorPid, deal, moves, nowOf, ok, pidOf, table} from './fixtures';

const legal = (s: TableState): Legal => legalFor(snapshotFromState(s), s.hand!.actor!)!;

// Four players, blinds 50/100: the button in seat 0, the blinds in 1 and 2, seat 3 first to act.
const four = (stacks: [number, number, number, number] = [10_000, 10_000, 10_000, 10_000]) =>
    deal(table({0: stacks[0], 1: stacks[1], 2: stacks[2], 3: stacks[3]}, {config: {smallBlind: 50, bigBlind: 100, buyInMin: 100, buyInMax: 50_000}, lastBigBlind: 1}));

// Everyone in for 100 and on the flop, seat 1 first to act.
const flop = (stacks?: [number, number, number, number]) => moves(four(stacks), C, C, C, X);

const pre = (s: TableState, seat: number, p: PreAction | null) => reduce(s, {type: 'pre', by: pidOf(seat), pre: p, at: nowOf(s)});

describe('the minimum raise', () => {
    it('is the current bet plus the last full raise: after a raise to 300 over a 100 big blind, 500', () => {
        let s = four();
        expect(s.hand!.actor).toBe(3);
        expect(legal(s)).toEqual({fold: true, check: false, call: 100, callAllIn: false, raise: {kind: 'raise', min: 200, max: 10_000}});
        s = moves(s, R(300));
        expect(legal(s).raise).toEqual({kind: 'raise', min: 500, max: 10_000});
        expect(reduce(s, actBy(s, actorPid(s), R(499))).ok).toBe(false);
        s = moves(s, R(500));
        expect(legal(s).raise!.min).toBe(700);
    });

    it('opens postflop at the big blind, as a bet', () => {
        const s = flop();
        expect(s.hand!.actor).toBe(1);
        expect(legal(s)).toEqual({fold: true, check: true, call: 0, callAllIn: false, raise: {kind: 'bet', min: 100, max: 9_900}});
    });
});

describe('short all-ins', () => {
    it('A bets 100, B calls, C is all in for 150: A and B may only call or fold, D may raise from 250', () => {
        let s = flop([10_000, 10_000, 10_000, 250]);
        s = moves(s, R(100), C, A);
        expect(s.hand!.currentBet).toBe(150);
        expect(s.hand!.increment).toBe(100);
        expect(s.hand!.actor).toBe(0);
        expect(legal(s).raise).toEqual({kind: 'raise', min: 250, max: 9_900});
        s = moves(s, C);
        expect(s.hand!.actor).toBe(1);
        expect(legal(s)).toMatchObject({call: 50, raise: null});
        s = moves(s, C);
        expect(legal(s)).toMatchObject({call: 50, raise: null});
    });

    it('cumulative short all-ins of 100 → 150 → 220 add up to a full raise and reopen A, who may raise from 320', () => {
        let s = flop([10_000, 10_000, 250, 320]);
        s = moves(s, R(100), A, A, C);
        expect(s.hand!.currentBet).toBe(220);
        expect(s.hand!.increment).toBe(100);
        expect(s.hand!.actor).toBe(1);
        expect(legal(s)).toMatchObject({call: 120, raise: {kind: 'raise', min: 320, max: 9_900}});
    });

    it('a checker facing an opening all-in under the minimum bet may raise to it plus a big blind (the friendlier reading)', () => {
        let s = flop([10_000, 10_000, 130, 10_000]);
        s = moves(s, X, A);
        expect(s.hand!.currentBet).toBe(30);
        expect(s.hand!.increment).toBe(100);
        expect(legal(s).raise).toEqual({kind: 'raise', min: 130, max: 9_900});
        s = moves(s, C, C);
        // Seat 1 checked, then faced the 30: the literal TDA reading would allow only a call.
        expect(s.hand!.actor).toBe(1);
        expect(legal(s)).toMatchObject({call: 30, raise: {kind: 'raise', min: 130, max: 9_900}});
    });

    it('a player who called a full bet and then faces a short all-in may only call (the TDA reading)', () => {
        let s = flop([10_000, 10_000, 10_000, 250]);
        s = moves(s, X, R(100), A, C);
        // Seat 1 checked and has not acted on the bet: the full bet reopened them.
        expect(s.hand!.actor).toBe(1);
        expect(legal(s).raise).toEqual({kind: 'raise', min: 250, max: 9_900});
        s = moves(s, C);
        // Seat 2 bet 100 and faces 150 now: 50 more, no raise.
        expect(s.hand!.actor).toBe(2);
        expect(legal(s)).toMatchObject({call: 50, raise: null});
    });

    it('a bet under the big blind is all in or nothing', () => {
        let s = flop([10_000, 130, 10_000, 10_000]);
        expect(legal(s).raise).toEqual({kind: 'bet', min: 30, max: 30});
        s = moves(s, X);
        expect(reduce(s, actBy(s, actorPid(s), R(50))).ok).toBe(false);
        expect(reduce(s, actBy(s, actorPid(s), R(50)))).toEqual({ok: false, reason: 'below-min-raise'});
    });

    it('a stack short of the minimum raise can only go all in: min = max', () => {
        let s = flop([10_000, 10_000, 250, 10_000]);
        s = moves(s, R(100));
        expect(legal(s)).toEqual({fold: true, check: false, call: 100, callAllIn: false, raise: {kind: 'raise', min: 150, max: 150}});
    });

    it('opens no raise when every opponent is all in', () => {
        let s = four([10_000, 300, 10_000, 500]);
        s = moves(s, A, F, A);
        expect(s.hand!.actor).toBe(2);
        expect(legal(s)).toEqual({fold: true, check: false, call: 400, callAllIn: false, raise: null});
    });

    it('caps the call at what a short big blind put in once nobody else can act', () => {
        // Seat 2 posts 80 of a 100 big blind; the button folds; the small blind owes 30, not 50.
        let s = deal(table({0: 10_000, 1: 10_000, 2: 80}, {config: {smallBlind: 50, bigBlind: 100, buyInMin: 100, buyInMax: 50_000}, lastBigBlind: 1}));
        expect(s.hand!.currentBet).toBe(100);
        expect(s.hand!.actor).toBe(0);
        s = moves(s, F);
        expect(s.hand!.actor).toBe(1);
        expect(legal(s)).toEqual({fold: true, check: false, call: 30, callAllIn: false, raise: null});
        s = moves(s, C);
        expect(s.hand!.phase).toBe('runout');
        expect(s.hand!.seats.map((p) => p.committed)).toEqual([80, 80, 0]);
    });
});

describe('the option', () => {
    it('gives the big blind a check or a raise after limps', () => {
        const s = moves(four(), C, C, C);
        expect(s.hand!.actor).toBe(2);
        expect(legal(s)).toEqual({fold: true, check: true, call: 0, callAllIn: false, raise: {kind: 'raise', min: 200, max: 10_000}});
    });

    it('gives a player who posted to play the same option', () => {
        let s = table({0: 1000, 1: 1000, 2: 1000, 3: 1000}, {lastBigBlind: 0});
        s.seats[3]!.owesPost = true;
        s = deal(s);
        expect(s.hand!.button).toBe(3);
        expect(s.hand!.seats.find((p) => p.seat === 3)).toMatchObject({streetBet: 20, actedAtBet: null});
        s = moves(s, C);
        expect(s.hand!.actor).toBe(3);
        expect(legal(s)).toEqual({fold: true, check: true, call: 0, callAllIn: false, raise: {kind: 'raise', min: 40, max: 1000}});
        s = moves(s, X, C, X);
        expect(s.hand!.street).toBe('flop');
    });
});

describe('owed', () => {
    it('is what is left to match, capped at what a live opponent can still put in', () => {
        const s = four();
        expect(owed(s.hand!, 3)).toBe(100);
        expect(owed(s.hand!, 1)).toBe(50);
        expect(owed(s.hand!, 2)).toBe(0);
        expect(owed(s.hand!, 7)).toBe(0);
    });
});

describe('pre-actions', () => {
    it('check/fold checks when that is free and folds to a bet', () => {
        let s = flop();
        s = ok(pre(s, 3, {kind: 'check-fold'}));
        s = moves(s, X, X);
        expect(s.hand!.actor).toBe(0);
        expect(s.hand!.seats.find((p) => p.seat === 3)).toMatchObject({folded: false, actedAtBet: 0, pre: null});
        s = ok(pre(s, 3, {kind: 'check-fold'}));
        s = moves(s, R(100), C, C);
        // Seat 3 folded at its turn; the betting closed with three in.
        expect(s.hand!.seats.find((p) => p.seat === 3)!.folded).toBe(true);
        expect(s.hand!.street).toBe('turn');
    });

    it('check is dropped, and the player decides, when a bet came in', () => {
        let s = flop();
        s = ok(pre(s, 3, {kind: 'check'}));
        s = moves(s, X, R(200));
        expect(s.hand!.actor).toBe(3);
        expect(s.hand!.seats.find((p) => p.seat === 3)!.pre).toBeNull();
    });

    it('call N calls while the bet stands and is dropped when it moves', () => {
        let s = flop();
        s = moves(s, R(100));
        s = ok(pre(s, 3, {kind: 'call', amount: 100}));
        s = ok(pre(s, 0, {kind: 'call', amount: 100}));
        expect(pre(s, 0, {kind: 'call', amount: 90})).toEqual({ok: false, reason: 'stale'});
        // Seat 2 calls; seats 3 and 0 call for themselves at their turns and the flop closes.
        s = moves(s, C);
        expect(s.hand!.street).toBe('turn');
        expect(s.hand!.seats.map((p) => p.committed)).toEqual([200, 200, 200, 200]);
        s = moves(s, R(100));
        s = ok(pre(s, 3, {kind: 'call', amount: 100}));
        s = moves(s, R(300));
        // Seat 3 faces 300 now, not the 100 it agreed to: it decides.
        expect(s.hand!.actor).toBe(3);
        expect(s.hand!.seats.find((p) => p.seat === 3)!.pre).toBeNull();
        expect(legal(s).call).toBe(300);
    });

    it('call any calls a raise, and every pre-action clears when the street changes', () => {
        let s = flop();
        s = ok(pre(s, 0, {kind: 'call-any'}));
        s = ok(pre(s, 3, {kind: 'check'}));
        s = moves(s, R(400), C);
        // Seat 3 must decide (its check no longer applies); after its call seat 0 calls any.
        expect(s.hand!.actor).toBe(3);
        s = moves(s, C);
        expect(s.hand!.street).toBe('turn');
        expect(s.hand!.seats.every((p) => p.pre === null)).toBe(true);
    });

    it('is taken only from a live player waiting for their turn, and setting the same one again changes nothing', () => {
        let s = flop();
        expect(pre(s, 1, {kind: 'check'})).toEqual({ok: false, reason: 'not-now'});
        expect(pre(s, 2, {kind: 'call', amount: 100})).toEqual({ok: false, reason: 'illegal'});
        s = ok(pre(s, 2, {kind: 'check-fold'}));
        const again = pre(s, 2, {kind: 'check-fold'});
        expect(again.ok && again.state).toBe(s);
        s = ok(pre(s, 2, null));
        expect(s.hand!.seats.find((p) => p.seat === 2)!.pre).toBeNull();
    });
});

describe('refusals', () => {
    it('refuses a move out of turn, on a stale turn, or after the grace', () => {
        const s = four();
        expect(reduce(s, actBy(s, pidOf(0), C))).toEqual({ok: false, reason: 'not-your-turn'});
        expect(reduce(s, {...actBy(s, pidOf(3), C), turn: s.turn - 1})).toEqual({ok: false, reason: 'stale'});
        expect(reduce(s, actBy(s, pidOf(9), C))).toEqual({ok: false, reason: 'not-seated'});
        const deadline = s.hand!.deadline!;
        expect(reduce(s, actBy(s, pidOf(3), C, deadline + TIMING.TURN_GRACE_MS - 1)).ok).toBe(true);
        expect(reduce(s, actBy(s, pidOf(3), C, deadline + TIMING.TURN_GRACE_MS))).toEqual({ok: false, reason: 'stale'});
    });

    it('refuses an amount that is not a whole number or out of range, and a check or call that is not open', () => {
        const s = four();
        const by = actorPid(s);
        expect(reduce(s, actBy(s, by, R(250.5)))).toEqual({ok: false, reason: 'bad-amount'});
        expect(reduce(s, actBy(s, by, R(10_001)))).toEqual({ok: false, reason: 'bad-amount'});
        expect(reduce(s, actBy(s, by, R(150)))).toEqual({ok: false, reason: 'below-min-raise'});
        expect(reduce(s, actBy(s, by, X))).toEqual({ok: false, reason: 'illegal'});
        const limped = moves(s, C, C, C);
        expect(reduce(limped, actBy(limped, actorPid(limped), C))).toEqual({ok: false, reason: 'illegal'});
        expect(reduce(s, actBy(s, by, {kind: 'shove'} as never))).toEqual({ok: false, reason: 'illegal'});
    });

    it('takes a fold when checking is free (the table asks first)', () => {
        const s = moves(four(), C, C, C);
        expect(reduce(s, actBy(s, actorPid(s), F)).ok).toBe(true);
    });
});

// PLO bets pot limit: a bet or a raise goes at most to the current bet plus the pot after the call —
// every chip committed this hand plus what the player owes — never below the minimum, never past all
// in. The minimum raise and the reopening rules are the no-limit ones.
describe('pot limit (PLO)', () => {
    const plo = (stacks: Record<number, number>, config: Partial<GameConfig> = {}) =>
        deal(table(stacks, {config: {variant: 'plo', smallBlind: 1, bigBlind: 2, buyInMin: 2, buyInMax: 1000, ...config}, lastBigBlind: 1}));
    const deep = (n: number) => Object.fromEntries(Array.from({length: n}, (_, i) => [i, 1000]));

    it('opens at blinds 1/2 to at most 7; facing 7, 24; the small blind facing 7 alone, 23', () => {
        let s = plo(deep(4));
        expect(s.hand!.variant).toBe('plo');
        expect(s.hand!.seats.every((p) => p.hole.length === 4)).toBe(true);
        expect(s.hand!.actor).toBe(3);
        expect(legal(s).raise).toEqual({kind: 'raise', min: 4, max: 7});
        expect(reduce(s, actBy(s, actorPid(s), R(8)))).toEqual({ok: false, reason: 'bad-amount'});
        const facing = moves(s, R(7));
        expect(legal(facing).raise).toEqual({kind: 'raise', min: 12, max: 24});
        s = moves(facing, F);
        expect(s.hand!.actor).toBe(1);
        expect(legal(s)).toEqual({fold: true, check: false, call: 6, callAllIn: false, raise: {kind: 'raise', min: 12, max: 23}});
    });

    it('bets the pot on the flop: 10 into 10, and the raise over it to 40', () => {
        let s = moves(plo(deep(5), {}), C, C, C, C, X);
        expect(s.hand!.street).toBe('flop');
        expect(legal(s).raise).toEqual({kind: 'bet', min: 2, max: 10});
        s = moves(s, R(10));
        expect(legal(s).raise).toEqual({kind: 'raise', min: 20, max: 40});
    });

    it('counts the antes: nine antes of 1 open to 16; a short big blind (1 of 2) to 6', () => {
        const nine = plo(deep(9), {seats: 9, ante: 1});
        expect(legal(nine).raise!.max).toBe(16);
        const short = plo({0: 1000, 1: 1000, 2: 1, 3: 1000});
        expect(short.hand!.seats.find((p) => p.seat === 2)!.allIn).toBe(true);
        expect(short.hand!.currentBet).toBe(2);
        expect(legal(short).raise!.max).toBe(6);
    });

    it('takes all in only within the cap: refused above it, a raise to the cap the way there', () => {
        const s = plo(deep(4));
        expect(reduce(s, actBy(s, actorPid(s), A))).toEqual({ok: false, reason: 'illegal'});
        const capped = moves(s, R(7));
        expect(capped.hand!.currentBet).toBe(7);
        // A stack under the cap goes all in as a raise; one at or under the minimum raise has min = max.
        const short = plo({0: 1000, 1: 1000, 2: 1000, 3: 5});
        expect(legal(short).raise).toEqual({kind: 'raise', min: 4, max: 5});
        expect(moves(short, A).hand!.currentBet).toBe(5);
        const tiny = plo({0: 1000, 1: 1000, 2: 1000, 3: 3});
        expect(legal(tiny).raise).toEqual({kind: 'raise', min: 3, max: 3});
        // Facing a bet as large as the stack, all in is the call.
        const call = plo({0: 2, 1: 1000, 2: 1000, 3: 1000});
        const facing = moves(call, R(7));
        expect(legal(facing)).toMatchObject({call: 2, callAllIn: true, raise: null});
        expect(moves(facing, A).hand!.seats.find((p) => p.seat === 0)!.allIn).toBe(true);
    });

    it('keeps the short all-in rule: a short all-in over a pot bet reopens nobody who acted', () => {
        let s = moves(plo({0: 1000, 1: 1000, 2: 1000, 3: 1000, 4: 17}), C, C, C, C, X);
        // Seat 1 bets the pot (10), seats 2 and 3 call, seat 4 is all in for its last 15: short of a full raise.
        s = moves(s, R(10), C, C, A);
        expect(s.hand!.currentBet).toBe(15);
        expect(s.hand!.actor).toBe(0);
        expect(legal(s).raise).toEqual({kind: 'raise', min: 25, max: 15 + 55 + 15});
        s = moves(s, C);
        expect(s.hand!.actor).toBe(1);
        expect(legal(s)).toMatchObject({call: 5, raise: null});
    });

    it('never offers a raise cap below the minimum or above the stack', () => {
        for (const stacks of [deep(4), {0: 1000, 1: 1000, 2: 1, 3: 1000}, {0: 9, 1: 3, 2: 1000, 3: 4}]) {
            let s = plo(stacks);
            for (let k = 0; k < 12 && s.hand!.phase === 'betting'; k++) {
                const l = legal(s);
                const p = s.hand!.seats.find((q) => q.seat === s.hand!.actor)!;
                if (l.raise) {
                    expect(l.raise.max).toBeGreaterThanOrEqual(l.raise.min);
                    expect(l.raise.max).toBeLessThanOrEqual(p.streetBet + s.seats[p.seat]!.stack);
                }
                s = moves(s, l.raise ? R(l.raise.max) : l.check ? X : C);
            }
        }
    });
});
