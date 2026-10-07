// The projections, the only way the state leaves the server. The non-leak property over seeded
// nights: two states that differ only in what is private (the deck's unrevealed cards, unshown hole
// cards, other players' pre-actions) give the same public and wire views, and the same player view
// for anyone whose own cards did not change. A deep scan finds no private key, no hole pair of
// another player and no database id. What the client works out from the wire view — its legal
// moves, the bank's chips and nets, a shown hand's value and five cards — equals the server's; the
// clock leader and the people list follow their rules; history shows a hole only when it was shown
// or is the viewer's own.

import {describe, expect, it} from 'vitest';
import {legalFor, snapshotFromState} from '@/lib/poker-night/betting';
import {nextDueAt} from '@/lib/poker-night/clock';
import {KEEP} from '@/lib/poker-night/config';
import {reduce} from '@/lib/poker-night/engine';
import {chipsOf, inPotOf, ledgerEvents, netOf} from '@/lib/poker-night/ledger';
import {seatOf} from '@/lib/poker-night/seats';
import type {PreAction, TableState} from '@/lib/poker-night/types';
import {
    bankDetailView, bankOf, clockLeaderOf, historyView, livePots, peopleIds, playerView, publicView, readShownHand, snapshotFromView, WIRE_KINDS, wireView,
} from '@/lib/poker-night/views';
import type {PlayerMeta, Presence, ViewMeta} from '@/lib/poker-night/view-types';
import {mulberry32} from '@/lib/random';
import {A, C, F, R, X, cards, deal, moves, nowOf, ok, play, randomNight, runOut, T0, table} from './fixtures';

const meta = (s: TableState, presence: Record<string, Presence> = {}): ViewMeta => ({
    code: 'K7QXM4', seq: 12, serverNow: T0, nextDueAt: nextDueAt(s), clockLeader: clockLeaderOf(s, presence),
    presence, watchers: 2, realtimeOk: true, peopleV: 3,
});
const playerMeta = (s: TableState): PlayerMeta => ({
    ...meta(s),
    people: Object.fromEntries(peopleIds(s).map((pid) => [pid, {name: pid.toUpperCase(), avatar: 'v1:fox:tangerine:ring:crown'}])),
    removed: [], hasAccount: false, emotes: [], emoteSeq: 0, pass: null,
});

// Every hole card a viewer may not see: dealt, not shown, not their own.
const hiddenHoles = (s: TableState, viewer: string | null): number[][] =>
    s.hand ? s.hand.seats.filter((p) => !p.shown && p.pid !== viewer).map((p) => [...p.hole]) : [];

// The same state with everything private redrawn: the board's unrevealed cards and every hidden
// hole (but the viewer's own), from the cards nobody can see, and every other player's pre-action.
const perturb = (s: TableState, viewer: string | null, seed: number): TableState => {
    const random = mulberry32(seed);
    const t = structuredClone(s);
    const hand = t.hand;
    if (!hand) return t;
    const visible = new Set<number>([...hand.board, ...hand.seats.filter((p) => p.shown || p.pid === viewer).flatMap((p) => p.hole)]);
    const pool = Array.from({length: 52}, (_, c) => c).filter((c) => !visible.has(c));
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    let k = 0;
    for (let i = hand.board.length; i < hand.deck.length; i++) hand.deck[i] = pool[k++];
    for (const p of hand.seats) {
        if (p.shown || p.pid === viewer) continue;
        p.hole = [pool[k++], pool[k++]];
        p.pre = random() < 0.5 ? null : {kind: 'call-any', atBet: hand.currentBet};
    }
    return t;
};

// Every array in a JSON value with the key it sits under.
const arraysIn = (value: unknown, key = '', out: {key: string; array: unknown[]}[] = []) => {
    if (Array.isArray(value)) {
        out.push({key, array: value});
        value.forEach((v) => arraysIn(v, key, out));
    } else if (value && typeof value === 'object') {
        for (const [k, v] of Object.entries(value)) arraysIn(v, k, out);
    }
    return out;
};
const keysIn = (value: unknown, out = new Set<string>()): Set<string> => {
    if (Array.isArray(value)) value.forEach((v) => keysIn(v, out));
    else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) {
        out.add(k);
        keysIn(v, out);
    }
    return out;
};
const stringsIn = (value: unknown): string[] => JSON.stringify(value).match(/"(?:[^"\\]|\\.)*"/g)?.map((s) => JSON.parse(s) as string) ?? [];

