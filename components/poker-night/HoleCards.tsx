'use client';

// The viewer's own two cards, large, in the dock: dealt in from the table, and — when the viewer
// folds — turned face down, sent toward the middle and faded. At a showdown they lift and glow when
// they are among the cards that play, and dim when they are not. The place keeps its size when there
// are no cards, so the dock never changes height.
//
// With Peek on (the personal look's `peek`, for a screen others can see) the cards are a button
// drawn face down, turned up only while the viewer presses on it — a pointer held down on it, or
// Space or Enter held while it has the focus — and face down again the moment they let go. The
// same card elements stay mounted either way, so a deal's motion is never played twice.

import type {KeyboardEvent} from "react";
import {animsOf, animVars, type LiveAnim} from "@/components/poker-night/anim";
import PlayingCard, {type CardMotion, type CardStateMotion} from "@/components/poker-night/PlayingCard";
import {HAND_COPY, LOOKS_COPY} from "@/lib/learn/copy/poker-night";
import type {Card} from "@/lib/poker/cards";
import {cardLook, type ResultLook} from "@/lib/poker-night/reveal";

type Props = {
    seat: number;
    hole: [Card, Card] | null;
    holding: boolean; // dealt in and not folded
    handNo: number | null;
    anims: readonly LiveAnim[];
    look: ResultLook | null;
    // Peek: null when it is off; else whether the viewer is pressing now, and how to say so.
    peek?: {peeking: boolean; onPeek: (peeking: boolean) => void} | null;
};

// Where the cards come from and go to, from the dock: the table above it.
const FROM_TABLE = {dx: 0, dy: -180};

const PEEK_KEYS = new Set([' ', 'Enter']);

const HoleCards = ({seat, hole, holding, handNo, anims, look, peek = null}: Props) => {
    const fold = animsOf(anims, 'fold').find((a) => a.event.seat === seat && a.event.handNo === handNo) ?? null;
    const deal = animsOf(anims, 'deal').find((a) => a.event.handNo === handNo && a.event.seats.includes(seat)) ?? null;
    const reveal = animsOf(anims, 'reveal').find((a) => a.event.handNo === handNo && a.event.hands.some((h) => h.seat === seat)) ?? null;
    const folding = !holding && fold !== null;
    const show = hole !== null && (holding || folding);
    const hidden = show && peek !== null && !peek.peeking;
    const cards = show ? hole.map((card, index) => {
        const dealt = deal?.cards?.find((c) => c.seat === seat && c.index === index);
        const motion: CardMotion | null = folding
            ? {cls: 'pn-fold', style: animVars(fold, fold.at, fold.dur, {dx: FROM_TABLE.dx, dy: Math.round(FROM_TABLE.dy * 0.6)}), anim: 'fold'}
            : dealt && deal ? {cls: 'pn-deal', style: animVars(deal, dealt.at, 1.6, FROM_TABLE), anim: 'deal'} : null;
        const state = folding || hidden ? null : cardLook(look, card);
        const stateMotion: CardStateMotion | null = reveal?.liftAt !== undefined && reveal && state
            ? {cls: state === 'win' ? 'pn-win-lift' : 'pn-dim', style: animVars(reveal, reveal.liftAt)} : null;
        const glow = state === 'win' ? animVars(reveal ?? {offset: 0}, reveal?.liftAt ?? 0) : null;
        return <PlayingCard key={`${card}`} card={hidden ? null : card} sides="two" state={state} motion={motion} stateMotion={stateMotion} glow={glow}/>;
    }) : <span className="pn-slot opacity-0" aria-hidden="true"/>;

    if (!show || peek === null) {
        return <div className="pn-hole" role="group" aria-label={HAND_COPY.yourHand} data-pn-hole={show ? '' : 'empty'}>{cards}</div>;
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
            className="pn-hole pn-peek select-none rounded-lg [-webkit-touch-callout:none] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            aria-label={hidden ? LOOKS_COPY.peekLabel : HAND_COPY.yourHand}
            aria-pressed={!hidden}
            data-pn-hole=""
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
        </button>
    );
};

export default HoleCards;
