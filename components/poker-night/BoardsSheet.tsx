'use client';

// The boards larger (P6): PLO's two or three boards in a sheet, each under its name ("Board 2") at
// stage.BOARDS_SHEET_CARD px a card — five cards and their gaps fit a 320 px phone — the cards not
// out yet as faint places, and at a showdown the cards that play lit as on the felt, with who won
// each board and with what (lib/poker-night/reveal's BoardLook). Opened by tapping the boards on the
// felt (components/poker-night/Board), for any viewer; it reads the room and writes nothing. Drawn in
// the viewer's own card face and colours (room.personal), as the Hands guide is.

import type {CSSProperties} from "react";
import {Drawer} from "@/components/poker-night/overlay-kit";
import PlayingCard from "@/components/poker-night/PlayingCard";
import {useRoom} from "@/components/poker-night/room-controller";
import {HAND_COPY, TABLE_COPY} from "@/lib/learn/copy/poker-night";
import {cardLook, playerAt, resultLook} from "@/lib/poker-night/reveal";
import {BOARDS_SHEET_CARD, CARD_RATIO} from "@/lib/poker-night/stage";

type Props = {open: boolean; onOpenChange: (open: boolean) => void; toTable: boolean};

const CARDS = {'--pn-card-w': `${BOARDS_SHEET_CARD}px`, '--pn-card-h': `${Math.round(BOARDS_SHEET_CARD * CARD_RATIO)}px`} as CSSProperties;

const BoardsSheet = ({open, onOpenChange, toTable}: Props) => {
    const room = useRoom();
    const table = room.table;
    const hand = table.hand;
    const boards = hand?.boards ?? [];
    const look = resultLook(hand);
    const nameOf = (seat: number) => {
        const pid = playerAt(table, seat);
        return (pid && table.people[pid]?.name) || TABLE_COPY.seat(seat);
    };
    const mySeat = room.me?.seat ?? null;
    return (
        <Drawer open={open} onOpenChange={onOpenChange} title={TABLE_COPY.boardsSheet} toTable={toTable} data-pn-drawer="boards">
            <div className="space-y-4" data-pn-face={room.personal.cardFace} data-pn-colours={room.personal.fourColour ? 'four' : 'two'}>
                {boards.map((cards, k) => {
                    const won = look?.showdown ? look.boards[k]?.winners ?? [] : [];
                    return (
                        <section key={k} aria-labelledby={`pn-sheet-board-${k}`} className="space-y-2" data-pn-sheet-board={k}>
                            <h3 id={`pn-sheet-board-${k}`} className="heading-type text-xs">{TABLE_COPY.boardName(k)}</h3>
                            <div className="pn-sheet-board" style={CARDS} role="group"
                                 aria-label={cards.length > 0 ? TABLE_COPY.boardOf(k, HAND_COPY.cardsSpoken(cards)) : HAND_COPY.noBoard}>
                                {[0, 1, 2, 3, 4].map((at) => {
                                    const card = cards[at];
                                    return card === undefined
                                        ? <span key={`slot-${at}`} className="pn-slot" aria-hidden="true"/>
                                        : <PlayingCard key={`card-${card}`} card={card} state={cardLook(look, card)}/>;
                                })}
                            </div>
                            {won.length > 0 && (
                                <ul className="space-y-0.5 text-xs text-fg-soft">
                                    {won.map((w) => (
                                        <li key={w.seat} data-pn-sheet-winner={w.seat}>
                                            <span className="font-semibold text-fg" {...(w.seat === mySeat ? {} : {'data-user-text': ''})}>
                                                {w.seat === mySeat ? TABLE_COPY.bannerYou(w.amount) : TABLE_COPY.banner(nameOf(w.seat), w.amount)}
                                            </span>
                                            {w.description && <> · {HAND_COPY.label(w.description)}</>}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>
                    );
                })}
            </div>
        </Drawer>
    );
};

export default BoardsSheet;
