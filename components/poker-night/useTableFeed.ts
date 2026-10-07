'use client';

// The table's feed in the browser: lib/poker-night/feed's reducer in a small store, and the I/O
// around it — the poll (paused while the page is hidden, at once when it shows again), the clock's
// tick (the leader just after a due time, everyone else seated a moment later in case the leader has
// gone), the presence beat every 25 s and on every visibility change, one GET state at a time, and
// the moves, the join and the drawers' reads. P3 runs on polling alone; P4's realtime client feeds
// the same store ('wire' inputs).
//
// A visitor who has not joined polls nothing: the routes answer only players. A table that closed,
// a removal and a lost seat re-render the page (router.refresh, once), which shows the summary or
// the join card; a newer deploy asks for a reload.

import {useCallback, useEffect, useRef, useState, useSyncExternalStore} from "react";
import {useRouter} from "next/navigation";
import {POKER_NIGHT_ERRORS} from "@/lib/learn/copy/poker-night";
import {
    createTicker, feedMode, feedReducer, handLive, initialFeed, isBehind, nearTurn, nextPollDelay, passFresh, shouldRetick, tickRole,
    type FeedInput, type FeedMode, type FeedState, type TickOutcome,
} from "@/lib/poker-night/feed";
import type {PokerNightErrorCode} from "@/lib/poker-night/http";
import type {ActionInput} from "@/lib/poker-night/input";
import {LIMITS} from "@/lib/poker-night/limits";
import type {DetailView, PlayerView, PlayPageView, Unchanged} from "@/lib/poker-night/view-types";
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
    problem: PokerNightErrorCode | null;
    send: (body: ActionBody) => Promise<SendResult>;
    join: (body: JoinBody) => Promise<JoinResult>;
    detail: (part: DetailPart, opts?: DetailOptions) => Promise<DetailView | null>;
    serverNow: () => number;
};

type Loop = {poll: () => void};

export const useTableFeed = ({code, initial, pollScale}: {code: string; initial: PlayPageView; pollScale: number}): TableFeed => {
    const router = useRouter();
    const [store] = useState(() => createFeedStore(initialFeed(initial)));
    const state = useSyncExternalStore(store.subscribe, store.get, store.get);
    const [problem, setProblem] = useState<PokerNightErrorCode | null>(null);
    const loop = useRef<Loop | null>(null);
    const refreshed = useRef(false);
    const joined = state.view !== null;

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

    // An answer from any request, into the store.
    const take = useCallback((r: ApiResult<PlayerView | Unchanged>): void => {
        if (!r.ok) return;
        if (isUnchanged(r.body)) store.dispatch({type: 'unchanged', body: r.body, at: r.receivedAt, sentAt: r.sentAt});
        else store.dispatch({type: 'view', view: r.body, at: r.receivedAt, sentAt: r.sentAt, animate: !hidden()});
    }, [store]);

    const pass = useCallback((): string | null => {
        const s = store.get();
        return passFresh(s.pass, Date.now() + s.offset);
    }, [store]);

    // The loop: polls, ticks and beats, for as long as the viewer has a row here.
    useEffect(() => {
        if (!joined || problem !== null) return;
        let stopped = false;
        let pollTimer: ReturnType<typeof setTimeout> | null = null;
        let pollAbort: AbortController | null = null;
        let polling = false;
        let again = false;
        const live = new Set<AbortController>();

        const end = (code: PokerNightErrorCode) => {
            if (REFRESH_CODES.has(code) || code === 'reload') {
                stopped = true;
                settle(code);
            } else if (TRANSIENT_CODES.has(code)) {
                store.dispatch({type: 'failed'});
            }
        };

        // ── the poll ──
        const schedule = () => {
            if (pollTimer !== null) clearTimeout(pollTimer);
            pollTimer = null;
            if (stopped) return;
            const s = store.get();
            const delay = nextPollDelay({
                mode: feedMode(s), hidden: hidden(), inHand: handLive(s.view), nearTurn: nearTurn(s.view, s.view?.me.seat ?? null), failures: s.failures,
                scale: pollScale,
            });
            if (delay !== null) pollTimer = setTimeout(() => void poll(), delay);
        };

        const poll = async (): Promise<void> => {
            if (stopped) return;
            if (polling) {
                again = true;
                return;
            }
            polling = true;
            again = false;
            if (pollTimer !== null) clearTimeout(pollTimer);
            pollTimer = null;
            const s = store.get();
            pollAbort = new AbortController();
            const r = await getState(code, {since: s.seq, esince: s.emoteSeq}, {pass: pass(), signal: pollAbort.signal});
            pollAbort = null;
            polling = false;
            if (stopped) return;
            if (r.ok) take(r);
            else if (!r.aborted) end(r.code);
            if (stopped) return;
            // A newer seq named while this one was out, or asked for meanwhile: once more, now.
            if (r.ok && (again || isBehind(store.get()))) {
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

        const onVisibility = () => {
            void beat();
            if (hidden()) {
                if (pollTimer !== null) clearTimeout(pollTimer);
                pollTimer = null;
            } else {
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
                if (!polling) schedule();
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
            unsubscribe();
            document.removeEventListener('visibilitychange', onVisibility);
            clearInterval(beatTimer);
            if (answerTimer !== null) clearTimeout(answerTimer);
            tabs?.close();
            if (pollTimer !== null) clearTimeout(pollTimer);
            ticker.stop();
            pollAbort?.abort();
            for (const controller of live) controller.abort();
        };
    }, [joined, problem, code, pollScale, store, settle, take, pass]);

    // ── the moves ──

    const send = useCallback(async (body: ActionBody): Promise<SendResult> => {
        const full = {...body, actionId: newActionId()} as ActionInput;
        // The pass names the player's own rate bucket (the route still reads the identity in full),
        // so players behind one address never share one.
        let r = await postAction(code, full, {pass: pass()});
        // A busy table lost five compare-and-sets: once more, under the same id.
        if (!r.ok && r.code === 'busy') r = await postAction(code, full, {pass: pass()});
        if (r.ok) {
            store.dispatch({type: 'view', view: r.body, at: r.receivedAt, sentAt: r.sentAt, animate: !hidden()});
            return {ok: true, view: r.body, duplicate: r.body.duplicate === true};
        }
        settle(r.code);
        // Turned down: the table may have moved on, so read it fresh.
        if (!REFRESH_CODES.has(r.code)) loop.current?.poll();
        return {ok: false, code: r.code, message: POKER_NIGHT_ERRORS[r.code]};
    }, [code, store, settle, pass]);

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

    return {state, mode: feedMode(state), problem, send, join, detail, serverNow};
};
