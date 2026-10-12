// Reading a stored state back. A version 2 state comes back as the same object; the version 1
// fixture — a hand on the flop with a pre-action set, a request waiting, a player leaving and
// another just seated, written by the version 1 engine and kept as JSON — comes back stepped to
// version 2 (migrate.v1ToV2) and plays on. A state from a newer version, one missing a field or with
// a field of the wrong shape (of either version), and anything that is not a state come back null.
// Version 2's shape takes every variant, board count and the 'discard' phase from the start. A
// PokerHand row's summary written before version 2 reads as today's (migrateSummary).

import {describe, expect, it} from 'vitest';
import {STATE_VERSION} from '@/lib/poker-night/config';
import {reduce} from '@/lib/poker-night/engine';
import {conservation} from '@/lib/poker-night/ledger';
import {migrateState, migrateSummary, v1ToV2} from '@/lib/poker-night/migrate';
import type {HandSummary, TableState} from '@/lib/poker-night/types';
import {historyView} from '@/lib/poker-night/views';
import {actBy, cards, checkInvariants, deal, moves, nowOf, ok, table, X} from './fixtures';
import stored from './fixtures/state-v1.json';
import storedSummary from './fixtures/summary-v1.json';

const fixture = (): Record<string, unknown> => structuredClone(stored) as Record<string, unknown>;

// A version 2 state of the current engine's own making: a hand on the flop.
const current = (): TableState => moves(deal(table({0: 1000, 1: 1000, 2: 1000}, {lastBigBlind: 0}), {board: '2c7d9s3s4c'}), {kind: 'call'}, {kind: 'call'}, X);

describe('migrateState', () => {
    it('hands a version 2 state back as it is', () => {
        expect(STATE_VERSION).toBe(2);
        const s = current();
        expect(migrateState(s)).toBe(s);
        expect(migrateState(JSON.parse(JSON.stringify(s)))).toEqual(s);
    });

    it('steps a version 1 state to version 2, ready to play on', () => {
        const raw = fixture();
        const s = migrateState(raw)!;
        expect(s).not.toBeNull();
        expect(s).not.toBe(raw);
        expect(s).toEqual(v1ToV2(raw as never));
        expect(s.v).toBe(2);
        // The config gains its game last, as DEFAULT_CONFIG has it; the policy keeps its meaning.
        expect(Object.keys(s.config).slice(-2)).toEqual(['variant', 'boards']);
        expect(s.config).toMatchObject({variant: 'holdem', boards: 1, rebuys: 'approve'});
        expect(s.seats.filter((seat) => seat !== null).every((seat) => seat!.leaveAfter === false)).toBe(true);
        expect([s.noAsks, s.askCooldowns]).toEqual([[], []]);
        // The hand: its game, its one board as a run and a board, nothing thrown away, no asks.
        const hand = s.hand!;
        const old = (raw as {hand: {deck: number[]; board: number[]}}).hand;
        expect(hand).toMatchObject({variant: 'holdem', deck: [old.deck], boards: [old.board], discards: [], asks: []});
        expect(hand).not.toHaveProperty('board');
        // Ledger times in seconds.
        const rows = (raw as {ledger: {events: number[][]}[]}).ledger;
        s.ledger.forEach((row, i) => expect(row.events.map((e) => e[0])).toEqual(rows[i].events.map((e) => Math.floor(e[0] / 1000))));
        checkInvariants(s);
        expect(s.hand!.street).toBe('flop');
        const actor = s.seats[s.hand!.actor!]!.pid;
        const r = reduce(s, actBy(s, actor, {kind: 'call'}));
        expect(r.ok).toBe(true);
        const next = moves(r.ok ? r.state : s, X);
        expect(conservation(next).ok).toBe(true);
        // The stepped state is version 2 through and through: read again, it is the same object.
        expect(migrateState(s)).toBe(s);
    });

    it('reads version 1\'s rebuys "auto" as "approve": the host approves buys once a hand is dealt', () => {
        const raw = fixture() as {config: {rebuys: string}};
        raw.config.rebuys = 'auto';
        expect(migrateState(raw)!.config.rebuys).toBe('approve');
        raw.config.rebuys = 'off';
        expect(migrateState(raw)!.config.rebuys).toBe('off');
    });

    it('survives the round trip a database makes', () => {
        const s = migrateState(fixture())!;
        expect(migrateState(JSON.parse(JSON.stringify(s)))).toEqual(s);
    });

    it('takes every game, board count and the throw-away phase in the stored shape', () => {
        const s = structuredClone(current());
        s.config = {...s.config, variant: 'plo', boards: 3};
        const hand = s.hand!;
        hand.variant = 'plo';
        hand.seats.forEach((p, k) => {
            p.hole = cards(['AhAdKhKd', 'QhQdJhJd', 'ThTd9h9d'][k]);
        });
        hand.deck = [cards('2c7d9s3s4c'), cards('2s7s9c3c4d'), cards('5c5d5h5s6c')];
        hand.boards = hand.deck.map((run) => run.slice(0, 3));
        expect(migrateState(s)).toBe(s);
        const t = structuredClone(current());
        t.config = {...t.config, variant: 'triple-t'};
        t.hand!.phase = 'discard';
        t.hand!.discards = [[0, 51]];
        expect(migrateState(t)).toBe(t);
    });

    it('refuses a newer version, a missing or misshapen field of either version, and anything else', () => {
        expect(migrateState({...current(), v: 3})).toBeNull();
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
        // A version 1 state with a version 2 field's shape, and the other way round.
        const v1Config = fixture() as {config: Record<string, unknown>};
        expect(migrateState({...v1Config, config: {...v1Config.config, variant: 'holdem'}})).toBeNull();
        const v1Board = structuredClone(current()) as unknown as {hand: {boards: unknown}};
        v1Board.hand.boards = [1, 2, 3];
        expect(migrateState(v1Board)).toBeNull();
        const uneven = structuredClone(current());
        uneven.hand!.deck.push(cards('AsKsQsJsTs'));
        expect(migrateState(uneven)).toBeNull();
        uneven.hand!.boards.push([]);
        expect(migrateState(uneven)).toBeNull();
        const badAnswer = structuredClone(current());
        badAnswer.hand!.asks.push([0, 1, 100, 9]);
        expect(migrateState(badAnswer)).toBeNull();
        const badPot = structuredClone(moves(current(), X, X, X, X, X, X, X, X, X));
        expect(badPot.hand!.phase).toBe('complete');
        badPot.hand!.result!.pots[0].shares = [[1, 2, 3, 4]];
        expect(migrateState(badPot)).toBeNull();
        const noVariant = structuredClone(current()) as unknown as {config: Record<string, unknown>};
        delete noVariant.config.variant;
        expect(migrateState(noVariant)).toBeNull();
        for (const junk of [null, undefined, 1, 'state', [], {v: 1}, {v: 2}]) expect(migrateState(junk)).toBeNull();
    });
});

