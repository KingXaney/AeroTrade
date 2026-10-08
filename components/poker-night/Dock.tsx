'use client';

// The viewer's corner, under the table (a column at the right on a phone held sideways): their two
// cards, what they make so far and, on their turn, the seconds left (while someone else acts in a
// hand they are in, who the table is waiting for) and the emote button (EmotePicker, key E); then
// one row of controls —
// the action bar on their turn, the early choices while someone else acts in a hand they are in,
// else their seat's own (the host's first deal, "I'm back", "Deal me in", "Sit out next hand", "Show
// my cards" and Leave whenever they are not playing a hand — the pause after a showdown they
// reached and a folded hand included — and once the stack is empty a rebuy, which opens the bank).
// What the seat does when the hand ends is said beside the cards (the plate keeps reading Folded):
// once they left mid-hand, that they leave when it ends, and the row offers nothing more; while a
// "Sit out next hand" waits, that they sit out from the next hand, and the row offers "Deal me in",
// which takes it back. Showing a folded hand is a secondary button after Sit out: it turns up the
// viewer's own cards for everyone, for good.
// Both rows keep their height whatever they hold, so the table above never moves. Everything is
// lib/poker-night/dock's reading of the view. A folded hand stays in front of the viewer, dimmed,
// until the next deal. With Peek on (My look) the cards stay face down until the viewer presses on
// them, and the hand's name with them: the line under them says how to peek. While the connection
// is lost a "Reconnecting…" pill says why the buttons wait.
//
// A visitor has the join card instead; a watcher a line saying so — or, for a player who has just
// left, what they left with, the way home (a full page load of "/"), the way back to a seat and,
// for an account, the lobby.
//
// The seat's own controls and the early choices shield the first taps after they appear
// (useTapShield), as the action bar does: a thumb on its way to Call as the hand ends does not land
// on Leave, nor one on its way to Leave as the next hand is dealt on an early choice.

import {useState} from "react";
import {toast} from "sonner";
import ActionButton, {actionButton} from "@/components/primitives/ActionButton";
import Panel from "@/components/primitives/Panel";
import ActionBar from "@/components/poker-night/ActionBar";
import type {LiveAnim} from "@/components/poker-night/anim";
import EmotePicker from "@/components/poker-night/EmotePicker";
import HandStrength from "@/components/poker-night/HandStrength";
import HoleCards from "@/components/poker-night/HoleCards";
import {HomeLink} from "@/components/poker-night/HomeLink";
import {askLeave, chooseSeat, openOverlay} from "@/components/poker-night/overlay-requests";
import PreActions from "@/components/poker-night/PreActions";
import {useRoom, useServerNow, type ActionBody} from "@/components/poker-night/room-controller";
import {useTapShield} from "@/components/poker-night/useTapShield";
import {BANK_COPY, HAND_COPY, INVITE_COPY, JOIN_COPY, LOOKS_COPY, TABLE_COPY} from "@/lib/learn/copy/poker-night";
import {turnLeft} from "@/lib/poker-night/client-clock";
import {dockView, preRowKey, type DockView} from "@/lib/poker-night/dock";
import {leaveTapAsks, leftState, type LeftState} from "@/lib/poker-night/overlays";
import type {ResultLook} from "@/lib/poker-night/reveal";
import {cn} from "@/lib/utils";

const NOTE = 'chrome-surface inline-flex items-center rounded-full px-3 py-1 text-xs text-fg-soft';
// A sentence that may take two lines beside the cards on a phone.
const LONG_NOTE = 'chrome-surface inline-flex max-w-full items-center rounded-xl px-3 py-1 text-xs leading-snug text-fg-soft';

