// The room document's size budget, on the heaviest table the engine can build: nine seats, six
// players who left (fifteen ledger rows, each with its full twelve events), a hand whose log is at
// its 200-entry cap from a min-raise war, four side pots and six hands shown, and a rebuy request from
// every non-host player — with every private list of version 2 at its longest on top: sixteen asks
// to see a hand, the cooldowns the state keeps, a "no asks" setting for every seat and every player
// dealt. The engine's state is held to 16,000 bytes (lib/poker-night/config KEEP and ASKS set the
// caps); the room document around it — every row the room keeps with the longest names and a nudge
// count, the applied ring, the beats and the emotes — to 27,000 bytes for what each write reads and
// 30,000 in all; and the public wire view — what every response and Ably message carries — to 4,500
// bytes, as is the Ably state message around it (lib/poker-night/channel.WIRE_BUDGET_BYTES).
// Names and looks are not part of the wire view: they ride beside it in responses only, versioned by
// peopleV (lib/poker-night/room.roomView). Every figure is held on the same table in PLO too (P5:
// four cards a hand, six of them shown; its short stacks go all in by pot-sized raises, the all-in
// over the cap being refused; P6: on three boards, every pot split three ways), and the room
// document on whichever state is larger.
//
// Measured (PN_BUDGET_PRINT=1 prints them): version 1's heaviest table made a 14,512-byte state, a
// 4,331-byte wire view (4,400 as a message), 26,883 bytes read per write and 29,534 in all; version
// 2 stores ledger times in seconds and sends the ledger as tuples, which pays for its new fields.
// With PLO open (P5): Texas hold'em 14,798 / 3,787 / 3,856 bytes (state, wire, message); PLO 14,878 /
// 3,862 / 3,925; on PLO's state the room reads 26,886 per write and 29,537 in all. On three boards
// (P6) PLO is 15,048 / 3,936 / 3,999, and the room read 27,056: the applied ring went from 40 keys
// to 36 (config KEEP.APPLIED), so it reads 26,944 per write and 29,595 in all. The wire keeps 500
// bytes to spare, so it needed none of the compaction ladder beyond the ledger's tuples. Triple T
// (P7) keeps its nine cards thrown away in the state, beside two-card hands on one board: smaller
// than PLO's three boards of four-card hands: 14,833 / 3,795 / 3,858 bytes.

import {describe, expect, it} from 'vitest';
import {stateMessage, WIRE_BUDGET_BYTES} from '@/lib/poker-night/channel';
import {nextDueAt} from '@/lib/poker-night/clock';
import {ASKS, DEFAULT_CONFIG, KEEP} from '@/lib/poker-night/config';
import {createTable} from '@/lib/poker-night/engine';
import {LIMITS} from '@/lib/poker-night/limits';
import {appliedKey} from '@/lib/poker-night/room';
import {isLive} from '@/lib/poker-night/seats';
import type {TableAction, TableState} from '@/lib/poker-night/types';
import {clockLeaderOf, wireView} from '@/lib/poker-night/views';
import {legalFor, snapshotFromState} from '@/lib/poker-night/betting';
import {reduce} from '@/lib/poker-night/engine';
import type {Move, Variant} from '@/lib/poker-night/types';
import {A, C, F, R, X, actBy, actorPid, checkInvariants, deal, host, moves, ok, play, T0} from './fixtures';

const bytes = (value: unknown): number => new TextEncoder().encode(JSON.stringify(value)).length;

const MINUTE = 60_000;

type Unstamped = TableAction extends infer T ? (T extends TableAction ? Omit<T, 'at'> : never) : never;

// Player ids as the room makes them: 11 characters of base64url.
const pid = (i: number): string => `Pq3x9Zk2L${String(i).padStart(2, '0')}`;

// Each pot has its own winner in either game: in Texas hold'em aces take the main pot, kings, queens
// and jacks the side pots, tens the two deep stacks' war; in PLO the same pairs in four-card hands,
// none of which makes a straight or a flush on this board (two of a suit at most, and no 4 with a 6,
// no 6 with a 9, no ace with a 4 in one hand).
const HOLES: Record<Variant, Record<number, string>> = {
    holdem: {0: '4c4d', 1: 'AhAd', 2: 'KhKd', 3: 'QhQd', 4: 'JhJd', 5: '4h4s', 6: '9c9d', 7: 'TcTd', 8: '6s6h'},
    // Texas hold'em's hands with a third card each, the one thrown away.
    'triple-t': {0: '4c4d2h', 1: 'AhAd3c', 2: 'KhKd2s', 3: 'QhQd3d', 4: 'JhJd2d', 5: '4h4s3s', 6: '9c9d5h', 7: 'TcTd6c', 8: '6s6h5d'},
    plo: {
        0: '4c4d2h2s', 1: 'AhAdKhQh', 2: 'KsKdJh9d', 3: 'QsQdJd9c', 4: 'JsJcTd9s', 5: '4h4s3c3d', 6: '6c6d8d8h', 7: 'TcThKcQc', 8: '6s6hAs7c',
    },
};