describe('migrateSummary', () => {
    it('reads a version 1 summary as today\'s: one board, each pot paid on it, shown hands as their cards', () => {
        const raw = structuredClone(storedSummary) as Record<string, unknown>;
        const s = migrateSummary(raw)!;
        expect(s).not.toBeNull();
        const old = storedSummary as unknown as {board: number[]; pots: {winners: number[]; shares: number[]}[]; players: unknown[]};
        expect(s).toMatchObject({variant: 'holdem', boards: [old.board]});
        expect(s.pots.map((p) => [p.winners, p.shares])).toEqual(old.pots.map((p) => [[p.winners], [p.shares]]));
        expect(s.hands.every((h) => Object.keys(h).sort().join() === 'cards,seat')).toBe(true);
        expect(s.players.every((p) => p.discard === null && p.seenBy.length === 0)).toBe(true);
        expect(s).not.toHaveProperty('board');
        // History reads it like any other.
        expect(historyView(s, null).players.filter((p) => p.hole !== null)).toHaveLength(s.players.filter((p) => p.shown).length);
    });

    it('hands a version 2 summary back as it is, and refuses anything else', () => {
        let state = current();
        let summary: HandSummary | null = null;
        while (state.hand!.phase !== 'complete') {
            const r = reduce(state, actBy(state, state.seats[state.hand!.actor!]!.pid, X, nowOf(state)));
            state = ok(r);
            if (r.ok && r.hands.length > 0) summary = r.hands[0];
        }
        expect(migrateSummary(summary)).toBe(summary);
        expect(migrateSummary(JSON.parse(JSON.stringify(summary)))).toEqual(summary);
        for (const junk of [null, 1, 'x', [], {}, {boards: [[1]]}, {...storedSummary, players: 'none'}]) expect(migrateSummary(junk)).toBeNull();
    });
});
