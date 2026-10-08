'use client';

// Everything that floats over the table, mounted once by TableScreen and reading the room through
// useRoom(): the top bar; the join card for a visitor (and for a watcher taking a seat); the
// drawers — Invite (open by itself for the host who just started the table), Bank, Host controls,
// Hand log, My look, Hands (the rankings and the game, for every viewer), the boards larger
// (BoardsSheet: PLO's two or three boards, a tap on them away, for every viewer); the dialogs that ask first — remove a player, hand over host, end the night,
// leave the table (LeaveDialog: staying to watch, or going home); the banner when a newer deploy
// needs a reload; an ask to see the viewer's cards (AskPrompt, at the foot of the screen); and the
// toasts that say once what changed on its own — a new game from this hand ("New game from this hand:
// Pot-limit Omaha.", at the first deal of it this page sees), the connection back ("Back online."), the host
// sitting the viewer out, how a request for chips ended (approved or declined: one the viewer took
// back, by Cancel or by leaving, says nothing more), how the viewer's own asks to see a hand ended
// (AskWatch, for every joined viewer, so an ask the next deal ended is said too) and, for the host,
// each new request for chips with Approve (RequestWatch). The menu's "Leave after this hand" and its
// Stay go through useLeaveAfter, as the dock's do.
//
// Which drawer and dialog are open is this component's state, so a dialog opened from the host
// drawer steps the drawer aside and brings it back when it closes, and nothing stacks one modal on
// another. When the viewer's turn comes round, every drawer and dialog closes (worked out during
// render from the turn number, lib/poker-night/overlays.myTurnKey) and focus goes to the action
// bar: nothing modal stands over it while the clock runs. Other table components ask for a drawer,
// a seat or the leave dialog through components/poker-night/overlay-requests.

import {useEffect, useRef, useState} from "react";
import {toast} from "sonner";
import ConfirmDialog from "@/components/primitives/ConfirmDialog";
import ActionButton from "@/components/primitives/ActionButton";
import {AskPrompt, AskWatch, RequestWatch} from "@/components/poker-night/AskPrompt";
import BankPanel from "@/components/poker-night/BankPanel";
import HandLog from "@/components/poker-night/HandLog";
import HandsDrawer from "@/components/poker-night/HandsDrawer";
import HostDrawer from "@/components/poker-night/HostDrawer";
import InviteSheet from "@/components/poker-night/InviteSheet";
import BoardsSheet from "@/components/poker-night/BoardsSheet";
import JoinCard from "@/components/poker-night/JoinCard";
import LeaveDialog from "@/components/poker-night/LeaveDialog";
import MyLookDrawer from "@/components/poker-night/MyLookDrawer";
import RemovePlayerDialog, {type RemoveTarget} from "@/components/poker-night/RemovePlayerDialog";
import TopBar from "@/components/poker-night/TopBar";
import {focusTableOnClose} from "@/components/poker-night/overlay-kit";
import {latestRequestId, takeOwnWithdraw, useOverlayRequest, type DrawerKind} from "@/components/poker-night/overlay-requests";
import {useRoom} from "@/components/poker-night/room-controller";
import type {HostSitOuts} from "@/components/poker-night/useHostSitOut";
import {useLeaveAfter} from "@/components/poker-night/useLeaveAfter";
import {ANNOUNCE_COPY, BANK_COPY, HOST_COPY, LOBBY_COPY, MODE_COPY, TABLE_COPY} from "@/lib/learn/copy/poker-night";
import {myTurnKey, ownSeat, requestEnded, type HostRow, type LeaveThen, type SeatChoice} from "@/lib/poker-night/overlays";
import {ledgerRowOf} from "@/lib/poker-night/views";

type Dialog =
    | {kind: 'remove'; target: RemoveTarget}
    | {kind: 'hand-over'; row: HostRow}
    | {kind: 'end'}
    | {kind: 'leave'; then: LeaveThen};

type Ui = {
    drawer: DrawerKind | null;
    dialog: Dialog | null;
    closedByTurn: boolean; // the drawer or dialog last closed because the viewer's turn came round
    visitorSeat: number | null; // the seat a visitor chose with "Sit here"
    sit: {seat: number | null} | null; // a watcher taking a seat
    turnSeen: number | null; // the viewer's turn the drawers last closed for
    requestSeen: number; // the last overlay request answered
};

