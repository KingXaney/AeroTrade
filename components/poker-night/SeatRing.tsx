'use client';

// The seats round the felt, each where lib/poker-night/stage placed it (the viewer always at the
// bottom centre), as a list a screen reader can walk: a plate for every player, an open seat for the
// rest — "Sit here" for a visitor or a watcher, which chooses that seat on the join card
// (components/poker-night/overlay-requests.chooseSeat). Beside each player who has bet this street,
// the bet line: their chips and the amount, landing as the chips that flew out to it arrive (the
// all-in's breathing); and the dealer button.

import {animsOf, animVars, type LiveAnim} from "@/components/poker-night/anim";
import ChipStack from "@/components/poker-night/ChipStack";
import DealerButton from "@/components/poker-night/DealerButton";
import Seat from "@/components/poker-night/Seat";
import {chooseSeat} from "@/components/poker-night/overlay-requests";
import {useRoom} from "@/components/poker-night/room-controller";
import {TABLE_COPY} from "@/lib/learn/copy/poker-night";
import type {ResultLook} from "@/lib/poker-night/reveal";
import type {Stage} from "@/lib/poker-night/stage";
import {cn} from "@/lib/utils";

type Props = {stage: Stage; anims: readonly LiveAnim[]; look: ResultLook | null};

const SeatRing = ({stage, anims, look}: Props) => {
    const room = useRoom();
    const table = room.table;
    const hand = table.hand;
    const live = !!hand && hand.phase !== 'complete';
    const mySeat = room.me?.seat ?? null;
    const actor = hand && hand.phase === 'betting' ? hand.actor : null;
    const turnMs = room.config.turnSeconds * 1000;
    // An open seat takes a visitor who may join, or a watcher; a seated player sees it as open.
    const canChoose = table.status !== 'closed' && (
        (room.joinView !== null && !room.joinView.banned && !room.joinView.locked && room.joinView.seatsFree > 0)
        || (room.me !== null && room.me.seat === null)
    );
    const chipsOut = animsOf(anims, 'chips-out');

    return (
        <>
            {table.seats.map((v, seat) => {
                if (!v || v.bet <= 0) return null;
                const place = stage.seats[seat];
                if (!place) return null;
                // The chips that flew out to this line land on it, last move first.
                const land = live ? chipsOut.filter((a) => a.event.seat === seat && a.event.handNo === hand?.no).at(-1) ?? null : null;
                return (
                    <div key={land ? `bet-${seat}-${land.id}` : `bet-${seat}`}
                         className={cn('pn-bet pn-on-felt', land && 'pn-chip-land', v.state === 'all-in' && 'pn-pulse')}
                         style={{left: place.bet.x, top: place.bet.y, ...(land ? animVars(land, land.at + land.dur * 0.8) : {})}}
                         data-bet-seat={seat} data-anim={land ? 'chips-in' : undefined}>
                        <ChipStack amount={v.bet}/>
                    </div>
                );
            })}
            {hand && stage.seats[hand.button] && <DealerButton at={stage.seats[hand.button].button}/>}
            <ul className="pn-seats" aria-label={TABLE_COPY.seatsLabel}>
                {table.seats.map((v, seat) => {
                    const place = stage.seats[seat];
                    if (!place) return null;
                    if (!v) {
                        return (
                            <li key={`open-${seat}`} className="pn-seat" style={{left: place.plate.x, top: place.plate.y}} data-seat={seat} data-open="">
                                {canChoose ? (
                                    <button type="button" className="pn-open-seat rounded-full" onClick={() => chooseSeat(seat)}
                                            aria-label={TABLE_COPY.openSeatLabel(seat)} data-sit-here={seat}>
                                        {TABLE_COPY.sitHere}
                                    </button>
                                ) : (
                                    <span className="pn-open-seat rounded-full" role="img" aria-label={TABLE_COPY.openSeatLabel(seat)} data-idle="">
                                        <span aria-hidden="true">{TABLE_COPY.openSeat}</span>
                                    </span>
                                )}
                            </li>
                        );
                    }
                    const mine = mySeat === seat;
                    const acting = actor === seat;
                    return (
                        <Seat key={`seat-${seat}-${v.pid}`} seat={seat} place={place} stage={stage} view={v} person={table.people[v.pid]} mine={mine}
                              live={live} acting={acting} myTurn={mine && acting}
                              turn={acting && hand?.deadline != null ? {deadline: hand.deadline, turnMs} : null}
                              blind={live && hand ? (hand.sb === seat && hand.bb !== seat ? 'small' : hand.bb === seat ? 'big' : null) : null}
                              look={look} anims={anims}/>
                    );
                })}
            </ul>
        </>
    );
};

export default SeatRing;
