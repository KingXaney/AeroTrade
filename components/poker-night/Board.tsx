'use client';

// The board in the middle of the felt, five places wide, at the size lib/poker-night/stage found
// room for: each street's cards turning up in order as they come (the flop one after another), and
// at a showdown the five cards that play lifting and glowing while the rest dim. An empty place is a
// faint outline on the cloth. data-pn-board is the hook a test reads; the group's name reads the
// cards aloud.
//
// PLO on two or three boards: one row of five a board, where the stage laid them (one over another,
// side by side, or cascaded, each lower board over the foot of the one above with every card's index
// in sight: data-pn-arrangement on the set), each with its numeral on the felt when there was room
// (.pn-board-label) and its own name read aloud ("Board 2: …"). Every board turns its street's cards
// in turn, and at a showdown each board's cards that play light board after board (no lift, which
// would cover the board above: the ring and glow alone). The whole block is one button that opens
// the boards larger (BoardsSheet), which on a phone with every seat taken is where they read best.

import type {CSSProperties} from "react";
import {animsOf, animVars, liftAtFor, type LiveAnim} from "@/components/poker-night/anim";
import {openOverlay} from "@/components/poker-night/overlay-requests";
import PlayingCard, {type CardMotion, type CardStateMotion} from "@/components/poker-night/PlayingCard";
import {useRoom} from "@/components/poker-night/room-controller";
import {HAND_COPY, TABLE_COPY} from "@/lib/learn/copy/poker-night";
import {cardLook, type ResultLook} from "@/lib/poker-night/reveal";
import type {Stage} from "@/lib/poker-night/stage";
import type {Card} from "@/lib/poker/cards";

type RowProps = {
    stage: Stage;
    index: number;
    cards: readonly Card[];
    several: boolean;
    turned: readonly LiveAnim[];
    reveal: LiveAnim | null;
    look: ResultLook | null;
};

const BoardRow = ({stage, index, cards, several, turned, reveal, look}: RowProps) => {
    const place = stage.boards[index];
    if (!place) return null;
    const style = {
        left: place.x, top: place.y, gap: stage.board.gap,
        '--pn-card-w': `${stage.board.card.w}px`, '--pn-card-h': `${stage.board.card.h}px`,
    } as CSSProperties;
    const spoken = cards.length > 0 ? HAND_COPY.cardsSpoken(cards) : HAND_COPY.noBoard;
    return (
        <div className="pn-board" style={style} role="group" aria-label={several ? TABLE_COPY.boardOf(index, spoken) : cards.length > 0 ? TABLE_COPY.board(spoken) : spoken}
             data-pn-board={cards.length} data-pn-board-index={index}>
            {[0, 1, 2, 3, 4].map((at) => {
                const card = cards[at];
                if (card === undefined) return <span key={`slot-${at}`} className="pn-slot" aria-hidden="true"/>;
                const anim = turned.find((a) => (a.event.kind === 'board' && a.event.board === index) && a.cards?.some((c) => c.index === at)) ?? null;
                const flipAt = anim?.cards?.find((c) => c.index === at)?.at ?? 0;
                const motion: CardMotion | null = anim ? {cls: 'pn-flip', style: animVars(anim, flipAt, 2), anim: 'board'} : null;
                const state = cardLook(look, card);
                const liftAt = reveal ? liftAtFor(reveal, state, index) : 0;
                const stateMotion: CardStateMotion | null = reveal && reveal.liftAt !== undefined && state
                    ? {cls: state === 'win' ? 'pn-win-lift' : 'pn-dim', style: animVars(reveal, liftAt)} : null;
                const glow = state === 'win' ? animVars(reveal ?? {offset: 0}, liftAt) : null;
                return <PlayingCard key={`card-${card}`} card={card} state={state} motion={motion} stateMotion={stateMotion} glow={glow}/>;
            })}
        </div>
    );
};

const Board = ({stage, anims, look}: {stage: Stage; anims: readonly LiveAnim[]; look: ResultLook | null}) => {
    const {table} = useRoom();
    const hand = table.hand;
    if (!hand) return null;
    const boards: readonly (readonly Card[])[] = hand.boards.length > 0 ? hand.boards : [[]];
    const several = boards.length > 1 && stage.boards.length === boards.length;
    const turned = animsOf(anims, 'board').filter((a) => a.event.handNo === hand.no);
    const reveal = animsOf(anims, 'reveal').find((a) => a.event.handNo === hand.no) ?? null;
    const rows = boards.map((cards, index) => (
        <BoardRow key={index} stage={stage} index={index} cards={cards} several={several} turned={turned} reveal={reveal} look={look}/>
    ));
    if (!several) return <>{rows}</>;
    const {board} = stage;
    // The button is the block, and never less than a thumb's 44 px each way (the plates, drawn over it, keep their own taps).
    const zoom = {w: Math.max(44, board.w), h: Math.max(44, board.h)};
    return (
        <div className="pn-board-set" data-pn-boards={boards.length} data-pn-arrangement={board.arrangement} data-pn-labels={board.labels ? 'on' : 'off'}>
            {rows}
            {board.labels && stage.boards.map((place) => place.label && (
                <span key={`label-${place.index}`} className="pn-board-label chrome-surface font-mono text-fg" aria-hidden="true" data-pn-board-label={place.index}
                      style={{left: place.label.x, top: place.label.y}}>
                    {place.index + 1}
                </span>
            ))}
            <button type="button" className="pn-boards-zoom" aria-label={TABLE_COPY.boardsZoom} title={TABLE_COPY.boardsZoom} data-pn-boards-zoom=""
                    style={{left: board.x - zoom.w / 2, top: board.y - zoom.h / 2, width: zoom.w, height: zoom.h}}
                    onClick={() => openOverlay('boards')}/>
        </div>
    );
};

export default Board;
