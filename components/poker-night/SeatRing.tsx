'use client';

// The seats round the felt, each where lib/poker-night/stage placed it (the viewer always at the
// bottom centre), as a list a screen reader can walk: a plate for every player, an open seat for the
// rest — "Sit here" for a visitor or a watcher, which chooses that seat on the join card
// (components/poker-night/overlay-requests.chooseSeat), and "Invite" for a seated player, which opens
// the invite sheet to fill it. Beside each player who has bet this street,
// the bet line: their chips and the amount, landing as the chips that flew out to it arrive (the
// all-in's breathing); and the dealer button. While a result shows, a seat whose player went as the
// hand completed (they left after it, or were removed: the result's gone list) keeps a ghost of
// their plate — the name, the look and any cards they turned up, no stack, "Left" — so the reveal
// still shows who won; never a menu or "Sit here" until the next deal.

import {animsOf, animVars, type LiveAnim} from "@/components/poker-night/anim";
import AvatarDisc from "@/components/poker-night/AvatarDisc";
import ChipStack from "@/components/poker-night/ChipStack";
import DealerButton from "@/components/poker-night/DealerButton";
import PlayingCard from "@/components/poker-night/PlayingCard";
import Seat, {shownStyle} from "@/components/poker-night/Seat";
import {chooseSeat, openOverlay} from "@/components/poker-night/overlay-requests";
import {useRoom} from "@/components/poker-night/room-controller";
import {TABLE_COPY} from "@/lib/learn/copy/poker-night";
import {HOLE_CARDS, PLAYING_CARDS} from "@/lib/poker-night/config";
import type {Card} from "@/lib/poker/cards";
import {cardLook, playerAt, streetTags, type ResultLook} from "@/lib/poker-night/reveal";
import {flagRoom, type SeatMarks, type SeatPlace, type Stage} from "@/lib/poker-night/stage";
import type {Person} from "@/lib/poker-night/view-types";
import {cn} from "@/lib/utils";

type Props = {stage: Stage; anims: readonly LiveAnim[]; look: ResultLook | null};

const GhostSeat = ({seat, place, pid, person, cards, look}: {
    seat: number; place: SeatPlace; pid: string; person: Person | undefined; cards: readonly Card[] | null; look: ResultLook | null;
}) => {
    const name = person?.name ?? '';
    return (
        <li className="pn-seat" style={{left: place.plate.x, top: place.plate.y}} data-seat={seat} data-pid={pid} data-ghost="" data-state="leaving"
            data-side={place.spot.side} data-shown={cards ? '' : undefined} aria-label={TABLE_COPY.ghostLabel(name, seat)}>
            {cards && (
                <div className="pn-seat-shown" style={shownStyle(place)} data-count={cards.length}>
                    {cards.map((card) => <PlayingCard key={`${card}`} card={card} state={cardLook(look, card)}/>)}
                </div>
            )}
            <div className="pn-plate chrome-surface">
                <span className="pn-plate-avatar"><AvatarDisc avatar={person?.avatar} decorative/></span>
                <span className="pn-plate-text">
                    <bdi className="pn-plate-name truncate" data-user-text="">{name}</bdi>
                </span>
            </div>
            <span className="pn-plate-flag chrome-surface text-fg-soft" data-flag="">{TABLE_COPY.leftSeat}</span>
        </li>
    );
};

