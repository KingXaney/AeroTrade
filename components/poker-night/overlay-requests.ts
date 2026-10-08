'use client';

// How the rest of the table asks the overlays for something: open a drawer (the dock's "Out of
// chips" opens the bank, a plate's menu the host drawer), take a seat (an open seat's "Sit here"
// chooses it on the join card, for a visitor or a watcher; the dock's "Sit down again" any seat), or
// ask before leaving (the dock's Leave when sitting down again is not assured). A tiny store outside React, so a table
// component calls openOverlay / chooseSeat from its click handler and TableOverlays, the one reader,
// picks the request up on its next render. Each request has its own id: TableOverlays answers each
// once, and one made before it mounted (a previous room) is never answered.

import {useSyncExternalStore} from "react";
import type {LeaveThen} from "@/lib/poker-night/overlays";

// 'hands': the Hands guide (HandsDrawer), the H key's and the menu's.
export type DrawerKind = 'invite' | 'bank' | 'host' | 'log' | 'look' | 'hands';

export type OverlayRequest =
    | {id: number; kind: 'drawer'; drawer: DrawerKind}
    | {id: number; kind: 'seat'; seat: number | null} // null: any open seat
    | {id: number; kind: 'leave'; then: LeaveThen}; // the leave dialog, from the dock's Leave or the top bar's Home

let latest: OverlayRequest | null = null;
let nextId = 1;
const listeners = new Set<() => void>();

type Unnumbered = OverlayRequest extends infer R ? (R extends OverlayRequest ? Omit<R, 'id'> : never) : never;

const emit = (request: Unnumbered) => {
    latest = {...request, id: nextId++};
    for (const listener of [...listeners]) listener();
};

export const openOverlay = (drawer: DrawerKind): void => emit({kind: 'drawer', drawer});

// The seat the viewer chose ("Sit here" on an open seat), or any open seat.
export const chooseSeat = (seat: number | null): void => emit({kind: 'seat', seat});

// The leave dialog (lib/poker-night/overlays.leavePlan): staying on the page to watch, or going
// home once the leave lands.
export const askLeave = (then: LeaveThen): void => emit({kind: 'leave', then});

// The id of the request made last, 0 before any: what a reader mounting now has already seen.
export const latestRequestId = (): number => latest?.id ?? 0;

const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};

export const useOverlayRequest = (): OverlayRequest | null => useSyncExternalStore(subscribe, () => latest, () => null);
