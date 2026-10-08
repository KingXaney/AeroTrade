// The projections, the only way the state leaves the server. The non-leak property over seeded
// nights: two states that differ only in what is private (the deck's unrevealed cards, unshown hole
// cards, other players' pre-actions, their plans to leave after the hand or to sit out from the next
// deal, the asks between other players and their cooldowns) give the same public and wire views,
// and the same player view for anyone whose own cards did not change. A deep scan finds no private
// key, no hole pair of another player and no database id. What the client works out from the wire
// view — its legal moves, the bank's chips and nets, a shown hand's value and five cards, a pot's
// shares — equals the server's; the clock leader and the people list follow their rules; history
// shows a hole only when it was shown, is the viewer's own or was shown to the viewer alone; an ask
// is seen by its two players only.

import {describe, expect, it} from 'vitest';
import {evaluateCards} from '@/lib/poker/evaluator';
import {legalFor, snapshotFromState} from '@/lib/poker-night/betting';
import {nextDueAt} from '@/lib/poker-night/clock';
import {ASKS, KEEP} from '@/lib/poker-night/config';
import {paidParts} from '@/lib/poker-night/pots';
import {handValue, readShown} from '@/lib/poker-night/variants';
import {reduce} from '@/lib/poker-night/engine';
import {chipsOf, inPotOf, ledgerEvents, netOf} from '@/lib/poker-night/ledger';
import {seatOf} from '@/lib/poker-night/seats';
import type {PreAction, TableState, Variant} from '@/lib/poker-night/types';
import {
    bankDetailView, bankOf, clockLeaderOf, historyView, livePots, nudgeKey, peopleIds, playerView, publicView, snapshotFromView, WIRE_KINDS, wireView,
} from '@/lib/poker-night/views';
import {playerAt} from '@/lib/poker-night/reveal';
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
    removed: [], hasAccount: false, emotes: [], emoteSeq: 0, pass: null, nudge: 0,
});

// Every hole card a viewer may not see: dealt, not shown, not their own.
const hiddenHoles = (s: TableState, viewer: string | null): number[][] =>
    s.hand ? s.hand.seats.filter((p) => !p.shown && p.pid !== viewer).map((p) => [...p.hole]) : [];

