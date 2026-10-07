'use client';

// The table, full screen: the scene, the felt with the seats round it (the viewer at the bottom
// centre), the board, the pot, the dealer button and the chips in flight, the winner's banner, then
// the dock with the viewer's cards and controls; the overlays (top bar, join card, drawers, dialogs —
// components/poker-night/TableOverlays) over all of it; and the live regions a screen reader hears.
// It takes no props: everything comes from the room (useRoom()).
//
// The seat layer is measured, and lib/poker-night/stage places everything in it in pixels — the
// geometry the animations fly along. The animations are the room's events on
// lib/poker-night/choreography's timeline (components/poker-night/anim), handed down to the pieces
// that draw them. While a result shows, the line under the board (the next deal's countdown, the
// pause) goes inside the winner's banner's column when the banner grows down over it (a phone
// upright, where the pot sits under the board). The room's root carries the looks' ids for LOOKS_CSS (the host's scene and felt,
// the viewer's card back and suit colours) and the hooks a test reads: data-pn-mode (polling,
// realtime, reconnecting), data-pn-transport (realtime, poll, both), data-pn-seq (the seq of the
// view drawn, which only ever moves up), data-pn-ready once the stage is measured.

import {useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties} from "react";
import {AnimContext, createAnimStore, EMPTY_ANIMS} from "@/components/poker-night/anim";
import Board from "@/components/poker-night/Board";
import ChipFlight from "@/components/poker-night/ChipFlight";
import Dock from "@/components/poker-night/Dock";
import LiveAnnouncer from "@/components/poker-night/LiveAnnouncer";
import PotDisplay from "@/components/poker-night/PotDisplay";
import SceneBackdrop from "@/components/poker-night/SceneBackdrop";
import SeatRing from "@/components/poker-night/SeatRing";
import TableFelt from "@/components/poker-night/TableFelt";
import TableOverlays from "@/components/poker-night/TableOverlays";
import WinnerReveal from "@/components/poker-night/WinnerReveal";
import {useRoom, useServerNow} from "@/components/poker-night/room-controller";
import {TABLE_COPY} from "@/lib/learn/copy/poker-night";
import {secondsUntil} from "@/lib/poker-night/client-clock";
import type {Box} from "@/lib/poker-night/layout";
import {cardBackFor, DEFAULT_CARD_FACE, DEFAULT_CHIP_SET, resolveTableLook} from "@/lib/poker-night/looks";
import {bannerShows, resultLook} from "@/lib/poker-night/reveal";
import {bannerPlace, stageLayout, type Stage} from "@/lib/poker-night/stage";
import {cn} from "@/lib/utils";
import type {RoomView} from "@/lib/poker-night/view-types";

// A seat that can be dealt into the next hand.
const ready = (table: RoomView): number =>
    table.seats.filter((s) => s !== null && s.chips + s.pendingBuy > 0 && (s.state === 'waiting' || s.state === 'in-hand' || s.state === 'all-in' || s.state === 'folded')).length;

// What the middle of the felt says when no hand is being played.
const centreNote = (table: RoomView): string | null => {
    if (table.status === 'closed') return TABLE_COPY.closed;
    if (table.closing) return TABLE_COPY.closing;
    if (table.status === 'paused') return TABLE_COPY.paused;
    if (table.status === 'open') return table.seats.filter((s) => s !== null).length < 2 ? TABLE_COPY.waitingForPlayers : TABLE_COPY.waitingForHost;
    return ready(table) < 2 ? TABLE_COPY.waitingForPlayers : null;
};

const PILL = 'chrome-surface rounded-full px-3 py-0.5 text-xs text-fg-soft';

// The countdown to the next deal: under the board while a result shows, in the middle otherwise, or
// in the banner's column (no style: it sits where its parent puts it).
const NextHand = ({at, style}: {at: number; style?: CSSProperties}) => {
    const now = useServerNow(1000);
    const s = secondsUntil(at, now, 0);
    if (s === null || s <= 0) return null;
    return <p className={cn(style && 'pn-centre-note', PILL)} style={style} data-pn-next-hand={s}>{TABLE_COPY.nextHandIn(s)}</p>;
};

// The seat layer's size, measured as it changes (a rotation, a resize, the dock's own height).
const useMeasured = (): [(el: HTMLDivElement | null) => (() => void) | undefined, Box | null] => {
    const [box, setBox] = useState<Box | null>(null);
    const ref = useCallback((el: HTMLDivElement | null) => {
        if (!el) return undefined;
        const observer = new ResizeObserver((entries) => {
            const rect = entries[0]?.contentRect;
            if (!rect) return;
            const next = {w: Math.round(rect.width), h: Math.round(rect.height)};
            setBox((prev) => (prev && prev.w === next.w && prev.h === next.h ? prev : next));
        });
        observer.observe(el);
        return () => observer.disconnect();
    }, []);
    return [ref, box];
};

