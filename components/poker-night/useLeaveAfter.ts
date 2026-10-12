'use client';

// "Leave after this hand", sent and said: the dock's one-tap toggle, the note's Stay, the menu's
// toggle, the break's Leave and the leave dialog all send the room's 'leave-after' through this, so
// each says the same once it lands — "You leave the table when this hand ends." (with Stay, a 44 px
// action that takes it back), "You stay at the table.", or, for a leave sent between hands that a deal beat to
// the table, "A new hand was dealt first: you leave the table when it ends." A leave that left at
// once says nothing here: the dock's left panel shows. A refusal is said as the table words it.

import {useCallback, useState} from "react";
import {toast} from "sonner";
import {TOAST_ACTION} from "@/components/poker-night/overlay-kit";
import {useRoom} from "@/components/poker-night/room-controller";
import {TABLE_COPY} from "@/lib/learn/copy/poker-night";
import {leaveAfterLanded} from "@/lib/poker-night/overlays";

export type LeaveAfterSend = (on: boolean, opts?: {between?: boolean}) => Promise<boolean>;

export const useLeaveAfter = (): {busy: boolean; send: LeaveAfterSend} => {
    const room = useRoom();
    const [busy, setBusy] = useState(false);
    const {send: roomSend} = room;
    const send = useCallback<LeaveAfterSend>(async (on, opts = {}) => {
        setBusy(true);
        const r = await roomSend({type: 'leave-after', on});
        setBusy(false);
        if (!r.ok) {
            toast.error(r.message);
            return false;
        }
        if (!on) {
            toast.message(TABLE_COPY.leaveAfterCleared);
            return true;
        }
        // Gone at once (between hands, or folded with nothing to wait for): the left panel says it.
        if (!leaveAfterLanded(r.view)) return true;
        const text = opts.between ? TABLE_COPY.leaveLanded : TABLE_COPY.leaveAfterSet;
        toast.message(text, {
            id: 'pn-leave-after',
            classNames: TOAST_ACTION,
            action: {
                label: TABLE_COPY.stay,
                onClick: () => {
                    void roomSend({type: 'leave-after', on: false}).then((back) => {
                        if (back.ok) toast.message(TABLE_COPY.leaveAfterCleared);
                        else toast.error(back.message);
                    });
                },
            },
        });
        return true;
    }, [roomSend]);
    return {busy, send};
};
