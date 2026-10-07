// The table's feed as the browser keeps it: a view applies only when it is newer, whatever order the
// answers come in; an unchanged answer moves the clock and the emotes, and says when a GET state is
// due; emotes are kept once each and never from before the page loaded; events fire once; a
// realtime message keeps the viewer's own part, drops what it shows is over, and says when it went
// stale, and the whole view fetched for it still lands. Then the decisions: the poll's wait, who
// ticks the clock and when, which transport to trust (the realtime monitor and its watchdog), and
// the seat pass's margin.

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {nextDueAt} from '@/lib/poker-night/clock';
import {
    BOTH_FOR_MS, createTicker, EMOTE_GRACE_MS, FALLBACK_QUIET_MS, feedMode, feedReducer, handLive, initialFeed, initialMonitor, isBehind, mergeEmotes,
    mergeWire, monitorLive, monitorStep, nearTurn, needsPrivate, nextPollDelay, nextTickAt, passExpiry, passFresh, pollPace, readAgain, shouldRetick, TICK_BACKOFF_MS,
    TICK_RETRIES, TICK_RETRY_MS, tickRole, TOKEN_RETRY_LATER_MS, tokenRetryDelay, tokenRetryLate, transportOf, transportPolicy, watchdogTripped, type FeedState,
    type RealtimeMonitor, type TickerFeed, type TickOutcome,
} from '@/lib/poker-night/feed';
import type {TableState} from '@/lib/poker-night/types';
import type {EmoteView, PlayerView, RoomView, Unchanged, WireView} from '@/lib/poker-night/view-types';
import {clockLeaderOf, peopleIds, peopleView, playerView, wireView} from '@/lib/poker-night/views';
import {C, R, deal, moves, nowOf, pidOf, play, table, T0} from './fixtures';

const people = (s: TableState) => Object.fromEntries(peopleIds(s).map((pid) => [pid, {name: pid.toUpperCase(), avatar: 'v1:fox:tangerine:ring:crown'}]));

const metaOf = (s: TableState, seq: number, serverNow: number, extra: {clockLeader?: string | null; peopleV?: number} = {}) => ({
    code: 'K7QXM4', seq, serverNow, nextDueAt: nextDueAt(s), clockLeader: extra.clockLeader ?? clockLeaderOf(s, {}), presence: {}, watchers: 0,
    realtimeOk: true, peopleV: extra.peopleV ?? 1,
});

const pv = (s: TableState, pid: string, seq: number, opts: {serverNow?: number; emotes?: EmoteView[]; emoteSeq?: number; pass?: string | null; clockLeader?: string | null} = {}): PlayerView =>
    playerView(s, pid, {
        ...metaOf(s, seq, opts.serverNow ?? nowOf(s), {clockLeader: opts.clockLeader}), people: people(s), removed: [], hasAccount: false,
        emotes: opts.emotes ?? [], emoteSeq: opts.emoteSeq ?? 0, pass: opts.pass ?? null,
    });

const wire = (s: TableState, seq: number, extra: {peopleV?: number} = {}): WireView => wireView(s, metaOf(s, seq, nowOf(s), extra));
const room = (s: TableState, seq: number): RoomView => ({...wire(s, seq), ...peopleView(people(s), [])});

const emote = (id: string, seq: number, at: number): EmoteView => ({kind: 'react', item: 'laugh', id, seq, from: pidOf(0), at});

const unchanged = (seq: number, extra: Partial<Unchanged> = {}): Unchanged =>
    ({unchanged: true, seq, emoteSeq: 0, serverNow: T0 + 5000, nextDueAt: null, emotes: [], pass: null, realtimeOk: true, ...extra});

const three = () => table({0: 1000, 1: 1000, 2: 1000}, {lastBigBlind: 0});

describe('applying views', () => {
    it('applies a view only when it is newer than the one held', () => {
        const s0 = three();
        const s1 = deal(s0);
        let f = initialFeed({view: pv(s0, pidOf(0), 5)});
        f = feedReducer(f, {type: 'view', view: pv(s1, pidOf(0), 7), at: T0});
        expect(f.seq).toBe(7);
        const held = f;
        // A slower answer about the older table arrives after: nothing changes but the clock.
        f = feedReducer(f, {type: 'view', view: pv(s0, pidOf(0), 6), at: T0});
        expect(f.view).toBe(held.view);
        expect(f.seq).toBe(7);
        f = feedReducer(f, {type: 'view', view: pv(s1, pidOf(0), 7), at: T0});
        expect(f.view).toBe(held.view);
    });

    it('takes a join\'s answer as the first view, whatever its seq, and drops the preview', () => {
        const s = three();
        let f = initialFeed({preview: room(s, 9)});
        expect(f.view).toBeNull();
        expect(f.preview).not.toBeNull();
        f = feedReducer(f, {type: 'view', view: pv(s, pidOf(1), 9), at: T0});
        expect(f.view?.me.pid).toBe(pidOf(1));
        expect(f.preview).toBeNull();
    });

    it('takes a visitor\'s refreshed page as the fresher table, never over a joined view', () => {
        const s0 = three();
        const s1 = deal(s0);
        let f = initialFeed({preview: room(s0, 4)});
        // The same seq read later (a presence change moves no seq) and a newer seq both apply.
        const later = {...room(s0, 4), serverNow: nowOf(s0) + 5000};
        f = feedReducer(f, {type: 'preview', preview: later});
        expect(f.preview).toBe(later);
        f = feedReducer(f, {type: 'preview', preview: room(s1, 6)});
        expect(f.seq).toBe(6);
        expect(f.preview?.hand?.no).toBe(s1.hand?.no);
        // An older page changes nothing; neither does any page once the visitor has joined.
        expect(feedReducer(f, {type: 'preview', preview: room(s0, 5)})).toBe(f);
        const joined = feedReducer(f, {type: 'view', view: pv(s1, pidOf(1), 7), at: T0});
        expect(feedReducer(joined, {type: 'preview', preview: room(s1, 9)})).toBe(joined);
    });

    it('keeps the last pass it was given and resets failures on any answer', () => {
        const s = three();
        let f = initialFeed({view: pv(s, pidOf(0), 1, {pass: 'first'})});
        f = feedReducer(f, {type: 'failed'});
        f = feedReducer(f, {type: 'failed'});
        expect(feedMode(f)).toBe('reconnecting');
        f = feedReducer(f, {type: 'view', view: pv(s, pidOf(0), 2), at: T0});
        expect(f.pass).toBe('first');
        expect(f.failures).toBe(0);
        expect(feedMode(f)).toBe('polling');
        f = feedReducer(f, {type: 'unchanged', body: unchanged(2, {pass: 'second'}), at: T0});
        expect(f.pass).toBe('second');
    });

    it('fires a diff\'s events once, and snaps when told not to animate', () => {
        const s0 = three();
        const s1 = deal(s0);
        const s2 = moves(s1, R(60));
        let f = initialFeed({view: pv(s0, pidOf(0), 1)});
        f = feedReducer(f, {type: 'view', view: pv(s1, pidOf(0), 2), at: T0});
        expect(f.events.map((e) => e.kind)).toEqual(['deal', 'chips-out', 'chips-out', 'turn']);
        expect(f.events.every((e) => e.seenAt === T0)).toBe(true);
        const quiet = feedReducer(f, {type: 'view', view: pv(s2, pidOf(0), 3), at: T0 + 100, animate: false});
        expect(quiet.events).toHaveLength(4);
        f = feedReducer(f, {type: 'view', view: pv(s2, pidOf(0), 3), at: T0 + 100});
        expect(f.events.map((e) => e.kind)).toEqual(['deal', 'chips-out', 'chips-out', 'turn', 'chips-out', 'turn']);
        // Events age out.
        f = feedReducer(f, {type: 'view', view: pv(moves(s2, C), pidOf(0), 4), at: T0 + 60_000});
        expect(f.events.every((e) => e.seenAt === T0 + 60_000)).toBe(true);
    });

    it('takes clock samples from round trips', () => {
        const s = three();
        let f = initialFeed({view: pv(s, pidOf(0), 1, {serverNow: T0})});
        f = feedReducer(f, {type: 'mounted', at: T0 - 3000});
        expect(f.offset).toBe(3000);
        f = feedReducer(f, {type: 'view', view: pv(s, pidOf(0), 2, {serverNow: T0 + 2100}), at: T0 + 200, sentAt: T0});
        expect(f.offset).toBe(2000);
        // A later mount guess never overrides a real sample.
        expect(feedReducer(f, {type: 'mounted', at: 0}).offset).toBe(2000);
    });
});

