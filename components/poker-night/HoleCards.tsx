'use client';

// The viewer's own cards, large, in the dock — two, or PLO's four in a fan, each card's index in
// sight (data-count) — dealt in from the table, and — when the viewer
// folds — kept in front of them, dimmed, with a "Folded" tag, until the next deal: the viewer can
// still see what they folded, and nobody else can unless they show it in the pause (the table sees
// a folded hand go to the muck on the plate). At a showdown they lift and glow when they are among
// the cards that play, and dim when they are not. The place keeps its size when there are no cards,
// and its width for the night's game (data-slots: the cards its hands hold), so the dock never changes
// height and the line beside it never moves.
//
// With Peek on (the personal look's `peek`, for a screen others can see) the cards are a button
// drawn face down, turned up only while the viewer presses on it — a pointer held down on it, or
// Space or Enter held while it has the focus — and face down again the moment they let go; a folded
// hand too. The same card elements stay mounted either way, so a deal's motion is never played twice.

import type {KeyboardEvent} from "react";
import {animsOf, animVars, type LiveAnim} from "@/components/poker-night/anim";
import PlayingCard, {type CardMotion, type CardStateMotion} from "@/components/poker-night/PlayingCard";
import {HAND_COPY, LOOKS_COPY, TABLE_COPY} from "@/lib/learn/copy/poker-night";
import type {Card} from "@/lib/poker/cards";
import {cardLook, type ResultLook} from "@/lib/poker-night/reveal";
import {cn} from "@/lib/utils";

type Props = {
    seat: number;
    hole: Card[] | null;
    slots?: number; // the cards a hand of the table's game holds: the width kept
    holding: boolean; // dealt in and not folded
    folded?: boolean; // dealt into the view's hand and folded: drawn dimmed, tagged "Folded"
    handNo: number | null;
    anims: readonly LiveAnim[];
    look: ResultLook | null;
    // Peek: null when it is off; else whether the viewer is pressing now, and how to say so.
    peek?: {peeking: boolean; onPeek: (peeking: boolean) => void} | null;
};

// Where the cards come from, from the dock: the table above it.
const FROM_TABLE = {dx: 0, dy: -180};

const PEEK_KEYS = new Set([' ', 'Enter']);

// The "Folded" tag over the bottom of the cards (the group's name says it for a screen reader).
const FoldedTag = () => (
    <span aria-hidden="true" data-pn-folded-tag=""
          className="chrome-surface label-type pointer-events-none absolute inset-x-0 bottom-1 z-[1] mx-auto w-fit rounded-full px-2 py-0.5 text-[10px] text-fg-soft">
        {TABLE_COPY.status.folded}
    </span>
);

const HoleCards = ({seat, hole, slots = 2, holding, folded = false, handNo, anims, look, peek = null}: Props) => {
    const fold = animsOf(anims, 'fold').find((a) => a.event.seat === seat && a.event.handNo === handNo) ?? null;
    const deal = animsOf(anims, 'deal').find((a) => a.event.handNo === handNo && a.event.seats.includes(seat)) ?? null;
    const reveal = animsOf(anims, 'reveal').find((a) => a.event.handNo === handNo && a.event.hands.some((h) => h.seat === seat)) ?? null;
    const mucked = !holding && folded;
    const show = hole !== null && (holding || mucked);
    const hidden = show && peek !== null && !peek.peeking;
    const label = mucked ? TABLE_COPY.foldedHand : HAND_COPY.yourHand;
    const cards = show ? hole.map((card, index) => {
        const dealt = deal?.cards?.find((c) => c.seat === seat && c.index === index);
        const motion: CardMotion | null = dealt && deal ? {cls: 'pn-deal', style: animVars(deal, dealt.at, 1.6, FROM_TABLE), anim: 'deal'} : null;
        // A folded hand dims where it lies, at the fold's moment (the viewer's own muck); a hand
        // still held reads the showdown's lift and dim.
        const state = mucked ? 'dim' : hidden ? null : cardLook(look, card);
        const stateMotion: CardStateMotion | null = mucked
            ? fold ? {cls: 'pn-dim', style: animVars(fold, fold.at)} : null
            : reveal?.liftAt !== undefined && reveal && state ? {cls: state === 'win' ? 'pn-win-lift' : 'pn-dim', style: animVars(reveal, reveal.liftAt)} : null;
        const glow = state === 'win' ? animVars(reveal ?? {offset: 0}, reveal?.liftAt ?? 0) : null;
        return <PlayingCard key={`${card}`} card={hidden ? null : card} sides="two" state={state} motion={motion} stateMotion={stateMotion} glow={glow}/>;
    }) : <span className="pn-slot opacity-0" aria-hidden="true"/>;

    if (!show || peek === null) {
        return (
            <div className={cn('pn-hole', mucked && 'relative')} role="group" aria-label={label} data-pn-hole={show ? (mucked ? 'folded' : '') : 'empty'}
                 data-count={show ? hole.length : undefined} data-slots={slots}>
                {cards}
                {mucked && <FoldedTag/>}
            </div>
        );
    }
    const press = (on: boolean) => {
        if (on !== peek.peeking) peek.onPeek(on);
    };
    const onKey = (event: KeyboardEvent<HTMLButtonElement>, on: boolean) => {
        if (!PEEK_KEYS.has(event.key)) return;
        // The key is the peek's own: no click, no table shortcut.
        event.preventDefault();
        if (!event.repeat) press(on);
    };
    return (
        <button
            type="button"
            className="pn-hole pn-peek relative select-none rounded-lg [-webkit-touch-callout:none] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            aria-label={hidden ? LOOKS_COPY.peekLabel : label}
            aria-pressed={!hidden}
            data-pn-hole={mucked ? 'folded' : ''}
            data-count={hole.length}
            data-slots={slots}
            data-pn-peek={hidden ? 'hidden' : 'shown'}
            onPointerDown={(event) => {
                event.currentTarget.setPointerCapture?.(event.pointerId);
                press(true);
            }}
            onPointerUp={() => press(false)}
            onPointerCancel={() => press(false)}
            onLostPointerCapture={() => press(false)}
            onKeyDown={(event) => onKey(event, true)}
            onKeyUp={(event) => onKey(event, false)}
            onBlur={() => press(false)}
            onContextMenu={(event) => event.preventDefault()}
        >
            {cards}
            {mucked && <FoldedTag/>}
        </button>
    );
};

export default HoleCards;
