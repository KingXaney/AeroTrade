'use client';

// The emotes over the table (P6): a reaction rising 60 px over its sender's plate, a phrase in a
// speech bubble beside it (.chrome-surface with its .chrome-tail), both clear of the seat's
// turned-up cards and its action tag — under the plate, the reaction drifting down toward the felt,
// for a seat along the top or one too near it (lib/poker-night/emotes.emoteSpot, data-below) — and a
// throw flying from the sender's avatar to its target's — an outer layer moving straight across
// (.pn-throw-x), an inner one rising and falling on an arc kept under the top bar (throwPath's
// ceiling) and spinning (.pn-throw-y) — then its impact on the target's avatar (a splat, petals,
// fizz, a burst, a bounce), marked data-splat with the thing thrown, never over the name and the
// stack, one at a time on a plate. Under reduced motion only the impact shows.
//
// What is on screen is components/poker-night/emote-client's store, fed the room's emotes once each:
// the viewer's own always, anyone else's unless the viewer muted every emote (their personal
// setting) or that player (the plate's menu, for this visit); never one older than 8 s. Lifetimes
// are timers (lib/poker-night/emotes EMOTE_TIMING), never animationend; at most three per player and
// 24 in all. Everything drawn here is hidden from a screen reader: the polite region at the end says
// each one instead. A pop sounds for another player's reaction or phrase, and a landing (a splat, a
// pop, a fizz or a bounce: emotes.landingSound) as a throw lands, while the viewer keeps the sounds
// on. Also mounts the plates' menus (SeatMenus).

import {useEffect, useRef, useState, useSyncExternalStore, type CSSProperties} from "react";
import {createEmoteStore, motionReduced, useMutedPlayers} from "@/components/poker-night/emote-client";
import {useRoom} from "@/components/poker-night/room-controller";
import SeatMenus from "@/components/poker-night/SeatMenu";
import {playSound} from "@/components/poker-night/sound-player";
import {EMOTE_COPY, TABLE_COPY} from "@/lib/learn/copy/poker-night";
import {
    burstJitter, emoteSpot, impactBits, impactOf, landingSound, reactionGlyph, throwCeiling, throwGlyph, throwPath, type EmoteMessage, type LiveEmote,
} from "@/lib/poker-night/emotes";
import {avatarCentre, type SeatPlace, type Stage} from "@/lib/poker-night/stage";
import type {People, SeatView} from "@/lib/poker-night/view-types";

const CLEAR_MS = 4000;

const seatOf = (seats: readonly (SeatView | null)[], pid: string): number => seats.findIndex((s) => s?.pid === pid);

const nameOf = (people: People, pid: string, seats: readonly (SeatView | null)[]): string =>
    people[pid]?.name || TABLE_COPY.seat(Math.max(0, seatOf(seats, pid)));

// What a screen reader hears for an emote.
const sayLine = (e: EmoteMessage, people: People, seats: readonly (SeatView | null)[], me: string | null): string => {
    const from = nameOf(people, e.from, seats);
    switch (e.kind) {
        case 'react':
            return EMOTE_COPY.reacted(from, e.item);
        case 'say':
            return EMOTE_COPY.said(from, e.item);
        case 'throw':
            return e.to === me ? EMOTE_COPY.threwAtYou(from, e.item) : EMOTE_COPY.threw(from, e.item, nameOf(people, e.to, seats));
    }
};

const Impact = ({live, place, stage}: {live: LiveEmote & {emote: {kind: 'throw'}}; place: SeatPlace; stage: Stage}) => {
    const e = live.emote;
    const impact = impactOf(e.item);
    const bits = impactBits(e.id, impact);
    const glyph = throwGlyph(e.item);
    const at = avatarCentre(place, stage);
    return (
        <span className="pn-impact" style={{left: at.x, top: at.y}} data-splat={e.item} data-impact={impact} data-splat-seat={place.seat}>
            {impact === 'splat' && (
                <>
                    <span className="pn-splat-blob pn-splat"/>
                    <span className="pn-impact-glyph pn-splat">{glyph}</span>
                    {bits.map((b, k) => (
                        <span key={k} className="pn-splat-drop pn-petals" style={{'--pn-x': `${b.x * 1.6}px`, '--pn-y': `${b.y * 1.2}px`, '--pn-rot': '0deg', '--pn-wait': '0ms', '--pn-life': '0.5s'} as CSSProperties}/>
                    ))}
                </>
            )}
            {(impact === 'petals' || impact === 'burst') && bits.map((b, k) => (
                <span key={k} className={impact === 'petals' ? 'pn-petal pn-petals' : 'pn-burst-bit pn-petals'} data-alt={k % 2 === 1 ? '' : undefined}
                      style={{'--pn-x': `${b.x}px`, '--pn-y': `${b.y}px`, '--pn-rot': `${b.rot}deg`, '--pn-wait': `${b.delay}ms`, '--pn-life': impact === 'burst' ? '1.1s' : '1.9s'} as CSSProperties}>
                    {impact === 'burst' && e.item === 'popcorn' ? glyph : null}
                </span>
            ))}
            {impact === 'fizz' && (
                <>
                    <span className="pn-impact-glyph pn-splat">{glyph}</span>
                    {bits.map((b, k) => (
                        <span key={k} className="pn-fizz-bubble pn-fizz" style={{'--pn-x': `${b.x}px`, '--pn-y': `${b.y}px`, '--pn-wait': `${b.delay}ms`} as CSSProperties}/>
                    ))}
                </>
            )}
            {impact === 'bounce' && (
                <span className="pn-impact-glyph pn-bounce" style={{'--pn-dir': place.plate.x < stage.centre.x ? '1' : '-1'} as CSSProperties}>{glyph}</span>
            )}
        </span>
    );
};