// The seconds left on the viewer's own turn (the ring on the plate shows the share).
const TurnClock = ({deadline, turnMs}: {deadline: number; turnMs: number}) => {
    const now = useServerNow(1000);
    const left = turnLeft(deadline, turnMs, now, 0);
    if (!left) return null;
    return (
        <span className={`${NOTE} gap-1.5 font-semibold text-fg`} role="timer" aria-live="off" aria-label={TABLE_COPY.timer} data-pn-clock={left.seconds}>
            <span>{TABLE_COPY.yourTurn}</span>
            <span className={left.fraction <= 0.3 ? 'font-mono text-warning' : 'font-mono'}>{TABLE_COPY.secondsLeft(left.seconds)}</span>
        </span>
    );
};

// The connection is lost: said where the buttons are, which wait for it (the top bar says it too).
const Reconnecting = () => (
    <span className={cn(NOTE, 'text-warning')} role="status" data-pn-reconnecting="">{TABLE_COPY.connection.reconnecting}</span>
);

// A button's word, short in a narrow dock (app/globals.css .pn-label-short); the long one is its name.
const Label = ({long, short}: {long: string; short: string}) => (
    <>
        <span className="pn-label-long">{long}</span>
        <span className="pn-label-short" aria-hidden="true">{short}</span>
    </>
);

const SeatControls = ({dock, disabled}: {dock: DockView; disabled: boolean}) => {
    const room = useRoom();
    const shield = useTapShield();
    const send = async (body: ActionBody) => {
        const r = await room.send(body);
        if (!r.ok) toast.error(r.message);
    };
    // A tap that lands as the row appears was meant for what was there before.
    const tap = (act: () => void) => (e: {detail: number; timeStamp: number}) => {
        if (shield.lands(e)) act();
    };
    const away = dock.control === 'back';
    const byHost = dock.control === 'sit-in' && room.satOutByHost;
    // Leaving in the break is one tap while sitting down again just works; otherwise the dialog says
    // what it takes first.
    const leave = () => {
        if (room.view && leaveTapAsks(room.view)) askLeave('stay');
        else void send({type: 'leave'});
    };
    return (
        <div className="flex min-h-12 flex-wrap items-center gap-1.5" data-pn-seat-controls="" data-pn-armed={shield.armed ? '' : undefined}>
            {dock.deal && (
                <ActionButton variant="strong" glow size="md" className="min-h-12 flex-1 sm:flex-none sm:px-10" disabled={disabled}
                              onClick={tap(() => void send({type: 'host', op: {op: 'start'}}))} data-pn-control="deal">
                    {INVITE_COPY.deal}
                </ActionButton>
            )}
            {dock.buy && (
                <>
                    <span className={NOTE}>{TABLE_COPY.outOfChips}</span>
                    <ActionButton variant="primary" size="md" className="min-h-12" onClick={tap(() => openOverlay('bank'))} data-pn-control="rebuy">
                        {dock.buy.rebuy ? BANK_COPY.rebuy : BANK_COPY.topUp(dock.buy.topUp)}
                    </ActionButton>
                </>
            )}
            {away && <span className={`${NOTE} min-w-0 flex-1`}>{TABLE_COPY.awayNote(room.config.sitOutAfter)}</span>}
            {dock.control === 'sit-in' && <span className={NOTE} data-pn-sat-out={byHost ? 'host' : 'self'}>{byHost ? TABLE_COPY.hostSatYouOut : TABLE_COPY.sittingOut}</span>}
            {(away || dock.control === 'sit-in') && (
                <ActionButton variant="primary" size="md" className="min-h-12" disabled={disabled} onClick={tap(() => void send({type: 'sit-in'}))}
                              data-pn-control={away ? 'back' : 'sit-in'}>
                    {away || byHost ? TABLE_COPY.back : TABLE_COPY.dealMeIn}
                </ActionButton>
            )}
            {/* A "Sit out next hand" waits (the note beside the cards says so): this takes it back. */}
            {dock.takeBack && (
                <ActionButton variant="secondary" size="md" className="min-h-12" disabled={disabled} onClick={tap(() => void send({type: 'sit-in'}))}
                              data-pn-control="take-back">
                    {TABLE_COPY.dealMeIn}
                </ActionButton>
            )}
            {dock.sitOut && (
                <ActionButton variant="secondary" size="md" className="min-h-12" disabled={disabled} onClick={tap(() => void send({type: 'sit-out'}))}
                              aria-label={TABLE_COPY.sitOut} data-pn-control="sit-out">
                    <Label long={TABLE_COPY.sitOut} short={TABLE_COPY.sitOutShort}/>
                </ActionButton>
            )}
            {dock.canShow && (
                <ActionButton variant="secondary" size="md" className="min-h-12" disabled={disabled} onClick={tap(() => void send({type: 'show'}))}
                              aria-label={TABLE_COPY.showCards} data-pn-control="show">
                    <Label long={TABLE_COPY.showCards} short={TABLE_COPY.showShort}/>
                </ActionButton>
            )}
            {dock.leave && (
                <ActionButton variant="danger" size="md" className="min-h-12" disabled={disabled} onClick={tap(leave)}
                              aria-label={TABLE_COPY.leaveTable} data-pn-control="leave">
                    <Label long={TABLE_COPY.leaveTable} short={TABLE_COPY.leaveShort}/>
                </ActionButton>
            )}
        </div>
    );
};