// The same state with everything private redrawn: the boards' unrevealed cards and every hidden
// hole (but the viewer's own), from the cards nobody can see; every other player's pre-action, plan
// to leave after the hand and (while the hand is live) sit-out asked for; an ask between two other
// players of a completed hand, and a cooldown between them.
const perturb = (s: TableState, viewer: string | null, seed: number): TableState => {
    const random = mulberry32(seed);
    const t = structuredClone(s);
    const hand = t.hand;
    if (!hand) return t;
    const visible = new Set<number>([...hand.boards.flat(), ...hand.seats.filter((p) => p.shown || p.pid === viewer).flatMap((p) => p.hole)]);
    const pool = Array.from({length: 52}, (_, c) => c).filter((c) => !visible.has(c));
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    let k = 0;
    hand.deck.forEach((run, b) => {
        for (let i = hand.boards[b].length; i < run.length; i++) run[i] = pool[k++];
    });
    const live = hand.phase !== 'complete';
    for (const p of hand.seats) {
        if (p.shown || p.pid === viewer) continue;
        p.hole = p.hole.map(() => pool[k++]);
        p.pre = random() < 0.5 ? null : {kind: 'call-any', atBet: hand.currentBet};
        const seat = t.seats[p.seat];
        if (seat && seat.pid === p.pid && live && !seat.leaving) {
            seat.leaveAfter = random() < 0.5;
            seat.sitOutNext = !seat.leaveAfter && random() < 0.5;
        }
    }
    const others = hand.seats.filter((p) => p.pid !== viewer);
    if (!live && others.length >= 2) {
        hand.asks.push([others[0].seat, others[1].seat, 100, Math.floor(random() * 5)]);
        t.askCooldowns.push([others[0].pid, others[1].pid, hand.no + ASKS.COOLDOWN_HANDS]);
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

// What a view shows that it should not: a private key, another player's hidden hole (two cards, or a
// PLO hand's four), an id.
const leaksIn = (view: unknown, s: TableState, viewer: string | null): string[] => {
    const problems: string[] = [];
    const keys = keysIn(view);
    for (const key of ['deck', 'userId', 'guestId', 'bannedKeys', 'applied', 'atBet', 'discards', 'noAsks', 'askCooldowns', 'leaveAfter', 'sitOutNext', 'seenBy']) {
        if (keys.has(key)) problems.push(`key ${key}`);
    }
    const hidden = new Set(hiddenHoles(s, viewer).map((h) => [...h].sort((x, y) => x - y).join(',')));
    for (const {key, array} of arraysIn(view)) {
        if (array.length < 2 || array.length > 4 || SEAT_LISTS.has(key)) continue;
        const hole = [...array as number[]].sort((x, y) => x - y).join(',');
        if (hidden.has(hole)) problems.push(`hole ${hole} under ${key}`);
    }
    for (const text of stringsIn(view)) if (/^[0-9a-f]{24}$/.test(text)) problems.push(`id ${text}`);
    return problems;
};
const expectNoLeak = (view: unknown, s: TableState, viewer: string | null) => expect(leaksIn(view, s, viewer)).toEqual([]);

// States from seeded nights, every few steps.
const nightStates = (seeds: number, steps: number, variant: Variant = 'holdem'): TableState[] => {
    const out: TableState[] = [];
    for (let seed = 1; seed <= seeds; seed++) {
        let k = 0;
        for (const {state} of randomNight(seed, steps, variant)) if (k++ % 3 === 0) out.push(state);
    }
    return out;
};
// Texas hold'em and PLO (four cards each, pot limit).
const STATES = [...nightStates(12, 500), ...nightStates(6, 500, 'plo')];

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
        expect(v.seats.slice(0, 3).map((x) => [x!.state, x!.cards])).toEqual([['in-hand', 2], ['in-hand', 2], ['folded', 'none']]);
        s = moves(s, A, A);
        expect(publicView(s).seats[0]!.cards).toEqual(cards('AhAd'));
        expect(publicView(s).seats[1]).toMatchObject({state: 'all-in', cards: cards('KhKd')});
        const me = playerView(s, 'p2', playerMeta(s)).me;
        expect(me).toEqual({
            pid: 'p2', seat: 2, role: 'seated', isHost: false, hasAccount: false, hole: cards('QhQd'), pre: null, next: null,
            discard: null, allowAsks: true, asks: [], canAsk: [], askBlocked: [], shownToMe: [], hostAwayAt: null,
        });
    });
});