const TableOverlays = () => {
    const room = useRoom();
    const view = room.view;
    const me = room.me;
    const isHost = me?.isHost ?? false;
    const joined = view !== null;
    const request = useOverlayRequest();
    const [ui, setUi] = useState<Ui>(() => ({
        drawer: room.invite && isHost ? 'invite' : null,
        dialog: null, closedByTurn: false, visitorSeat: null, sit: null,
        turnSeen: myTurnKey(room.view), requestSeen: latestRequestId(),
    }));

    // Worked out during render, from what the room and the requests say now (the React pattern for
    // state that follows a change: https://react.dev/reference/react/useState#storing-information-from-previous-renders).
    let next = ui;
    // A drawer or a seat another table component asked for, answered once.
    if (request && request.id > next.requestSeen) {
        next = {...next, requestSeen: request.id};
        if (request.kind === 'drawer') {
            const allowed = request.drawer === 'host' ? isHost : request.drawer === 'log' || request.drawer === 'look' ? joined : true;
            if (allowed) next = {...next, drawer: request.drawer, dialog: null, closedByTurn: false};
        } else if (request.kind === 'leave') {
            if (me?.seat !== null && me?.seat !== undefined) next = {...next, dialog: {kind: 'leave', then: request.then}, closedByTurn: false};
        } else if (!joined) {
            next = {...next, visitorSeat: request.seat};
        } else if (me?.seat === null) {
            next = {...next, sit: {seat: request.seat}};
        }
    }
    // The viewer's turn: whatever is open closes, once per turn.
    const turnKey = myTurnKey(view);
    if (turnKey !== null && turnKey !== next.turnSeen) {
        next = {...next, turnSeen: turnKey, drawer: null, dialog: null, closedByTurn: next.drawer !== null || next.dialog !== null};
    }
    // The leave dialog is a seated player's: once the seat is gone (left, removed), it is too, so it
    // never opens again by itself when they sit down later.
    if (next.dialog?.kind === 'leave' && (me?.seat ?? null) === null) next = {...next, dialog: null};
    if (next !== ui) setUi(next);

    // How a request for chips the viewer asked the host for ended: said once, whichever drawer is
    // open — approved or declined. One the viewer took back (Cancel, which marks it as it is sent, or
    // a leave, now or after the hand, which takes it with it) was said where it was done.
    const asked = view ? view.requests.find((r) => r.pid === view.me.pid)?.amount ?? null : null;
    const bought = view ? ledgerRowOf(view, view.me.pid)?.bought ?? 0 : 0;
    const pendingBuy = view && view.me.seat !== null ? view.seats[view.me.seat]?.pendingBuy ?? 0 : 0;
    const seated = (view?.me.seat ?? null) !== null;
    const leavingSoon = view?.me.next === 'leave' || view?.me.next === 'leave-after';
    const waiting = useRef<{amount: number; bought: number} | null>(null);
    useEffect(() => {
        const before = waiting.current;
        if (asked !== null) {
            if (!before) waiting.current = {amount: asked, bought};
            return;
        }
        if (!before) return;
        waiting.current = null;
        const outcome = requestEnded(before, {bought, pendingBuy, seated, leaving: leavingSoon, withdrawn: takeOwnWithdraw()});
        if (outcome === 'declined') toast.message(BANK_COPY.declined);
        else if (outcome === 'approved') toast.success(pendingBuy > 0 ? BANK_COPY.pending(pendingBuy) : BANK_COPY.approved(before.amount));
    }, [asked, bought, pendingBuy, seated, leavingSoon]);

    // The host's sit-outs still waiting on a hand, by player (the hand they were asked during): kept
    // here, so the bank's rows and the host drawer's More menu agree, whichever drawer is open.
    const [hostSitOutsWaiting, setHostSitOutsWaiting] = useState<Record<string, number>>({});
    const sitOuts: HostSitOuts = {
        waiting: hostSitOutsWaiting,
        onWaiting: (pid, handNo) => setHostSitOutsWaiting((prev) => {
            const next = {...prev};
            if (handNo === null) delete next[pid];
            else next[pid] = handNo;
            return next;
        }),
    };

    const openDrawer = (drawer: DrawerKind) => setUi((prev) => ({...prev, drawer, dialog: null, closedByTurn: false}));
    const drawerChange = (drawer: DrawerKind) => (open: boolean) =>
        setUi((prev) => ({...prev, drawer: open ? drawer : null, closedByTurn: open ? false : prev.closedByTurn}));
    const openDialog = (dialog: Dialog) => setUi((prev) => ({...prev, dialog, closedByTurn: false}));
    const closeDialog = () => setUi((prev) => ({...prev, dialog: null}));
    // A drawer steps aside while a dialog is up.
    const isOpen = (drawer: DrawerKind) => ui.drawer === drawer && ui.dialog === null;

    const leaving = useLeaveAfter();

    const seatChoice = async (choice: SeatChoice) => {
        const r = await room.send({type: choice === 'sit-out' ? 'sit-out' : 'sit-in'});
        if (!r.ok) toast.error(r.message);
    };

    const remove = async (target: RemoveTarget, lockToo: boolean): Promise<boolean> => {
        const r = await room.send({type: 'host', op: {op: 'kick', pid: target.pid}});
        if (!r.ok) {
            toast.error(r.message);
            return false;
        }
        if (lockToo) {
            const locked = await room.send({type: 'host', op: {op: 'settings', patch: {locked: true}}});
            if (!locked.ok) toast.error(locked.message);
        }
        toast.success(HOST_COPY.removedDone(target.name));
        return true;
    };

    const handOver = async (row: HostRow) => {
        const r = await room.send({type: 'hand-over', pid: row.pid});
        if (r.ok) {
            toast.success(ANNOUNCE_COPY.host(row.name));
            setUi((prev) => ({...prev, drawer: null}));
        } else {
            toast.error(r.code === 'needs_account' ? HOST_COPY.handOverNeedsAccount : r.message);
        }
    };

    const end = async () => {
        const r = await room.send({type: 'host', op: {op: 'end'}});
        if (r.ok) {
            toast.message(LOBBY_COPY.ended);
            setUi((prev) => ({...prev, drawer: null}));
        } else {
            toast.error(r.message);
        }
    };

    // The connection came back: said once.
    const reconnecting = room.mode === 'reconnecting';
    const wasReconnecting = useRef(false);
    useEffect(() => {
        if (reconnecting) {
            wasReconnecting.current = true;
            return;
        }
        if (!wasReconnecting.current) return;
        wasReconnecting.current = false;
        toast.success(TABLE_COPY.connection.back);
    }, [reconnecting]);

    // A hand of another game than the one before it on this page: said once, at its deal.
    const dealt = room.table.hand;
    const lastGame = useRef<{no: number; label: string} | null>(null);
    useEffect(() => {
        if (!dealt) return;
        const label = MODE_COPY.spokenLabel(dealt.variant, dealt.boards.length);
        const last = lastGame.current;
        lastGame.current = {no: dealt.no, label};
        if (last && dealt.no > last.no && label !== last.label) toast.message(MODE_COPY.changed(label));
    }, [dealt]);

    // The host sat the viewer out: said once as it happens (the dock keeps saying it).
    const satOut = room.satOutByHost;
    const saidSatOut = useRef(false);
    useEffect(() => {
        if (satOut && !saidSatOut.current) toast.message(TABLE_COPY.hostSatYouOut);
        saidSatOut.current = satOut;
    }, [satOut]);

    const own = view ? ownSeat(view) : null;
    const dialog = ui.dialog;
    // Asks to see a hand: the prompt while one to the viewer waits, the watch for every joined viewer
    // (each reads the clock itself, so nothing here re-renders by the second).
    const myPid = view?.me.pid ?? null;
    const askedMe = view !== null && view.me.asks.some((a) => a.to === myPid && a.answer === 'waiting');
    const showSit = joined && me?.seat === null && ui.sit !== null && own?.canTakeSeat === true;

    return (
        <>
            <TopBar onOpen={openDrawer} onSeatChoice={(c) => void seatChoice(c)} onTakeSeat={() => setUi((prev) => ({...prev, sit: {seat: null}}))}
                    onLeave={() => openDialog({kind: 'leave', then: 'stay'})} onHome={() => openDialog({kind: 'leave', then: 'home'})}
                    onLeaveAfter={(on) => void leaving.send(on)}/>
            {isHost && <RequestWatch/>}
            {joined && <AskWatch/>}
            {askedMe && <AskPrompt/>}

            {room.problem && (
                <div role="alert" className="chrome-surface fixed inset-x-3 top-[calc(env(safe-area-inset-top)+3.5rem)] z-30 mx-auto flex max-w-md items-center gap-3 rounded-lg px-4 py-3"
                     data-pn-problem={room.problem.code}>
                    <p className="min-w-0 flex-1 text-sm text-fg">{room.problem.message}</p>
                    <ActionButton size="md" className="min-h-11" onClick={() => window.location.reload()}>{TABLE_COPY.reload}</ActionButton>
                </div>
            )}

            {room.joinView && <JoinCard seat={ui.visitorSeat}/>}
            {showSit && <JoinCard seat={ui.sit!.seat} onClose={() => setUi((prev) => ({...prev, sit: null}))}/>}

            <InviteSheet open={isOpen('invite')} onOpenChange={drawerChange('invite')} toTable={ui.closedByTurn}
                         onDealt={() => setUi((prev) => ({...prev, drawer: null}))}/>
            <BankPanel open={isOpen('bank')} onOpenChange={drawerChange('bank')} toTable={ui.closedByTurn} sitOuts={sitOuts}/>
            <HandsDrawer open={isOpen('hands')} onOpenChange={drawerChange('hands')} toTable={ui.closedByTurn}/>
            <BoardsSheet open={isOpen('boards')} onOpenChange={drawerChange('boards')} toTable={ui.closedByTurn}/>
            {isHost && (
                <HostDrawer open={isOpen('host')} onOpenChange={drawerChange('host')} toTable={ui.closedByTurn}
                            onRemove={(row) => openDialog({kind: 'remove', target: {pid: row.pid, name: row.name, avatar: row.avatar, chips: row.dealtIn ? row.stack : row.chips, dealtIn: row.dealtIn}})}
                            onHandOver={(row) => openDialog({kind: 'hand-over', row})}
                            onEnd={() => openDialog({kind: 'end'})} sitOuts={sitOuts}/>
            )}
            {joined && (
                <>
                    <HandLog open={isOpen('log')} onOpenChange={drawerChange('log')} toTable={ui.closedByTurn}/>
                    <MyLookDrawer open={isOpen('look')} onOpenChange={drawerChange('look')} toTable={ui.closedByTurn}/>
                </>
            )}

            <RemovePlayerDialog target={dialog?.kind === 'remove' ? dialog.target : null} locked={room.table.settings.locked} toTable={ui.closedByTurn}
                                onClose={closeDialog} onRemove={remove}/>
            <ConfirmDialog
                open={dialog?.kind === 'hand-over'}
                onOpenChange={(open) => !open && closeDialog()}
                title={dialog?.kind === 'hand-over' ? HOST_COPY.handOverTitle(dialog.row.name) : HOST_COPY.handOver}
                description={HOST_COPY.handOverBody}
                confirmLabel={HOST_COPY.handOver}
                onConfirm={() => (dialog?.kind === 'hand-over' ? handOver(dialog.row) : undefined)}
                onCloseAutoFocus={focusTableOnClose(ui.closedByTurn)}
            />
            <ConfirmDialog
                open={dialog?.kind === 'end'}
                onOpenChange={(open) => !open && closeDialog()}
                title={HOST_COPY.endTitle}
                description={HOST_COPY.endBody}
                confirmLabel={HOST_COPY.end}
                destructive
                onConfirm={end}
                onCloseAutoFocus={focusTableOnClose(ui.closedByTurn)}
            />
            <LeaveDialog then={dialog?.kind === 'leave' ? dialog.then : null} toTable={ui.closedByTurn} onClose={closeDialog}/>
        </>
    );
};

export default TableOverlays;