describe('unchanged answers', () => {
    it('moves the clock and asks for a GET state when the table moved', () => {
        const s = three();
        let f = initialFeed({view: pv(s, pidOf(0), 4)});
        f = feedReducer(f, {type: 'unchanged', body: unchanged(4, {nextDueAt: T0 + 9000}), at: T0});
        expect(f.nextDueAt).toBe(T0 + 9000);
        expect(isBehind(f)).toBe(false);
        // A tick names a newer seq (someone else's commit): a GET state is due.
        f = feedReducer(f, {type: 'unchanged', body: unchanged(6, {nextDueAt: T0 + 1}), at: T0});
        expect(isBehind(f)).toBe(true);
        expect(f.nextDueAt).toBe(T0 + 9000);
    });

    it('moves the emote seq only by the emotes it delivered', () => {
        const s = three();
        let f = initialFeed({view: pv(s, pidOf(0), 4, {serverNow: T0})});
        // A tick says there are new emotes without carrying them.
        f = feedReducer(f, {type: 'unchanged', body: unchanged(4, {emoteSeq: 3}), at: T0});
        expect(f.emoteSeq).toBe(0);
        expect(isBehind(f)).toBe(true);
        f = feedReducer(f, {type: 'unchanged', body: unchanged(4, {emoteSeq: 3, emotes: [emote('a', 2, T0 + 10), emote('b', 3, T0 + 20)]}), at: T0});
        expect(f.emoteSeq).toBe(3);
        expect(isBehind(f)).toBe(false);
        expect(f.emotes.map((e) => e.id)).toEqual(['a', 'b']);
    });
});

describe('emotes', () => {
    it('keeps each once, in order, and none from before the page loaded', () => {
        const floor = T0 - EMOTE_GRACE_MS;
        const held = [emote('a', 1, T0)];
        const merged = mergeEmotes(held, [emote('a', 1, T0), emote('old', 0, floor - 1), emote('c', 3, T0 + 2), emote('b', 2, T0 + 1)], floor);
        expect(merged.map((e) => e.id)).toEqual(['a', 'b', 'c']);
    });

    it('treats the page\'s own emotes as history', () => {
        const s = three();
        const f = initialFeed({view: pv(s, pidOf(0), 1, {serverNow: T0, emotes: [emote('a', 1, T0 - 10)], emoteSeq: 1})});
        expect(f.emotes).toEqual([]);
        expect(f.emoteSeq).toBe(1);
    });
});

