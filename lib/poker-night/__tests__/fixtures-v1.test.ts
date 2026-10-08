// The version 1 baselines a later state version migrates from (docs/specs/2026-10-06-poker-night.md,
// lib/poker-night/migrate): written by today's engine and kept as JSON beside state-v1.json, so a
// migration is tested against what live tables really hold, not against what a new engine would
// write. Three files:
//
// - state-v1-showdown.json: a table in the results pause after a showdown with side pots, an
//   uncalled bet handed back and every live hand shown with its value and the five cards that play,
//   plus a folded player who showed in the pause;
// - summary-v1.json: that hand as PokerHand history keeps it (a HandSummary);
// - state-v1-corpus.json: some thirty states from seeded nights, chosen so every phase and seat flag
//   a stored room can hold is there — preflop with pre-actions, a run-out timed by nextStreetAt,
//   leaving and removed seats, pending buys, requests, a closing night, a voided hand, closed and
//   paused tables.
//
// PN_WRITE_FIXTURES=1 npx vitest run lib/poker-night/__tests__/fixtures-v1.test.ts wrote them from the
// version 1 engine; the state version has moved on (2), so they are never written again. This test
// reads the files, holds them to what they promise, and steps every one to version 2
// (migrate.v1ToV2): each comes out valid, keeps its invariants and plays on — its hand to the end,
// and the next one dealt and played — with every chip accounted for.

import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import {legalFor, snapshotFromState} from '@/lib/poker-night/betting';
import {advance} from '@/lib/poker-night/clock';
import {STATE_VERSION} from '@/lib/poker-night/config';
import {FULL_DECK, shuffleWith} from '@/lib/poker-night/deck';
import {createTable, forceClose, reduce} from '@/lib/poker-night/engine';
import {conservation} from '@/lib/poker-night/ledger';
import {migrateState, migrateSummary} from '@/lib/poker-night/migrate';
import {eligibleSeats, isLive} from '@/lib/poker-night/seats';
import type {HandSummary, TableState} from '@/lib/poker-night/types';
import {readShown} from '@/lib/poker-night/variants';
import {mulberry32} from '@/lib/random';
import {A, C, F, X, actBy, actorPid, checkInvariants, deal, moves, nowOf, ok, pidOf, randomNight, T0, table} from './fixtures';

const WRITE = process.env.PN_WRITE_FIXTURES === '1';
const file = (name: string): string => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

// ── the showdown ──

// Five players: p4 folds first, then p0 goes all in for 5,000 and the others call all in on stacks of
// 1,000, 2,000 and 3,000 — so p0 gets 2,000 back uncalled and three pots are built — each pot to a
// different pair (aces the main pot, kings the first side pot, queens the second), and then the
// folded p4 shows in the pause.
const showdown = (): {state: TableState; summary: HandSummary} => {
    let s = table({0: 5000, 1: 1000, 2: 2000, 3: 3000, 4: 2000}, {config: {seats: 6}, lastBigBlind: 2});
    s = deal(s, {holes: {0: '4c4d', 1: 'AhAd', 2: 'KhKd', 3: 'QhQd', 4: '9s8s'}, board: '2c7d5s3hJc'});
    while (s.hand!.phase === 'betting') {
        const legal = legalFor(snapshotFromState(s), s.hand!.actor!)!;
        s = moves(s, actorPid(s) === pidOf(4) ? F : legal.raise ? A : C);
    }
    let summary: HandSummary | null = null;
    while (isLive(s.hand)) {
        const r = reduce(s, {type: 'deal-street', at: s.hand.nextStreetAt!});
        s = ok(r, 'deal-street');
        if (r.ok && r.hands.length > 0) summary = r.hands[r.hands.length - 1];
    }
    const shown = reduce(s, {type: 'show', by: pidOf(4), at: nowOf(s) + 500});
    s = ok(shown, 'show');
    if (shown.ok && shown.hands.length > 0) summary = shown.hands[shown.hands.length - 1];
    if (!summary) throw new Error('the hand made no summary');
    return {state: s, summary};
};

// ── the corpus ──

type Kind =
    | 'open' | 'preflop-pre' | 'flop' | 'turn' | 'river' | 'runout' | 'complete-showdown' | 'complete-uncontested' | 'leaving'
    | 'removed' | 'pending-buy' | 'requests' | 'closing' | 'paused' | 'sitting-out' | 'away' | 'owes-post' | 'busted' | 'voided' | 'closed';

const KINDS: readonly Kind[] = [
    'open', 'preflop-pre', 'flop', 'turn', 'river', 'runout', 'complete-showdown', 'complete-uncontested', 'leaving', 'removed', 'pending-buy',
    'requests', 'closing', 'paused', 'sitting-out', 'away', 'owes-post', 'busted', 'voided', 'closed',
];

