// The lazy clock: what comes due in each phase and when, advance firing one event and stopping
// (every new deadline counts from now, so a table left alone for an hour resumes with one timeout,
// not a string of ghost hands), a new hand taking exactly one deck and one draw, one run-out street
// per due step, the grace on a turn's deadline, the slack any writer but the actor waits before
// timing a turn out (and the mirror the leader's tick is armed by), and a move that arrived in time
// winning against a timeout that fell due while it was being processed.

import {describe, expect, it} from 'vitest';
import {advance, dueFor, nextDue, nextDueAt} from '@/lib/poker-night/clock';
import {TIMING} from '@/lib/poker-night/config';
import {FULL_DECK} from '@/lib/poker-night/deck';
import {reduce} from '@/lib/poker-night/engine';
import type {DeckSource, TableState} from '@/lib/poker-night/types';
import {A, C, F, actBy, deal, deepFreeze, host, moves, nowOf, ok, pidOf, play, table} from './fixtures';

const GRACE = TIMING.TURN_GRACE_MS;

// A deck source that counts what it is asked for.
const counting = () => {
    const calls = {deck: 0, draw: 0};
    const source: DeckSource = {
        deck: () => {
            calls.deck++;
            return [...FULL_DECK];
        },
        draw: () => {
            calls.draw++;
            return 7;
        },
    };
    return {source, calls};
};

const three = (): TableState => table({0: 1000, 1: 1000, 2: 1000}, {lastBigBlind: 0});

describe('nextDue', () => {
    it('is the actor\'s deadline plus the grace while betting', () => {
        const s = deal(three());
        expect(nextDue(s)).toEqual({kind: 'timeout', at: s.hand!.deadline! + GRACE, turn: s.turn});
        // A tick times the turn out only once the slack is past too: that is the mirror's time.
        expect(nextDueAt(s)).toBe(s.hand!.deadline! + GRACE + TIMING.TIMEOUT_SLACK_MS);
    });

    it('waits the slack longer for any writer but the actor, and only for a turn\'s timeout', () => {
        const s = deal(three());
        const actor = s.seats[s.hand!.actor!]!.pid;
        const other = s.seats.find((seat) => seat && seat.pid !== actor)!.pid;
        const at = s.hand!.deadline! + GRACE;
        expect(dueFor(s, null)?.at).toBe(at);
        expect(dueFor(s, {pid: actor})?.at).toBe(at);
        expect(dueFor(s, {pid: other})?.at).toBe(at + TIMING.TIMEOUT_SLACK_MS);
        expect(dueFor(s, {pid: null})?.at).toBe(at + TIMING.TIMEOUT_SLACK_MS);
        // At the turn\'s own time the actor\'s request times them out; anyone else\'s leaves it.
        expect(advance(s, at, counting().source, {pid: actor}).steps).toBe(1);
        expect(advance(s, at + TIMING.TIMEOUT_SLACK_MS - 1, counting().source, {pid: other}).state).toBe(s);
        expect(advance(s, at + TIMING.TIMEOUT_SLACK_MS, counting().source, {pid: other}).steps).toBe(1);
        // A run-out street and a deal are due at their own times for every writer.
        const runout = moves(deal(three()), A, A, A);
        expect(dueFor(runout, {pid: null})).toEqual(nextDue(runout));
        const between = moves(deal(three()), F, F);
        expect(dueFor(between, {pid: null})).toEqual(nextDue(between));
        expect(nextDueAt(between)).toBe(between.nextHandAt);
    });

    it('is the next street during a run-out', () => {
        const s = moves(deal(three()), A, A, A);
        expect(s.hand!.phase).toBe('runout');
        expect(nextDue(s)).toEqual({kind: 'street', at: s.hand!.nextStreetAt});
    });

    it('is the next deal between hands, only while playing with two eligible seats and not closing', () => {
        const done = moves(deal(three()), F, F);
        expect(nextDue(done)).toEqual({kind: 'start', at: done.nextHandAt});
        expect(nextDue(ok(host(done, {op: 'pause'})))).toBeNull();
        expect(nextDue({...done, closing: true})).toBeNull();
        expect(nextDue(play(done, {type: 'leave', by: pidOf(0), at: nowOf(done)}, {type: 'leave', by: pidOf(1), at: nowOf(done)}))).toBeNull();
        expect(nextDue({...three(), status: 'open'})).toBeNull();
        expect(nextDue(ok(host(done, {op: 'end'})))).toBeNull();
    });
});

