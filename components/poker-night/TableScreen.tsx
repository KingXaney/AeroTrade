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
// that draw them. The pots' pills go where lib/poker-night/stage.potPlan finds room for them, clear of
// every card, plate, bet line out, a winner's "+N" and the dealer button, and their chips fly to and
// from there. While a result shows, the winner's banner and the line under the board (the next
// deal's countdown, the pause) go where lib/poker-night/stage.bannerPlan finds room for them, clear of
// every plate, turned-up hand (as many cards as the game's hands hold: four in PLO), the dealer
// button, the board, the pots paying out and the winners' "+N" — under the banner when they fit
// together, else apart. Between hands, when the host picked another game, the countdown says it ("Next
// hand: PLO, in 4 s"); before the first hand the felt prints the game under the table's name. In
// Triple T's throw-away the middle of the felt, where the board's cards will come, counts the throws
// with its seconds ("Everyone throws away one card · 3 of 5 done · 12 s"). The room's root carries the looks' ids
// for LOOKS_CSS (the host's scene and felt, the viewer's card back and suit colours) and the hooks a
// test reads: data-pn-mode (polling, realtime, reconnecting), data-pn-transport (realtime, poll,
// both), data-pn-seq (the seq of the view drawn, which only ever moves up), data-pn-ready once the
// stage is measured.

import {useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties} from "react";
import {AnimContext, createAnimStore, EMPTY_ANIMS} from "@/components/poker-night/anim";
import Board from "@/components/poker-night/Board";
import ChipFlight from "@/components/poker-night/ChipFlight";
import Dock from "@/components/poker-night/Dock";
import LiveAnnouncer from "@/components/poker-night/LiveAnnouncer";
import EmoteLayer from "@/components/poker-night/EmoteLayer";
import TableFeel from "@/components/poker-night/TableFeel";
import PotDisplay from "@/components/poker-night/PotDisplay";
import SceneBackdrop from "@/components/poker-night/SceneBackdrop";
import SeatRing from "@/components/poker-night/SeatRing";
import TableFelt from "@/components/poker-night/TableFelt";
import TableOverlays from "@/components/poker-night/TableOverlays";
import WinnerReveal from "@/components/poker-night/WinnerReveal";
import {useRoom, useServerNow} from "@/components/poker-night/room-controller";
import {DISCARD_COPY, MODE_COPY, TABLE_COPY} from "@/lib/learn/copy/poker-night";
import {HOLE_CARDS, PLAYING_CARDS} from "@/lib/poker-night/config";
import {throwAwayCount} from "@/lib/poker-night/dock";
import {modeChanged, modeOf, nextModeOf} from "@/lib/poker-night/variants";
import {secondsUntil} from "@/lib/poker-night/client-clock";
import type {Box} from "@/lib/poker-night/layout";
import {cardBackFor, cardFaceFor, chipSetFor, resolveTableLook} from "@/lib/poker-night/looks";
import {bannerLines, bannerShows, playerAt, resultLook, viewerSeatIn} from "@/lib/poker-night/reveal";
import {potPlan, resultBannerPlan, stageLayout, type PotAmount, type PotNow, type PotSeen, type Stage, type WinPop} from "@/lib/poker-night/stage";
import {cn} from "@/lib/utils";
import type {HandView, RoomView} from "@/lib/poker-night/view-types";

// The pots on the felt: as they stand while the hand is played, as its result paid them after.
const potsOf = (hand: HandView | null): PotAmount[] =>
    (!hand ? [] : hand.phase === 'complete' ? hand.result?.pots ?? [] : hand.pots).map((p, pot) => ({pot, amount: p.amount}));

// The winners' "+N" from their key ("seat:amount", a comma apart).
const popsOf = (key: string): WinPop[] =>
    key ? key.split(',').map((pair) => {
        const [seat, amount] = pair.split(':').map(Number);
        return {seat, amount};
    }) : [];

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