const SeatRing = ({stage, anims, look}: Props) => {
    const room = useRoom();
    const table = room.table;
    const hand = table.hand;
    const live = !!hand && hand.phase !== 'complete';
    const mySeat = room.me?.seat ?? null;
    const actor = hand && hand.phase === 'betting' ? hand.actor : null;
    // Triple T's throw-away: the seats still to throw a card away ("Discarding…").
    const toDiscard = new Set(hand?.phase === 'discard' ? hand.toDiscard : []);
    // The cards a hand of this game holds once the betting starts (in Triple T's throw-away, the three
    // dealt): what a seat's fold sends in.
    const held = hand ? (hand.phase === 'discard' ? HOLE_CARDS : PLAYING_CARDS)[hand.variant] : 2;
    // Where a plate's "Discarding…" flag has no room under it (a crowded side column on a phone on its
    // side), the plate carries a dashed ring instead (stage.flagRoom); the felt's count and the backs
    // going three to two say who is still to throw, and the plate's name says it to a screen reader.
    const blinds = live && hand ? [hand.sb, hand.bb] : [];
    const marks: SeatMarks[] = table.seats.map((v, seat) => ({
        seat, open: !v, backs: v && seat !== mySeat && typeof v.cards === 'number' ? v.cards : 0, blind: !!v && blinds.includes(seat),
        flag: toDiscard.has(seat) ? TABLE_COPY.discarding : null,
    }));
    const discardMark = (seat: number): boolean => toDiscard.has(seat) && !flagRoom(stage, seat, TABLE_COPY.discarding, marks);
    const turnMs = room.config.turnSeconds * 1000;
    // An open seat takes a visitor who may join, or a watcher; a seated player sees it as open.
    const canChoose = table.status !== 'closed' && (
        (room.joinView !== null && !room.joinView.banned && !room.joinView.locked && room.joinView.seatsFree > 0)
        || (room.me !== null && room.me.seat === null)
    );
    // A seated player sees an open seat as a way to fill it: a tap opens the invite sheet.
    const canInvite = table.status !== 'closed' && mySeat !== null;
    const chipsOut = animsOf(anims, 'chips-out');
    // While a result shows: the players gone since the deal whose seat stands empty, and the hands
    // shown to the viewer alone (answering their ask) — each on the plate of whoever played it.
    const result = hand && hand.phase === 'complete' ? hand.result : null;
    const ghosts = new Map((result?.gone ?? []).filter(([seat]) => table.seats[seat] === null).map(([seat, pid]) => [seat, pid]));
    const seenAlone = room.me?.shownToMe ?? [];
    const cardsShownAt = (seat: number): Card[] | null =>
        result?.hands.find((h) => h.seat === seat)?.cards ?? seenAlone.find((h) => h.seat === seat)?.cards ?? null;
    const requested = new Set(table.requests.map((r) => r.pid));
    // Each seat's last move on the street being bet, kept on its plate once the tag's pop is over.
    const stills = streetTags(hand);

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
                    const ghost = !v ? ghosts.get(seat) : undefined;
                    if (!v && ghost !== undefined) {
                        return <GhostSeat key={`ghost-${seat}-${ghost}`} seat={seat} place={place} pid={ghost} person={table.people[ghost]} cards={cardsShownAt(seat)} look={look}/>;
                    }
                    if (!v) {
                        return (
                            <li key={`open-${seat}`} className="pn-seat" style={{left: place.plate.x, top: place.plate.y}} data-seat={seat} data-open="">
                                {canChoose ? (
                                    <button type="button" className="pn-open-seat rounded-full" onClick={() => chooseSeat(seat)}
                                            aria-label={TABLE_COPY.openSeatLabel(seat)} data-sit-here={seat}>
                                        {TABLE_COPY.sitHere}
                                    </button>
                                ) : canInvite ? (
                                    <button type="button" className="pn-open-seat rounded-full" onClick={() => openOverlay('invite')}
                                            aria-label={TABLE_COPY.inviteToSeat(seat)} data-invite-seat={seat}>
                                        {TABLE_COPY.inviteSeat}
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
                              look={look} anims={anims} awaitingChips={requested.has(v.pid)}
                              privateCards={playerAt(table, seat) === v.pid ? seenAlone.find((h) => h.seat === seat)?.cards ?? null : null} held={held}
                              discarding={toDiscard.has(seat)} discardMark={discardMark(seat)} still={stills.get(seat) ?? null}/>
                    );
                })}
            </ul>
        </>
    );
};

export default SeatRing;