// The viewer's cards and the line beside them: the seconds left, who the table waits for, what the
// cards make — or, with Peek on and the cards face down, how to turn them up.
const DockHand = ({dock, deadline, waitingFor, anims, look}: {
    dock: DockView; deadline: number | null; waitingFor: string | null; anims: readonly LiveAnim[]; look: ResultLook | null;
}) => {
    const room = useRoom();
    const [peeking, setPeeking] = useState(false);
    const hand = room.view?.hand ?? null;
    const peekOn = room.personal.peek && dock.hole !== null && (dock.dealtIn || dock.mucked);
    const hidden = peekOn && !peeking;
    return (
        <>
            <HoleCards seat={dock.seat!} hole={dock.hole} holding={dock.dealtIn} folded={dock.mucked} handNo={hand?.no ?? null} anims={anims} look={look}
                       peek={room.personal.peek ? {peeking, onPeek: setPeeking} : null}/>
            <div className="flex min-w-0 flex-col items-start gap-1">
                {room.mode === 'reconnecting' && <Reconnecting/>}
                {deadline !== null && <TurnClock deadline={deadline} turnMs={room.config.turnSeconds * 1000}/>}
                {/* A long name is cut short with an ellipsis: on the inner span, since a flex box draws none. */}
                {waitingFor !== null && (
                    <span className={`${NOTE} max-w-full`} data-user-text="" data-pn-waiting="">
                        <span className="min-w-0 truncate">{TABLE_COPY.waitingFor(waitingFor)}</span>
                    </span>
                )}
                {/* What the seat does when the hand ends, which the plate does not say while it reads Folded. */}
                {dock.leaving && <span className={LONG_NOTE} role="status" data-pn-leaving="">{TABLE_COPY.leavingAfterHand}</span>}
                {dock.sitOutNext && <span className={LONG_NOTE} role="status" data-pn-sit-out-next="">{TABLE_COPY.sitOutNextNote}</span>}
                {/* The hand's name, unless the viewer turned it off (My look: "Name my hand") or keeps the cards face down. */}
                {hidden
                    ? <span className={NOTE} data-pn-peek-prompt="">{LOOKS_COPY.peekPrompt}</span>
                    : <HandStrength strength={room.personal.handHints ? dock.strength : null}/>}
            </div>
        </>
    );
};