describe('realtime messages', () => {
    it('lay the public table over the viewer\'s own part', () => {
        const s0 = three();
        const s1 = deal(s0);
        const mine = pv(s1, pidOf(0), 3);
        const merged = mergeWire(mine, wire(moves(s1, R(60)), 4));
        expect(merged.seq).toBe(4);
        expect(merged.me).toBe(mine.me);
        expect(merged.config).toBe(mine.config);
        expect(merged.people).toBe(mine.people);
        let f: FeedState = initialFeed({view: mine});
        f = feedReducer(f, {type: 'wire', wire: wire(moves(s1, R(60)), 4), at: T0});
        expect(f.seq).toBe(4);
        expect(f.events.map((e) => e.kind)).toEqual(['chips-out', 'turn']);
        const same = feedReducer(f, {type: 'wire', wire: wire(s1, 3), at: T0});
        expect(same).toBe(f);
    });

    it('say when the viewer\'s own part went stale', () => {
        const s0 = three();
        const s1 = deal(s0);
        const before = pv(s0, pidOf(0), 1);
        expect(needsPrivate(null, wire(s0, 1))).toBe(true);
        expect(needsPrivate(before, wire(s0, 2))).toBe(false);
        // A new hand the viewer is dealt into: their cards.
        expect(needsPrivate(before, wire(s1, 2))).toBe(true);
        // Names or looks moved.
        expect(needsPrivate(before, wire(s0, 2, {peopleV: 2}))).toBe(true);
        // Their seat changed: a watcher's view sees nothing new until they sit.
        const watcher = pv(s0, pidOf(5), 1);
        expect(needsPrivate(watcher, wire(s0, 2))).toBe(false);
        expect(needsPrivate(pv(s1, pidOf(0), 2), wire(moves(s1, R(60)), 3))).toBe(false);
    });

    it('drop at once what the message shows is over: the last hand\'s cards, a pre-action the server cleared', () => {
        // Seat 2 (the button) acts first, then 0, then 1: seat 1, the big blind, waits with call-any.
        const s1 = deal(three());
        const waiting = play(s1, {type: 'pre', by: pidOf(1), pre: {kind: 'call-any'}, at: nowOf(s1)});
        const mine = pv(waiting, pidOf(1), 3);
        expect(mine.me.pre).toEqual({kind: 'call-any'});
        expect(mine.me.hole).not.toBeNull();
        // Seat 2 raises: nothing about seat 1 moved, so its own part stands as it was.
        const raised = moves(waiting, R(60));
        const merged = mergeWire(mine, wire(raised, 4));
        expect(merged.me).toBe(mine.me);
        // Seat 0 calls: the turn reaches seat 1, whose pre-action plays and is cleared.
        const called = mergeWire(merged, wire(moves(raised, C), 5));
        expect(called.me.pre).toBeNull();
        expect(called.me.hole).toEqual(mine.me.hole);
        // The next hand's message: the last hand's cards are not this one's.
        const next = wire(moves(raised, C), 6);
        const dealt = mergeWire(mine, {...next, hand: {...next.hand!, no: next.hand!.no + 1}});
        expect(dealt.me.hole).toBeNull();
        expect(dealt.me.pre).toBeNull();
        expect(dealt.me.pid).toBe(pidOf(1));
    });

    it('let the whole view of a table a message already showed in, once, for the viewer\'s own part', () => {
        const s0 = three();
        const s1 = deal(s0);
        let f = initialFeed({view: pv(s0, pidOf(0), 1)});
        f = feedReducer(f, {type: 'wire', wire: wire(s1, 2), at: T0});
        expect(f.seq).toBe(2);
        expect(f.privateSeq).toBe(1);
        expect(f.view!.me.hole).toBeNull();
        const whole = pv(s1, pidOf(0), 2);
        f = feedReducer(f, {type: 'view', view: whole, at: T0});
        expect(f.view).toBe(whole);
        expect(f.privateSeq).toBe(2);
        expect(f.view!.me.hole).not.toBeNull();
        // Once: a second answer for the same seq changes nothing but the clock.
        expect(feedReducer(f, {type: 'view', view: pv(s1, pidOf(0), 2), at: T0}).view).toBe(whole);
        // A message that leaves the viewer's own part as it was carries it on: the next poll may
        // be answered Unchanged.
        const later = feedReducer(f, {type: 'wire', wire: wire(moves(s1, R(60)), 3), at: T0});
        expect(later.privateSeq).toBe(3);
        // An older whole view is still older.
        expect(feedReducer(later, {type: 'view', view: pv(s1, pidOf(0), 2), at: T0}).seq).toBe(3);
        // Once stale, it stays stale until a whole view comes, whatever the messages after.
        let stale = initialFeed({view: pv(s0, pidOf(0), 1)});
        stale = feedReducer(stale, {type: 'wire', wire: wire(s1, 2), at: T0});
        stale = feedReducer(stale, {type: 'wire', wire: wire(moves(s1, R(60)), 3), at: T0});
        expect([stale.seq, stale.privateSeq]).toEqual([3, 1]);
    });

    it('keep the viewer\'s own part from a whole view the next message overtook', () => {
        // The deal's message asks for the whole view; the first actor's move comes over the channel
        // before that read's answer, which is older than the table held by then.
        const s0 = three();
        const s1 = deal(s0);
        const s2 = moves(s1, C);
        let f = initialFeed({view: pv(s0, pidOf(0), 10)});
        f = feedReducer(f, {type: 'wire', wire: wire(s1, 11), at: T0});
        expect(needsPrivate(pv(s0, pidOf(0), 10), wire(s1, 11))).toBe(true);
        f = feedReducer(f, {type: 'wire', wire: wire(s2, 12), at: T0});
        expect([f.seq, f.privateSeq, f.view!.me.hole]).toEqual([12, 10, null]);
        const whole = pv(s1, pidOf(0), 11);
        const held = f;
        f = feedReducer(f, {type: 'view', view: whole, at: T0 + 50});
        // The cards, the config and the people of the read, under the newer table: fresh as of 12.
        expect(f.seq).toBe(12);
        expect(f.privateSeq).toBe(12);
        expect(f.view!.me.hole).toEqual(whole.me.hole);
        expect(f.view!.me.hole).not.toBeNull();
        expect(f.view!.seats).toBe(held.view!.seats);
        expect(f.view!.hand).toBe(held.view!.hand);
        expect(f.view!.people).toBe(whole.people);
        expect(isBehind(f)).toBe(false);
        // The read answered once is not taken twice, and the next message carries the part on.
        expect(feedReducer(f, {type: 'view', view: whole, at: T0 + 60}).view).toBe(f.view);
        expect(feedReducer(f, {type: 'wire', wire: wire(moves(s2, C), 13), at: T0}).privateSeq).toBe(13);
    });

    it('keep an older whole view\'s own part only when nothing between it and the table held could have changed it', () => {
        const s0 = three();
        const s1 = deal(s0);
        const s2 = moves(s1, C);
        const start = (peopleV = 1) => {
            let f = initialFeed({view: pv(s0, pidOf(0), 10)});
            f = feedReducer(f, {type: 'wire', wire: wire(s1, 11), at: T0});
            return feedReducer(f, {type: 'wire', wire: wire(s2, 12, {peopleV}), at: T0});
        };
        // Read before the deal: no cards of this hand in it.
        const early = feedReducer(start(), {type: 'view', view: pv(s0, pidOf(0), 11), at: T0});
        expect([early.seq, early.privateSeq, early.view!.me.hole]).toEqual([12, 10, null]);
        // The people moved after the read: its names are not the table's.
        const renamed = feedReducer(start(2), {type: 'view', view: pv(s1, pidOf(0), 11), at: T0});
        expect([renamed.seq, renamed.privateSeq, renamed.view!.me.hole]).toEqual([12, 10, null]);
        // No newer than the part held: nothing to bring.
        let fresh = initialFeed({view: pv(s1, pidOf(0), 11)});
        fresh = feedReducer(fresh, {type: 'wire', wire: wire(s2, 12), at: T0});
        expect(fresh.privateSeq).toBe(12);
        expect(feedReducer(fresh, {type: 'view', view: pv(s1, pidOf(0), 11), at: T0}).view).toBe(fresh.view);
    });

    it('carry the viewer\'s own part on only while no move of theirs is out', () => {
        // Seat 1, the big blind, sets a pre-action; its own commit comes over the channel before the
        // move's answer, and shows nothing of it.
        const s1 = deal(three());
        const waiting = play(s1, {type: 'pre', by: pidOf(1), pre: {kind: 'call-any'}, at: nowOf(s1)});
        let f = initialFeed({view: pv(s1, pidOf(1), 3)});
        const moving = feedReducer(f, {type: 'wire', wire: wire(waiting, 4), at: T0, moving: true});
        expect([moving.seq, moving.privateSeq]).toEqual([4, 3]);
        expect(feedReducer(f, {type: 'wire', wire: wire(waiting, 4), at: T0}).privateSeq).toBe(4);
        // The answer lands on the same seq: its own part is taken, the pre-action with it.
        f = feedReducer(moving, {type: 'view', view: pv(waiting, pidOf(1), 4), at: T0});
        expect(f.view!.me.pre).toEqual({kind: 'call-any'});
        expect(f.privateSeq).toBe(4);
        // Or after the next message: kept under it, as long as seat 1 is as it was.
        const raised = moves(waiting, R(60));
        let late = feedReducer(moving, {type: 'wire', wire: wire(raised, 5), at: T0});
        late = feedReducer(late, {type: 'view', view: pv(waiting, pidOf(1), 4), at: T0});
        expect([late.seq, late.privateSeq]).toEqual([5, 5]);
        expect(late.view!.me.pre).toEqual({kind: 'call-any'});
    });

    it('name the host from the message', () => {
        const s = three();
        const mine = pv(s, pidOf(1), 1);
        expect(mine.me.isHost).toBe(false);
        const handed = {...wire(s, 2), hostPid: pidOf(1)};
        expect(mergeWire(mine, handed).me.isHost).toBe(true);
        expect(mergeWire(mine, wire(s, 2)).me).toBe(mine.me);
    });
});

