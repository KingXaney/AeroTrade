'use client';

// The viewer's corner, under the table (a column at the right on a phone held sideways): their two
// cards, what they make so far and, on their turn, the seconds left (while someone else acts in a
// hand they are in, who the table is waiting for); then one row of controls —
// the action bar on their turn, the early choices while someone else acts in a hand they are in,
// else their seat's own (the host's first deal, "I'm back", "Deal me in", "Sit out next hand",
// "Show my cards", and once the stack is empty a rebuy, which opens the bank). Both rows keep their
// height whatever they hold, so the table above never moves. Everything is lib/poker-night/dock's
// reading of the view. A visitor has the join card instead; a watcher a line saying so.

import {toast} from "sonner";
import ActionButton from "@/components/primitives/ActionButton";
import ActionBar from "@/components/poker-night/ActionBar";
import type {LiveAnim} from "@/components/poker-night/anim";
import HandStrength from "@/components/poker-night/HandStrength";
import HoleCards from "@/components/poker-night/HoleCards";
import {openOverlay} from "@/components/poker-night/overlay-requests";
import PreActions from "@/components/poker-night/PreActions";
import {useRoom, useServerNow, type ActionBody} from "@/components/poker-night/room-controller";
import {BANK_COPY, HAND_COPY, INVITE_COPY, JOIN_COPY, TABLE_COPY} from "@/lib/learn/copy/poker-night";
import {turnLeft} from "@/lib/poker-night/client-clock";
import {dockView, type DockView} from "@/lib/poker-night/dock";
import type {ResultLook} from "@/lib/poker-night/reveal";

const NOTE = 'chrome-surface inline-flex items-center rounded-full px-3 py-1 text-xs text-fg-soft';

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

const SeatControls = ({dock, disabled}: {dock: DockView; disabled: boolean}) => {
    const room = useRoom();
    const send = async (body: ActionBody) => {
        const r = await room.send(body);
        if (!r.ok) toast.error(r.message);
    };
    const away = dock.control === 'back';
    return (
        <div className="flex min-h-12 flex-wrap items-center gap-1.5" data-pn-seat-controls="">
            {dock.deal && (
                <ActionButton variant="strong" glow size="md" className="min-h-12 flex-1 sm:flex-none sm:px-10" disabled={disabled} onClick={() => void send({type: 'host', op: {op: 'start'}})} data-pn-control="deal">
                    {INVITE_COPY.deal}
                </ActionButton>
            )}
            {dock.buy && (
                <>
                    <span className={NOTE}>{TABLE_COPY.outOfChips}</span>
                    <ActionButton variant="primary" size="md" className="min-h-12" onClick={() => openOverlay('bank')} data-pn-control="rebuy">
                        {dock.buy.rebuy ? BANK_COPY.rebuy : BANK_COPY.topUp(dock.buy.topUp)}
                    </ActionButton>
                </>
            )}
            {away && <span className={`${NOTE} min-w-0 flex-1`}>{TABLE_COPY.awayNote(room.config.sitOutAfter)}</span>}
            {dock.control === 'sit-in' && <span className={NOTE}>{TABLE_COPY.sittingOut}</span>}
            {(away || dock.control === 'sit-in') && (
                <ActionButton variant="primary" size="md" className="min-h-12" disabled={disabled} onClick={() => void send({type: 'sit-in'})} data-pn-control={away ? 'back' : 'sit-in'}>
                    {away ? TABLE_COPY.back : TABLE_COPY.dealMeIn}
                </ActionButton>
            )}
            {dock.canShow && (
                <ActionButton variant="secondary" size="md" className="min-h-12" disabled={disabled} onClick={() => void send({type: 'show'})} data-pn-control="show">
                    {TABLE_COPY.showCards}
                </ActionButton>
            )}
            {dock.control === 'sit-out' && !dock.dealtIn && !dock.deal && (
                <ActionButton variant="secondary" size="md" className="min-h-12" disabled={disabled} onClick={() => void send({type: 'sit-out'})} data-pn-control="sit-out">
                    {TABLE_COPY.sitOut}
                </ActionButton>
            )}
        </div>
    );
};

const Dock = ({anims, look}: {anims: readonly LiveAnim[]; look: ResultLook | null}) => {
    const room = useRoom();
    const view = room.view;
    if (!view) return null;
    const disabled = room.problem !== null || room.mode === 'reconnecting';
    if (view.me.seat === null) {
        return (
            <section className="pn-dock" aria-label={HAND_COPY.yourHand} data-pn-dock="watching">
                <div className="pn-dock-row justify-center">
                    <p className={NOTE} role="status">{JOIN_COPY.watching}</p>
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
                    <HoleCards seat={dock.seat!} hole={dock.hole} holding={dock.dealtIn} handNo={hand?.no ?? null} anims={anims} look={look}/>
                    <div className="flex min-w-0 flex-col items-start gap-1">
                        {deadline !== null && <TurnClock deadline={deadline} turnMs={room.config.turnSeconds * 1000}/>}
                        {waitingFor !== null && (
                            <span className={`${NOTE} max-w-full truncate`} data-user-text="" data-pn-waiting="">{TABLE_COPY.waitingFor(waitingFor)}</span>
                        )}
                        <HandStrength strength={dock.strength}/>
                    </div>
                </div>
                <div className="pn-dock-actions">
                    {dock.myTurn ? (
                        <ActionBar key={view.turn} dock={dock} turn={view.turn} disabled={disabled}/>
                    ) : dock.pre ? (
                        <PreActions pre={dock.pre} disabled={disabled}/>
                    ) : (
                        <SeatControls dock={dock} disabled={disabled}/>
                    )}
                </div>
            </div>
        </section>
    );
};

export default Dock;