// A short stack's way all in: in Texas hold'em the all-in; in PLO a raise to the most the pot limit
// allows, again until the cap reaches the stack (the all-in over it is refused).
const shove = (s: TableState, variant: Variant, capped: {n: number}): Move => {
    if (variant !== 'plo') return A;
    const actor = s.hand!.actor!;
    const legal = legalFor(snapshotFromState(s), actor)!;
    if (!legal.raise) return C;
    const stack = s.seats[actor]!.stack + s.hand!.seats.find((p) => p.seat === actor)!.streetBet;
    if (legal.raise.max < stack) {
        expect(reduce(s, actBy(s, actorPid(s), A))).toEqual({ok: false, reason: 'illegal'});
        capped.n++;
    }
    return R(legal.raise.max);
};

// PLO's three boards: the first is Texas hold'em's own, the other two from the cards no hand holds.
const BOARDS = ['2c7d5s3h8c', '5c5d9h2d7h', '3s7s8sTsAc'];

const heaviest = (variant: Variant = 'holdem', capped = {n: 0}, boards: 1 | 2 | 3 = 1): TableState => {
    let at = T0;
    const tick = () => (at += 7 * MINUTE);
    const config = {
        ...DEFAULT_CONFIG, seats: 9, smallBlind: 10, bigBlind: 25, ante: 25, buyInMin: 100, buyInMax: 12_500, maxRebuys: 20, turnSeconds: 120, pauseSeconds: 15, sitOutAfter: 5,
        variant, boards,
    };
    let s = createTable({hostPid: pid(0), config, at});
    s = ok(host(s, {op: 'settings', patch: {name: '🃏'.repeat(20), scene: 'midnight-lounge', felt: 'royal-blue'}}, at));
    const act = (action: Unstamped) => {
        s = play(s, {...action, at: tick()} as TableAction);
    };
    // Six players who came and went six times each: twelve events apiece.
    for (let k = 9; k < 15; k++) {
        for (let visit = 0; visit < 6; visit++) {
            act({type: 'sit', by: pid(k), seat: 0, buyIn: 9_999 - visit});
            act({type: 'leave', by: pid(k)});
        }
    }
    // Nine seated, each topping up eleven times on the way to their stack.
    const targets = [10_000, 1200, 1600, 2000, 2400, 10_000, 10_000, 10_000, 10_000];
    targets.forEach((target, i) => {
        act({type: 'sit', by: pid(i), seat: i, buyIn: target - 1100});
        for (let k = 0; k < 11; k++) act({type: 'buy', by: pid(i), amount: 100});
    });
    s = ok(host(s, {op: 'start'}, tick()));
    s = deal(s, {holes: HOLES[variant], boards: BOARDS.slice(0, boards), at: s.nextHandAt!});
    // Triple T: everyone throws the third card away, and the hand is Texas hold'em's.
    if (variant === 'triple-t') {
        for (const p of s.hand!.seats) s = play(s, {type: 'discard', by: p.pid, turn: s.turn, card: p.hole[2], at: s.hand!.startedAt});
    }
    // The four short stacks are all in before the flop; the five deep stacks call.
    while (s.hand!.street === 'preflop') s = moves(s, [1, 2, 3, 4].map(pid).includes(actorPid(s)) ? shove(s, variant, capped) : C);
    // On the flop three deep stacks fold and two min-raise each other past the log's cap.
    while (s.hand!.street === 'flop') {
        const hand = s.hand!;
        const actor = actorPid(s);
        s = moves(s, [0, 5, 6].map(pid).includes(actor) ? F : hand.logDropped > 0 ? C : R(hand.currentBet + hand.increment));
    }
    while (isLive(s.hand)) s = moves(s, X);
    // Everyone but the host asks the host for chips (a hand has been dealt: every buy waits).
    for (let i = 1; i < 9; i++) act({type: 'buy', by: pid(i), amount: Math.min(12_500 - s.seats[i]!.stack, 9_000)});
    // The private lists at their longest: two asks from each of eight folded players (the most a
    // hand allows), the cooldowns the state keeps, and "no asks" for every seat and every player of
    // the hand. (Laid on directly: no one hand reaches all of them.)
    const askedAt = 9_999_999;
    return {
        ...s,
        hand: {...s.hand!, asks: Array.from({length: 16}, (_, k): [number, number, number, number] => [k % 8, 8, askedAt - k, k % 5])},
        askCooldowns: Array.from({length: ASKS.COOLDOWNS_KEPT}, (_, k): [string, string, number] => [pid(9 + (k % 6)), pid(k % 9), 9_999]),
        noAsks: Array.from({length: 18}, (_, k) => pid(k)),
    };
};

