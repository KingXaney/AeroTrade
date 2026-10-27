'use client';

import {useEffect, useRef, useState, useSyncExternalStore} from "react";
import {getLive} from "@/components/agent-world/live-api";
import {initialLive, isSessionLive, liveReducer, nextPollDelay, type LiveInput, type LiveState} from "@/lib/agent-world/live";
import type {LiveView} from "@/lib/agent-world/types";

// The floor's poll loop around the pure reducer (lib/agent-world/live.ts): one request in flight at
// a time, each with its own AbortController; nothing while the tab is hidden, a poll at once when
// it shows again; every few seconds while a session is in progress, slowly otherwise, backing off
// after failures. The store is read through useSyncExternalStore with the server's view as the
// first snapshot, so the first paint is the server's.

export type LiveStore = {get: () => LiveState; dispatch: (input: LiveInput) => void; subscribe: (listener: () => void) => () => void};

export const createLiveStore = (initial: LiveState): LiveStore => {
    let state = initial;
    const listeners = new Set<() => void>();
    return {
        get: () => state,
        dispatch: (input) => {
            const next = liveReducer(state, input);
            if (next === state) return;
            state = next;
            for (const listener of [...listeners]) listener();
        },
        subscribe: (listener) => {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
    };
};

export const useLiveFeed = (initial: LiveView): {state: LiveState; dispatch: (input: LiveInput) => void; pollNow: () => void} => {
    const [store] = useState(() => createLiveStore(initialLive(initial)));
    const state = useSyncExternalStore(store.subscribe, store.get, store.get);
    const pollRef = useRef<() => void>(() => undefined);

    // A newer server render (the page refreshed after an action, or after a session settled)
    // arrives as a new prop; the reducer keeps whichever view is newer.
    useEffect(() => {
        store.dispatch({type: 'answer', answer: initial, at: initial.serverNow});
    }, [initial, store]);

    useEffect(() => {
        let stopped = false;
        let timer: ReturnType<typeof setTimeout> | null = null;
        let controller: AbortController | null = null;
        let polling = false;
        let again = false;
        const hidden = () => typeof document !== 'undefined' && document.hidden;
        const unarm = () => {
            if (timer !== null) clearTimeout(timer);
            timer = null;
        };
        const schedule = () => {
            if (stopped) return;
            unarm();
            const current = store.get();
            const delay = nextPollDelay({live: isSessionLive(current.view), hidden: hidden(), failures: current.failures});
            if (delay !== null) timer = setTimeout(() => void poll(), delay);
        };
        const poll = async () => {
            if (stopped) return;
            if (polling) {
                again = true;
                return;
            }
            polling = true;
            again = false;
            unarm();
            controller = new AbortController();
            const held = store.get().view;
            const result = await getLive({sid: held.session?.sessionId ?? null, version: held.version, seq: held.seq}, controller.signal);
            polling = false;
            if (stopped) return;
            if (result.ok) store.dispatch({type: 'answer', answer: result.body, at: result.receivedAt});
            else if (!result.aborted) store.dispatch({type: 'failed'});
            if (again) void poll();
            else schedule();
        };
        pollRef.current = () => void poll();
        const onVisibility = () => {
            if (hidden()) unarm();
            else void poll();
        };
        document.addEventListener('visibilitychange', onVisibility);
        schedule();
        return () => {
            stopped = true;
            unarm();
            controller?.abort();
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, [store]);

    return {state, dispatch: store.dispatch, pollNow: () => pollRef.current()};
};

// A clock for the tiles' elapsed times and the replay: local time ticking at `everyMs` (none when
// null), starting from the server's time so the first paint matches the server's.
export const useClock = (serverNow: number, everyMs: number | null): number => {
    const [now, setNow] = useState(serverNow);
    useEffect(() => {
        if (everyMs === null) return;
        const id = setInterval(() => setNow(Date.now()), everyMs);
        return () => clearInterval(id);
    }, [everyMs]);
    return now;
};