// Every kind a state is an example of (a state can be several).
const kindsOf = (s: TableState): Kind[] => {
    const out: Kind[] = [];
    const hand = s.hand;
    const live = isLive(hand);
    if (s.status === 'open') out.push('open');
    if (s.status === 'paused') out.push('paused');
    if (s.status === 'closed') out.push(hand?.log.some((e) => e[0] === -1) ? 'voided' : 'closed');
    if (s.closing) out.push('closing');
    if (live && hand.phase === 'betting') {
        if (hand.street === 'preflop' && hand.seats.some((p) => p.pre !== null)) out.push('preflop-pre');
        if (hand.street !== 'preflop') out.push(hand.street);
    }
    if (live && hand.phase === 'runout' && hand.nextStreetAt !== null) out.push('runout');
    if (hand?.phase === 'complete' && s.status !== 'closed') out.push(hand.result?.showdown ? 'complete-showdown' : 'complete-uncontested');
    for (const seat of s.seats) {
        if (!seat) continue;
        if (seat.leaving && seat.removed) out.push('removed');
        else if (seat.leaving) out.push('leaving');
        if (seat.pendingBuy > 0) out.push('pending-buy');
        if (seat.sittingOut && !seat.away) out.push('sitting-out');
        if (seat.away) out.push('away');
        if (seat.owesPost) out.push('owes-post');
        if (seat.stack === 0 && seat.pendingBuy === 0 && !live) out.push('busted');
    }
    if (s.requests.length > 0) out.push('requests');
    return [...new Set(out)];
};

const PER_KIND = 2;

// The first states of every kind across seeded nights, at most PER_KIND of each and one per night
// and kind, then a voided hand (a live one closed by force) where the nights made none.
const corpus = (): {kind: Kind; state: TableState}[] => {
    // A table before its first deal: the nights start theirs at once.
    let open = createTable({hostPid: pidOf(0), at: T0});
    for (const i of [0, 1, 2]) open = ok(reduce(open, {type: 'sit', by: pidOf(i), seat: i, buyIn: open.config.buyInMax, at: T0 + 1000 * (i + 1)}), 'sit');
    const picked: {kind: Kind; state: TableState}[] = [{kind: 'open', state: open}];
    const count = (kind: Kind) => picked.filter((p) => p.kind === kind).length;
    for (let seed = 1; seed <= 40 && KINDS.some((k) => count(k) < PER_KIND); seed++) {
        const seen = new Set<Kind>();
        let lastLive: TableState | null = null;
        for (const {state} of randomNight(seed, 400)) {
            if (isLive(state.hand)) lastLive = state;
            for (const kind of kindsOf(state)) {
                if (seen.has(kind) || count(kind) >= PER_KIND) continue;
                seen.add(kind);
                picked.push({kind, state: structuredClone(state)});
            }
        }
        if (count('voided') < PER_KIND && lastLive) picked.push({kind: 'voided', state: forceClose(lastLive, nowOf(lastLive) + 1000)});
    }
    return picked;
};

// One state per line, so a regenerated corpus diffs line by line.
const corpusJson = (list: readonly {kind: Kind; state: TableState}[]): string =>
    `{"states": [\n${list.map((entry) => JSON.stringify(entry)).join(',\n')}\n]}\n`;

const read = <T>(name: string): T => JSON.parse(readFileSync(file(name), 'utf8')) as T;

// A live hand played to its end — checks and calls, the run-out on its clock — then, at a table
// still dealing, the next hand dealt from a seeded deck and played the same way. Every state on the
// way keeps its invariants.
const playOn = (start: TableState, seed: number): TableState => {
    const random = mulberry32(seed);
    const source = {deck: () => shuffleWith(FULL_DECK, (max) => Math.floor(random() * max)), draw: () => 0};
    const finish = (from: TableState): TableState => {
        let s = from;
        for (let guard = 0; guard < 400 && isLive(s.hand); guard++) {
            const hand = s.hand;
            if (hand.phase === 'betting') {
                const legal = legalFor(snapshotFromState(s), hand.actor!)!;
                s = ok(reduce(s, actBy(s, actorPid(s), legal.check ? X : C, nowOf(s))));
            } else if (hand.phase === 'runout') {
                s = ok(reduce(s, {type: 'deal-street', at: hand.nextStreetAt!}));
            } else {
                throw new Error(`a ${hand.phase} hand cannot be played on here`);
            }
            checkInvariants(s);
        }
        return s;
    };
    let s = finish(start);
    if (s.status === 'playing' && !s.closing && s.nextHandAt !== null && eligibleSeats(s).length >= 2) {
        s = advance(s, s.nextHandAt, source).state;
        expect(isLive(s.hand)).toBe(true);
        s = finish(s);
    }
    return s;
};

