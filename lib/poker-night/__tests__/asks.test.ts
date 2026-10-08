// Asks to see a hand, read the way the engine and the viewer's own view both read them: how one
// stands at a moment (a waiting one past its time is a no before any write says so), and who a
// player may ask — exactly the asks the engine takes, over seeded completed hands.

import {describe, expect, it} from 'vitest';
import {answerAt, askChoices, askDeadline, askedHand, canAskFrom, coolingDown} from '@/lib/poker-night/asks';
import {ASKS} from '@/lib/poker-night/config';
import {reduce} from '@/lib/poker-night/engine';
import type {TableState} from '@/lib/poker-night/types';
import {deal, moves, ok, pidOf, table} from './fixtures';

// Four players: everyone but the big blind folds, so the big blind wins unshown.
const walked = (): TableState => {
    let s = deal(table({0: 1000, 1: 1000, 2: 1000, 3: 1000}, {lastBigBlind: 0}));
    while (s.hand!.phase === 'betting') s = moves(s, {kind: 'fold'});
    return s;
};

describe('an ask, read', () => {
    it('is waiting until its time runs out, then a no', () => {
        const s = walked();
        const at = s.hand!.result!.completedAt;
        const winner = s.hand!.seats.find((p) => !p.folded)!;
        const asker = s.hand!.seats.find((p) => p.folded)!;
        const asked = ok(reduce(s, {type: 'ask', by: asker.pid, to: winner.pid, at: at + 10}));
        const entry = asked.hand!.asks[0];
        expect(askDeadline(asked.hand!, entry)).toBe(at + 10 + ASKS.WAIT_MS);
        expect(answerAt(asked.hand!, entry, at + 10 + ASKS.WAIT_MS - 1)).toBe('waiting');
        expect(answerAt(asked.hand!, entry, at + 10 + ASKS.WAIT_MS)).toBe('expired');
        expect(askedHand(asked)).toBe(asked.hand);
        expect(askedHand(deal(table({0: 1000, 1: 1000}, {lastBigBlind: 0})))).toBeNull();
    });
});

describe('who a player may ask', () => {
    it('offers exactly what the engine takes, before and after every ask, answer and setting', () => {
        let s = walked();
        const at = s.hand!.result!.completedAt;
        const folded = s.hand!.seats.filter((p) => p.folded).map((p) => p.pid);
        const winner = s.hand!.seats.find((p) => !p.folded)!.pid;
        // Each folded player may ask anyone else dealt: the winner and the other folded players.
        for (const pid of folded) expect(new Set(canAskFrom(s, pid, at))).toEqual(new Set(s.hand!.seats.map((p) => p.pid).filter((q) => q !== pid)));
        expect(canAskFrom(s, winner, at)).toEqual([]);
        expect(canAskFrom(s, pidOf(9), at)).toEqual([]);
        const [a, b, c] = folded;
        // The engine takes an ask exactly when it is offered, for every pair, at every turn below.
        const agrees = (st: TableState, now: number) => {
            for (const from of st.hand!.seats.map((p) => p.pid)) {
                for (const to of st.hand!.seats.map((p) => p.pid)) {
                    if (from === to) continue;
                    const r = reduce(st, {type: 'ask', by: from, to, at: now});
                    const took = r.ok && r.state !== st;
                    expect(took, `${from} → ${to}`).toBe(canAskFrom(st, from, now).includes(to));
                }
            }
        };
        agrees(s, at + 1);
        s = ok(reduce(s, {type: 'ask', by: a, to: winner, at: at + 10}));
        agrees(s, at + 20);
        expect(canAskFrom(s, a, at + 20)).toEqual([]);
        s = ok(reduce(s, {type: 'reply', by: winner, to: a, show: 'none', at: at + 30}));
        expect(coolingDown(s, a, winner, s.hand!.no)).toBe(true);
        agrees(s, at + 40);
        s = ok(reduce(s, {type: 'allow-asks', by: b, on: false, at: at + 50}));
        expect(canAskFrom(s, a, at + 60)).not.toContain(b);
        agrees(s, at + 60);
        s = ok(reduce(s, {type: 'ask', by: a, to: c, at: at + 70}));
        // Two asks made: none more this hand.
        s = ok(reduce(s, {type: 'reply', by: c, to: a, show: 'one', at: at + 80}));
        expect(canAskFrom(s, a, at + 90)).toEqual([]);
        agrees(s, at + 90);
        // A waiting ask past its time is a no: the player may ask someone else (and not the same one).
        s = ok(reduce(s, {type: 'ask', by: b, to: winner, at: at + 100}));
        expect(canAskFrom(s, b, at + 100 + ASKS.WAIT_MS)).not.toContain(winner);
        expect(canAskFrom(s, b, at + 100 + ASKS.WAIT_MS).length).toBeGreaterThan(0);
        agrees(s, at + 100 + ASKS.WAIT_MS);
    });
});

describe('why a player may not ask', () => {
    it('names a reason for exactly the choices the engine refuses, "asks off" as the engine says it', () => {
        let s = walked();
        const at = s.hand!.result!.completedAt;
        const folded = s.hand!.seats.filter((p) => p.folded).map((p) => p.pid);
        const winner = s.hand!.seats.find((p) => !p.folded)!.pid;
        const [a, b] = folded;
        s = ok(reduce(s, {type: 'allow-asks', by: b, on: false, at: at + 1}));
        s = ok(reduce(s, {type: 'ask', by: a, to: winner, at: at + 2}));
        const holds = (st: TableState, now: number) => {
            for (const from of st.hand!.seats.map((p) => p.pid)) {
                for (const choice of askChoices(st, from, now)) {
                    const r = reduce(st, {type: 'ask', by: from, to: choice.pid, at: now});
                    const took = r.ok && r.state !== st;
                    expect(took, `${from} → ${choice.pid}`).toBe(choice.block === null);
                    if (choice.block === 'asks-off') expect(r.ok ? null : r.reason).toBe('asks-off');
                }
            }
        };
        holds(s, at + 3);
        expect(askChoices(s, a, at + 3)).toEqual(expect.arrayContaining([{pid: b, block: 'asks-off'}]));
        expect(askChoices(s, a, at + 3).filter((c) => c.pid !== b).every((c) => c.block === 'waiting')).toBe(true);
        // Its time up: the waiting block lifts, the player asked drops off the list (asked already).
        holds(s, at + 2 + ASKS.WAIT_MS);
        expect(askChoices(s, a, at + 2 + ASKS.WAIT_MS).some((c) => c.pid === winner)).toBe(false);
        s = ok(reduce(s, {type: 'ask', by: a, to: folded[2], at: at + 3 + ASKS.WAIT_MS}));
        s = ok(reduce(s, {type: 'reply', by: folded[2], to: a, show: 'none', at: at + 4 + ASKS.WAIT_MS}));
        // Two asks made: every other choice reads "limit".
        expect(askChoices(s, a, at + 5 + ASKS.WAIT_MS).filter((c) => c.pid !== b).every((c) => c.block === 'limit')).toBe(true);
        holds(s, at + 5 + ASKS.WAIT_MS);
    });
});
