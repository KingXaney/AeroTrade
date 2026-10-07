// The table's clock, run lazily: nothing wakes on a timer on the server. Every POST advances the
// clock to the moment it arrived before its own step and to now after it, and the clock leader's
// tick (POST tick) advances it alone; a GET or a page render never does. Pure.
//
// Three things come due — the actor's time running out (after the deadline's grace), the next
// street of an all-in run-out, the next deal — and each is applied with at = now, so every new
// deadline counts from now: a table nobody watched picks up in real time instead of playing out
// hands no one saw.

import {TIMING} from '@/lib/poker-night/config';
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
    if (state.status === 'playing' && !state.closing && state.nextHandAt !== null && eligibleSeats(state).length >= 2) {
        return {kind: 'start', at: state.nextHandAt};
    }
    return null;
};

// The room's mirror of the next due time (PokerRoom.nextDueAt and every view).
export const nextDueAt = (state: TableState): number | null => nextDue(state)?.at ?? null;

// Applies what is due by `now`, at most MAX_CLOCK_STEPS events. A new hand takes exactly one deck
// and one draw from the source. Hands back the same state reference when nothing was due.
export const advance = (state: TableState, now: number, source: DeckSource): {state: TableState; hands: HandSummary[]; ledgerDirty: boolean; steps: number} => {
    let current = state;
    const hands: HandSummary[] = [];
    let ledgerDirty = false;
    let steps = 0;
    while (steps < TIMING.MAX_CLOCK_STEPS) {
        const due = nextDue(current);
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