// The countdown to the next deal: in the middle between hands, else under the board, or where the
// banner's plan puts it while a result shows — naming the game when the next deal changes it.
const nextHandText = (game: string | null, s: number): string => (game ? MODE_COPY.nextHandIn(game, s) : TABLE_COPY.nextHandIn(s));
const NextHand = ({at, game, className, style}: {at: number; game: string | null; className: string; style?: CSSProperties}) => {
    const now = useServerNow(1000);
    const s = secondsUntil(at, now, 0);
    if (s === null || s <= 0) return null;
    return <p className={cn(className, PILL)} style={style} data-pn-next-hand={s} data-pn-next-game={game ?? undefined}>{nextHandText(game, s)}</p>;
};

// Triple T's throw-away, in the middle of the felt: how many of the players still in have thrown a
// card away, and the seconds the throw-away has left — inside the board's own place, which the stage
// keeps clear of every plate, bet line and the dealer button (the board has no card yet). A narrower
// board says the count alone on one line; one too narrow for that (a small phone on its side) says
// nothing there: the plates' "Discarding…" and the dock's clock say it.
const ThrowAwayNote = ({count, deadline, board}: {count: {done: number; of: number}; deadline: number | null; board: Stage['board']}) => {
    const now = useServerNow(1000);
    if (board.w < THROW_AWAY_PX.count) return null;
    const s = deadline === null ? null : secondsUntil(deadline, now, 0);
    const full = board.w >= THROW_AWAY_PX.full;
    return (
        <p className={cn('pn-centre-note', PILL, 'text-fg', !full && 'whitespace-nowrap text-[11px]')} style={{left: board.x, top: board.y, maxWidth: board.w}} role="status"
           data-pn-throw-away={`${count.done}/${count.of}`} data-compact={full ? undefined : ''}>
            <span>{full ? DISCARD_COPY.felt(count.done, count.of) : DISCARD_COPY.feltShort(count.done, count.of)}</span>
            {full && s !== null && s > 0 && <span className="whitespace-nowrap font-mono"> · {TABLE_COPY.secondsLeft(s)}</span>}
        </p>
    );
};

// The board widths the felt's throw-away note needs: the sentence with the seconds (two lines at
// most), and the count alone on one line ("3 of 5 thrown away" at 11 px: about 95 px in the app's
// faces, its padding and the widest chrome border, a few pixels to spare).
const THROW_AWAY_PX = {full: 200, count: 126} as const;