describe('the version 1 baselines', () => {
    it.runIf(WRITE)('are written from today\'s engine', () => {
        expect(STATE_VERSION).toBe(1);
        const {state, summary} = showdown();
        writeFileSync(file('state-v1-showdown.json'), `${JSON.stringify(state, null, 2)}\n`);
        writeFileSync(file('summary-v1.json'), `${JSON.stringify(summary, null, 2)}\n`);
        const list = corpus();
        expect(KINDS.filter((kind) => !list.some((entry) => entry.kind === kind))).toEqual([]);
        writeFileSync(file('state-v1-corpus.json'), corpusJson(list));
    });

    it('keep a showdown with side pots, a refund and every hand shown with its value and the five cards that play', () => {
        const raw = read<Record<string, unknown>>('state-v1-showdown.json');
        expect(raw.v).toBe(1);
        const s = migrateState(structuredClone(raw));
        expect(s).not.toBeNull();
        expect(STATE_VERSION).toBe(2);
        checkInvariants(s!);
        const result = s!.hand!.result!;
        expect(s!.hand!.phase).toBe('complete');
        expect(result.showdown).toBe(true);
        expect(result.refund).toEqual({seat: 0, amount: 2000});
        expect(result.pots.map((p) => p.amount)).toEqual([4000, 3000, 2000]);
        // Each pot paid on the one board.
        expect(result.pots.map((p) => [p.winners, p.shares])).toEqual([[[[1]], [[4000]]], [[[2]], [[3000]]], [[[3]], [[2000]]]]);
        expect(result.hands).toHaveLength(5);
        // Shown hands keep their cards; the value and five cards that play the version 1 state
        // stored are read from them now, and come out the same.
        const old = (raw as {hand: {result: {hands: {cards: number[]; value: number; best: number[]}[]}}}).hand.result.hands;
        result.hands.forEach((h, k) => {
            expect(h).toEqual({seat: h.seat, cards: old[k].cards});
            const read = readShown(s!.hand!.variant, s!.hand!.boards, h).reads[0];
            expect(read.value).toBe(old[k].value);
            expect(read.best).toHaveLength(5);
        });
        // The folded player's hand, shown in the pause, is the last.
        expect(result.hands[4].seat).toBe(4);
        expect(s!.hand!.seats.find((p) => p.seat === 4)).toMatchObject({folded: true, shown: true});
        // And the table deals on.
        const on = playOn(s!, 1);
        expect(on.handNo).toBe(2);
        expect(conservation(on).ok).toBe(true);
    });

    it('keep that hand as history holds it', () => {
        // Version 1's shape: one board, flat pots.
        const summary = read<Omit<HandSummary, 'boards' | 'pots'> & {board: number[]; pots: {winners: number[]; shares: number[]}[]}>('summary-v1.json');
        expect(summary.board).toHaveLength(5);
        expect(summary.players).toHaveLength(5);
        for (const p of summary.players) expect(p.hole).toHaveLength(2);
        expect(summary.pots.map((p) => [p.winners, p.shares])).toEqual([[[1], [4000]], [[2], [3000]], [[3], [2000]]]);
        expect(summary.hands).toHaveLength(5);
        expect(summary.players.find((p) => p.seat === 4)).toMatchObject({shown: true});
        // Read back through migrateSummary, it is today's shape.
        const now = migrateSummary(summary)!;
        expect(now.boards).toEqual([summary.board]);
        expect(now.pots.map((p) => [p.winners, p.shares])).toEqual([[[[1]], [[4000]]], [[[2]], [[3000]]], [[[3]], [[2000]]]]);
    });

    it('keep a corpus with every phase and seat flag a stored room can hold, each one a valid state', () => {
        const {states} = read<{states: {kind: Kind; state: Record<string, unknown>}[]}>('state-v1-corpus.json');
        expect(states.length).toBeGreaterThanOrEqual(30);
        for (const kind of KINDS) expect(states.some((entry) => entry.kind === kind), kind).toBe(true);
        let played = 0;
        states.forEach(({kind, state: raw}, i) => {
            expect(raw.v, kind).toBe(1);
            const s = migrateState(structuredClone(raw));
            expect(s, kind).not.toBeNull();
            expect(s!.v, kind).toBe(2);
            checkInvariants(s!);
            expect(kindsOf(s!), kind).toContain(kind);
            // Version 2 throughout: read again it is the same object, through JSON an equal one.
            expect(migrateState(s), kind).toBe(s);
            expect(migrateState(JSON.parse(JSON.stringify(s))), kind).toEqual(s);
            const on = playOn(s!, i + 1);
            expect(conservation(on).ok, kind).toBe(true);
            if (on.handNo > s!.handNo || (isLive(s!.hand) && !isLive(on.hand))) played++;
        });
        expect(played).toBeGreaterThanOrEqual(15);
    });
});