describe('the poll', () => {
    const base = {mode: 'polling' as const, hidden: false, inHand: false, nearTurn: false, failures: 0, scale: 0};

    it('waits per the table', () => {
        expect(nextPollDelay({...base, hidden: true})).toBeNull();
        expect(nextPollDelay(base)).toBe(4000);
        expect(nextPollDelay({...base, inHand: true})).toBe(3000);
        expect(nextPollDelay({...base, inHand: true, nearTurn: true})).toBe(1500);
        expect(nextPollDelay({...base, mode: 'realtime', inHand: true})).toBe(20_000);
        expect(nextPollDelay({...base, failures: 1})).toBe(3000);
        expect(nextPollDelay({...base, failures: 2})).toBe(6000);
        expect(nextPollDelay({...base, failures: 9})).toBe(10_000);
        expect(nextPollDelay({...base, inHand: true, nearTurn: true, scale: 2500})).toBe(2500);
    });

    it('keeps to the safety poll over a healthy channel only while the viewer\'s own part is fresh', () => {
        expect(pollPace('realtime', {seq: 5, privateSeq: 5})).toBe('realtime');
        // A read for it failed, or came back older than a message: the table's own pace until it lands.
        expect(pollPace('realtime', {seq: 6, privateSeq: 5})).toBe('polling');
        expect(pollPace('both', {seq: 5, privateSeq: 5})).toBe('polling');
        expect(pollPace('poll', {seq: 5, privateSeq: 5})).toBe('polling');
    });

    it('reads again at once while an answer leaves the table or the viewer\'s own part behind', () => {
        const held = {seq: 12, privateSeq: 12, emoteSeq: 0, knownSeq: 12, knownEmoteSeq: 0};
        expect(readAgain({again: false, whole: true, state: held})).toBe(false);
        expect(readAgain({again: true, whole: false, state: held})).toBe(true);
        expect(readAgain({again: false, whole: false, state: {...held, knownSeq: 13}})).toBe(true);
        // A whole view older than the messages, whose own part could not be kept: once more, now.
        expect(readAgain({again: false, whole: true, state: {...held, privateSeq: 10}})).toBe(true);
        // An Unchanged says the server has nothing newer than the read asked from: the pace, not a loop.
        expect(readAgain({again: false, whole: false, state: {...held, privateSeq: 10}})).toBe(false);
    });

    it('knows a live hand and when the action is near', () => {
        const s0 = three();
        const s1 = deal(s0);
        // Seat 2 (the button) acts first, then 0, then 1.
        expect(handLive(pv(s0, pidOf(0), 1))).toBe(false);
        expect(handLive(pv(s1, pidOf(0), 1))).toBe(true);
        expect(nearTurn(pv(s1, pidOf(2), 1), 2)).toBe(true);
        expect(nearTurn(pv(s1, pidOf(1), 1), 1, 2)).toBe(true);
        expect(nearTurn(pv(s1, pidOf(0), 1), 0, 1)).toBe(true);
        expect(nearTurn(pv(s1, pidOf(1), 1), 1, 1)).toBe(false);
        expect(nearTurn(pv(s1, pidOf(5), 1), null)).toBe(false);
    });
});

