'use client';

// The table's feed in the browser: lib/poker-night/feed's reducer in a small store, and the I/O
// around it — the poll (paused while the page is hidden, at once when it shows again), the clock's
// tick (the leader just after a due time, everyone else seated a moment later in case the leader has
// gone), the presence beat every 25 s and on every visibility change, one GET state at a time, and
// the moves, the join and the drawers' reads.
//
// Realtime (P4), when the page says this deployment has it (or the QA's relay is there): the link
// (components/poker-night/realtime-client) feeds each message's wire view into the same store, by
// seq, so a late or repeated message changes nothing; a message that leaves the viewer's own part
// stale (lib/poker-night/feed.needsPrivate: a hand they are dealt into, their seat, the config, the
// people) reads the whole view once, as does every (re)attach; that read, overtaken by the next
// message, still brings the viewer's own part (feed.graftPrivate) or is read again (feed.readAgain),
// and while the part is stale the poll keeps the table's own pace (feed.pollPace). A move of the
// viewer's own that is out keeps the messages from counting that part fresh: its answer brings it.
// lib/poker-night/feed's monitor says which transport runs — the channel alone with a safety poll
// every 20 s, or polls beside it for five minutes once it stalls — checked every second; it starts
// from the view the page holds and hears realtimeOk from every message and answer. A change to the
// table never puts off a poll already due (a read for the viewer's own part, a retry, the safety
// poll). A page hidden five minutes lets the connection go and opens it again when it shows.
//
// A visitor who has not joined polls nothing: the routes answer only players. A table that closed,
// a removal and a lost seat re-render the page (router.refresh, once), which shows the summary or
// the join card; a newer deploy asks for a reload.

import {useCallback, useEffect, useRef, useState, useSyncExternalStore} from "react";
import {useRouter} from "next/navigation";
import {POKER_NIGHT_ERRORS} from "@/lib/learn/copy/poker-night";
import {
    createTicker, feedMode, feedReducer, handLive, initialFeed, initialMonitor, isBehind, monitorLive, monitorStep, nearTurn, needsPrivate,
    nextPollDelay, passFresh, pollPace, readAgain, shouldRetick, tickRole, transportOf,
    type FeedInput, type FeedMode, type FeedState, type MonitorInput, type RealtimeMonitor, type TickOutcome, type Transport,
} from "@/lib/poker-night/feed";
import type {PokerNightErrorCode} from "@/lib/poker-night/http";
import type {ActionInput} from "@/lib/poker-night/input";
import {LIMITS} from "@/lib/poker-night/limits";
import type {DetailView, PlayerView, PlayPageView, Unchanged} from "@/lib/poker-night/view-types";
import {connectRealtime, realtimeFake, type RealtimeLink} from "@/components/poker-night/realtime-client";
import {getDetail, getState, isUnchanged, newActionId, postAction, postJoin, postTick, type ApiResult} from "@/components/poker-night/table-api";
import type {ActionBody, DetailOptions, DetailPart, JoinBody, JoinResult, SendResult} from "@/components/poker-night/room-controller";

// ── the store ──

export type FeedStore = {
    get: () => FeedState;
    dispatch: (input: FeedInput) => void;
    subscribe: (listener: () => void) => () => void;
};