// The widest the countdown says it, for the banner's plan: the next deal is never 100 s away.
const NEXT_HAND_WIDEST = 99;

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
    const myPid = room.me?.pid ?? null;

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
    // The stage lays out as many boards as the game has (PLO's two or three): the hand's own while
    // there is one, else what the next deal plays.
    const boardCount = hand ? hand.boards.length : nextModeOf(room.config).boards;
    // The game: the hand's own (what its turned-up hands hold), and the next deal's when the host
    // picked another. The stage keeps the board clear of PLO's hands of four, and moves a turned-up
    // hand along its row off another.
    const game = modeOf(hand, room.config);
    const handSize = PLAYING_CARDS[game.variant];
    // Where the board sat a moment ago (its middle, as a share of the seat layer's height) for this
    // table's layout: a box a pixel taller or shorter keeps it there among places as good (the stage's
    // `prefer`), so the dock's line wrapping never sends the board across the felt and back.
    const layoutKey = `${seatCount}:${mySeat}:${boardCount}:${handSize}`;
    const [held, setHeld] = useState<{key: string; share: number} | null>(null);
    const prefer = box && held?.key === layoutKey ? held.share * box.h : null;
    // The seats nobody sits in (a ring, no plate, bet line or hand there), which the board may use: a
    // seat whose player went as the hand completed keeps its ghost plate until the next deal.
    const goneSeats = new Set(hand?.phase === 'complete' ? (hand.result?.gone ?? []).map(([seat]) => seat) : []);
    const openKey = table.seats.flatMap((v, seat) => (v === null && !goneSeats.has(seat) ? [seat] : [])).join(',');
    const stage: Stage | null = useMemo(() => {
        if (!box || box.w <= 0 || box.h <= 0) return null;
        const open = openKey ? openKey.split(',').map(Number) : [];
        return stageLayout(box, seatCount, mySeat, boardCount, {handSize, prefer, open});
    }, [box, seatCount, mySeat, boardCount, handSize, prefer, openKey]);
    const share = stage ? stage.board.y / stage.box.h : null;
    if (share !== null && (held?.key !== layoutKey || held.share !== share)) setHeld({key: layoutKey, share});
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
    const throwAway = throwAwayCount(table);
    const nextAt = !live && table.status === 'playing' && !table.closing && table.nextHandAt !== null && note === null ? table.nextHandAt : null;
    // The cards face down before a plate: Triple T's three while they throw one away.
    const backs = hand?.phase === 'discard' ? HOLE_CARDS[game.variant] : handSize;
    const nextGame = nextModeOf(room.config);
    const changedTo = modeChanged(hand, room.config) ? MODE_COPY.label(nextGame.variant, nextGame.boards) : null;
    // While a result shows: what the banner says, what the line under the board says at its widest,
    // and where the two go, clear of the open seats' rings, the turned-up hands and the dealer button.
    const lines = useMemo(() => {
        if (!look) return [];
        // Through the result's gone list: a winner cashed out as the hand completed, or whose seat
        // was taken in the pause, is still named.
        const nameOf = (seat: number) => {
            const pid = playerAt(table, seat);
            return pid ? table.people[pid]?.name ?? null : null;
        };
        // "You win" only for the seat the viewer played, not one they took in the pause.
        return bannerLines(look, nameOf, viewerSeatIn(table, mySeat, myPid));
    }, [look, table, mySeat, myPid]);
    const line = note && hand ? note : nextAt !== null ? nextHandText(changedTo, NEXT_HAND_WIDEST) : null;
    // The winners' "+N" while the result pays out, which the pots and the banner keep clear of.
    const popsKey = hand?.phase === 'complete' && look ? look.winners.map((w) => `${w.seat}:${w.amount}`).join(',') : '';
    // The pots' pills, clear of what shows now — the hands turned up, the bet lines out as drawn, the
    // winners' "+N" — and, where that is near enough, of what may yet show: every seated player's hand
    // but the viewer's turned up, every bet line; the dealer button always. Keyed on what they depend on,
    // so a poll that changes nothing of it places nothing again.
    const button = hand?.button ?? null;
    // Hands turned up where no seat view says so: a ghost plate's (a player gone as the hand
    // completed, SeatRing) and those shown to the viewer alone — kept clear of the pots and banner too.
    const doneResult = hand?.phase === 'complete' ? hand.result : null;
    const extraShown = new Set([
        ...(room.me?.shownToMe ?? []).map((h) => h.seat),
        ...(doneResult?.gone ?? []).filter(([seat]) => table.seats[seat] === null && doneResult!.hands.some((h) => h.seat === seat)).map(([seat]) => seat),
    ]);
    const seatedKey = table.seats.map((v) => (v ? 1 : 0)).join('');
    const shownKey = table.seats.map((v, seat) => (seat !== mySeat && ((v && Array.isArray(v.cards)) || extraShown.has(seat)) ? 1 : 0)).join('');
    const betsKey = table.seats.map((v) => (v && v.bet > 0 ? `${v.bet}${v.state === 'all-in' ? '!' : ''}` : '')).join(',');
    const potKey = potsOf(hand).map((p) => p.amount).join(',');
    const pots = useMemo(() => {
        if (!stage || !potKey) return null;
        const open: number[] = [];
        const seated: number[] = [];
        [...seatedKey].forEach((c, seat) => (c === '1' ? seated : open).push(seat));
        const now: PotNow = {
            shown: [...shownKey].flatMap((c, seat) => (c === '1' ? [seat] : [])),
            bets: betsKey.split(',').flatMap((b, seat) => (b ? [{seat, amount: parseInt(b, 10), allIn: b.endsWith('!')}] : [])),
            pops: popsOf(popsKey),
        };
        const seen: PotSeen = {open, shown: seated.filter((seat) => seat !== mySeat), button, bets: seated, now, handSize, backs};
        return potPlan(stage, potKey.split(',').map((amount, pot) => ({pot, amount: Number(amount)})), seen);
    }, [stage, potKey, seatedKey, shownKey, betsKey, popsKey, mySeat, button, handSize, backs]);
    const plan = useMemo(() => {
        if (!stage || !bannerShows(hand, look)) return null;
        const open: number[] = [];
        const shown: number[] = [];
        table.seats.forEach((v, seat) => {
            if (!v) open.push(seat);
            if (seat !== mySeat && ((v && Array.isArray(v.cards)) || [...shownKey][seat] === '1')) shown.push(seat);
        });
        const text = {winners: lines, note: line};
        const seen = {open, shown, button: hand?.button ?? null, handSize};
        // Clear of the result's pots too, which stay on while their chips stream out, and of the
        // winners' "+N" — where that leaves room; else clear of the table alone, since both leave
        // within a second or two (stage.resultBannerPlan), never over a plate for the whole pause.
        return resultBannerPlan(stage, text, {...seen, pots: pots?.pills ?? [], pops: popsOf(popsKey)});
    }, [stage, hand, look, lines, line, table.seats, mySeat, pots, popsKey, shownKey, handSize]);
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
            data-pn-face={cardFaceFor(room.personal.cardFace)}
            data-pn-colours={room.personal.fourColour ? 'four' : 'two'}
            data-pn-chips={chipSetFor(room.personal.chips)}
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
                                <TableFelt stage={stage} name={name} showName={!hand} game={MODE_COPY.label(game.variant, game.boards)}/>
                                <Board stage={stage} anims={anims} look={look}/>
                                <PotDisplay plan={pots} anims={anims}/>
                                {note && !hand && (
                                    <p className="pn-centre-note pn-on-felt" style={{left: stage.board.x, top: stage.board.y, maxWidth: Math.max(stage.board.w, 180)}} role="status" data-pn-note="">
                                        {note}
                                    </p>
                                )}
                                {throwAway && hand && <ThrowAwayNote count={throwAway} deadline={hand.deadline} board={stage.board}/>}
                                <SeatRing stage={stage} anims={anims} look={look}/>
                                <ChipFlight stage={stage} pots={pots} anims={anims} handNo={hand?.no ?? null}/>
                                {plan && hand && <WinnerReveal anims={anims} handNo={hand.no} lines={lines} plan={plan}/>}
                                {plan?.note && (
                                    <div className="pn-banner-wrap" style={{left: plan.note.x - plan.note.width / 2, top: plan.note.top, width: plan.note.width}} data-pn-banner-place="note">
                                        {note && hand
                                            ? <p className={cn('pn-banner-note', PILL)} role="status" data-pn-note="">{note}</p>
                                            : nextAt !== null && <NextHand at={nextAt} game={changedTo} className="pn-banner-note"/>}
                                    </div>
                                )}
                                {!plan && note && hand && (
                                    <p className={cn('pn-centre-note', PILL)} role="status" data-pn-note=""
                                       style={{left: stage.board.x, top: stage.board.y + stage.board.h / 2 + 14}}>
                                        {note}
                                    </p>
                                )}
                                {!plan && nextAt !== null && (
                                    <NextHand at={nextAt} game={changedTo} className="pn-centre-note"
                                              style={hand ? {left: stage.board.x, top: stage.board.y + stage.board.h / 2 + 14} : {left: stage.board.x, top: stage.board.y}}/>
                                )}
                                <EmoteLayer stage={stage}/>
                            </>
                        )}
                    </div>
                    <Dock anims={anims} look={look}/>
                </div>
            </AnimContext.Provider>
            <LiveAnnouncer/>
            <TableFeel anims={anims}/>
            <TableOverlays/>
        </main>
    );
};

export default TableScreen;