describe('the clock', () => {
    it('names who ticks', () => {
        const s = three();
        expect(tickRole(pv(s, pidOf(0), 1, {clockLeader: pidOf(0)}))).toBe('leader');
        expect(tickRole(pv(s, pidOf(1), 1, {clockLeader: pidOf(0)}))).toBe('fallback');
        expect(tickRole(pv(s, pidOf(7), 1, {clockLeader: pidOf(0)}))).toBe('none');
        // The host ticks even unseated.
        const hosted = table({1: 1000, 2: 1000}, {host: pidOf(0), lastBigBlind: 1});
        expect(tickRole(pv(hosted, pidOf(0), 1, {clockLeader: null}))).toBe('fallback');
        expect(tickRole(null)).toBe('none');
    });

    it('ticks the leader just after the due time and the others later', () => {
        expect(nextTickAt({nextDueAt: 10_000, offset: 2000, role: 'leader', rand: 0})).toBe(8050);
        expect(nextTickAt({nextDueAt: 10_000, offset: 2000, role: 'leader', rand: 0.999})).toBeLessThan(8300);
        expect(nextTickAt({nextDueAt: 10_000, offset: 2000, role: 'fallback', rand: 0})).toBe(9500);
        expect(nextTickAt({nextDueAt: 10_000, offset: 2000, role: 'fallback', rand: 0.999})).toBeLessThan(10_500);
        expect(nextTickAt({nextDueAt: 10_000, offset: 0, role: 'none', rand: 0})).toBeNull();
        expect(nextTickAt({nextDueAt: null, offset: 0, role: 'leader', rand: 0})).toBeNull();
    });

    it('ticks again only while the same due time is still past on the server', () => {
        expect(shouldRetick({nextDueAt: 100, serverNow: 150}, 100)).toBe(true);
        expect(shouldRetick({nextDueAt: 100, serverNow: 50}, 100)).toBe(false);
        expect(shouldRetick({nextDueAt: 200, serverNow: 250}, 100)).toBe(false);
        expect(shouldRetick({nextDueAt: null, serverNow: 250}, 100)).toBe(false);
    });
});

// The ticker on fake timers, the way useTableFeed runs it: a send's answer goes into the feed (and so
// through ticker.feed) before the send settles, exactly as take() and end() dispatch into the store.
describe('the ticker', () => {
    type Answer = {outcome: TickOutcome; feed?: Partial<TickerFeed>};
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(T0);
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    // A ticker whose sends answer with `answer(n)` (n counts from 1), immediately or when released.
    const rig = (initial: TickerFeed, answer: (n: number, due: number) => Answer | Promise<Answer>) => {
        let feed = {...initial};
        const sent: {at: number; due: number}[] = [];
        const ticker = createTicker({
            now: () => Date.now(),
            rand: () => 0.5,
            setTimer: (fire, ms) => setTimeout(fire, ms),
            clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
            send: async (due) => {
                sent.push({at: Date.now(), due});
                const a = await answer(sent.length, due);
                // The answer lands in the store first: a failure counts, anything else clears them.
                feed = {...feed, ...a.feed, failures: a.outcome === 'transient' ? feed.failures + 1 : 0};
                ticker.feed(feed);
                return a.outcome;
            },
            seq: () => feed.seq,
            offset: () => feed.offset,
        });
        const set = (patch: Partial<TickerFeed>) => {
            feed = {...feed, ...patch};
            ticker.feed(feed);
        };
        return {ticker, sent, set, feed: () => feed};
    };
    const leader = (due: number): TickerFeed => ({due, role: 'leader', seq: 1, offset: 0, failures: 0});

    it('sends at most 1 + TICK_RETRIES ticks for a due time that keeps failing, backing off', async () => {
        const r = rig(leader(T0 - 1000), () => ({outcome: 'transient'}));
        r.ticker.feed(r.feed());
        // The poll fails too, every few seconds: none of it arms another tick.
        const polls = setInterval(() => r.set({failures: r.feed().failures + 1}), 1500);
        await vi.advanceTimersByTimeAsync(10 * 60_000);
        clearInterval(polls);
        expect(r.sent).toHaveLength(1 + TICK_RETRIES);
        const gaps = r.sent.slice(1).map((s, i) => s.at - r.sent[i].at);
        expect(gaps).toEqual(Array.from({length: TICK_RETRIES}, (_, i) => TICK_BACKOFF_MS * 2 ** i));
        expect(r.ticker.state().spent).toBe(true);
        r.ticker.stop();
    });

    it('stays bounded when every send rejects at once', async () => {
        const r = rig(leader(T0 - 1000), () => Promise.reject(new TypeError('Failed to fetch')));
        r.ticker.feed(r.feed());
        await vi.advanceTimersByTimeAsync(5 * 60_000);
        expect(r.sent).toHaveLength(1 + TICK_RETRIES);
        r.ticker.stop();
    });

    it('sends nothing more while a tick is out, whatever lands meanwhile, and arms the new due after', async () => {
        let release: (a: Answer) => void = () => {};
        const r = rig(leader(T0 - 1000), (n) => (n === 1 ? new Promise<Answer>((resolve) => {
            release = resolve;
        }) : {outcome: 'moved'}));
        r.ticker.feed(r.feed());
        await vi.advanceTimersByTimeAsync(400);
        expect(r.sent).toHaveLength(1);
        // A poll answers, a beat answers, a poll fails: the same due each time.
        r.set({seq: 1});
        r.set({failures: 1});
        r.set({failures: 0, offset: 20});
        await vi.advanceTimersByTimeAsync(5000);
        expect(r.sent).toHaveLength(1);
        // The tick's own answer moves the table on: a new due, two seconds ahead.
        release({outcome: 'moved', feed: {due: Date.now() + 2000, seq: 2}});
        await vi.advanceTimersByTimeAsync(0);
        expect(r.ticker.state().due).toBe(r.feed().due);
        expect(r.sent).toHaveLength(1);
        await vi.advanceTimersByTimeAsync(2400);
        expect(r.sent).toHaveLength(2);
        expect(r.sent[1].due).toBe(r.feed().due);
        r.ticker.stop();
    });

    it('waits out a clock that disagrees TICK_RETRY_MS at a time, bounded', async () => {
        const r = rig(leader(T0 - 1000), () => ({outcome: 'retick'}));
        r.ticker.feed(r.feed());
        await vi.advanceTimersByTimeAsync(60_000);
        expect(r.sent).toHaveLength(1 + TICK_RETRIES);
        expect(r.sent.slice(1).every((s, i) => s.at - r.sent[i].at === TICK_RETRY_MS)).toBe(true);
        r.ticker.stop();
    });

    it('never ticks sooner than a retry for a due the server says is still ahead', async () => {
        const r = rig(leader(T0 - 1000), () => ({outcome: 'moved'}));
        r.ticker.feed(r.feed());
        await vi.advanceTimersByTimeAsync(60_000);
        expect(r.sent).toHaveLength(1 + TICK_RETRIES);
        expect(r.sent.slice(1).every((s, i) => s.at - r.sent[i].at >= TICK_RETRY_MS)).toBe(true);
        r.ticker.stop();
    });

    it('has one more go at a due it gave up on once the connection is back', async () => {
        let online = false;
        const r = rig(leader(T0 - 1000), () => (online ? {outcome: 'moved', feed: {due: null, seq: 9}} : {outcome: 'transient'}));
        r.ticker.feed(r.feed());
        await vi.advanceTimersByTimeAsync(5 * 60_000);
        expect(r.sent).toHaveLength(1 + TICK_RETRIES);
        // A poll gets through: the failures clear.
        online = true;
        r.set({failures: 0});
        await vi.advanceTimersByTimeAsync(1000);
        expect(r.sent).toHaveLength(2 + TICK_RETRIES);
        expect(r.ticker.state()).toMatchObject({due: null, timer: null});
        r.ticker.stop();
    });

    it('starts the count again for a new due time', async () => {
        const r = rig(leader(T0 - 1000), () => ({outcome: 'transient'}));
        r.ticker.feed(r.feed());
        await vi.advanceTimersByTimeAsync(5 * 60_000);
        expect(r.sent).toHaveLength(1 + TICK_RETRIES);
        r.set({due: Date.now() - 10, seq: 2});
        await vi.advanceTimersByTimeAsync(5 * 60_000);
        expect(r.sent).toHaveLength(2 * (1 + TICK_RETRIES));
        r.ticker.stop();
    });

    it('lets a fallback tick only once the table has been quiet', async () => {
        const fallback: TickerFeed = {due: T0 + 1000, role: 'fallback', seq: 1, offset: 0, failures: 0};
        const r = rig(fallback, () => ({outcome: 'moved', feed: {due: null}}));
        r.ticker.feed(r.feed());
        // Armed for 1.5–2.5 s past the due; the table moves before then.
        await vi.advanceTimersByTimeAsync(1000 + 1000);
        r.set({seq: 2});
        await vi.advanceTimersByTimeAsync(1000);
        expect(r.sent).toHaveLength(0);
        // Quiet from here: it ticks one quiet spell later.
        await vi.advanceTimersByTimeAsync(FALLBACK_QUIET_MS + 1000);
        expect(r.sent).toHaveLength(1);
        r.ticker.stop();
    });

    it('ticks nothing as a watcher, and nothing at all once stopped', async () => {
        const r = rig({due: T0 - 1000, role: 'none', seq: 1, offset: 0, failures: 0}, () => ({outcome: 'moved'}));
        r.ticker.feed(r.feed());
        await vi.advanceTimersByTimeAsync(10_000);
        expect(r.sent).toHaveLength(0);
        r.set({role: 'leader'});
        r.ticker.stop();
        await vi.advanceTimersByTimeAsync(10_000);
        expect(r.sent).toHaveLength(0);
        expect(vi.getTimerCount()).toBe(0);
    });
});