const SEAT_LISTS = new Set(['eligible', 'winners', 'shares', 'showOrder']);

// What a view shows that it should not: a private key, another player's hidden hole pair, an id.
const leaksIn = (view: unknown, s: TableState, viewer: string | null): string[] => {
    const problems: string[] = [];
    const keys = keysIn(view);
    for (const key of ['deck', 'userId', 'guestId', 'bannedKeys', 'applied', 'atBet']) if (keys.has(key)) problems.push(`key ${key}`);
    const hidden = new Set(hiddenHoles(s, viewer).map((h) => [...h].sort((x, y) => x - y).join(',')));
    for (const {key, array} of arraysIn(view)) {
        if (array.length !== 2 || SEAT_LISTS.has(key)) continue;
        const pair = [...array as number[]].sort((x, y) => x - y).join(',');
        if (hidden.has(pair)) problems.push(`hole ${pair} under ${key}`);
    }
    for (const text of stringsIn(view)) if (/^[0-9a-f]{24}$/.test(text)) problems.push(`id ${text}`);
    return problems;
};
const expectNoLeak = (view: unknown, s: TableState, viewer: string | null) => expect(leaksIn(view, s, viewer)).toEqual([]);

// States from seeded nights, every few steps.
const nightStates = (seeds: number, steps: number): TableState[] => {
    const out: TableState[] = [];
    for (let seed = 1; seed <= seeds; seed++) {
        let k = 0;
        for (const {state} of randomNight(seed, steps)) if (k++ % 3 === 0) out.push(state);
    }
    return out;
};
const STATES = nightStates(12, 500);

describe('the non-leak property', () => {
    it('gives equal views of states that differ only in what is private', () => {
        let compared = 0;
        STATES.forEach((s, n) => {
            if (!s.hand) return;
            expect(publicView(perturb(s, null, n))).toEqual(publicView(s));
            expect(wireView(perturb(s, null, n), meta(s))).toEqual(wireView(s, meta(s)));
            for (const seat of s.seats) {
                if (!seat) continue;
                expect(playerView(perturb(s, seat.pid, n), seat.pid, playerMeta(s))).toEqual(playerView(s, seat.pid, playerMeta(s)));
                // Redraw their own cards too: only `me` may change.
                const {me: a, ...restA} = playerView(perturb(s, null, n + 1), seat.pid, playerMeta(s));
                const {me: b, ...restB} = playerView(s, seat.pid, playerMeta(s));
                expect(restA).toEqual(restB);
                expect(a.pid).toBe(b.pid);
                compared++;
            }
        });
        expect(compared).toBeGreaterThan(500);
    });

    it('finds no private key, no other player\'s hole pair and no database id in any view', () => {
        for (const s of STATES) {
            expectNoLeak(publicView(s), s, null);
            expectNoLeak(wireView(s, meta(s)), s, null);
            for (const seat of s.seats) if (seat) expectNoLeak(playerView(s, seat.pid, playerMeta(s)), s, seat.pid);
        }
    });

    it('shows a seat\'s cards as hidden while dealt and unshown, none when folded or not dealt, face up once shown', () => {
        let s = table({0: 1000, 1: 1000, 2: 1000}, {lastBigBlind: 0});
        s = deal(s, {holes: {0: 'AhAd', 1: 'KhKd', 2: 'QhQd'}});
        s = moves(s, F);
        const v = publicView(s);
        expect(v.seats.slice(0, 3).map((x) => [x!.state, x!.cards])).toEqual([['in-hand', 'hidden'], ['in-hand', 'hidden'], ['folded', 'none']]);
        s = moves(s, A, A);
        expect(publicView(s).seats[0]!.cards).toEqual(cards('AhAd'));
        expect(publicView(s).seats[1]).toMatchObject({state: 'all-in', cards: cards('KhKd')});
        const me = playerView(s, 'p2', playerMeta(s)).me;
        expect(me).toEqual({pid: 'p2', seat: 2, role: 'seated', isHost: false, hasAccount: false, hole: cards('QhQd'), pre: null});
    });
});

