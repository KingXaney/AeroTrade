'use client';

// The table's sounds, wired to its animations (P6): every animation the table schedules
// (components/poker-night/anim) makes its sound at its own moment on the same timeline —
// lib/poker-night/sounds.soundCues — on the style's motion token, so a zeroed token (brutalist,
// reduced motion) plays them at once as it shows the moves at once. The viewer's turn chimes as it
// starts (and, on a phone with buzz on, vibrates once). The page's one audio context is made and
// woken by a gesture in the room (sound-player.stayUnlocked) — every kind a browser counts as one:
// a touch's pointerup and touchend (a touch's pointerdown is not one, and iOS starts Web Audio only
// inside a touchend or a click), a click, a mouse press, a key — until it is running. Nothing plays
// while the player keeps the sounds off (My look, or M), and nothing but the turn while the page is
// hidden.

import {useEffect, useRef} from "react";
import type {LiveAnim} from "@/components/poker-night/anim";
import {useRoom} from "@/components/poker-night/room-controller";
import {playSound, stayUnlocked} from "@/components/poker-night/sound-player";
import {cssTimeMs} from "@/lib/poker-night/chips";
import {UNIT_MS} from "@/lib/poker-night/choreography";
import {attentionKey} from "@/lib/poker-night/overlays";
import {cueDelayMs, soundCues} from "@/lib/poker-night/sounds";

const KEPT = 512;
const BUZZ_MS = 30;

// The style's motion unit now: --motion-base, read off the room (a guard may zero it).
const unitMs = (): number => {
    const el = document.querySelector('.pn-room') ?? document.documentElement;
    const raw = getComputedStyle(el).getPropertyValue('--motion-base');
    return raw.trim() === '' ? UNIT_MS : cssTimeMs(raw);
};

export const useTableSounds = (anims: readonly LiveAnim[]): void => {
    const room = useRoom();
    const on = room.personal.sound;
    const buzz = room.personal.buzz;
    const played = useRef(new Set<string>());
    const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

    // A gesture in the room makes (or wakes) the audio context; the listeners stay until it runs,
    // and come back whenever the browser suspends or interrupts it (a call, another app).
    useEffect(() => stayUnlocked(), []);

    // Each animation's sounds, once, at their moment.
    useEffect(() => {
        const cues = soundCues(anims);
        const fresh = cues.filter((c) => !played.current.has(c.key));
        for (const c of fresh) played.current.add(c.key);
        while (played.current.size > KEPT) played.current.delete(played.current.values().next().value as string);
        if (!on || fresh.length === 0) return;
        const unit = unitMs();
        for (const cue of fresh) {
            const timer = setTimeout(() => {
                timers.current.delete(timer);
                playSound(cue.sound);
            }, cueDelayMs(cue, unit));
            timers.current.add(timer);
        }
    }, [anims, on]);

    // Turning the sounds off silences what is still to come.
    useEffect(() => {
        if (on) return;
        for (const timer of timers.current) clearTimeout(timer);
        timers.current.clear();
    }, [on]);

    useEffect(() => {
        const pending = timers.current;
        return () => {
            for (const timer of pending) clearTimeout(timer);
            pending.clear();
        };
    }, []);

    // The viewer's turn (or a card of theirs to throw away, in Triple T): a chime, and on a touch
    // screen with buzz on, one short vibration.
    const turnKey = attentionKey(room.view);
    const turnSeen = useRef<string | null>(null);
    useEffect(() => {
        if (turnKey === null || turnSeen.current === turnKey) return;
        turnSeen.current = turnKey;
        if (on) playSound('turn');
        if (buzz && typeof navigator.vibrate === 'function' && window.matchMedia('(pointer: coarse)').matches) navigator.vibrate(BUZZ_MS);
    }, [turnKey, on, buzz]);
};