describe('the transport', () => {
    it('polls without realtime and falls back to both when it stalls', () => {
        const base = {realtime: true, ablyState: 'connected' as const, msInState: 0, watchdog: false};
        expect(transportPolicy({...base, realtime: false})).toBe('poll');
        expect(transportPolicy(base)).toBe('realtime');
        expect(transportPolicy({...base, ablyState: 'connecting', msInState: 7000})).toBe('realtime');
        expect(transportPolicy({...base, ablyState: 'connecting', msInState: 8001})).toBe('both');
        expect(transportPolicy({...base, ablyState: 'disconnected', msInState: 9000})).toBe('realtime');
        expect(transportPolicy({...base, ablyState: 'disconnected', msInState: 10_001})).toBe('both');
        expect(transportPolicy({...base, ablyState: 'suspended'})).toBe('both');
        expect(transportPolicy({...base, ablyState: 'failed'})).toBe('both');
        expect(transportPolicy({...base, watchdog: true})).toBe('both');
        expect(BOTH_FOR_MS).toBe(300_000);
    });

    it('trips the watchdog on a failing server, a lagging channel or silence past a due time', () => {
        const base = {now: 100_000, realtimeOk: true, liveHand: true, responseAheadSince: null, lastMessageAt: 99_000, nextDueAt: null};
        expect(watchdogTripped(base)).toBe(false);
        expect(watchdogTripped({...base, realtimeOk: false, liveHand: false})).toBe(true);
        expect(watchdogTripped({...base, responseAheadSince: 97_500})).toBe(false);
        expect(watchdogTripped({...base, responseAheadSince: 96_000})).toBe(true);
        expect(watchdogTripped({...base, nextDueAt: 94_000, lastMessageAt: 93_000})).toBe(true);
        expect(watchdogTripped({...base, nextDueAt: 94_000, lastMessageAt: 95_000})).toBe(false);
        expect(watchdogTripped({...base, liveHand: false, nextDueAt: 1, responseAheadSince: 1})).toBe(false);
        // Silence counts only for a due time the channel was connected for.
        expect(watchdogTripped({...base, nextDueAt: 94_000, lastMessageAt: 93_000, connectedAt: 90_000})).toBe(true);
        expect(watchdogTripped({...base, nextDueAt: 94_000, lastMessageAt: 93_000, connectedAt: 94_500})).toBe(false);
        expect(watchdogTripped({...base, nextDueAt: 94_000, lastMessageAt: null, connectedAt: null})).toBe(false);
        expect(watchdogTripped({...base, nextDueAt: 94_000, lastMessageAt: null})).toBe(true);
        // Exactly at the limits: not yet.
        expect(watchdogTripped({...base, responseAheadSince: 97_000})).toBe(false);
        expect(watchdogTripped({...base, now: 99_000, nextDueAt: 94_000, lastMessageAt: 93_000})).toBe(false);
    });

    it('falls back to polls alone while the connection is let go', () => {
        const base = {realtime: true, msInState: 60_000, watchdog: false};
        expect(transportPolicy({...base, ablyState: 'closing'})).toBe('poll');
        expect(transportPolicy({...base, ablyState: 'closed'})).toBe('poll');
        expect(transportPolicy({...base, ablyState: 'closed', watchdog: true})).toBe('poll');
    });

    it('never gives up on a first token: three quick tries for a refusal that passes, then every five minutes', () => {
        expect(TOKEN_RETRY_LATER_MS).toBe(BOTH_FOR_MS);
        expect([0, 1, 2, 3, 4, 50].map((attempt) => tokenRetryDelay(attempt, true))).toEqual([5000, 15_000, 45_000, BOTH_FOR_MS, BOTH_FOR_MS, BOTH_FOR_MS]);
        // Anything else (a refusal the polls settle, a chunk that would not load) waits the long way.
        expect(tokenRetryDelay(0, false)).toBe(BOTH_FOR_MS);
        expect(Number.isFinite(tokenRetryDelay(10_000, true))).toBe(true);
        // The link reports 'failed' (both transports) only once the quick tries are spent.
        expect([0, 1, 2, 3].map((attempt) => tokenRetryLate(attempt, true))).toEqual([false, false, false, true]);
        expect(tokenRetryLate(0, false)).toBe(true);
    });
});

