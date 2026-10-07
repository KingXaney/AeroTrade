'use client';

// The table's animations in the browser: the room's events (useRoom().events, from
// lib/poker-night/events.diffViews) laid on lib/poker-night/choreography's timeline, a batch at a
// time, each one after the one still playing, kept while its elements are on screen and let go by
// a timer. A small store outside React, created once by TableScreen and handed down through
// AnimContext; a component reads the animations live now with useAnims() and draws them with
// animVars(), the custom properties the poker night CSS reads (--pn-at, --pn-dur in units of
// --motion-base, and a flight's --pn-dx / --pn-dy). Nothing here moves anything: CSS does.

import {createContext, useContext, type CSSProperties} from "react";
import {batchStart, scheduleBatch, STALE_MS, UNIT_MS, type Scheduled} from "@/lib/poker-night/choreography";
import type {TableEvent} from "@/lib/poker-night/events";
import type {RoomEvent} from "@/lib/poker-night/feed";

// A scheduled animation as it plays here: offset is how late its batch started after the moment
// the elements mounted, in units, added to every time inside it.
export type LiveAnim = Scheduled & {offset: number};

export type AnimStore = {
    get: () => readonly LiveAnim[];
    subscribe: (listener: () => void) => () => void;
    ingest: (events: readonly RoomEvent[], now: number) => void;
    dispose: () => void;
};

const SEEN_KEPT = 512;
const SLACK_MS = 400;

export const EMPTY_ANIMS: readonly LiveAnim[] = Object.freeze([]);

export const createAnimStore = (): AnimStore => {
    let items: readonly LiveAnim[] = EMPTY_ANIMS;
    const expires = new Map<string, number>();
    const seen = new Set<string>();
    const listeners = new Set<() => void>();
    let busyUntil = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const notify = () => {
        for (const listener of [...listeners]) listener();
    };
    const arm = () => {
        if (timer !== null) clearTimeout(timer);
        timer = null;
        if (items.length === 0) return;
        const next = Math.min(...items.map((i) => expires.get(i.id) ?? 0));
        timer = setTimeout(prune, Math.max(0, next - Date.now()) + 20);
    };
    const prune = () => {
        timer = null;
        const now = Date.now();
        const kept = items.filter((i) => (expires.get(i.id) ?? 0) > now);
        if (kept.length !== items.length) {
            for (const i of items) if (!kept.includes(i)) expires.delete(i.id);
            items = kept.length === 0 ? EMPTY_ANIMS : kept;
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
        ingest: (events, now) => {
            const fresh: RoomEvent[] = [];
            for (const e of events) {
                if (seen.has(e.id)) continue;
                seen.add(e.id);
                // An event older than STALE_MS (a page that slept) is drawn in place, not played.
                if (now - e.seenAt <= STALE_MS) fresh.push(e);
            }
            while (seen.size > SEEN_KEPT) seen.delete(seen.values().next().value as string);
            if (fresh.length === 0) return;
            // One batch per view the feed applied, in the order they came.
            const batches = new Map<number, TableEvent[]>();
            for (const e of fresh) batches.set(e.seenAt, [...(batches.get(e.seenAt) ?? []), e]);
            const added: LiveAnim[] = [];
            for (const at of [...batches.keys()].sort((a, b) => a - b)) {
                const start = batchStart(now, busyUntil);
                const offset = (start - now) / UNIT_MS;
                const batch = scheduleBatch(batches.get(at)!);
                for (const s of batch.items) {
                    added.push({...s, offset});
                    expires.set(s.id, start + s.until * UNIT_MS + SLACK_MS);
                }
                busyUntil = start + batch.length * UNIT_MS;
            }
            if (added.length === 0) return;
            const ids = new Set(added.map((a) => a.id));
            items = [...items.filter((i) => !ids.has(i.id)), ...added];
            notify();
            arm();
        },
        dispose: () => {
            if (timer !== null) clearTimeout(timer);
            timer = null;
            listeners.clear();
        },
    };
};

export const AnimContext = createContext<readonly LiveAnim[]>(EMPTY_ANIMS);

export const useAnims = (): readonly LiveAnim[] => useContext(AnimContext);

// The animations of one kind, narrowed to its event.
export type AnimOf<K extends TableEvent['kind']> = LiveAnim & {event: TableEvent & {kind: K}};

export const animsOf = <K extends TableEvent['kind']>(anims: readonly LiveAnim[], kind: K): AnimOf<K>[] =>
    anims.filter((a): a is AnimOf<K> => a.event.kind === kind);

// The custom properties an animated element reads: when (units, from the batch's start, offset
// included) and how long; a flight's offset in pixels; anything else by name.
export const animVars = (anim: Pick<LiveAnim, 'offset'>, at: number, dur?: number, extra: Record<string, string | number> = {}): CSSProperties => {
    const vars: Record<string, string> = {'--pn-at': (anim.offset + at).toFixed(3)};
    if (dur !== undefined) vars['--pn-dur'] = dur.toFixed(3);
    for (const [name, value] of Object.entries(extra)) vars[`--pn-${name}`] = typeof value === 'number' ? `${value}px` : value;
    return vars as CSSProperties;
};
