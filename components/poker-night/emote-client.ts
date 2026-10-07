'use client';

// The table's small stores for emotes and the keys (P6), outside React like overlay-requests: the
// players this viewer muted for the visit (a SeatMenu choice, gone on reload — the personal "Mute
// emotes" switch is the lasting one, lib/poker-night/personal); the requests to open the emote
// picker (the E key) and the shortcuts list (the ? key, the top bar's menu), each answered once by
// the one component that owns it; the 1.2-second cooldown the picker and the plates' menus share;
// and the emotes on screen (createEmoteStore, EmoteLayer's), planned by lib/poker-night/emotes and
// let go by timers. Plus whether motion is reduced, read when an emote arrives.

import {useSyncExternalStore} from "react";
import {toast} from "sonner";
import type {EmoteResult} from "@/components/poker-night/room-controller";
import {EMOTE_COPY} from "@/lib/learn/copy/poker-night";
import {admit, EMOTE_COOLDOWN_MS, emoteShows, liveFor, nextChange, readEmote, settle, type EmoteInput, type EmoteMessage, type LiveEmote} from "@/lib/poker-night/emotes";
import type {EmoteView} from "@/lib/poker-night/view-types";

const store = <T>(initial: T) => {
    let value = initial;
    const listeners = new Set<() => void>();
    return {
        get: () => value,
        set: (next: T) => {
            if (next === value) return;
            value = next;
            for (const listener of [...listeners]) listener();
        },
        subscribe: (listener: () => void) => {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
    };
};

// ── players muted for this visit ──

const EMPTY: ReadonlySet<string> = new Set();
const muted = store<ReadonlySet<string>>(EMPTY);

export const toggleMuted = (pid: string): boolean => {
    const next = new Set(muted.get());
    const now = !next.has(pid);
    if (now) next.add(pid);
    else next.delete(pid);
    muted.set(next);
    return now;
};

export const useMutedPlayers = (): ReadonlySet<string> => useSyncExternalStore(muted.subscribe, muted.get, () => EMPTY);

// ── requests: open the picker, open the shortcuts list ──

type Request = {id: number};
let nextId = 1;
const pickerRequests = store<Request | null>(null);
const shortcutRequests = store<Request | null>(null);

export const requestEmotePicker = (): void => pickerRequests.set({id: nextId++});
export const openShortcuts = (): void => shortcutRequests.set({id: nextId++});

export const useEmotePickerRequest = (): Request | null => useSyncExternalStore(pickerRequests.subscribe, pickerRequests.get, () => null);
export const useShortcutsRequest = (): Request | null => useSyncExternalStore(shortcutRequests.subscribe, shortcutRequests.get, () => null);

// The id of the request made last, 0 before any: what a reader mounting now has already seen.
export const latestPickerRequest = (): number => pickerRequests.get()?.id ?? 0;
export const latestShortcutsRequest = (): number => shortcutRequests.get()?.id ?? 0;

// ── the cooldown, shared by the picker and the plates' menus ──

// True for EMOTE_COOLDOWN_MS after an emote goes: the buttons grey out, as the room would refuse
// a second one (429) inside it.
const cooling = store(false);
let coolTimer: ReturnType<typeof setTimeout> | null = null;

export const startCooldown = (): void => {
    cooling.set(true);
    if (coolTimer !== null) clearTimeout(coolTimer);
    coolTimer = setTimeout(() => {
        coolTimer = null;
        cooling.set(false);
    }, EMOTE_COOLDOWN_MS);
};

export const coolingDown = (): boolean => cooling.get();

export const useCoolingDown = (): boolean => useSyncExternalStore(cooling.subscribe, cooling.get, () => false);

// An emote from the picker or a plate's menu: not inside the cooldown, which starts as it goes and
// starts again when the answer comes — the room stamps the emote when the request arrives, after the
// click, so a cooldown counted from the click alone could end before the room's and a second emote
// the picker allows would be refused; a refusal said in a toast (the cooldown's own words for a 429).
export const sendEmoteNow = async (send: (input: EmoteInput) => Promise<EmoteResult>, input: EmoteInput): Promise<boolean> => {
    if (coolingDown()) {
        toast.message(EMOTE_COPY.cooldown);
        return false;
    }
    startCooldown();
    const r = await send(input);
    if (r.ok) {
        startCooldown();
        return true;
    }
    if (r.code === 'rate_limited') toast.message(EMOTE_COPY.cooldown);
    else toast.error(r.message);
    return false;
};

// ── what is on screen ──

export type IngestContext = {me: string | null; muteAll: boolean; muted: ReadonlySet<string>; serverNow: number; reduced: boolean};

export type EmoteStore = {
    get: () => readonly LiveEmote[];
    subscribe: (listener: () => void) => () => void;
    // New emotes from the room (each id once): those the viewer sees go on screen; returned so the
    // caller can say them and sound them.
    ingest: (emotes: readonly EmoteView[], ctx: IngestContext) => EmoteMessage[];
    // Called as each throw reaches its target (its impact begins); returns how to stop listening.
    onLand: (listener: (live: LiveEmote) => void) => () => void;
    dispose: () => void;
};

const SEEN_KEPT = 256;
const NONE: readonly LiveEmote[] = Object.freeze([]);

// The emotes on screen, as lib/poker-night/emotes plans them (admit, settle), each taken away (or
// landed, a throw in flight) by a timer at its own time, never by animationend.
export const createEmoteStore = (): EmoteStore => {
    let items: readonly LiveEmote[] = NONE;
    const seen = new Set<string>();
    const listeners = new Set<() => void>();
    const landers = new Set<(live: LiveEmote) => void>();
    let timer: ReturnType<typeof setTimeout> | null = null;

    const notify = () => {
        for (const listener of [...listeners]) listener();
    };
    const arm = () => {
        if (timer !== null) clearTimeout(timer);
        timer = null;
        const at = nextChange(items);
        if (at !== null) timer = setTimeout(tick, Math.max(0, at - Date.now()) + 15);
    };
    const tick = () => {
        timer = null;
        const now = Date.now();
        const before = items;
        const next = settle(before, now);
        if (next !== before) {
            for (const i of next) if (i.phase === 'impact' && before.some((b) => b.key === i.key && b.phase === 'flight')) for (const land of [...landers]) land(i);
            items = next.length === 0 ? NONE : next;
            notify();
        }
        arm();
    };

    return {
        get: () => items,
        subscribe: (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        ingest: (emotes, ctx) => {
            const shown: EmoteMessage[] = [];
            const now = Date.now();
            let next = settle(items, now);
            for (const raw of emotes) {
                if (seen.has(raw.id)) continue;
                seen.add(raw.id);
                const e = readEmote(raw);
                if (!e || !emoteShows(e, {me: ctx.me, muteAll: ctx.muteAll, muted: ctx.muted, now: ctx.serverNow})) continue;
                next = admit(next, liveFor(e, now, ctx.reduced));
                shown.push(e);
            }
            while (seen.size > SEEN_KEPT) seen.delete(seen.values().next().value as string);
            if (next !== items) {
                items = next.length === 0 ? NONE : next;
                notify();
                arm();
            }
            return shown;
        },
        onLand: (listener) => {
            landers.add(listener);
            return () => {
                landers.delete(listener);
            };
        },
        dispose: () => {
            if (timer !== null) clearTimeout(timer);
            timer = null;
            listeners.clear();
            landers.clear();
        },
    };
};

// ── motion ──

// The in-app "Reduce motion" (html[data-motion="reduced"]) or the system's: a throw then shows only
// its impact. Read in a handler or an effect, never in render.
export const motionReduced = (): boolean =>
    typeof window !== 'undefined'
    && (document.documentElement.dataset.motion === 'reduced' || window.matchMedia('(prefers-reduced-motion: reduce)').matches);