const PRINT = process.env.PN_BUDGET_PRINT === '1';
const report = (label: string, n: number): number => {
    if (PRINT) process.stderr.write(`PN_BYTES ${label} ${n}\n`);
    return n;
};

const plo = {capped: {n: 0}, state: null as TableState | null};
const heaviestPlo = (): TableState => (plo.state ??= heaviest('plo', plo.capped, 3));
const heaviestTripleT = (): TableState => heaviest('triple-t');
// The largest state, for the room document.
const largest = (): TableState => [heaviest(), heaviestPlo(), heaviestTripleT()].sort((a, b) => bytes(b) - bytes(a))[0];

describe('Triple T\'s heaviest table', () => {
    it('is Texas hold\'em\'s, with a card thrown away a seat, and keeps every budget', () => {
        const s = heaviestTripleT();
        checkInvariants(s);
        const hand = s.hand!;
        expect(hand.variant).toBe('triple-t');
        expect(hand.discards).toHaveLength(9);
        expect(hand.seats.every((p) => p.hole.length === 2)).toBe(true);
        expect(hand.result!.pots.length).toBe(5);
        expect(report('triple-t state', bytes(s))).toBeLessThanOrEqual(16_000);
        expect(bytes(s)).toBeLessThan(bytes(heaviestPlo()));
        const presence = Object.fromEntries(s.seats.map((seat) => [seat!.pid, 'here' as const]));
        const view = wireView(s, {
            code: 'K7QXM4', seq: 999_999, serverNow: T0 + 12 * 3_600_000, nextDueAt: nextDueAt(s), clockLeader: clockLeaderOf(s, presence),
            presence, watchers: 12, realtimeOk: false, peopleV: 99_999,
        });
        expect(report('triple-t wire', bytes(view))).toBeLessThanOrEqual(4_500);
        expect(report('triple-t message', bytes(stateMessage('6650a1b2c3d4e5f601234567', view)))).toBeLessThanOrEqual(WIRE_BUDGET_BYTES);
    });
});

describe('PLO\'s heaviest table', () => {
    it('is built as Texas hold\'em\'s is, four cards a hand on three boards, the short stacks in by pot raises that hit the cap', () => {
        const s = heaviestPlo();
        checkInvariants(s);
        const hand = s.hand!;
        expect(hand.variant).toBe('plo');
        expect(hand.boards).toHaveLength(3);
        expect(hand.seats.every((p) => p.hole.length === 4)).toBe(true);
        expect(plo.capped.n).toBeGreaterThan(0);
        expect(hand.log.length).toBe(KEEP.LOG_SUMMARY);
        expect(hand.result!.pots.length).toBe(5);
        // Every pot split three ways, the first board's parts to the first board's winners.
        expect(hand.result!.pots.every((p) => p.winners.length === 3 && p.shares.length === 3)).toBe(true);
        expect(hand.result!.pots.map((p) => p.winners[0])).toEqual([[1], [2], [3], [4], [7]]);
        expect(hand.result!.hands.length).toBe(6);
        expect(hand.result!.hands.every((h) => h.cards.length === 4)).toBe(true);
    });

    it('keeps the state, the wire view and the realtime message within their budgets', () => {
        const s = heaviestPlo();
        expect(report('plo state', bytes(s))).toBeLessThanOrEqual(16_000);
        const presence = Object.fromEntries(s.seats.map((seat) => [seat!.pid, 'here' as const]));
        const view = wireView(s, {
            code: 'K7QXM4', seq: 999_999, serverNow: T0 + 12 * 3_600_000, nextDueAt: nextDueAt(s), clockLeader: clockLeaderOf(s, presence),
            presence, watchers: 12, realtimeOk: false, peopleV: 99_999,
        });
        expect(report('plo wire', bytes(view))).toBeLessThanOrEqual(4_500);
        expect(report('plo message', bytes(stateMessage('6650a1b2c3d4e5f601234567', view)))).toBeLessThanOrEqual(WIRE_BUDGET_BYTES);
    });
});

