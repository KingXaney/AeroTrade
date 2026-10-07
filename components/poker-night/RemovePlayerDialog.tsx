'use client';

// "Remove from table", from a player's More menu in the host drawer: a dialog that names the player,
// says their chips are cashed out and that they can't rejoin unless the host lets them back in, and
// acts only on a press held for two seconds (HoldToConfirm) — never on a tap, and never by typing
// their name. "And lock the table" closes it to new players in the same go. The host's removal is
// the engine's 'kick' (the room bans that identity); the lock is the room's settings. A player dealt
// into the hand in play leaves when it ends (the engine keeps them in it, away), so the dialog says
// so and promises no figure. Closed because the host's own turn came round, it hands the focus to
// the action bar.

import {useId, useState} from "react";
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from "@/components/ui/dialog";
import ActionButton from "@/components/primitives/ActionButton";
import HoldToConfirm from "@/components/poker-night/HoldToConfirm";
import {focusTableOnClose, MiniAvatar} from "@/components/poker-night/overlay-kit";
import {HOST_COPY} from "@/lib/learn/copy/poker-night";

export type RemoveTarget = {pid: string; name: string; avatar: string | null; chips: number; dealtIn: boolean};

type Props = {
    target: RemoveTarget | null;
    locked: boolean; // the table is locked already: no box to tick
    toTable: boolean; // it closed because the viewer's turn came round
    onClose: () => void;
    onRemove: (target: RemoveTarget, lockToo: boolean) => Promise<boolean>; // true once removed
};

const RemovePlayerDialog = ({target, locked, toTable, onClose, onRemove}: Props) => {
    const lockId = useId();
    const [lockToo, setLockToo] = useState(false);
    const [busy, setBusy] = useState(false);

    const close = (open: boolean) => {
        if (open || busy) return;
        setLockToo(false);
        onClose();
    };

    const remove = async () => {
        if (!target || busy) return;
        setBusy(true);
        const removed = await onRemove(target, lockToo && !locked);
        setBusy(false);
        if (removed) {
            setLockToo(false);
            onClose();
        }
    };

    return (
        <Dialog open={target !== null} onOpenChange={close}>
            <DialogContent className="sm:max-w-md" onCloseAutoFocus={focusTableOnClose(toTable)} data-remove-dialog="">
                {target && (
                    <>
                        <DialogHeader>
                            <div className="flex items-center gap-3">
                                <MiniAvatar avatar={target.avatar} size="md"/>
                                <DialogTitle className="font-heading min-w-0 break-words">{HOST_COPY.removeTitle(target.name)}</DialogTitle>
                            </div>
                            <DialogDescription className="text-fg-soft">
                                {target.dealtIn ? HOST_COPY.removeBodyInHand(target.name) : HOST_COPY.removeBody(target.name, target.chips)}
                            </DialogDescription>
                            {target.dealtIn && <p className="text-xs text-fg-muted">{HOST_COPY.removeInHand}</p>}
                        </DialogHeader>
                        {!locked && (
                            <label htmlFor={lockId} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-fg-soft">
                                <input id={lockId} type="checkbox" checked={lockToo} disabled={busy} data-lock-too=""
                                       onChange={(e) => setLockToo(e.target.checked)} className="size-5 accent-brand"/>
                                {HOST_COPY.lockToo}
                            </label>
                        )}
                        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-start">
                            {/* Cancel first, and focused, so a keyboard lands on the safe action. */}
                            <ActionButton variant="secondary" size="md" autoFocus className="min-h-11 sm:w-auto" disabled={busy}
                                          onClick={() => close(false)}>
                                {HOST_COPY.cancel}
                            </ActionButton>
                            <div className="flex-1">
                                <HoldToConfirm label={HOST_COPY.pressAndHold} hint={HOST_COPY.pressAndHoldHint} busy={busy} onConfirm={() => void remove()}/>
                            </div>
                        </div>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
};

export default RemovePlayerDialog;