const TableScreen = () => {
    const room = useRoom();
    const table = room.table;
    const hand = table.hand;
    const mySeat = room.me?.seat ?? null;

    // The animations: the room's events, scheduled as they arrive.
    const [store] = useState(createAnimStore);
    const {events} = room;
    useEffect(() => {
        store.ingest(events, Date.now());
    }, [store, events]);
    useEffect(() => () => store.dispose(), [store]);
    const anims = useSyncExternalStore(store.subscribe, store.get, () => EMPTY_ANIMS);

    const [measure, box] = useMeasured();
    const seatCount = table.seats.length;
    const stage: Stage | null = useMemo(() => (box && box.w > 0 && box.h > 0 ? stageLayout(box, seatCount, mySeat) : null), [box, seatCount, mySeat]);
    const look = useMemo(() => resultLook(hand), [hand]);
    const tableLook = resolveTableLook(table.settings);
    const name = TABLE_COPY.name(table.settings.name, room.code);

    // The tab says when it is the viewer's turn, and goes back to the table's name after.
    const yourTurn = mySeat !== null && hand?.phase === 'betting' && hand.actor === mySeat;
    const title = useRef<string | null>(null);
    useEffect(() => {
        const base = title.current ?? document.title;
        title.current = base;
        document.title = yourTurn ? TABLE_COPY.documentTitle(name, true) : base;
        return () => {
            document.title = base;
        };
    }, [yourTurn, name]);

    const live = !!hand && hand.phase !== 'complete';
    const note = live ? null : centreNote(table);
    const nextAt = !live && table.status === 'playing' && !table.closing && table.nextHandAt !== null && note === null ? table.nextHandAt : null;
    // The line under the board, inside the banner's column when the banner grows down over it.
    const inBanner = stage !== null && bannerShows(hand, look) && !bannerPlace(stage).up;
    const tableVars = stage ? ({'--pn-plate-w': `${stage.plateSize.w}px`, '--pn-plate-h': `${stage.plateSize.h}px`, '--pn-button': `${stage.buttonSize}px`} as CSSProperties) : undefined;

    return (
        <main
            className="pn-room"
            aria-label={TABLE_COPY.region(name)}
            data-pn-mode={room.mode}
            data-pn-transport={room.transport}
            data-pn-seq={table.seq}
            data-pn-scene={tableLook.scene}
            data-pn-felt={tableLook.felt}
            data-pn-back={cardBackFor(room.personal.cardBack)}
            data-pn-face={DEFAULT_CARD_FACE}
            data-pn-colours={room.personal.fourColour ? 'four' : 'two'}
            data-pn-chips={DEFAULT_CHIP_SET}
            data-pn-fit={stage?.fit ?? 'compact'}
            data-pn-orientation={stage?.orientation ?? 'portrait'}
            data-pn-joined={room.view ? (mySeat !== null ? 'seated' : 'watching') : 'visitor'}
            data-pn-status={table.status}
        >
            <SceneBackdrop/>
            <AnimContext.Provider value={anims}>
                <div className="pn-stage">
                    <div ref={measure} className="pn-table" style={tableVars} data-pn-ready={stage ? 'true' : 'false'} data-pn-hand={hand?.no ?? 0}>
                        {stage && (
                            <>
                                <TableFelt stage={stage} name={name} showName={!hand}/>
                                <Board stage={stage} anims={anims} look={look}/>
                                <PotDisplay stage={stage} anims={anims}/>
                                {note && !hand && (
                                    <p className="pn-centre-note pn-on-felt" style={{left: stage.board.x, top: stage.board.y, maxWidth: Math.max(stage.board.w, 180)}} role="status" data-pn-note="">
                                        {note}
                                    </p>
                                )}
                                <SeatRing stage={stage} anims={anims} look={look}/>
                                <ChipFlight stage={stage} anims={anims} handNo={hand?.no ?? null}/>
                                <WinnerReveal stage={stage} anims={anims} look={look} footer={inBanner ? (
                                    <>
                                        {note && hand && <p className={PILL} role="status" data-pn-note="">{note}</p>}
                                        {nextAt !== null && <NextHand at={nextAt}/>}
                                    </>
                                ) : null}/>
                                {!inBanner && note && hand && (
                                    <p className={cn('pn-centre-note', PILL)} role="status" data-pn-note=""
                                       style={{left: stage.board.x, top: stage.board.y + stage.board.h / 2 + 14}}>
                                        {note}
                                    </p>
                                )}
                                {!inBanner && nextAt !== null && (
                                    <NextHand at={nextAt} style={hand ? {left: stage.board.x, top: stage.board.y + stage.board.h / 2 + 14} : {left: stage.board.x, top: stage.board.y}}/>
                                )}
                            </>
                        )}
                    </div>
                    <Dock anims={anims} look={look}/>
                </div>
            </AnimContext.Provider>
            <LiveAnnouncer/>
            <TableOverlays/>
        </main>
    );
};

export default TableScreen;
