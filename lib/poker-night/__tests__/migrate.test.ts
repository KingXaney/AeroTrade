// Reading a stored state back. The version 1 fixture — a hand on the flop with a pre-action set, a
// request waiting, a player leaving and another just seated, written by the engine and kept as
// JSON — comes back as the same object and plays on; a state from a newer version, one missing a
// field or with a field of the wrong shape, and anything that is not a state come back null.

import {describe, expect, it} from 'vitest';
import {STATE_VERSION} from '@/lib/poker-night/config';
import {reduce} from '@/lib/poker-night/engine';
import {conservation} from '@/lib/poker-night/ledger';
import {migrateState} from '@/lib/poker-night/migrate';
import type {TableState} from '@/lib/poker-night/types';
import {actBy, checkInvariants, moves, X} from './fixtures';
import stored from './fixtures/state-v1.json';

const fixture = (): Record<string, unknown> => structuredClone(stored) as Record<string, unknown>;

describe('migrateState', () => {
    it('hands a version 1 state back as it is, ready to play on', () => {
        const raw = fixture();
        const s = migrateState(raw);
        expect(s).toBe(raw);
        expect(STATE_VERSION).toBe(1);
        checkInvariants(s!);
        expect(s!.hand!.street).toBe('flop');
        const actor = s!.seats[s!.hand!.actor!]!.pid;
        const r = reduce(s!, actBy(s!, actor, {kind: 'call'}));
        expect(r.ok).toBe(true);
        const next = moves(r.ok ? r.state : s!, X);
        expect(conservation(next).ok).toBe(true);
    });

    it('survives the round trip a database makes', () => {
        const s = migrateState(fixture())!;
        expect(migrateState(JSON.parse(JSON.stringify(s)))).toEqual(s);
    });

    it('refuses a newer version, a missing or misshapen field, and anything else', () => {
        expect(migrateState({...fixture(), v: 2})).toBeNull();
        expect(migrateState({...fixture(), v: 0})).toBeNull();
        const missing = fixture();
        delete missing.ledger;
        expect(migrateState(missing)).toBeNull();
        const wrong = fixture() as unknown as TableState;
        wrong.seats[0]!.stack = -5;
        expect(migrateState(wrong)).toBeNull();
        const fraction = fixture() as unknown as TableState;
        fraction.hand!.seats[0].committed = 1.5;
        expect(migrateState(fraction)).toBeNull();
        const short = fixture() as unknown as TableState;
        short.seats.pop();
        expect(migrateState(short)).toBeNull();
        for (const junk of [null, undefined, 1, 'state', [], {v: 1}]) expect(migrateState(junk)).toBeNull();
    });
});