export const createFeedStore = (initial: FeedState): FeedStore => {
    let state = initial;
    const listeners = new Set<() => void>();
    return {
        get: () => state,
        dispatch: (input) => {
            const next = feedReducer(state, input);
            if (next === state) return;
            state = next;
            for (const listener of [...listeners]) listener();
        },
        subscribe: (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
    };
};

// ── what a refusal means for the feed ──

// The room is gone for this viewer as they know it: the page re-renders and decides (the summary, or
// the join card for a removed or forgotten player).
const REFRESH_CODES: ReadonlySet<PokerNightErrorCode> = new Set(['closed', 'banned', 'not_player', 'no_identity', 'not_found']);
// The connection rather than the request: counted as a failure, so the polls back off.
const TRANSIENT_CODES: ReadonlySet<PokerNightErrorCode> = new Set(['unavailable', 'busy', 'rate_limited']);

const hidden = (): boolean => typeof document !== 'undefined' && document.hidden;

export type TableFeed = {
    state: FeedState;
    mode: FeedMode;
    transport: Transport; // what runs now: the channel alone, polls alone, or both
    problem: PokerNightErrorCode | null;
    send: (body: ActionBody) => Promise<SendResult>;
    join: (body: JoinBody) => Promise<JoinResult>;
    detail: (part: DetailPart, opts?: DetailOptions) => Promise<DetailView | null>;
    serverNow: () => number;
};

type Loop = {poll: () => void};

// How long a hidden page keeps its realtime connection, and how often the monitor checks it.
export const HIDDEN_CLOSE_MS = 5 * 60_000;
const MONITOR_CHECK_MS = 1000;

type Link = {transport: Transport; live: boolean};

const POLLING: Link = Object.freeze({transport: 'poll', live: false});

const linkOf = (m: RealtimeMonitor, at: number): Link => ({transport: transportOf(m, at), live: monitorLive(m, at)});

export const useTableFeed = ({code, initial, pollScale, realtime}: {code: string; initial: PlayPageView; pollScale: number; realtime: boolean}): TableFeed => {
    const router = useRouter();
    const [store] = useState(() => createFeedStore(initialFeed(initial)));
    const state = useSyncExternalStore(store.subscribe, store.get, store.get);
    const [problem, setProblem] = useState<PokerNightErrorCode | null>(null);
    const loop = useRef<Loop | null>(null);
    const refreshed = useRef(false);
    // Moves of the viewer's own that are out: while one is, a message does not count their own part
    // fresh (its commit may have set a pre-action no message shows).
    const movesOut = useRef(0);
    const joined = state.view !== null;

    // The realtime monitor (lib/poker-night/feed), stepped by every answer and by the link; the loop
    // listens and turns what it says into the transport.
    const monitor = useRef<RealtimeMonitor>(initialMonitor(false, 0));
    const onMonitor = useRef<(() => void) | null>(null);
    const [link, setLink] = useState<Link>(POLLING);
    const stepMonitor = useCallback((input: MonitorInput): void => {
        const next = monitorStep(monitor.current, input);
        if (next === monitor.current) return;
        monitor.current = next;
        onMonitor.current?.();
    }, []);

    // Once per mount: the server's clock until a round trip gives a better reading.
    useEffect(() => {
        store.dispatch({type: 'mounted', at: Date.now()});
    }, [store]);

    // A newer render of the page (a refresh) brings a newer view, or a visitor's fresher table:
    // apply it like any answer.
    useEffect(() => {
        if ('view' in initial) {
            if (initial.view.seq > store.get().seq) store.dispatch({type: 'view', view: initial.view, at: Date.now(), animate: false});
        } else {
            store.dispatch({type: 'preview', preview: initial.preview});
        }
    }, [initial, store]);

    // A refusal that ends this view of the table: re-render the page once, or ask for a reload.
    const settle = useCallback((code: PokerNightErrorCode): void => {
        if (code === 'reload') {
            setProblem('reload');
            return;
        }
        if (REFRESH_CODES.has(code) && !refreshed.current) {
            refreshed.current = true;
            router.refresh();
        }
    }, [router]);

    // An answer from any request, into the store, and to the monitor (is the channel keeping up?).
    const take = useCallback((r: ApiResult<PlayerView | Unchanged>): void => {
        if (!r.ok) return;
        const body = r.body;
        if (isUnchanged(body)) {
            // An older server's Unchanged (a rollout) carries no realtimeOk: it says nothing.
            const realtimeOk = typeof body.realtimeOk === 'boolean' ? body.realtimeOk : null;
            stepMonitor({type: 'answer', seq: body.seq, realtimeOk, at: r.receivedAt, serverNow: body.serverNow});
            store.dispatch({type: 'unchanged', body, at: r.receivedAt, sentAt: r.sentAt});
        } else {
            stepMonitor({type: 'answer', seq: body.seq, realtimeOk: body.realtimeOk, at: r.receivedAt, serverNow: body.serverNow});
            store.dispatch({type: 'view', view: body, at: r.receivedAt, sentAt: r.sentAt, animate: !hidden()});
        }
    }, [store, stepMonitor]);

    const pass = useCallback((): string | null => {
        const s = store.get();
        return passFresh(s.pass, Date.now() + s.offset);
    }, [store]);

    // The loop: polls, ticks and beats, for as long as the viewer has a row here.
    useEffect(() => {
        if (!joined || problem !== null) return;
        let stopped = false;
        let pollTimer: ReturnType<typeof setTimeout> | null = null;
        let pollDueAt: number | null = null; // when (browser time) the armed poll goes
        let pollAbort: AbortController | null = null;
        let polling = false;
        let again = false;
        const live = new Set<AbortController>();

        // ── the transport ──
        // What the monitor says, as the loop last acted on it. A change to a transport that polls
        // reads the table at once (the channel may have missed something); any change re-paces the
        // poll.
        const wanted = realtime || realtimeFake() !== null;
        // From the view the page holds: one that says the publishes fail runs both from the start.
        monitor.current = initialMonitor(wanted, Date.now(), store.get().view?.realtimeOk ?? true);
        let current: Link = POLLING;
        const recompute = () => {
            if (stopped) return;
            const next = linkOf(monitor.current, Date.now());
            if (next.transport === current.transport && next.live === current.live) return;
            const stalled = next.transport !== 'realtime' && current.transport === 'realtime';
            current = next;
            setLink(next);
            if (stalled && !hidden()) void poll();
            else if (!polling) schedule();
        };
        onMonitor.current = recompute;

        const end = (code: PokerNightErrorCode) => {
            if (REFRESH_CODES.has(code) || code === 'reload') {
                stopped = true;
                settle(code);
            } else if (TRANSIENT_CODES.has(code)) {
                store.dispatch({type: 'failed'});
            }
        };

        // ── the poll ──
        const unarm = () => {
            if (pollTimer !== null) clearTimeout(pollTimer);
            pollTimer = null;
            pollDueAt = null;
        };
        // Arms the next poll at the pace the table and the transport call for. sooner: only if that
        // is before the poll already armed — a change to the table (a message, any answer) never puts
        // off a read for the viewer's own part, a retry after a failure or the safety poll.
        const schedule = (sooner = false) => {
            if (stopped) {
                unarm();
                return;
            }
            const s = store.get();
            // Over a healthy channel, only the safety poll (while the viewer's own part is fresh);
            // otherwise the table's own pace.
            const delay = nextPollDelay({
                mode: pollPace(current.transport, s), hidden: hidden(), inHand: handLive(s.view),
                nearTurn: nearTurn(s.view, s.view?.me.seat ?? null), failures: s.failures, scale: pollScale,
            });
            const dueAt = delay === null ? null : Date.now() + delay;
            if (sooner && pollTimer !== null && pollDueAt !== null && (dueAt === null || pollDueAt <= dueAt)) return;
            unarm();
            if (delay !== null) {
                pollDueAt = dueAt;
                pollTimer = setTimeout(() => {
                    pollTimer = null;
                    pollDueAt = null;
                    void poll();
                }, delay);
            }
        };

        const poll = async (): Promise<void> => {
            if (stopped) return;
            if (polling) {
                again = true;
                return;
            }
            polling = true;
            again = false;
            unarm();
            const s = store.get();
            pollAbort = new AbortController();
            // since: how far the viewer's own part is known fresh (FeedState.privateSeq), so after a
            // realtime message that left it stale the answer is the whole view, not Unchanged.
            const r = await getState(code, {since: s.privateSeq, esince: s.emoteSeq}, {pass: pass(), signal: pollAbort.signal});
            pollAbort = null;
            polling = false;
            if (stopped) return;
            if (r.ok) {
                take(r);
                // The first read sent after the channel attached: what it holds, the channel need
                // not deliver.
                if (attachedAt !== null && r.sentAt >= attachedAt) {
                    attachedAt = null;
                    const held = store.get();
                    stepMonitor({type: 'baseline', seq: Math.max(held.seq, held.knownSeq)});
                }
            } else if (!r.aborted) {
                end(r.code);
            }
            if (stopped) return;
            // A newer seq named while this one was out, asked for meanwhile, or a whole view older
            // than the messages whose own part could not be kept: once more, now.
            if (r.ok && readAgain({again, whole: !isUnchanged(r.body), state: store.get()})) {
                void poll();
                return;
            }
            schedule();
        };

        // ── the clock ──
        // lib/poker-night/feed's ticker decides when a tick goes; this posts it. Its answer goes into
        // the store (and so back to the ticker as a feed change) before the outcome is handed back.
        const tickOnce = async (due: number): Promise<TickOutcome> => {
            if (stopped) return 'final';
            const controller = new AbortController();
            live.add(controller);
            const r = await postTick(code, {}, {pass: pass(), signal: controller.signal});
            live.delete(controller);
            if (stopped) return 'final';
            take(r);
            if (!r.ok) {
                if (r.aborted) return 'final';
                end(r.code);
                return TRANSIENT_CODES.has(r.code) ? 'transient' : 'final';
            }
            return isUnchanged(r.body) && shouldRetick(r.body, due) ? 'retick' : 'moved';
        };
        const ticker = createTicker({
            now: () => Date.now(),
            rand: () => Math.random(),
            setTimer: (fire, ms) => setTimeout(fire, ms),
            clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
            send: tickOnce,
            seq: () => store.get().seq,
            offset: () => store.get().offset,
        });
        const arm = () => {
            if (stopped) return;
            const s = store.get();
            ticker.feed({due: s.nextDueAt, role: tickRole(s.view), seq: s.seq, offset: s.offset, failures: s.failures});
        };

        // ── presence ──
        // The server keeps one stamp per player, so a second tab of this browser that hides or
        // closes would leave the player "in another tab" while this one is in front: it says so on
        // a channel, before its beat and once that beat is answered, and a visible tab beats back.
        const tabs = typeof BroadcastChannel === 'function' ? new BroadcastChannel(`aero-pn-tabs:${code}`) : null;
        let answerTimer: ReturnType<typeof setTimeout> | null = null;
        const beat = async (): Promise<void> => {
            if (stopped) return;
            const isHidden = hidden();
            if (isHidden) tabs?.postMessage('hidden');
            const controller = new AbortController();
            live.add(controller);
            const r = await postTick(code, {beat: {hidden: isHidden}}, {pass: pass(), signal: controller.signal});
            live.delete(controller);
            if (stopped) return;
            if (isHidden) tabs?.postMessage('hidden');
            take(r);
            if (!r.ok && !r.aborted) end(r.code);
        };
        if (tabs) {
            tabs.onmessage = (event: MessageEvent) => {
                if (event.data !== 'hidden' || hidden() || stopped) return;
                // A moment later, so this beat lands after the hidden one.
                if (answerTimer !== null) clearTimeout(answerTimer);
                answerTimer = setTimeout(() => {
                    answerTimer = null;
                    if (!hidden()) void beat();
                }, 600);
            };
        }
        const beatTimer = setInterval(() => {
            if (!hidden()) void beat();
        }, LIMITS.heartbeatMs);

        // ── realtime ──
        let link: RealtimeLink | null = null;
        let attachedAt: number | null = null; // the next read sent after this (browser time) sets the baseline
        let hiddenTimer: ReturnType<typeof setTimeout> | null = null;
        let checkTimer: ReturnType<typeof setInterval> | null = null;
        const serverTime = () => Date.now() + store.get().offset;
        if (wanted) {
            link = connectRealtime(code, pass, {
                wire: (wire) => {
                    if (stopped) return;
                    stepMonitor({type: 'message', seq: wire.seq, realtimeOk: wire.realtimeOk, at: Date.now(), serverNow: serverTime()});
                    const s = store.get();
                    // Decided against the view held before the message: does it leave this viewer's
                    // own part stale?
                    const stale = s.view !== null && wire.seq > s.seq && needsPrivate(s.view, wire);
                    store.dispatch({type: 'wire', wire, at: Date.now(), animate: !hidden(), moving: movesOut.current > 0});
                    if (stale) void poll();
                },
                connection: (ablyState) => {
                    if (!stopped) stepMonitor({type: 'connection', state: ablyState, at: Date.now(), serverNow: serverTime()});
                },
                attached: () => {
                    if (stopped) return;
                    attachedAt = Date.now();
                    void poll();
                },
                off: () => {
                    stepMonitor({type: 'off'});
                    link?.close();
                    link = null;
                },
            });
            // Once a second while the page is in front: the watchdog, and the grace periods that
            // run out with time alone.
            checkTimer = setInterval(() => {
                if (stopped || hidden() || !monitor.current.on) return;
                const s = store.get();
                stepMonitor({type: 'check', at: Date.now(), serverNow: serverTime(), liveHand: handLive(s.view), nextDueAt: s.nextDueAt});
                recompute();
            }, MONITOR_CHECK_MS);
        }
        // The transport as the monitor first says it, once the effect has run.
        const kick = setTimeout(recompute, 0);

        // A page left hidden lets its connection go after a while (Ably counts connections).
        const letGoLater = () => {
            if (link === null || hiddenTimer !== null) return;
            hiddenTimer = setTimeout(() => {
                hiddenTimer = null;
                if (hidden()) link?.suspend();
            }, HIDDEN_CLOSE_MS);
        };
        // Opened in a background tab: the same clock from the start.
        if (hidden()) letGoLater();

        const onVisibility = () => {
            void beat();
            if (hidden()) {
                unarm();
                letGoLater();
            } else {
                if (hiddenTimer !== null) clearTimeout(hiddenTimer);
                hiddenTimer = null;
                // Opened again: it reads the table once it attaches; the poll reads it now.
                link?.resume();
                void poll();
            }
        };
        document.addEventListener('visibilitychange', onVisibility);

        // Every change to the store: re-arm the clock, and catch up once each time an answer names a
        // newer seq than any before it (a failed catch-up waits for the poll's own backoff).
        let lastSeq = store.get().seq;
        let named = {seq: store.get().knownSeq, emoteSeq: store.get().knownEmoteSeq};
        const unsubscribe = store.subscribe(() => {
            const s = store.get();
            if (s.view?.status === 'closed') {
                stopped = true;
                settle('closed');
                return;
            }
            arm();
            if (s.seq !== lastSeq) {
                lastSeq = s.seq;
                // The pace may be quicker now (the action nearer, the own part stale); never later.
                if (!polling) schedule(true);
            }
            if (s.knownSeq > named.seq || s.knownEmoteSeq > named.emoteSeq) {
                named = {seq: s.knownSeq, emoteSeq: s.knownEmoteSeq};
                if (isBehind(s)) void poll();
            }
        });

        loop.current = {poll: () => void poll()};
        // Start: say we are here (the clock leader is whoever is here), read the table fresh, arm.
        void beat();
        void poll();
        arm();

        return () => {
            stopped = true;
            loop.current = null;
            onMonitor.current = null;
            unsubscribe();
            document.removeEventListener('visibilitychange', onVisibility);
            clearInterval(beatTimer);
            if (answerTimer !== null) clearTimeout(answerTimer);
            tabs?.close();
            unarm();
            clearTimeout(kick);
            if (checkTimer !== null) clearInterval(checkTimer);
            if (hiddenTimer !== null) clearTimeout(hiddenTimer);
            link?.close();
            link = null;
            // The next run (or none) starts from polling, as this one did.
            setLink(POLLING);
            ticker.stop();
            pollAbort?.abort();
            for (const controller of live) controller.abort();
        };
    }, [joined, problem, code, pollScale, realtime, store, settle, take, pass, stepMonitor]);

    // ── the moves ──

    const send = useCallback(async (body: ActionBody): Promise<SendResult> => {
        const full = {...body, actionId: newActionId()} as ActionInput;
        movesOut.current++;
        let r: Awaited<ReturnType<typeof postAction>>;
        try {
            // The pass names the player's own rate bucket (the route still reads the identity in
            // full), so players behind one address never share one.
            r = await postAction(code, full, {pass: pass()});
            // A busy table lost five compare-and-sets: once more, under the same id.
            if (!r.ok && r.code === 'busy') r = await postAction(code, full, {pass: pass()});
            // Into the store while the move still counts as out: its own part lands with it.
            if (r.ok) take(r);
        } finally {
            movesOut.current--;
        }
        if (r.ok) return {ok: true, view: r.body, duplicate: r.body.duplicate === true};
        settle(r.code);
        // Turned down: the table may have moved on, so read it fresh.
        if (!REFRESH_CODES.has(r.code)) loop.current?.poll();
        return {ok: false, code: r.code, message: POKER_NIGHT_ERRORS[r.code]};
    }, [code, settle, pass, take]);

    const join = useCallback(async (body: JoinBody): Promise<JoinResult> => {
        const full = {...body, joinId: newActionId()};
        let r = await postJoin(code, full);
        if (!r.ok && r.code === 'busy') r = await postJoin(code, full);
        if (r.ok) {
            const {outcome, renamed, ...view} = r.body;
            store.dispatch({type: 'view', view, at: r.receivedAt, sentAt: r.sentAt, animate: !hidden()});
            return {ok: true, view, outcome, renamed};
        }
        if (r.code === 'closed' || r.code === 'reload') settle(r.code);
        return {ok: false, code: r.code, message: POKER_NIGHT_ERRORS[r.code]};
    }, [code, store, settle]);

    const detail = useCallback(async (part: DetailPart, opts: DetailOptions = {}): Promise<DetailView | null> => {
        const query = part === 'log' ? {part, hand: opts.hand ?? null} : part === 'history' ? {part, before: opts.before ?? null} : {part};
        const r = await getDetail(code, query, {pass: pass()});
        if (!r.ok) {
            if (!r.aborted) settle(r.code);
            return null;
        }
        return r.body;
    }, [code, pass, settle]);

    const serverNow = useCallback((): number => Date.now() + store.get().offset, [store]);

    // Live only over a connected channel the monitor trusts alone; polls beside it read as polling.
    return {state, mode: feedMode(state, link.live), transport: link.transport, problem, send, join, detail, serverNow};
};
