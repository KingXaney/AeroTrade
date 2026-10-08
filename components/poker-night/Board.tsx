'use client';

// The board in the middle of the felt, five places wide, at the size lib/poker-night/stage found
// room for: each street's cards turning up in order as they come (the flop one after another), and
// at a showdown the five cards that play lifting and glowing while the rest dim. An empty place is a
// faint outline on the cloth. data-pn-board is the hook a test reads; the group's name reads the
// cards aloud.

import type {CSSProperties} from "react";
import {animsOf, animVars, type LiveAnim} from "@/components/poker-night/anim";
import PlayingCard, {type CardMotion, type CardStateMotion} from "@/components/poker-night/PlayingCard";
import {useRoom} from "@/components/poker-night/room-controller";
import {HAND_COPY, TABLE_COPY} from "@/lib/learn/copy/poker-night";
import {cardLook, type ResultLook} from "@/lib/poker-night/reveal";
import type {Stage} from "@/lib/poker-night/stage";

const Board = ({stage, anims, look}: {stage: Stage; anims: readonly LiveAnim[]; look: ResultLook | null}) => {
    const {table} = useRoom();
    const hand = table.hand;
    if (!hand) return null;
    const board = hand.boards[0] ?? [];
    const turned = animsOf(anims, 'board').filter((a) => a.event.handNo === hand.no);
    const reveal = animsOf(anims, 'reveal').find((a) => a.event.handNo === hand.no) ?? null;
    const style = {
        left: stage.board.x, top: stage.board.y, gap: stage.board.gap,
        '--pn-card-w': `${stage.board.card.w}px`, '--pn-card-h': `${stage.board.card.h}px`,
    } as CSSProperties;
    return (
        <div className="pn-board" style={style} role="group" aria-label={board.length > 0 ? TABLE_COPY.board(HAND_COPY.cardsSpoken(board)) : HAND_COPY.noBoard}
             data-pn-board={board.length}>
            {[0, 1, 2, 3, 4].map((index) => {
                const card = board[index];
                if (card === undefined) return <span key={`slot-${index}`} className="pn-slot" aria-hidden="true"/>;
                const anim = turned.find((a) => a.cards?.some((c) => c.index === index)) ?? null;
                const at = anim?.cards?.find((c) => c.index === index)?.at ?? 0;
                const motion: CardMotion | null = anim ? {cls: 'pn-flip', style: animVars(anim, at, 2), anim: 'board'} : null;
                const state = cardLook(look, card);
                const stateMotion: CardStateMotion | null = reveal?.liftAt !== undefined && reveal && state
                    ? {cls: state === 'win' ? 'pn-win-lift' : 'pn-dim', style: animVars(reveal, reveal.liftAt)} : null;
                const glow = state === 'win' ? animVars(reveal ?? {offset: 0}, reveal?.liftAt ?? 0) : null;
                return <PlayingCard key={`card-${card}`} card={card} state={state} motion={motion} stateMotion={stateMotion} glow={glow}/>;
            })}
        </div>
    );
};

export default Board;