// After leaving: what the player left with tonight, the way home, the way back to a seat (or why
// there is none) and, for an account, the lobby. Home and the lobby are full page loads, so the
// table's connection, wake lock and sounds end with the page.
const LeftPanel = ({left}: {left: LeftState}) => {
    const room = useRoom();
    const shield = useTapShield();
    const hasAccount = room.me?.hasAccount ?? false;
    return (
        <Panel pad={3} className="w-full max-w-md space-y-2" aria-label={TABLE_COPY.leftTitle} data-pn-left={left.net}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <h2 className="heading-type text-sm text-fg">{TABLE_COPY.leftTitle}</h2>
                <p className={cn('font-mono text-sm tabular-nums', left.net > 0 ? 'text-positive' : left.net < 0 ? 'text-negative' : 'text-fg-soft')}
                   data-pn-left-net="">
                    {TABLE_COPY.netTonight(left.net)}
                </p>
            </div>
            {left.note && <p className="text-xs text-fg-muted" data-pn-left-note="">{left.note}</p>}
            <div className="flex flex-wrap gap-2" data-pn-armed={shield.armed ? '' : undefined}>
                <HomeLink className={actionButton({variant: 'primary', size: 'md', className: 'inline-flex min-h-11 flex-1 items-center justify-center'})} data-pn-home="">
                    {TABLE_COPY.home}
                </HomeLink>
                {left.sitAgain && (
                    <ActionButton variant="secondary" size="md" className="min-h-11 flex-1" data-pn-sit-again=""
                                  onClick={(e) => {
                                      if (shield.lands(e)) chooseSeat(null);
                                  }}>
                        {TABLE_COPY.sitAgain}
                    </ActionButton>
                )}
                {hasAccount && (
                    <a href="/poker-night" className={actionButton({variant: 'secondary', size: 'md', className: 'inline-flex min-h-11 flex-1 items-center justify-center'})}
                       data-pn-lobby="">
                        {TABLE_COPY.lobby}
                    </a>
                )}
            </div>
        </Panel>
    );
};

const Dock = ({anims, look}: {anims: readonly LiveAnim[]; look: ResultLook | null}) => {
    const room = useRoom();
    const view = room.view;
    if (!view) return null;
    const disabled = room.problem !== null || room.mode === 'reconnecting';
    if (view.me.seat === null) {
        const left = leftState(view);
        return (
            <section className="pn-dock" aria-label={HAND_COPY.yourHand} data-pn-dock="watching">
                <div className="pn-dock-row flex-col items-center justify-center">
                    {room.mode === 'reconnecting' && <Reconnecting/>}
                    {left ? <LeftPanel left={left}/> : <p className={NOTE} role="status">{JOIN_COPY.watching}</p>}
                </div>
            </section>
        );
    }
    const dock = dockView(view);
    const hand = view.hand;
    const deadline = dock.myTurn && hand?.deadline != null ? hand.deadline : null;
    // Someone else on the clock in a hand the viewer is in: their name, where the viewer's seconds go.
    const actor = !dock.myTurn && dock.dealtIn && hand?.phase === 'betting' && hand.actor !== null ? view.seats[hand.actor] ?? null : null;
    const waitingFor = actor ? view.people[actor.pid]?.name ?? null : null;
    return (
        <section className="pn-dock" aria-label={HAND_COPY.yourHand} data-pn-dock="seated">
            <div className="pn-dock-row">
                <div className="pn-dock-hand">
                    <DockHand dock={dock} deadline={deadline} waitingFor={waitingFor} anims={anims} look={look}/>
                    <EmotePicker/>
                </div>
                <div className="pn-dock-actions">
                    {dock.myTurn ? (
                        <ActionBar key={view.turn} dock={dock} turn={view.turn} disabled={disabled}/>
                    ) : dock.pre ? (
                        // Mounted afresh for each hand and each set of choices, behind its tap shield.
                        <PreActions key={preRowKey(hand?.no ?? null, dock.pre.options)} pre={dock.pre} disabled={disabled}/>
                    ) : (
                        // Shielded afresh when a hand ends (its pause brings Show, Sit out and Leave
                        // under the thumb) and when one is dealt.
                        <SeatControls key={`${hand?.no ?? 0}:${hand?.phase === 'complete' ? 'pause' : 'hand'}`} dock={dock} disabled={disabled}/>
                    )}
                </div>
            </div>
        </section>
    );
};

export default Dock;
