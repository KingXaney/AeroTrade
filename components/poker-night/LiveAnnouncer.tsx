'use client';

// What a screen reader hears as the table moves: two visually hidden live regions, polite and
// assertive, filled from the room's events by lib/poker-night/announce (every sentence
// ANNOUNCE_COPY's) — the viewer's turn at once, with its price and the pot, and in Triple T the three
// cards to throw one of away; the deal, the card thrown away, the streets, the others' moves, the
// winners, who sits down and leaves in turn — and "10 seconds left" on the viewer's own turn and
// throw-away. The regions are written directly (a live region is announced when its text
// changes), and cleared a moment later so the same words can be said again.

import {useEffect, useRef} from "react";
import {useRoom} from "@/components/poker-night/room-controller";
import {ANNOUNCE_COPY} from "@/lib/learn/copy/poker-night";
import {announcementsFor} from "@/lib/poker-night/announce";

const CLEAR_MS = 4000;
const LOW_SECONDS = 10;

const say = (el: HTMLElement | null, lines: readonly string[], timers: Map<HTMLElement, ReturnType<typeof setTimeout>>) => {
    if (!el || lines.length === 0) return;
    el.textContent = lines.join(' ');
    const previous = timers.get(el);
    if (previous) clearTimeout(previous);
    timers.set(el, setTimeout(() => {
        el.textContent = '';
    }, CLEAR_MS));
};

const LiveAnnouncer = () => {
    const room = useRoom();
    const polite = useRef<HTMLDivElement>(null);
    const assertive = useRef<HTMLDivElement>(null);
    const said = useRef(new Set<string>());
    const timers = useRef(new Map<HTMLElement, ReturnType<typeof setTimeout>>());
    const {events, table, me} = room;

    useEffect(() => {
        const fresh = events.filter((e) => !said.current.has(e.id));
        if (fresh.length === 0) return;
        for (const e of fresh) said.current.add(e.id);
        if (said.current.size > 512) said.current = new Set([...said.current].slice(-256));
        const out = announcementsFor(fresh, {view: table, people: table.people, mySeat: me?.seat ?? null, hole: me?.hole ?? null, discard: me?.discard ?? null});
        say(polite.current, out.polite, timers.current);
        say(assertive.current, out.assertive, timers.current);
    }, [events, table, me]);

    // Ten seconds left on the viewer's own turn (or to throw a card away, in Triple T), said once.
    const hand = table.hand;
    const seat = me?.seat ?? null;
    const mine = seat !== null && ((hand?.phase === 'betting' && hand.actor === seat) || (hand?.phase === 'discard' && hand.toDiscard.includes(seat)));
    const deadline = mine ? hand?.deadline ?? null : null;
    const {serverNow} = room;
    useEffect(() => {
        if (deadline === null) return;
        const wait = deadline - LOW_SECONDS * 1000 - serverNow();
        if (wait < 0) return;
        const id = setTimeout(() => say(assertive.current, [ANNOUNCE_COPY.timeLow(LOW_SECONDS)], timers.current), wait);
        return () => clearTimeout(id);
    }, [deadline, serverNow]);

    useEffect(() => {
        const pending = timers.current;
        return () => {
            for (const id of pending.values()) clearTimeout(id);
        };
    }, []);

    return (
        <>
            <div ref={polite} className="sr-only" aria-live="polite" aria-atomic="true" data-pn-live="polite"/>
            <div ref={assertive} className="sr-only" aria-live="assertive" aria-atomic="true" data-pn-live="assertive"/>
        </>
    );
};

export default LiveAnnouncer;