describe('what only the viewer sees', () => {
    it('gives a player their own cards and pre-action, a watcher neither, and the config to both', () => {
        let s = deal(table({0: 1000, 1: 1000, 2: 1000}, {lastBigBlind: 0}), {holes: {0: 'AhAd', 1: 'KhKd', 2: 'QhQd'}});
        s = ok(reduce(s, {type: 'pre', by: 'p1', pre: {kind: 'check-fold'}, at: nowOf(s)}));
        const p1 = playerView(s, 'p1', {...playerMeta(s), hasAccount: true});
        expect(p1.me).toEqual({pid: 'p1', seat: 1, role: 'seated', isHost: false, hasAccount: true, hole: cards('KhKd'), pre: {kind: 'check-fold'} as PreAction});
        const host = playerView(s, 'p0', playerMeta(s));
        expect(host.me).toMatchObject({isHost: true, pre: null, hole: cards('AhAd')});
        const watcher = playerView(s, 'w1', playerMeta(s));
        expect(watcher.me).toEqual({pid: 'w1', seat: null, role: 'watching', isHost: false, hasAccount: false, hole: null, pre: null});
        expect(watcher.config).toEqual(s.config);
        expect(watcher.seats[1]!.cards).toBe('hidden');
    });

    it('keeps a history hole only when shown or the viewer\'s own', () => {
        let s = deal(table({0: 1000, 1: 1000, 2: 1000}, {lastBigBlind: 0}), {holes: {0: 'AhAd', 1: 'KhKd', 2: 'QhQd'}});
        const r = reduce(moves(s, F, F), {type: 'show', by: 'p2', at: nowOf(s)});
        s = ok(r);
        const summary = r.ok ? r.hands[0] : null;
        expect(summary!.players.map((p) => p.hole)).toEqual([cards('AhAd'), cards('KhKd'), cards('QhQd')]);
        expect(historyView(summary!, 'p0').players.map((p) => p.hole)).toEqual([cards('AhAd'), null, cards('QhQd')]);
        expect(historyView(summary!, null).players.map((p) => p.hole)).toEqual([null, null, cards('QhQd')]);
        expectNoLeak(historyView(summary!, 'p0'), s, 'p0');
    });
});

describe('the scan itself', () => {
    it('catches a private key, a hidden hole pair and a database id planted in a view', () => {
        const s = deal(table({0: 1000, 1: 1000, 2: 1000}, {lastBigBlind: 0}), {holes: {0: 'AhAd', 1: 'KhKd', 2: 'QhQd'}});
        const view = wireView(s, meta(s));
        expect(leaksIn(view, s, null)).toEqual([]);
        expect(leaksIn({...view, deck: []}, s, null)).toEqual(['key deck']);
        expect(leaksIn({...view, extra: {cards: cards('KdKh')}}, s, null)).toHaveLength(1);
        expect(leaksIn({...view, extra: {cards: cards('KdKh')}}, s, 'p1')).toEqual([]);
        expect(leaksIn({...view, by: '64f0c0ffee0000000000beef'}, s, null)).toEqual(['id 64f0c0ffee0000000000beef']);
    });
});

describe('what the client works out from the wire view', () => {
    it('the bank: the server\'s chips, pot and net for every player of every state', () => {
        for (const s of STATES) {
            expect(bankOf(wireView(s, meta(s)))).toEqual(s.ledger.map((row) => ({
                pid: row.pid, bought: row.bought, cashedOut: row.cashedOut, buys: row.buys,
                chips: chipsOf(s, row.pid), inPot: inPotOf(s, row.pid), net: netOf(s, row.pid), seated: seatOf(s, row.pid) !== null,
            })));
        }
    });

    it('the bank in full: the same figures with each row\'s kept events, and nothing private', () => {
        for (const s of STATES) {
            const detail = bankDetailView(s);
            // toEqual reads an undefined key as absent: the figures alone.
            expect(detail.map((row) => ({...row, events: undefined}))).toEqual(bankOf(wireView(s, meta(s))));
            expect(detail.map((row) => row.events)).toEqual(s.ledger.map((row) => ledgerEvents(s, row)));
            expectNoLeak(detail, s, null);
        }
    });

    it('a shown hand: the server\'s value and the five cards that play', () => {
        let shown = 0;
        for (const s of STATES) {
            const result = s.hand?.result;
            if (!result) continue;
            const hand = publicView(s).hand!;
            expect(hand.result!.hands.map((h) => readShownHand(hand.board, h))).toEqual(result.hands);
            expect(hand.pots).toEqual([]);
            shown += result.hands.length;
        }
        expect(shown).toBeGreaterThan(20);
    });
});

