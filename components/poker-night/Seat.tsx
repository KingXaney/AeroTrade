'use client';

// One seat at the table: the plate (the avatar with the turn ring while this player is on the
// clock, the name in a <bdi>, the stack, a word for anything but simply playing), the cards in front
// of it (face down for everyone else; turned up at a showdown or when shown), the tag of the last
// move ("Call 40"), the blind's mark, and — when it wins — its stack counting up and a "+2,400" over
// it. The viewer's own cards are the dock's, not the plate's. A hand shown to the viewer alone
// (answering their ask) turns up on its plate for them, flagged "Shown to you"; a seat whose chips
// wait for the host's yes says "Waiting for chips".
//
// What moves is the room's animations for this seat (components/poker-night/anim): sitting down,
// the deal, a fold (the cards turn over, slide toward the middle and fade; the plate dims), the
// showdown's flip, the cards that play lifting while the rest dim, the count-up (CountUp, stepped
// text). Cards turned up sit outside the plate toward the middle (data-side, data-shown), and a
// bottom seat's tag hangs under its plate, so the name and the stack stay in sight. The hooks a test
// reads: data-seat, data-me, data-my-turn, data-state, data-acting, data-side, data-card, data-anim.

import {useMemo, type CSSProperties, type ReactNode} from "react";
import {animsOf, animVars, type LiveAnim} from "@/components/poker-night/anim";
import AvatarDisc from "@/components/poker-night/AvatarDisc";
import BlindMarker from "@/components/poker-night/BlindMarker";
import CountUp from "@/components/poker-night/CountUp";
import PlayingCard, {type CardMotion, type CardStateMotion} from "@/components/poker-night/PlayingCard";
import TurnRing from "@/components/poker-night/TurnRing";
import {ACTION_COPY, ASK_COPY, BANK_COPY, TABLE_COPY} from "@/lib/learn/copy/poker-night";
import type {Card} from "@/lib/poker/cards";
import {compactChips} from "@/lib/poker-night/chips";
import {cardLook, type ResultLook} from "@/lib/poker-night/reveal";
import {offset, type SeatPlace, type Stage} from "@/lib/poker-night/stage";
import type {EntryKind} from "@/lib/poker-night/types";
import type {Person, SeatView} from "@/lib/poker-night/view-types";
import {cn} from "@/lib/utils";

export type SeatProps = {
    seat: number;
    place: SeatPlace;
    stage: Stage;
    view: SeatView;
    person: Person | undefined;
    mine: boolean;
    live: boolean; // a hand is being played
    acting: boolean;
    myTurn: boolean;
    turn: {deadline: number; turnMs: number} | null;
    blind: 'small' | 'big' | null;
    look: ResultLook | null;
    anims: readonly LiveAnim[];
    privateCards?: readonly Card[] | null; // shown to the viewer alone (MeView.shownToMe)
    awaitingChips?: boolean; // a request for chips waits for the host (the table's requests)
};

type Tag = {id: string; kind: EntryKind; text: string; allIn: boolean; said: string; at: number; offset: number};

// The last move this seat made among the animations live now.
const lastTag = (anims: readonly LiveAnim[], seat: number): Tag | null => {
    let best: Tag | null = null;
    for (const a of anims) {
        const e = a.event;
        let tag: Omit<Tag, 'at' | 'offset' | 'id'> | null = null;
        // The blinds and antes carry no tag: the blinds' marks and the bet lines say them.
        if (e.kind === 'chips-out' && e.seat === seat && e.move !== 'ante' && e.move !== 'small-blind' && e.move !== 'big-blind') {
            const shown = e.move === 'raise' || e.allIn ? e.to : e.amount;
            tag = {kind: e.move, text: ACTION_COPY.tag(e.move, shown, e.allIn), allIn: e.allIn, said: ACTION_COPY.does(e.move, e.move === 'raise' ? e.to : e.amount, e.allIn)};
        } else if ((e.kind === 'check' || e.kind === 'fold') && e.seat === seat) {
            tag = {kind: e.kind, text: ACTION_COPY.tag(e.kind, 0, false), allIn: false, said: ACTION_COPY.does(e.kind, 0, false)};
        } else if (e.kind === 'refund' && e.seat === seat) {
            tag = {kind: 'refund', text: ACTION_COPY.tag('refund', e.amount, false), allIn: false, said: ACTION_COPY.does('refund', e.amount, false)};
        }
        if (tag && (!best || a.offset + a.at >= best.offset + best.at)) best = {...tag, id: a.id, at: a.at, offset: a.offset};
    }
    return best;
};