describe('what only the viewer sees', () => {
    it('gives a player their own cards and pre-action, a watcher neither, and the config to both', () => {
        let s = deal(table({0: 1000, 1: 1000, 2: 1000}, {lastBigBlind: 0}), {holes: {0: 'AhAd', 1: 'KhKd', 2: 'QhQd'}});
        s = ok(reduce(s, {type: 'pre', by: 'p1', pre: {kind: 'check-fold'}, at: nowOf(s)}));
        const p1 = playerView(s, 'p1', {...playerMeta(s), hasAccount: true});
        expect(p1.me).toEqual({
            pid: 'p1', seat: 1, role: 'seated', isHost: false, hasAccount: true, hole: cards('KhKd'), pre: {kind: 'check-fold'} as PreAction, next: null,
            discard: null, allowAsks: true, asks: [], canAsk: [], askBlocked: [], shownToMe: [], hostAwayAt: null,
        });
        const host = playerView(s, 'p0', playerMeta(s));
        expect(host.me).toMatchObject({isHost: true, pre: null, hole: cards('AhAd')});
        const watcher = playerView(s, 'w1', playerMeta(s));
        expect(watcher.me).toEqual({
            pid: 'w1', seat: null, role: 'watching', isHost: false, hasAccount: false, hole: null, pre: null, next: null,
            discard: null, allowAsks: true, asks: [], canAsk: [], askBlocked: [], shownToMe: [], hostAwayAt: null,
        });
        expect(watcher.config).toEqual(s.config);
        expect(watcher.seats[1]!.cards).toBe(2);
    });

    it('says what the viewer\'s own seat does when the hand ends, to them alone: leaving, or sitting out from the next deal', () => {
        let s = deal(table({0: 1000, 1: 1000, 2: 1000}, {lastBigBlind: 0}));
        // Seat 2 folds, then leaves: the plate still reads Folded for everyone, the viewer's own part says leave.
        s = moves(s, F);
        s = ok(reduce(s, {type: 'leave', by: 'p2', at: nowOf(s)}));
        expect(publicView(s).seats[2]!.state).toBe('folded');
        expect(playerView(s, 'p2', playerMeta(s)).me.next).toBe('leave');
        // Seat 0 asks to sit out from the next hand while still in this one.
        s = ok(reduce(s, {type: 'sit-out', by: 'p0', at: nowOf(s)}));
        expect(publicView(s).seats[0]!.state).toBe('in-hand');
        expect(playerView(s, 'p0', playerMeta(s)).me.next).toBe('sit-out');
        expect(playerView(s, 'p1', playerMeta(s)).me.next).toBeNull();
        expect(playerView(s, 'w1', playerMeta(s)).me.next).toBeNull();
        // Never on the wire, nor in the public table.
        expect(keysIn(wireView(s, meta(s))).has('next')).toBe(false);
        expect(keysIn(publicView(s)).has('next')).toBe(false);
    });

    it('says "leave-after" to the viewer alone while they play out the hand they chose to leave after, "leave" once they leave now', () => {
        let s = deal(table({0: 1000, 1: 1000, 2: 1000}, {lastBigBlind: 0}));
        const before = wireView(s, meta(s));
        s = ok(reduce(s, {type: 'leave-after', by: 'p2', on: true, at: nowOf(s)}));
        expect(playerView(s, 'p2', playerMeta(s)).me.next).toBe('leave-after');
        // Leaving now overrides it: nothing takes that back.
        expect(playerView(ok(reduce(s, {type: 'leave', by: 'p2', at: nowOf(s)})), 'p2', playerMeta(s)).me.next).toBe('leave');
        expect(playerView(s, 'p1', playerMeta(s)).me.next).toBeNull();
        expect(publicView(s).seats[2]!.state).toBe('in-hand');
        expect(wireView(s, meta(s))).toEqual(before);
    });

    it('keeps a folded player\'s cards theirs to see through the hand and its pause, and in nobody else\'s view', () => {
        let s = deal(table({0: 1000, 1: 1000, 2: 1000}, {lastBigBlind: 0}), {holes: {0: 'AhAd', 1: 'KhKd', 2: 'QhQd'}, board: '2c7d9s3s4c'});
        s = moves(s, F);
        const others = (st: TableState) => [
            ...['p0', 'p1', 'w1'].map((pid) => ({viewer: pid as string | null, view: playerView(st, pid, playerMeta(st)) as unknown})),
            {viewer: null, view: wireView(st, meta(st)) as unknown},
        ];
        const folded = playerView(s, 'p2', playerMeta(s));
        expect(folded.me.hole).toEqual(cards('QhQd'));
        expect(folded.seats[2]!.cards).toBe('none');
        for (const {viewer, view} of others(s)) expectNoLeak(view, s, viewer);
        // To the end of the hand and into the pause.
        s = moves(s, C, X, X, X, X, X, X, X);
        expect(s.hand!.phase).toBe('complete');
        expect(playerView(s, 'p2', playerMeta(s)).me.hole).toEqual(cards('QhQd'));
        for (const {viewer, view} of others(s)) expectNoLeak(view, s, viewer);
        // Shown, everyone sees them; the next deal, they are gone.
        s = ok(reduce(s, {type: 'show', by: 'p2', at: nowOf(s)}));
        expect(wireView(s, meta(s)).seats[2]!.cards).toEqual(cards('QhQd'));
        s = deal(s, {holes: {2: 'JhJd'}});
        expect(playerView(s, 'p2', playerMeta(s)).me.hole).toEqual(cards('JhJd'));
    });

    it('shows an ask to its two players only, a hand shown alone to the one who asked, and says who may be asked', () => {
        let s = deal(table({0: 1000, 1: 1000, 2: 1000}, {lastBigBlind: 0}), {holes: {0: 'AhAd', 1: 'KhKd', 2: 'QhQd'}});
        s = moves(s, F, F);
        const at = s.hand!.result!.completedAt;
        const viewAt = (st: TableState, pid: string, now: number) => playerView(st, pid, {...playerMeta(st), serverNow: now});
        // Seats 2 and 0 folded; seat 1 won unshown: each folded player may ask seat 1 or the other.
        expect(viewAt(s, 'p2', at).me.canAsk).toEqual(['p0', 'p1']);
        expect(viewAt(s, 'p1', at).me.canAsk).toEqual([]);
        const before = wireView(s, meta(s));
        s = ok(reduce(s, {type: 'ask', by: 'p2', to: 'p1', at: at + 100}));
        const ask = {from: 'p2', to: 'p1', fromSeat: 2, toSeat: 1, at: at + 100, until: at + 100 + ASKS.WAIT_MS, answer: 'waiting'};
        expect(viewAt(s, 'p2', at + 200).me.asks).toEqual([ask]);
        expect(viewAt(s, 'p1', at + 200).me.asks).toEqual([ask]);
        expect(viewAt(s, 'p0', at + 200).me.asks).toEqual([]);
        expect(viewAt(s, 'p2', at + 200).me.canAsk).toEqual([]);
        // Unanswered past its time: a no for both, though nothing was written.
        expect(viewAt(s, 'p1', at + 100 + ASKS.WAIT_MS).me.asks[0].answer).toBe('expired');
        expect(wireView(s, meta(s))).toEqual(before);
        expect(nudgeKey(s, 'p1')).not.toBe(nudgeKey(structuredClone({...s, hand: {...s.hand!, asks: []}}), 'p1'));
        const r = reduce(s, {type: 'reply', by: 'p1', to: 'p2', show: 'one', at: at + 300});
        s = ok(r);
        expect(viewAt(s, 'p2', at + 400).me.shownToMe).toEqual([{seat: 1, cards: cards('KhKd')}]);
        expect(viewAt(s, 'p0', at + 400).me.shownToMe).toEqual([]);
        expect(viewAt(s, 'p1', at + 400).me.shownToMe).toEqual([]);
        expect(wireView(s, meta(s))).toEqual(before);
        expectNoLeak(viewAt(s, 'p0', at + 400), s, 'p0');
        // History: the one who asked sees it, nobody else.
        const summary = r.ok ? r.hands[0] : null;
        expect(historyView(summary!, 'p2').players.find((p) => p.pid === 'p1')!.hole).toEqual(cards('KhKd'));
        expect(historyView(summary!, 'p0').players.find((p) => p.pid === 'p1')!.hole).toBeNull();
        expect(historyView(summary!, null).players.find((p) => p.pid === 'p1')!.hole).toBeNull();
        // Asks off: nobody may ask them, and those who could are told why — they alone.
        const off = ok(reduce(moves(deal(table({0: 1000, 1: 1000, 2: 1000}, {lastBigBlind: 0})), F, F), {type: 'allow-asks', by: 'p1', on: false, at: at + 10}));
        expect(playerView(off, 'p1', playerMeta(off)).me.allowAsks).toBe(false);
        expect(playerView(off, 'p2', {...playerMeta(off), serverNow: at}).me.canAsk).toEqual(['p0']);
        expect(playerView(off, 'p2', {...playerMeta(off), serverNow: at}).me.askBlocked).toEqual([['p1', 'asks-off']]);
        expect(playerView(off, 'p1', {...playerMeta(off), serverNow: at}).me.askBlocked).toEqual([]);
        expect(playerView(off, 'w1', {...playerMeta(off), serverNow: at}).me.askBlocked).toEqual([]);
        expect(keysIn(wireView(off, meta(off))).has('askBlocked')).toBe(false);
        // An ask waiting blocks the rest, for the one who asked alone, until its time is up.
        const waiting = ok(reduce(off, {type: 'ask', by: 'p2', to: 'p0', at: at + 20}));
        expect(playerView(waiting, 'p2', {...playerMeta(waiting), serverNow: at + 30}).me.askBlocked).toEqual([['p1', 'asks-off']]);
        expect(playerView(waiting, 'p0', {...playerMeta(waiting), serverNow: at + 30}).me.askBlocked).toEqual([['p1', 'asks-off']]);
        expect(playerView(waiting, 'p0', {...playerMeta(waiting), serverNow: at + 30}).me.canAsk).toEqual(['p2']);
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

    it('a shown hand: the server\'s value and the five cards that play; a paid pot: the server\'s shares', () => {
        let shown = 0;
        for (const s of STATES) {
            const result = s.hand?.result;
            if (!result) continue;
            const hand = publicView(s).hand!;
            expect(hand.result!.hands).toEqual(result.hands);
            for (const h of hand.result!.hands) {
                const read = readShown(hand.variant, hand.boards, h);
                if (hand.boards[0].length < 3) {
                    expect(read.reads).toEqual([]);
                    continue;
                }
                const all = [...hand.boards[0], ...h.cards];
                expect(read.reads[0].value).toBe(hand.variant === 'plo' ? handValue('plo', h.cards, hand.boards[0]) : evaluateCards(all));
                expect(evaluateCards(read.reads[0].best)).toBe(read.reads[0].value);
                expect(read.reads[0].best.every((c) => all.includes(c))).toBe(true);
            }
            expect(hand.result!.pots.map((p) => paidParts(p).map((part) => part.shares))).toEqual(result.pots.map((p) => p.shares));
            expect(hand.pots).toEqual([]);
            shown += result.hands.length;
        }
        expect(shown).toBeGreaterThan(20);
    });
});

describe('the client\'s legal moves', () => {
    it('rebuilt from the wire view, equal the server\'s for every seat of every state, the pot limit\'s cap included', () => {
        let compared = 0;
        let capped = 0;
        for (const s of STATES) {
            const view = wireView(s, meta(s));
            if (s.hand?.phase === 'betting') expect(snapshotFromView(view).pot).toBe(snapshotFromState(s).pot);
            for (let seat = 0; seat < s.seats.length; seat++) {
                const server = legalFor(snapshotFromState(s), seat);
                expect(legalFor(snapshotFromView(view), seat)).toEqual(server);
                if (server) compared++;
                if (server?.raise && server.raise.max < s.hand!.seats.find((p) => p.seat === seat)!.streetBet + s.seats[seat]!.stack) capped++;
            }
        }
        expect(compared).toBeGreaterThan(150);
        expect(capped).toBeGreaterThan(20);
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
        expect(v.hand!.result!.gone).toEqual([]);
    });

    it('names the players gone from a result\'s seats since the deal, so a winner who left or was replaced keeps their name', () => {
        let s = deal(table({0: 1000, 1: 1000, 2: 1000}, {lastBigBlind: 0}));
        // The big blind leaves owing nothing: in the hand, away, and cashed out as it completes.
        s = ok(reduce(s, {type: 'leave', by: 'p1', at: nowOf(s)}));
        s = moves(s, F, F);
        expect(s.hand!.phase).toBe('complete');
        expect(s.seats[1]).toBeNull();
        let v = wireView(s, meta(s));
        expect(v.hand!.result!.gone).toEqual([[1, 'p1']]);
        expect(playerAt(v, 1)).toBe('p1');
        expect(playerAt(v, 0)).toBe('p0');
        // Someone new takes the seat in the pause: the result still names the player who won.
        s = ok(reduce(s, {type: 'sit', by: 'p7', seat: 1, buyIn: s.config.buyInMax, at: nowOf(s)}));
        v = wireView(s, meta(s));
        expect(v.seats[1]!.pid).toBe('p7');
        expect(v.hand!.result!.gone).toEqual([[1, 'p1']]);
        expect(playerAt(v, 1)).toBe('p1');
        // A view from an older server, with no gone list, reads the seats.
        const old = structuredClone(v) as unknown as {hand: {result: {gone?: unknown}}};
        delete old.hand.result.gone;
        expect(playerAt(old as unknown as typeof v, 1)).toBe('p7');
        // The next deal has no result: the seats.
        s = deal(s);
        expect(playerAt(wireView(s, meta(s)), 1)).toBe('p7');
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
        const named = new Set<string>([view.hostPid, ...view.ledger.map(([pid]) => pid), ...view.requests.map((r) => r.pid)]);
        for (const seat of view.seats) if (seat) named.add(seat.pid);
        for (const pid of named) expect(view.people[pid], pid).toBeDefined();
        // The wire view carries no names: they ride beside it in responses, versioned by peopleV.
        const wire = wireView(s, meta(s));
        expect(Object.keys(wire)).not.toContain('people');
        expect([wire.peopleV, view.peopleV]).toEqual([3, 3]);
    });
});
