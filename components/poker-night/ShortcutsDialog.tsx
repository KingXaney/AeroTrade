'use client';

// The table's keys, listed (P6): opened by "?" (with the focus on the table) and from the top bar's
// menu (emote-client.openShortcuts), it shows every key lib/poker-night/keys answers — the moves on
// the viewer's turn, then the room's own — each worded by SHORTCUTS_COPY. While the player keeps the
// single-key shortcuts off (My look), it says so first. It closes when the viewer's turn comes round
// and hands the focus to the action bar, as the drawers do.

import {useState} from "react";
import {X} from "lucide-react";
import {Dialog, DialogContent, DialogDescription, DialogTitle} from "@/components/ui/dialog";
import {iconButton} from "@/components/primitives/iconButton";
import {latestShortcutsRequest, useShortcutsRequest} from "@/components/poker-night/emote-client";
import {focusTableOnClose} from "@/components/poker-night/overlay-kit";
import {useRoom} from "@/components/poker-night/room-controller";
import {OVERLAY_COPY, SHORTCUTS_COPY} from "@/lib/learn/copy/poker-night";
import {SHORTCUTS, type ShortcutGroup} from "@/lib/poker-night/keys";
import {myTurnKey} from "@/lib/poker-night/overlays";
import {cn} from "@/lib/utils";

const GROUPS = Object.keys(SHORTCUTS) as ShortcutGroup[];

type Ui = {open: boolean; requestSeen: number; turnSeen: number | null; closedByTurn: boolean};

const ShortcutsDialog = () => {
    const room = useRoom();
    const request = useShortcutsRequest();
    const turnKey = myTurnKey(room.view);
    const [ui, setUi] = useState<Ui>(() => ({open: false, requestSeen: latestShortcutsRequest(), turnSeen: turnKey, closedByTurn: false}));

    let next = ui;
    if (request && request.id > next.requestSeen) next = {...next, requestSeen: request.id, open: true, closedByTurn: false};
    if (turnKey !== next.turnSeen) next = {...next, turnSeen: turnKey, ...(turnKey !== null && next.open ? {open: false, closedByTurn: true} : {})};
    if (next !== ui) setUi(next);

    const close = () => setUi((prev) => ({...prev, open: false}));

    return (
        <Dialog open={ui.open} onOpenChange={(open) => (open ? undefined : close())}>
            <DialogContent showCloseButton={false} className="max-h-[85dvh] gap-3 overflow-y-auto text-fg sm:max-w-md" onCloseAutoFocus={focusTableOnClose(ui.closedByTurn)}
                           data-pn-shortcuts-dialog="">
                <div className="flex items-start justify-between gap-3">
                    <DialogTitle className="heading-type pt-2 text-base text-fg">{SHORTCUTS_COPY.title}</DialogTitle>
                    <button type="button" className={cn(iconButton, 'size-11 shrink-0')} aria-label={OVERLAY_COPY.close} onClick={close}>
                        <X className="size-5" aria-hidden="true"/>
                    </button>
                </div>
                <DialogDescription className="text-xs leading-relaxed text-fg-muted">
                    {room.personal.shortcuts ? SHORTCUTS_COPY.lead : SHORTCUTS_COPY.off}
                </DialogDescription>
                {GROUPS.map((group) => (
                    <section key={group} className="space-y-1.5" aria-labelledby={`pn-keys-${group}`}>
                        <h3 id={`pn-keys-${group}`} className="label-type text-[11px] text-fg-muted">{SHORTCUTS_COPY.groups[group]}</h3>
                        <dl className="divide-y divide-line-strong/15 rounded-lg border border-line-strong/20">
                            {SHORTCUTS[group].map((s) => (
                                <div key={s.id} className="flex items-center justify-between gap-3 px-3 py-2" data-shortcut={s.id}>
                                    <dt className="text-sm text-fg-soft">{SHORTCUTS_COPY.does[s.id]}</dt>
                                    <dd className="flex shrink-0 gap-1">
                                        {s.keys.map((k) => (
                                            <kbd key={k} className="min-w-7 rounded-md border border-line-strong/40 bg-surface-2 px-1.5 py-0.5 text-center font-mono text-xs text-fg">{k}</kbd>
                                        ))}
                                    </dd>
                                </div>
                            ))}
                        </dl>
                    </section>
                ))}
            </DialogContent>
        </Dialog>
    );
};

export default ShortcutsDialog;