// A word for the seat when it is not simply playing: folded, all in, away, sitting out, out of
// chips, leaving; "next hand" only while a hand it is not in is being played; else how it is
// connected, when it is not here.
const statusOf = (v: SeatView, live: boolean, awaitingChips = false): string | null => {
    if (v.state === 'in-hand') return v.presence === 'here' ? null : TABLE_COPY.presence[v.presence];
    if (v.state === 'busted' && awaitingChips) return TABLE_COPY.awaitingChips;
    if (v.state === 'waiting') return live ? TABLE_COPY.status.waiting : v.presence === 'here' ? null : TABLE_COPY.presence[v.presence];
    return TABLE_COPY.status[v.state];
};

const Seat = ({seat, place, stage, view: v, person, mine, live, acting, myTurn, turn, blind, look, anims, privateCards = null, awaitingChips = false}: SeatProps) => {
    const name = person?.name ?? '';
    const ours = useMemo(() => anims.filter((a) => {
        const e = a.event;
        if ('seat' in e && e.seat === seat) return true;
        if (e.kind === 'deal') return e.seats.includes(seat);
        if (e.kind === 'reveal') return e.hands.some((h) => h.seat === seat);
        if (e.kind === 'win') return a.counts?.some((c) => c.seat === seat) ?? false;
        return false;
    }), [anims, seat]);

    const joined = animsOf(ours, 'join').find((a) => a.event.pid === v.pid) ?? null;
    const dealt = animsOf(ours, 'deal').at(-1) ?? null;
    const folded = animsOf(ours, 'fold').at(-1) ?? null;
    const reveal = animsOf(ours, 'reveal').at(-1) ?? null;
    const shownNow = animsOf(ours, 'show').at(-1) ?? null;
    const win = animsOf(ours, 'win').find((a) => !a.still) ?? null;
    const count = win?.counts?.find((c) => c.seat === seat) ?? null;
    const tag = lastTag(ours, seat);
    // The viewer is looking at this page: their own seat is here, whatever another tab of theirs
    // last said (a second tab closing reports the player hidden until this one's next beat).
    const presence = mine ? 'here' : v.presence;
    const seenAlone = !mine && !Array.isArray(v.cards) && privateCards !== null && privateCards.length > 0 ? privateCards : null;
    const status = seenAlone ? ASK_COPY.shownTag : statusOf({...v, presence}, live, awaitingChips);

    // Cards in front of the plate (never the viewer's own: the dock draws those).
    const toCentre = offset(stage.centre, place.plate);
    let cards: ReactNode = null;
    const faceUp = !mine && Array.isArray(v.cards);
    if (!mine && Array.isArray(v.cards)) {
        const flips = reveal?.cards?.filter((c) => c.seat === seat) ?? shownNow?.cards ?? null;
        const timing = reveal ?? shownNow;
        cards = (
            <div className="pn-seat-shown" style={{'--pn-card-w': 'var(--pn-show-w)'} as CSSProperties}>
                {v.cards.map((card: Card, index) => {
                    const flip = flips?.find((c) => c.index === index);
                    const state = cardLook(look, card);
                    const motion: CardMotion | null = flip && timing ? {cls: 'pn-flip', style: animVars(timing, flip.at, 2), anim: 'flip'} : null;
                    const stateMotion: CardStateMotion | null = reveal && reveal.liftAt !== undefined && state
                        ? {cls: state === 'win' ? 'pn-win-lift' : 'pn-dim', style: animVars(reveal, reveal.liftAt)} : null;
                    const glow = state === 'win' ? animVars(reveal ?? {offset: 0}, reveal?.liftAt ?? 0) : null;
                    return <PlayingCard key={`${card}`} card={card} state={state} motion={motion} stateMotion={stateMotion} glow={glow}/>;
                })}
            </div>
        );
    } else if (seenAlone) {
        // Shown to the viewer alone, after the hand: face up where a shown hand sits, never lit.
        cards = (
            <div className="pn-seat-shown" style={{'--pn-card-w': 'var(--pn-show-w)'} as CSSProperties} data-pn-shown-to-me="">
                {seenAlone.map((card) => <PlayingCard key={`${card}`} card={card}/>)}
            </div>
        );
    } else if (!mine && (typeof v.cards === 'number' || (folded && v.cards === 'none' && v.state === 'folded'))) {
        const folding = v.cards === 'none' && folded !== null;
        cards = (
            <div className="pn-seat-cards" style={{'--pn-card-w': 'var(--pn-mini-w)'} as CSSProperties} data-anim={folding ? 'fold' : undefined}>
                {[0, 1].map((index) => {
                    const deal = dealt?.cards?.find((c) => c.seat === seat && c.index === index);
                    const motion: CardMotion | null = folding
                        ? {cls: 'pn-fold', style: animVars(folded, folded.at, folded.dur, {dx: Math.round(toCentre.dx * 0.7), dy: Math.round(toCentre.dy * 0.7)}), anim: 'fold'}
                        : deal && dealt ? {cls: 'pn-deal', style: animVars(dealt, deal.at, 1.6, {dx: toCentre.dx, dy: toCentre.dy}), anim: 'deal'} : null;
                    return <PlayingCard key={index} card={null} motion={motion}/>;
                })}
            </div>
        );
    }

    const label = TABLE_COPY.seatLabel(name, seat, v.chips + v.inPot, acting ? TABLE_COPY.thinking : status, tag?.said ?? null);

    return (
        <li
            className={cn('pn-seat', joined && 'pn-seat-in')}
            style={{left: place.plate.x, top: place.plate.y, ...(joined ? animVars(joined, joined.at, joined.dur) : {})}}
            data-seat={seat}
            data-pid={v.pid}
            data-me={mine ? '' : undefined}
            data-my-turn={myTurn ? '' : undefined}
            data-acting={acting ? '' : undefined}
            data-state={v.state}
            data-presence={presence}
            data-side={place.spot.side}
            data-shown={faceUp || seenAlone ? '' : undefined}
            data-anim={joined ? 'join' : undefined}
            aria-label={label}
        >
            {cards}
            <div className={cn('pn-plate chrome-surface', acting && 'pn-pulse')}>
                <span className="pn-plate-avatar">
                    <AvatarDisc avatar={person?.avatar} decorative/>
                    {acting && turn && <TurnRing deadline={turn.deadline} turnMs={turn.turnMs}/>}
                </span>
                <span className="pn-plate-text">
                    <bdi className="pn-plate-name truncate" data-user-text="">{name}</bdi>
                    <span className="pn-plate-stack" data-stack={v.chips}>
                        {count && win ? (
                            <>
                                <CountUp from={Math.max(0, v.chips - count.amount)} to={v.chips} at={win.offset + count.at} dur={count.dur}/>
                                <span className="sr-only">{compactChips(v.chips)}</span>
                            </>
                        ) : compactChips(v.chips)}
                    </span>
                </span>
            </div>
            {status && !acting && <span className="pn-plate-flag chrome-surface text-fg-soft" data-flag="">{status}</span>}
            {blind && live && <BlindMarker blind={blind}/>}
            {tag && (
                <span key={tag.id} className="pn-tag chrome-surface pn-tag-pop" style={animVars(tag, tag.at)} data-kind={tag.kind} data-all-in={tag.allIn ? '' : undefined}
                      data-over={place.bet.y < place.plate.y - stage.plateSize.h / 2 ? '' : undefined}
                      data-anim="tag" aria-hidden="true">
                    {tag.text}
                </span>
            )}
            {count && win && (
                <span className="pn-win-pop-text pn-win-pop" style={animVars(win, count.at)} data-anim="win-pop" aria-hidden="true">
                    {BANK_COPY.net(count.amount)}
                </span>
            )}
        </li>
    );
};

export default Seat;
