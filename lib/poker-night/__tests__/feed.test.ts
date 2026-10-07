// The table's feed as the browser keeps it: a view applies only when it is newer, whatever order the
// answers come in; an unchanged answer moves the clock and the emotes, and says when a GET state is
// due; emotes are kept once each and never from before the page loaded; events fire once; a
// realtime message keeps the viewer's own part and says when it went stale. Then the decisions: the
// poll's wait, who ticks the clock and when, which transport to trust, and the seat pass's margin.

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {nextDueAt} from '@/lib/poker-night/clock';
import {
    BOTH_FOR_MS, createTicker, EMOTE_GRACE_MS, FALLBACK_QUIET_MS, feedMode, feedReducer, handLive, initialFeed, isBehind, mergeEmotes, mergeWire,
    nearTurn, needsPrivate, nextPollDelay, nextTickAt, passExpiry, passFresh, shouldRetick, TICK_BACKOFF_MS, TICK_RETRIES, TICK_RETRY_MS, tickRole,
    transportPolicy, watchdogTripped, type FeedState, type TickerFeed, type TickOutcome,
} from '@/lib/poker-night/feed';
import type {TableState} from '@/lib/poker-night/types';
import type {EmoteView, PlayerView, RoomView, Unchanged, WireView} from '@/lib/poker-night/view-types';
import {clockLeaderOf, peopleIds, peopleView, playerView, wireView} from '@/lib/poker-night/views';
import {C, R, deal, moves, nowOf, pidOf, table, T0} from './fixtures';

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
    ({unchanged: true, seq, emoteSeq: 0, serverNow: T0 + 5000, nextDueAt: null, emotes: [], pass: null, ...extra});

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
