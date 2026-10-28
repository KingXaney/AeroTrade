// The live floor's state, pure and client-safe: what the page holds of the newest session, how a
// poll's answer merges into it, which symbol's lane is shown, and how long to wait before the next
// poll. components/agent-world/useLiveFeed.ts owns the timers and the fetches; nothing here does.

import {POLL_BACKOFF_CAP_MS, POLL_IDLE_MS, POLL_LIVE_MS, isLiveStatus} from "@/lib/agent-world/config";
import type {LiveAnswer, LiveView, RunView} from "@/lib/agent-world/types";
import {isLiveUnchanged} from "@/lib/agent-world/types";

export type ReplayClock = {startedAt: number; duration: number};

export type LiveState = {
    view: LiveView;
    // Server time minus this browser's, from the last answer: the clock the tiles' elapsed times read.
    offset: number;
    failures: number;
    // The lane shown, and whether the reader picked it (else it follows the run in progress).
    symbol: string | null;
    pinned: boolean;
    replay: ReplayClock | null;
};

export type LiveInput =
    | {type: 'answer'; answer: LiveAnswer; at: number}
    | {type: 'failed'}
    | {type: 'pick'; symbol: string}
    | {type: 'follow'}
    | {type: 'replay-start'; at: number; duration: number}
    | {type: 'replay-stop'};

export const initialLive = (view: LiveView, at: number = view.serverNow): LiveState => ({
    view,
    offset: view.serverNow - at,
    failures: 0,
    symbol: view.session?.current?.symbol ?? view.session?.symbols[0] ?? null,
    pinned: false,
    replay: null,
});

const sameSession = (a: LiveView, b: LiveView): boolean => (a.session?.sessionId ?? null) === (b.session?.sessionId ?? null);

// The view after an answer: a new session replaces everything; within one session a newer version
// is taken (a partial one merging its runs by symbol into those held), a full one at the same
// version replaces in place (a server render after a refresh), anything older is ignored.
export const mergeView = (held: LiveView, next: LiveView): LiveView => {
    if (!sameSession(held, next)) return next;
    if (next.version < held.version) return held;
    if (next.version === held.version && (next.partial || next.seq < held.seq)) return held;
    if (!next.partial) return next;
    const runs = new Map(held.runs.map((run) => [run.symbol, run]));
    for (const run of next.runs) {
        const before = runs.get(run.symbol);
        if (!before || run.seq >= before.seq) runs.set(run.symbol, run);
    }
    const order = next.session?.symbols ?? held.session?.symbols ?? [];
    const merged = [...runs.values()].sort((a, b) => order.indexOf(a.symbol) - order.indexOf(b.symbol));
    return {...next, runs: merged, partial: false};
};

export const liveReducer = (state: LiveState, input: LiveInput): LiveState => {
    switch (input.type) {
        case 'answer': {
            const offset = input.answer.serverNow - input.at;
            if (isLiveUnchanged(input.answer)) {
                return state.failures === 0 && Math.abs(offset - state.offset) < 250 ? state : {...state, failures: 0, offset};
            }
            const view = mergeView(state.view, input.answer);
            if (view === state.view) return state.failures === 0 ? state : {...state, failures: 0};
            const symbols = view.session?.symbols ?? [];
            const keep = state.pinned && state.symbol !== null && symbols.includes(state.symbol);
            const symbol = keep ? state.symbol : view.session?.current?.symbol ?? (state.symbol !== null && symbols.includes(state.symbol) ? state.symbol : symbols[0] ?? null);
            const fresh = !sameSession(state.view, view);
            return {...state, view, offset, failures: 0, symbol, pinned: keep, replay: fresh ? null : state.replay};
        }
        case 'failed':
            return {...state, failures: state.failures + 1};
        case 'pick':
            if (!(state.view.session?.symbols ?? []).includes(input.symbol)) return state;
            return state.symbol === input.symbol && state.pinned ? state : {...state, symbol: input.symbol, pinned: true};
        case 'follow':
            return state.pinned ? {...state, pinned: false, symbol: state.view.session?.current?.symbol ?? state.symbol} : state;
        case 'replay-start':
            // A session still running is shown live; there is nothing stored to play back yet.
            if (isSessionLive(state.view) || state.view.runs.length === 0) return state;
            return {...state, replay: {startedAt: input.at, duration: input.duration}, pinned: false};
        case 'replay-stop':
            return state.replay === null ? state : {...state, replay: null};
    }
};

export const isSessionLive = (view: Pick<LiveView, 'session'>): boolean => view.session !== null && isLiveStatus(view.session.status);

export type LiveMode = 'live' | 'replay' | 'idle';
export const liveMode = (state: Pick<LiveState, 'view' | 'replay'>): LiveMode =>
    state.replay !== null ? 'replay' : isSessionLive(state.view) ? 'live' : 'idle';

// How long until the next poll: never while the tab is hidden, backing off after failures, every
// few seconds while a session is in progress, otherwise slowly (a session may start any time).
export const nextPollDelay = ({live, hidden, failures}: {live: boolean; hidden: boolean; failures: number}): number | null => {
    if (hidden) return null;
    if (failures > 0) return Math.min(POLL_LIVE_MS * 2 ** failures, POLL_BACKOFF_CAP_MS);
    return live ? POLL_LIVE_MS : POLL_IDLE_MS;
};

// The run whose lane is shown: the one picked, else the one the session is on, else the first.
export const activeRun = (view: LiveView, symbol: string | null): RunView | null =>
    view.runs.find((run) => run.symbol === symbol)
    ?? view.runs.find((run) => run.symbol === view.session?.current?.symbol)
    ?? view.runs[0]
    ?? null;
