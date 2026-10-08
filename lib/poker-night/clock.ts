// The table's clock, run lazily: nothing wakes on a timer on the server. Every POST advances the
// clock to the moment it arrived before its own step and to now after it, and the clock leader's
// tick (POST tick) advances it alone; a GET or a page render never does. Pure.
//
// Three things come due — the actor's time running out (after the deadline's grace), the next
// street of an all-in run-out, the next deal — and each is applied with at = now, so every new
// deadline counts from now: a table nobody watched picks up in real time instead of playing out
// hands no one saw.
//
// A turn's timeout is judged by who is running the clock. The actor's own request judges it by the
// turn's own time (the deadline's grace), so a move that arrived after it is late. Any other writer
// — the clock leader's tick, another player's step, a join — applies it TIMING.TIMEOUT_SLACK_MS
// later, so a move that arrived in time and is still on its way to the room's compare-and-set lands
// before a timeout another request could commit first. With no writer named, the engine's own rule
// (the grace alone) applies: what the tests and the simulator replay.

import {dealable, TIMING} from '@/lib/poker-night/config';
import type {DeckSource} from '@/lib/poker-night/deck';
import {reduce} from '@/lib/poker-night/engine';
import {eligibleSeats, isLive} from '@/lib/poker-night/seats';
import type {Due, HandSummary, TableAction, TableState} from '@/lib/poker-night/types';

export type {DeckSource};

export const nextDue = (state: TableState): Due | null => {
    if (state.status === 'closed') return null;
    const hand = state.hand;
    if (isLive(hand)) {
        if (hand.phase === 'betting' && hand.actor !== null && hand.deadline !== null) {
            return {kind: 'timeout', at: hand.deadline + TIMING.TURN_GRACE_MS, turn: state.turn};
        }
        if (hand.phase === 'runout' && hand.nextStreetAt !== null) return {kind: 'street', at: hand.nextStreetAt};
        return null;
    }
    if (state.status === 'playing' && !state.closing && state.nextHandAt !== null && eligibleSeats(state).length >= 2 && dealable(state.config)) {
        return {kind: 'start', at: state.nextHandAt};
    }
    return null;
};

// Who runs the clock: the requester's pid (null for a tick or a join, whose writer is no actor).
export type ClockWriter = {pid: string | null};

const actorOf = (state: TableState): string | null => {
    const hand = state.hand;
    if (!isLive(hand) || hand.actor === null) return null;
    return hand.seats.find((p) => p.seat === hand.actor)?.pid ?? null;
};

// What is due next as `writer` applies it: a turn's timeout TIMING.TIMEOUT_SLACK_MS later for any
// writer but the actor; everything else as nextDue says.
export const dueFor = (state: TableState, writer: ClockWriter | null): Due | null => {
    const due = nextDue(state);
    if (writer === null || due === null || due.kind !== 'timeout' || (writer.pid !== null && writer.pid === actorOf(state))) return due;
    return {...due, at: due.at + TIMING.TIMEOUT_SLACK_MS};
};

// The room's mirror of the next due time (PokerRoom.nextDueAt and every view): when a tick finds it
// due, so the clock leader's tick is armed for then.
export const nextDueAt = (state: TableState): number | null => dueFor(state, {pid: null})?.at ?? null;

// Applies what is due by `now` as `writer` judges it (dueFor; none: the engine's own rule), at most
// MAX_CLOCK_STEPS events. A new hand takes exactly one deck and one draw from the source. Hands back
// the same state reference when nothing was due.
export const advance = (
    state: TableState, now: number, source: DeckSource, writer: ClockWriter | null = null,
): {state: TableState; hands: HandSummary[]; ledgerDirty: boolean; steps: number} => {
    let current = state;
    const hands: HandSummary[] = [];
    let ledgerDirty = false;
    let steps = 0;
    while (steps < TIMING.MAX_CLOCK_STEPS) {
        const due = dueFor(current, writer);
        if (!due || due.at > now) break;
        const action: TableAction = due.kind === 'timeout' ? {type: 'timeout', turn: due.turn, at: now}
            : due.kind === 'street' ? {type: 'deal-street', at: now}
            : {type: 'start-hand', deck: source.deck(), draw: source.draw(), at: now};
        const r = reduce(current, action);
        if (!r.ok) break;
        current = r.state;
        hands.push(...r.hands);
        ledgerDirty = ledgerDirty || r.ledgerDirty;
        steps++;
    }
    return {state: current, hands, ledgerDirty, steps};
};
