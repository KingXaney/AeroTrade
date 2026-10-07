'use client';

// The room's own keys (P6), beside the action bar's moves: E opens the emotes (a seated player), L
// the hand log, B the bank, M turns the sounds on or off, ? lists every key
// (lib/poker-night/keys.roomIntentForKey). The same rules as the moves: never with ⌘, Ctrl or Alt,
// never on a held key or while typing, never over a dialog, a menu or a drawer, only with the focus
// on the table itself (not the top bar), and only while the player keeps the single-key shortcuts
// on (WCAG 2.1.4). A joined viewer only: a visitor has the join card.

import {useEffect, useEffectEvent} from "react";
import {toast} from "sonner";
import {openShortcuts, requestEmotePicker} from "@/components/poker-night/emote-client";
import {openOverlay} from "@/components/poker-night/overlay-requests";
import {useRoom} from "@/components/poker-night/room-controller";
import {SHORTCUTS_COPY} from "@/lib/learn/copy/poker-night";
import {isEditableTarget, keyAllowed, roomIntentForKey, type FocusPlace} from "@/lib/poker-night/keys";

// A keydown aimed at a dialog, a menu or a drawer belongs to it.
const insideOverlay = (target: EventTarget | null): boolean =>
    target instanceof Element && target.closest('[role="dialog"], [role="menu"], [data-slot="sheet-content"], [data-slot="dialog-content"], [data-slot="popover-content"]') !== null;

// Where a keydown's focus is: the page itself, the table and the dock, or anywhere else.
const placeOf = (target: EventTarget | null): FocusPlace => {
    if (!(target instanceof Element) || target === document.body || target === document.documentElement) return 'body';
    return target.closest('[data-pn-dock], .pn-table') ? 'table' : 'elsewhere';
};

export const useHotkeys = (): void => {
    const room = useRoom();

    const onKey = useEffectEvent((e: KeyboardEvent) => {
        if (e.defaultPrevented || !room.view || insideOverlay(e.target)) return;
        if (!keyAllowed(e.key, placeOf(e.target), room.personal.shortcuts)) return;
        const intent = roomIntentForKey({key: e.key, metaKey: e.metaKey, ctrlKey: e.ctrlKey, altKey: e.altKey, repeat: e.repeat, editable: isEditableTarget(e.target)});
        if (!intent) return;
        switch (intent) {
            case 'emotes':
                if (room.view.me.seat === null) return;
                requestEmotePicker();
                break;
            case 'log':
                openOverlay('log');
                break;
            case 'bank':
                openOverlay('bank');
                break;
            case 'mute': {
                const sound = !room.personal.sound;
                room.setPersonal({sound});
                toast.message(sound ? SHORTCUTS_COPY.soundOn : SHORTCUTS_COPY.soundOff);
                break;
            }
            case 'shortcuts':
                openShortcuts();
                break;
        }
        e.preventDefault();
    });

    useEffect(() => {
        const listener = (e: KeyboardEvent) => onKey(e);
        window.addEventListener('keydown', listener);
        return () => window.removeEventListener('keydown', listener);
    }, []);
};
