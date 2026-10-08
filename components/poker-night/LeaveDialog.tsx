'use client';

// The leave dialog: from the menu's "Leave table", the dock's Leave when sitting down again is not
// assured, and the top bar's Home for a seated player. What it says and offers is
// lib/poker-night/overlays.leavePlan, read on every render — a deal that lands while it is open
// turns it into the mid-hand dialog before the player confirms ("Leave in the middle of a hand?",
// the hand folding the next time it faces a bet), and the button keeps its place as its label
// changes. Home's buttons leave and then load "/" in full ("Leave and go"), so the table's
// connection, wake lock and sounds end with the page; Stay keeps everything as it is. On a phone the
// buttons are full width, the one that acts at the bottom.

import {useState} from "react";
import {toast} from "sonner";
import {Loader2} from "lucide-react";
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from "@/components/ui/dialog";
import ActionButton from "@/components/primitives/ActionButton";
import {focusTableOnClose} from "@/components/poker-night/overlay-kit";
import {goHome} from "@/components/poker-night/HomeLink";
import {useRoom} from "@/components/poker-night/room-controller";
import {TABLE_COPY} from "@/lib/learn/copy/poker-night";
import {leavePlan, type LeaveAction, type LeaveThen} from "@/lib/poker-night/overlays";

type Props = {
    then: LeaveThen | null; // null: closed
    toTable: boolean; // it closed because the viewer's turn came round
    onClose: () => void;
};

const LeaveDialog = ({then, toTable, onClose}: Props) => {
    const room = useRoom();
    const [busy, setBusy] = useState<LeaveAction['send'] | null>(null);
    const plan = then && room.view ? leavePlan(room.view, then) : null;
    const open = plan !== null;

    const act = async (action: LeaveAction) => {
        if (busy) return;
        setBusy(action.send);
        const r = await room.send({type: action.send});
        if (!r.ok) {
            setBusy(null);
            toast.error(r.message);
            return;
        }
        if (action.navigates) {
            // The page goes; the dialog waits with it.
            goHome();
            return;
        }
        setBusy(null);
        onClose();
    };

    return (
        <Dialog open={open} onOpenChange={(next) => {
            if (!next && !busy) onClose();
        }}>
            {/* No corner ✕: Stay is the way to close it (and Escape), a full 44 px target where the
                dialog's own close button would be a 28 px one on a phone. */}
            <DialogContent showCloseButton={false} className="sm:max-w-md" onCloseAutoFocus={focusTableOnClose(toTable)}
                           data-pn-leave-dialog={plan ? (plan.midHand ? 'mid-hand' : 'between') : undefined} data-pn-leave-then={then ?? undefined}>
                {plan && (
                    <>
                        <DialogHeader>
                            <DialogTitle className="font-heading">{plan.title}</DialogTitle>
                            <DialogDescription>{plan.body}</DialogDescription>
                        </DialogHeader>
                        {plan.note && <p className="text-xs text-fg-muted" data-pn-leave-note="">{plan.note}</p>}
                        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:justify-end">
                            {/* Stay first, so the keyboard lands on the safe choice. */}
                            <ActionButton variant="secondary" size="md" className="min-h-11 w-full sm:w-auto" autoFocus disabled={busy !== null}
                                          onClick={onClose} data-pn-leave="stay">
                                {TABLE_COPY.stay}
                            </ActionButton>
                            {plan.actions.map((action) => (
                                <ActionButton key={action.send} variant={action.destructive ? 'destructive' : 'primary'} size="md"
                                              className="inline-flex min-h-11 w-full items-center justify-center gap-2 sm:w-auto" disabled={busy !== null}
                                              aria-busy={busy === action.send} onClick={() => void act(action)} data-pn-leave={action.send}>
                                    {busy === action.send && <Loader2 className="size-3.5 animate-spin" aria-hidden="true"/>}
                                    {action.label}
                                </ActionButton>
                            ))}
                        </div>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
};

export default LeaveDialog;