describe('advance', () => {
    it('hands back the same state when nothing is due', () => {
        const s = deal(three());
        const {source, calls} = counting();
        const r = advance(s, s.hand!.deadline! + GRACE - 1, source);
        expect(r.state).toBe(s);
        expect(r).toMatchObject({hands: [], ledgerDirty: false, steps: 0});
        expect(calls).toEqual({deck: 0, draw: 0});
    });

    it('fires one timeout and stops: the next deadline counts from now, so an hour away is one timeout', () => {
        const s = deepFreeze(deal(three()));
        const now = s.hand!.deadline! + 3_600_000;
        const r = advance(s, now, counting().source);
        expect(r.steps).toBe(1);
        expect(r.state.hand!.actor).toBe(0);
        expect(r.state.hand!.deadline).toBe(now + s.config.turnSeconds * 1000);
        expect(r.state.handNo).toBe(1);
        expect(r.state.seats[2]!.timeouts).toBe(1);
    });

    it('returns the hand a timeout completes, and marks the ledger', () => {
        let s = deal(three());
        s = moves(s, F);
        const r = advance(s, s.hand!.deadline! + GRACE, counting().source);
        expect(r.steps).toBe(1);
        expect(r.hands.map((h) => h.no)).toEqual([1]);
        expect(r.ledgerDirty).toBe(true);
    });

    it('deals a new hand with exactly one deck and one draw', () => {
        const s = moves(deal(three()), F, F);
        const {source, calls} = counting();
        const r = advance(s, s.nextHandAt!, source);
        expect(r.steps).toBe(1);
        expect(calls).toEqual({deck: 1, draw: 1});
        expect(r.state.handNo).toBe(2);
        expect(r.state.hand!.phase).toBe('betting');
    });

    it('turns one run-out street per due step', () => {
        const s = moves(deal(three()), A, A, A);
        let r = advance(s, s.hand!.nextStreetAt!, counting().source);
        expect([r.steps, r.state.hand!.boards[0].length]).toEqual([1, 3]);
        r = advance(r.state, r.state.hand!.nextStreetAt! + 10_000, counting().source);
        expect([r.steps, r.state.hand!.boards[0].length]).toEqual([1, 4]);
    });

    it('stops at a step the engine refuses', () => {
        const s = moves(deal(three()), F, F);
        const r = advance(s, s.nextHandAt!, {deck: () => [], draw: () => 0});
        expect(r.state).toBe(s);
        expect(r.steps).toBe(0);
    });
});

describe('the grace on a deadline', () => {
    it('takes a move up to 1,999 ms past the deadline and refuses it at 2,000, when the timeout is due', () => {
        const s = deal(three());
        const deadline = s.hand!.deadline!;
        expect(reduce(s, actBy(s, pidOf(2), C, deadline + GRACE - 1)).ok).toBe(true);
        expect(reduce(s, actBy(s, pidOf(2), C, deadline + GRACE))).toEqual({ok: false, reason: 'stale'});
        expect(nextDue(s)!.at).toBe(deadline + GRACE);
    });

    it('lets a move that arrived in time win against a timeout that fell due while it was processed', () => {
        const s = deal(three());
        const receivedAt = s.hand!.deadline! + GRACE - 500;
        const now = s.hand!.deadline! + GRACE + 3000;
        // The room advances the clock to the moment the request arrived, applies it, then to now.
        const before = advance(s, receivedAt, counting().source);
        expect(before.state).toBe(s);
        const acted = ok(reduce(before.state, actBy(s, pidOf(2), C, receivedAt)));
        const after = advance(acted, now, counting().source);
        expect(after.state).toBe(acted);
        expect(acted.hand!.log[acted.hand!.log.length - 1].slice(0, 3)).toEqual([2, 6, 20]);
        // Advanced to now first, the timeout would have folded seat 2 and the move gone stale.
        const late = advance(s, now, counting().source).state;
        expect(reduce(late, actBy(s, pidOf(2), C, receivedAt))).toEqual({ok: false, reason: 'stale'});
    });
});

describe('a game this deploy does not deal', () => {
    it('waits between hands, its config intact, and nothing falls due until the host picks one it does', () => {
        let s = moves(deal(table({0: 1000, 1: 1000, 2: 1000}, {lastBigBlind: 0})), F, F);
        expect(nextDue(s)?.kind).toBe('start');
        // As a state written by a later deploy (a rollback) may hold it.
        s = {...s, config: {...s.config, variant: 'plo'}};
        expect(nextDue(s)).toBeNull();
        expect(reduce(s, {type: 'start-hand', deck: [...FULL_DECK], draw: 0, at: s.nextHandAt!}).ok).toBe(true);
        const r = reduce(s, {type: 'start-hand', deck: [...FULL_DECK], draw: 0, at: s.nextHandAt!});
        expect(r.ok && r.state.handNo).toBe(s.handNo);
        expect(r.ok && r.state.nextHandAt).toBeNull();
        s = ok(host(s, {op: 'config', patch: {variant: 'holdem'}}));
        expect(s.config).toMatchObject({variant: 'holdem', boards: 1});
        expect(nextDue(s)?.kind).toBe('start');
    });
});