describe('the client\'s legal moves', () => {
    it('rebuilt from the wire view, equal the server\'s for every seat of every state', () => {
        let compared = 0;
        for (const s of STATES) {
            const view = wireView(s, meta(s));
            for (let seat = 0; seat < s.seats.length; seat++) {
                const server = legalFor(snapshotFromState(s), seat);
                expect(legalFor(snapshotFromView(view), seat)).toEqual(server);
                if (server) compared++;
            }
        }
        expect(compared).toBeGreaterThan(200);
    });
});

describe('the hand view', () => {
    it('sends the log\'s tail as wire entries, counts the whole log, and pots without the street\'s bets', () => {
        let s = deal(table({0: 10_000, 1: 10_000, 2: 10_000}, {config: {buyInMax: 10_000}, lastBigBlind: 0}));
        s = moves(s, C, C, X, R(100));
        for (let k = 0; k < 8; k++) s = moves(s, R(s.hand!.currentBet + 100));
        const hand = publicView(s).hand!;
        expect(hand.logTail.length).toBe(KEEP.LOG_TAIL);
        expect(hand.logLength).toBe(s.hand!.log.length);
        expect(hand.logTail.at(-1)).toEqual([2, WIRE_KINDS.indexOf('raise'), 300, 900, 0, 1]);
        expect(hand.pots).toEqual([{amount: 60, eligible: [0, 1, 2]}]);
        expect(livePots(s.hand!)).toEqual(hand.pots);
        expect(publicView(s).seats[2]).toMatchObject({bet: 900, acted: 900});
    });

    it('carries the result with shown hands only, and the next deal\'s time', () => {
        let s = deal(table({0: 1000, 1: 1000, 2: 1000}, {lastBigBlind: 0}), {holes: {0: 'AhAd', 1: 'KhKd', 2: 'QhQd'}, board: '2c7d9s3s4c'});
        s = runOut(moves(s, F, A, A));
        const v = wireView(s, meta(s));
        expect(v.hand!.result!.hands.map((h) => h.seat)).toEqual([0, 1]);
        expect(v.nextHandAt).toBe(s.nextHandAt);
        expect(v.nextDueAt).toBe(s.nextHandAt);
    });
});

describe('the room\'s helpers', () => {
    it('picks the clock leader: the lowest seat here, else the host if here, else nobody', () => {
        const s = table({1: 1000, 3: 1000, 5: 1000}, {host: 'h'});
        expect(clockLeaderOf(s, {p3: 'here', p5: 'here', h: 'here'})).toBe('p3');
        expect(clockLeaderOf(s, {p1: 'hidden', p3: 'offline', h: 'here'})).toBe('h');
        expect(clockLeaderOf(s, {p1: 'hidden', h: 'hidden'})).toBeNull();
    });

    it('names everyone a view mentions: the seats, the ledger, the requests and the host', () => {
        let s = table({0: 1000, 1: 1000}, {host: 'h', config: {rebuys: 'approve', buyInMin: 100, buyInMax: 2000}});
        s = play(s, {type: 'leave', by: 'p1', at: T0}, {type: 'sit', by: 'p4', seat: 4, buyIn: 500, at: T0}, {type: 'buy', by: 'p4', amount: 100, at: T0});
        const ids = peopleIds(s);
        expect([...ids].sort()).toEqual(['h', 'p0', 'p1', 'p4']);
        const view = playerView(s, 'p0', playerMeta(s));
        const named = new Set<string>([view.hostPid, ...view.ledger.map((r) => r.pid), ...view.requests.map((r) => r.pid)]);
        for (const seat of view.seats) if (seat) named.add(seat.pid);
        for (const pid of named) expect(view.people[pid], pid).toBeDefined();
        // The wire view carries no names: they ride beside it in responses, versioned by peopleV.
        const wire = wireView(s, meta(s));
        expect(Object.keys(wire)).not.toContain('people');
        expect([wire.peopleV, view.peopleV]).toEqual([3, 3]);
    });
});
