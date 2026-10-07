// The room document's size budget, on the heaviest table the engine can build: nine seats, six
// players who left (fifteen ledger rows, each with its full twelve events), a hand whose log is at
// its 200-entry cap from a min-raise war, four side pots and six hands shown, and a rebuy request from
// every non-host player. The engine's state is held to 16,000 bytes (lib/poker-night/config KEEP
// sets the caps); the room document around it — every row the room keeps with the longest names, the
// applied ring, the beats and the emotes — to 27,000 bytes for what each write reads and 30,000 in
// all; and the public wire view — what every response and Ably message carries — to 4,500 bytes,
// as is the Ably state message around it (lib/poker-night/channel.WIRE_BUDGET_BYTES).
// Names and looks are not part of the wire view: they ride beside it in responses only, versioned by
// peopleV (lib/poker-night/room.roomView).

import {describe, expect, it} from 'vitest';
import {stateMessage, WIRE_BUDGET_BYTES} from '@/lib/poker-night/channel';
import {nextDueAt} from '@/lib/poker-night/clock';
import {DEFAULT_CONFIG, KEEP} from '@/lib/poker-night/config';
import {createTable} from '@/lib/poker-night/engine';
import {LIMITS} from '@/lib/poker-night/limits';
import {appliedKey} from '@/lib/poker-night/room';
import {isLive} from '@/lib/poker-night/seats';
import type {TableAction, TableState} from '@/lib/poker-night/types';
import {clockLeaderOf, wireView} from '@/lib/poker-night/views';
import {A, C, F, R, X, actorPid, checkInvariants, deal, host, moves, ok, play, T0} from './fixtures';

const bytes = (value: unknown): number => new TextEncoder().encode(JSON.stringify(value)).length;

const MINUTE = 60_000;

type Unstamped = TableAction extends infer T ? (T extends TableAction ? Omit<T, 'at'> : never) : never;

// Player ids as the room makes them: 11 characters of base64url.
const pid = (i: number): string => `Pq3x9Zk2L${String(i).padStart(2, '0')}`;

const heaviest = (): TableState => {
    let at = T0;
    const tick = () => (at += 7 * MINUTE);
    const config = {...DEFAULT_CONFIG, seats: 9, smallBlind: 10, bigBlind: 25, ante: 25, buyInMin: 100, buyInMax: 12_500, maxRebuys: 20, turnSeconds: 120, pauseSeconds: 15, sitOutAfter: 5};
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
    // Each pot has its own winner: aces take the main pot, kings, queens and jacks the side pots,
    // tens the two deep stacks' war.
    s = deal(s, {
        holes: {0: '4c4d', 1: 'AhAd', 2: 'KhKd', 3: 'QhQd', 4: 'JhJd', 5: '4h4s', 6: '9c9d', 7: 'TcTd', 8: '6s6h'},
        board: '2c7d5s3h8c', at: s.nextHandAt!,
    });
    // The four short stacks are all in before the flop; the five deep stacks call.
    while (s.hand!.street === 'preflop') s = moves(s, [1, 2, 3, 4].map(pid).includes(actorPid(s)) ? A : C);
    // On the flop three deep stacks fold and two min-raise each other past the log's cap.
    while (s.hand!.street === 'flop') {
        const hand = s.hand!;
        const actor = actorPid(s);
        s = moves(s, [0, 5, 6].map(pid).includes(actor) ? F : hand.logDropped > 0 ? C : R(hand.currentBet + hand.increment));
    }
    while (isLive(s.hand)) s = moves(s, X);
    // Everyone but the host asks the host for chips.
    s = ok(host(s, {op: 'config', patch: {rebuys: 'approve'}}, tick()));
    for (let i = 1; i < 9; i++) act({type: 'buy', by: pid(i), amount: Math.min(12_500 - s.seats[i]!.stack, 9_000)});
    return s;
};

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
    });

    it('keeps the engine state within 16,000 bytes', () => {
        expect(bytes(s)).toBeLessThanOrEqual(16_000);
    });

    it('keeps the wire view within 4,500 bytes', () => {
        const presence = Object.fromEntries(s.seats.map((seat) => [seat!.pid, 'here' as const]));
        const view = wireView(s, {
            code: 'K7QXM4', seq: 3100, serverNow: T0 + 12 * 3_600_000, nextDueAt: nextDueAt(s), clockLeader: clockLeaderOf(s, presence),
            presence, watchers: 12, realtimeOk: true, peopleV: 40,
        });
        expect(bytes(view)).toBeLessThanOrEqual(4_500);
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
        expect(bytes(message)).toBeLessThanOrEqual(WIRE_BUDGET_BYTES);
    });
});

describe('the room document budget', () => {
    const s = heaviest();
    // The room's other hot fields at their heaviest: every row the room keeps (LIMITS.players), each
    // with an account id and a 48-unit name of skin-toned emoji (four units, eight bytes a grapheme),
    // the longest look and a removal flag here and there; the removals the room remembers; the
    // applied ring full; a beat from every row; the emote ring full of throws.
    const name = String.fromCodePoint(0x1f44d, 0x1f3fd).repeat(12);
    const players = Array.from({length: LIMITS.players}, (_, i) => ({
        pid: pid(i), userId: `6650a1b2c3d4e5f6012345${String(i).padStart(2, '0')}`, guestId: null, name, avatar: 'v1:butterfly:tangerine:double:cherries',
        joinedAt: T0 + i, banned: i % 7 === 0,
    }));
    const applied = Array.from({length: KEEP.APPLIED}, (_, i) => appliedKey(pid(i % 30), `0b7c1e2a-9f3d-4c5b-8a6e-${String(i).padStart(12, '0')}`));
    const seen = Object.fromEntries(players.map((p) => [p.pid, {at: T0 + 12 * 3_600_000, hidden: true}]));
    const emotes = Array.from({length: KEEP.EMOTES}, (_, i) => ({kind: 'throw', item: 'tennis-ball', to: pid(1), id: `e${i}`.padEnd(16, 'x'), seq: 1000 + i, from: pid(2), at: T0}));
    // Every removal the room remembers (LIMITS.bannedKeys), each an account's key, the longest kind.
    const bannedKeys = Array.from({length: LIMITS.bannedKeys}, (_, i) => `u:6650a1b2c3d4e5f6012345${String(i).padStart(2, '0')}`);
    const casRead = {state: s, players, bannedKeys, applied, seen, peopleV: 999};

    // The design's first figure was 24,000 bytes; thirty rows of 48-unit names (8 KB) on top of the
    // heaviest state (14.5 KB) do not fit it, so these hold what the limits really allow.
    it('keeps what every write reads and rewrites within 27,000 bytes', () => {
        expect(name.length).toBe(48);
        expect(bytes(casRead)).toBeLessThanOrEqual(27_000);
    });

    it('keeps the whole hot document, emotes included, within 30,000 bytes', () => {
        expect(bytes({...casRead, emotes})).toBeLessThanOrEqual(30_000);
    });
});