describe('the realtime monitor', () => {
    const AT = 5_000_000; // the browser's clock
    const srv = (ms: number) => T0 + ms; // the server's
    type Input = Parameters<typeof monitorStep>[1];
    const step = (m: RealtimeMonitor, ...inputs: Input[]) => inputs.reduce(monitorStep, m);
    const connected = (ms = 0) => step(initialMonitor(true, AT), {type: 'connection', state: 'connected', at: AT + ms, serverNow: srv(ms)});
    const check = (ms: number, liveHand: boolean, nextDueAt: number | null = null): Input => ({type: 'check', at: AT + ms, serverNow: srv(ms), liveHand, nextDueAt});
    const answer = (seq: number, ms: number, realtimeOk: boolean | null = true): Input => ({type: 'answer', seq, realtimeOk, at: AT + ms, serverNow: srv(ms)});
    const message = (seq: number, ms: number, realtimeOk = true): Input => ({type: 'message', seq, realtimeOk, at: AT + ms, serverNow: srv(ms)});

    it('polls without realtime, and from the moment the server says the table has none', () => {
        expect(transportOf(initialMonitor(false, AT), AT)).toBe('poll');
        const m = initialMonitor(true, AT);
        expect(transportOf(m, AT)).toBe('realtime');
        expect(monitorLive(m, AT)).toBe(false);
        const off = monitorStep(m, {type: 'off'});
        expect(transportOf(off, AT)).toBe('poll');
        expect(monitorStep(off, {type: 'off'})).toBe(off);
        expect(monitorStep(off, check(60_000, true))).toBe(off);
    });

    it('goes live once connected, and runs both for five minutes after a connection that took over 8 s', () => {
        expect(monitorLive(connected(), AT)).toBe(true);
        let m = step(initialMonitor(true, AT), check(7000, true));
        expect(transportOf(m, AT + 7000)).toBe('realtime');
        m = step(m, check(8001, false));
        expect(transportOf(m, AT + 8001)).toBe('both');
        m = step(m, {type: 'connection', state: 'connected', at: AT + 9000, serverNow: srv(9000)});
        // Connected now, but the five minutes run from the last check that saw it stalled.
        expect(transportOf(m, AT + 9000)).toBe('both');
        expect(monitorLive(m, AT + 9000)).toBe(false);
        expect(transportOf(m, AT + 8001 + BOTH_FOR_MS - 1)).toBe('both');
        expect(transportOf(m, AT + 8001 + BOTH_FOR_MS)).toBe('realtime');
        expect(monitorLive(m, AT + 8001 + BOTH_FOR_MS)).toBe(true);
    });

    it('runs both once disconnected over 10 s, or suspended, or failed', () => {
        const lost = step(connected(), {type: 'connection', state: 'disconnected', at: AT + 1000, serverNow: srv(1000)});
        expect(transportOf(step(lost, check(11_000, true)), AT + 11_000)).toBe('realtime');
        const long = step(lost, check(11_001, true));
        expect(transportOf(long, AT + 11_001)).toBe('both');
        // Back within the five minutes: still both.
        const back = step(long, {type: 'connection', state: 'connected', at: AT + 20_000, serverNow: srv(20_000)});
        expect(transportOf(back, AT + 20_000)).toBe('both');
        for (const state of ['suspended', 'failed'] as const) {
            const m = step(connected(), {type: 'connection', state, at: AT + 1000, serverNow: srv(1000)});
            expect(transportOf(m, AT + 1000)).toBe('both');
        }
        // Let go while the page hides: polls (paused while hidden), not both.
        expect(transportOf(step(connected(), {type: 'connection', state: 'closed', at: AT + 1000, serverNow: srv(1000)}), AT + 1000)).toBe('poll');
    });

    it('trips when, during a live hand, an answer stays ahead of the channel for over 3 s', () => {
        // The read after the attach sets the baseline: the channel need not repeat seq 10.
        let m = step(connected(), answer(10, 100), {type: 'baseline', seq: 10});
        expect(m.aheadSince).toBeNull();
        // A move's answer comes before its message: ahead, for a moment.
        m = step(m, answer(11, 1000));
        expect(m.aheadSince).toBe(srv(1000));
        expect(transportOf(step(m, check(4000, true)), AT + 4000)).toBe('realtime');
        // The message lands: caught up.
        const caught = step(m, message(11, 1200));
        expect(caught.aheadSince).toBeNull();
        expect(transportOf(step(caught, check(9000, true)), AT + 9000)).toBe('realtime');
        // It never does: over 3 s later, during a live hand, both; between hands, not.
        expect(transportOf(step(m, check(4001, false)), AT + 4001)).toBe('realtime');
        const stalled = step(m, check(4001, true));
        expect(transportOf(stalled, AT + 4001)).toBe('both');
        expect(transportOf(stalled, AT + 4001 + BOTH_FOR_MS)).toBe('realtime');
        // Late, repeated and out-of-order messages only ever raise what the channel delivered.
        expect(step(m, message(13, 1100), message(11, 1300)).wireSeq).toBe(13);
    });

    it('counts an answer ahead only while connected, and settles a reconnection with its read', () => {
        let m = step(initialMonitor(true, AT), answer(20, 100));
        expect(m.aheadSince).toBeNull();
        m = step(m, {type: 'connection', state: 'connected', at: AT + 500, serverNow: srv(500)}, answer(21, 600));
        expect(m.aheadSince).toBe(srv(600));
        m = step(m, {type: 'baseline', seq: 21});
        expect(m.aheadSince).toBeNull();
        // A drop and a reconnection count afresh.
        m = step(m, answer(22, 700), {type: 'connection', state: 'disconnected', at: AT + 800, serverNow: srv(800)});
        expect(m.aheadSince).toBeNull();
        expect(m.connectedAt).toBeNull();
    });

    it('trips at once when an answer says the server\'s publishes fail', () => {
        const m = step(connected(), answer(5, 1000, false));
        expect(transportOf(m, AT + 1000)).toBe('both');
        // An Unchanged says nothing either way; a later view that says all is well leaves the five
        // minutes to run out, and the checks no longer extend them.
        const ok = step(m, answer(5, 2000, null), answer(6, 3000, true), message(6, 3000));
        expect(ok.realtimeOk).toBe(true);
        expect(transportOf(step(ok, check(4000, false)), AT + 1000 + BOTH_FOR_MS)).toBe('realtime');
        expect(transportOf(step(m, check(4000, false)), AT + 1000 + BOTH_FOR_MS)).toBe('both');
    });

    it('hears that the publishes work again from the messages and the Unchanged answers, not only a whole view', () => {
        // One whole view said a publish failed; then twenty minutes with a check every second.
        const tripped = step(connected(), answer(5, 1000, false));
        const run = (each: (t: number) => Input[]) => {
            let m = tripped;
            let liveAt: number | null = null;
            for (let t = 2000; t <= 20 * 60_000; t += 1000) {
                m = step(m, ...each(t), check(t, false));
                if (liveAt === null && transportOf(m, AT + t) === 'realtime') liveAt = t;
            }
            return {m, liveAt};
        };
        // A live table: its messages say all is well (the safety polls' Unchanged from an older
        // server say nothing).
        const live = run((t) => (t % 20_000 === 0 ? [answer(5, t, null)] : t % 3000 === 0 ? [message(5 + t / 1000, t)] : []));
        expect(live.m.realtimeOk).toBe(true);
        // Both for five minutes from the last check that still heard otherwise.
        expect(live.liveAt).toBe(2000 + BOTH_FOR_MS);
        // An idle table, no messages at all: the safety polls' Unchanged answers say it.
        const idle = run((t) => (t % 20_000 === 0 ? [answer(5, t, true)] : []));
        expect(idle.m.realtimeOk).toBe(true);
        expect(idle.liveAt).toBe(19_000 + BOTH_FOR_MS);
        // While they still say the publishes fail, both, however long.
        const failing = run((t) => (t % 3000 === 0 ? [message(5 + t / 1000, t, false)] : []));
        expect(transportOf(failing.m, AT + 20 * 60_000)).toBe('both');
        expect(failing.liveAt).toBeNull();
        // A message that says so trips at once, as an answer does; a late one never outvotes a newer.
        expect(transportOf(step(connected(), message(6, 500, false)), AT + 500)).toBe('both');
        expect(step(connected(), message(10, 100), message(8, 200, false)).realtimeOk).toBe(true);
    });

    it('starts from the view the page holds: a page opened inside a failure window runs both', () => {
        expect(transportOf(initialMonitor(true, AT, false), AT)).toBe('both');
        const opened = step(initialMonitor(true, AT, false), {type: 'connection', state: 'connected', at: AT + 100, serverNow: srv(100)});
        expect(transportOf(opened, AT + 100)).toBe('both');
        expect(monitorLive(opened, AT + 100)).toBe(false);
        expect(transportOf(opened, AT + BOTH_FOR_MS)).toBe('realtime');
        expect(transportOf(initialMonitor(true, AT, true), AT)).toBe('realtime');
        expect(transportOf(initialMonitor(false, AT, false), AT)).toBe('poll');
    });

    it('trips on silence past a due time the channel was connected for', () => {
        const m = step(connected(), message(3, 500));
        expect(transportOf(step(m, check(15_000, true, srv(10_000))), AT + 15_000)).toBe('realtime');
        expect(transportOf(step(m, check(15_001, true, srv(10_000))), AT + 15_001)).toBe('both');
        expect(transportOf(step(m, check(15_001, false, srv(10_000))), AT + 15_001)).toBe('realtime');
        // A message after the due time: the clock moved, nothing is missing.
        expect(transportOf(step(m, message(4, 10_200), check(15_001, true, srv(10_000))), AT + 15_001)).toBe('realtime');
        // Connected only after the due time: nothing it could have carried.
        const late = step(initialMonitor(true, AT), {type: 'connection', state: 'connected', at: AT + 12_000, serverNow: srv(12_000)});
        expect(transportOf(step(late, check(15_001, true, srv(10_000))), AT + 15_001)).toBe('realtime');
    });

    it('reads as live only over a connected channel the monitor trusts alone', () => {
        const s = initialFeed({view: pv(three(), pidOf(0), 1)});
        expect(feedMode(s, monitorLive(connected(), AT))).toBe('realtime');
        expect(feedMode(s, monitorLive(initialMonitor(true, AT), AT))).toBe('polling');
        expect(feedMode({...s, failures: 2}, true)).toBe('reconnecting');
    });
});

describe('the seat pass', () => {
    const exp = Math.floor((T0 + 10 * 60_000) / 1000);
    const pass = `v1.${'a'.repeat(24)}.${'b'.repeat(11)}.${exp.toString(36)}.${'c'.repeat(43)}`;

    it('reads its expiry from its text', () => {
        expect(passExpiry(pass)).toBe(exp * 1000);
        expect(passExpiry('v2.x.y.z.w')).toBeNull();
        expect(passExpiry(null)).toBeNull();
    });

    it('is sent while more than two minutes are left', () => {
        expect(passFresh(pass, T0)).toBe(pass);
        expect(passFresh(pass, exp * 1000 - 120_001)).toBe(pass);
        expect(passFresh(pass, exp * 1000 - 120_000)).toBeNull();
        expect(passFresh(null, T0)).toBeNull();
    });
});