const EmoteLayer = ({stage}: {stage: Stage}) => {
    const room = useRoom();
    const table = room.table;
    const muted = useMutedPlayers();
    const region = useRef<HTMLDivElement>(null);
    const clear = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [store] = useState(createEmoteStore);
    useEffect(() => () => store.dispose(), [store]);
    // A throw sounds as it lands, while the viewer keeps the sounds on.
    const soundOn = room.personal.sound;
    useEffect(() => (soundOn ? store.onLand((landed) => {
        if (landed.emote.kind === 'throw') playSound(landingSound(landed.emote.item));
    }) : undefined), [store, soundOn]);
    const live = useSyncExternalStore(store.subscribe, store.get, store.get);

    const {emotes, serverNow, personal} = room;
    const me = room.me?.pid ?? null;
    const people = table.people;
    const seats = table.seats;
    useEffect(() => {
        const shown = store.ingest(emotes, {me, muteAll: personal.muteEmotes, muted, serverNow: serverNow(), reduced: motionReduced()});
        if (shown.length === 0) return;
        if (personal.sound) {
            if (shown.some((e) => e.kind !== 'throw' && e.from !== me)) playSound('pop');
            if (motionReduced()) for (const e of shown) if (e.kind === 'throw') playSound(landingSound(e.item));
        }
        const el = region.current;
        if (!el) return;
        el.textContent = shown.map((e) => sayLine(e, people, seats, me)).join(' ');
        if (clear.current) clearTimeout(clear.current);
        clear.current = setTimeout(() => {
            el.textContent = '';
        }, CLEAR_MS);
    }, [store, emotes, me, personal.muteEmotes, personal.sound, muted, serverNow, people, seats]);
    useEffect(() => () => {
        if (clear.current) clearTimeout(clear.current);
    }, []);

    const placeOf = (pid: string): SeatPlace | null => {
        const seat = seatOf(seats, pid);
        return seat === -1 ? null : stage.seats[seat] ?? null;
    };
    // Whether a seat shows its cards turned up beside its plate (never the viewer's own: the dock has those).
    const shows = (pid: string): boolean => {
        const seat = seatOf(seats, pid);
        return seat !== -1 && seat !== room.me?.seat && Array.isArray(seats[seat]?.cards);
    };
    const ceiling = throwCeiling(stage.fit);

    return (
        <>
            <SeatMenus stage={stage}/>
            <div className="pn-emotes" aria-hidden="true" data-pn-emotes={live.length}>
                {live.map((item) => {
                    const e = item.emote;
                    const at = placeOf(item.anchor);
                    if (!at) return null;
                    if (item.phase === 'burst' && e.kind === 'react') {
                        const spot = emoteSpot(at, stage, shows(e.from));
                        return (
                            <span key={item.key} className="pn-emote pn-emote-rise" style={{left: spot.x + burstJitter(e.id), top: spot.y}}
                                  data-below={spot.below ? '' : undefined} data-emote="react" data-emote-item={e.item} data-emote-from={e.from}>
                                {reactionGlyph(e.item)}
                            </span>
                        );
                    }
                    if (item.phase === 'phrase' && e.kind === 'say') {
                        const spot = emoteSpot(at, stage, shows(e.from));
                        return (
                            <span key={item.key} className="pn-phrase chrome-surface pn-phrase-in" data-below={spot.below ? '' : undefined}
                                  style={{left: spot.x, top: spot.y}}
                                  data-emote="say" data-emote-item={e.item} data-emote-from={e.from}>
                                {EMOTE_COPY.phrases[e.item]}
                                <span aria-hidden="true" className="pn-phrase-tail chrome-tail"/>
                            </span>
                        );
                    }
                    if (e.kind !== 'throw') return null;
                    if (item.phase === 'flight') {
                        const from = placeOf(e.from);
                        if (!from) return null;
                        const to = avatarCentre(at, stage);
                        const path = throwPath(avatarCentre(from, stage), to, ceiling);
                        return (
                            <span key={`${item.key}:flight`} className="pn-throw pn-throw-x" style={{left: to.x, top: to.y, '--pn-dx': `${path.dx}px`} as CSSProperties}
                                  data-emote="throw" data-emote-item={e.item} data-emote-from={e.from} data-emote-to={e.to}>
                                <span className="pn-throw-y" style={{'--pn-dy': `${path.dy}px`, '--pn-arc': `${path.arc}px`} as CSSProperties}>{throwGlyph(e.item)}</span>
                            </span>
                        );
                    }
                    return <Impact key={`${item.key}:impact`} live={item as LiveEmote & {emote: {kind: 'throw'}}} place={at} stage={stage}/>;
                })}
            </div>
            <div ref={region} className="sr-only" aria-live="polite" aria-atomic="true" data-pn-live="emotes"/>
        </>
    );
};

export default EmoteLayer;