describe('the hot document budget', () => {
    const s = heaviest();

    it('builds the heaviest table the limits allow', () => {
        checkInvariants(s);
        const hand = s.hand!;
        expect(s.seats.every((seat) => seat !== null)).toBe(true);
        expect(s.ledger.length).toBe(15);
        expect(s.ledger.every((row) => row.events.length === KEEP.LEDGER_EVENTS)).toBe(true);
        expect(hand.log.length).toBe(KEEP.LOG_SUMMARY);
        expect(hand.logDropped).toBeGreaterThan(0);
        expect(hand.result!.pots.length).toBe(5);
        expect(hand.result!.hands.length).toBe(6);
        expect(s.requests.length).toBe(8);
        expect(s.hand!.asks).toHaveLength(16);
    });

    it('keeps the engine state within 16,000 bytes', () => {
        expect(report('state', bytes(s))).toBeLessThanOrEqual(16_000);
    });

    it('keeps the wire view within 4,500 bytes', () => {
        const presence = Object.fromEntries(s.seats.map((seat) => [seat!.pid, 'here' as const]));
        const view = wireView(s, {
            code: 'K7QXM4', seq: 3100, serverNow: T0 + 12 * 3_600_000, nextDueAt: nextDueAt(s), clockLeader: clockLeaderOf(s, presence),
            presence, watchers: 12, realtimeOk: true, peopleV: 40,
        });
        expect(report('wire', bytes(view))).toBeLessThanOrEqual(4_500);
    });

    // What Ably carries: the wire view inside its message, the name and the id (the room's ObjectId
    // and the seq) included, measured as UTF-8 the way Ably counts it.
    it('keeps the realtime state message, envelope and all, within WIRE_BUDGET_BYTES', () => {
        const presence = Object.fromEntries(s.seats.map((seat) => [seat!.pid, 'here' as const]));
        const view = wireView(s, {
            code: 'K7QXM4', seq: 999_999, serverNow: T0 + 12 * 3_600_000, nextDueAt: nextDueAt(s), clockLeader: clockLeaderOf(s, presence),
            presence, watchers: 12, realtimeOk: false, peopleV: 99_999,
        });
        const message = stateMessage('6650a1b2c3d4e5f601234567', view);
        expect(WIRE_BUDGET_BYTES).toBe(4_500);
        expect(report('message', bytes(message))).toBeLessThanOrEqual(WIRE_BUDGET_BYTES);
    });
});

describe('the room document budget', () => {
    const s = largest();
    // The room's other hot fields at their heaviest: every row the room keeps (LIMITS.players), each
    // with an account id and a 48-unit name of skin-toned emoji (four units, eight bytes a grapheme),
    // the longest look and a removal flag here and there; the removals the room remembers; the
    // applied ring full; a beat from every row; the emote ring full of throws.
    const name = String.fromCodePoint(0x1f44d, 0x1f3fd).repeat(12);
    const players = Array.from({length: LIMITS.players}, (_, i) => ({
        pid: pid(i), userId: `6650a1b2c3d4e5f6012345${String(i).padStart(2, '0')}`, guestId: null, name, avatar: 'v1:butterfly:tangerine:double:cherries',
        joinedAt: T0 + i, banned: i % 7 === 0, nudge: 99,
    }));
    const applied = Array.from({length: KEEP.APPLIED}, (_, i) => appliedKey(pid(i % 30), `0b7c1e2a-9f3d-4c5b-8a6e-${String(i).padStart(12, '0')}`));
    const seen = Object.fromEntries(players.map((p) => [p.pid, {at: T0 + 12 * 3_600_000, hidden: true}]));
    const emotes = Array.from({length: KEEP.EMOTES}, (_, i) => ({kind: 'throw', item: 'tennis-ball', to: pid(1), id: `e${i}`.padEnd(16, 'x'), seq: 1000 + i, from: pid(2), at: T0}));
    // Every removal the room remembers (LIMITS.bannedKeys), each an account's key, the longest kind.
    const bannedKeys = Array.from({length: LIMITS.bannedKeys}, (_, i) => `u:6650a1b2c3d4e5f6012345${String(i).padStart(2, '0')}`);
    const casRead = {state: s, players, bannedKeys, applied, seen, peopleV: 999};

    // The design's first figure was 24,000 bytes; thirty rows of 48-unit names (8 KB) on top of the
    // heaviest state (14.5 KB) do not fit it, so these hold what the limits really allow.
    it('keeps what every write reads and rewrites within 27,200 bytes', () => {
        expect(name.length).toBe(48);
        expect(report('read', bytes(casRead))).toBeLessThanOrEqual(27_200);
    });

    it('keeps the whole hot document, emotes included, within 30,000 bytes', () => {
        expect(report('whole', bytes({...casRead, emotes}))).toBeLessThanOrEqual(30_000);
    });
});
