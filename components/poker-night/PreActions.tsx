'use client';

// The early choices, while the action is on someone else in a hand the viewer is still in: with
// nothing to call, Check/fold, Check or Call any; facing a bet, Check/fold, "Call 40" or Call any
// (lib/poker-night/dock.preOptions). They are the server's (the action route's 'pre'): the table
// makes the move when the turn comes round, even if this phone has gone to sleep, and clears a
// choice the betting has passed by. Pressing the chosen one again clears it. Chips that carry their
// own on and off state, so plain buttons with aria-pressed rather than ActionButton.
//
// The row takes the place of the break's Show, Sit out and Leave at every deal, and a "Check" here
// becomes "Call 40" when a bet comes in: the Dock remounts it for each hand and each set of choices
// (dock.preRowKey), and a pointer tap within lib/poker-night/keys.TAP_SHIELD_MS of it appearing is dropped
// (useTapShield) — it was aimed at what was there before, and a choice made here plays a move by
// itself when the turn comes. The row carries data-pn-armed once taps land; a keyboard's click
// always does.

import {useState, type MouseEvent} from "react";
import {toast} from "sonner";
import {useRoom} from "@/components/poker-night/room-controller";
import {useTapShield} from "@/components/poker-night/useTapShield";
import {ACTION_COPY} from "@/lib/learn/copy/poker-night";
import {preKeyOf, samePre, type DockView} from "@/lib/poker-night/dock";
import type {PreAction} from "@/lib/poker-night/types";
import {cn} from "@/lib/utils";


const PreActions = ({pre, disabled}: {pre: NonNullable<DockView['pre']>; disabled: boolean}) => {
    const room = useRoom();
    const [pending, setPending] = useState<string | null>(null);
    const shield = useTapShield();

    const choose = async (option: PreAction, e: MouseEvent<HTMLButtonElement>) => {
        // A tap that lands as the row appears was meant for what was there before.
        if (pending !== null || disabled || !shield.lands(e)) return;
        const next = samePre(option, pre.selected) ? null : option;
        setPending(preKeyOf(option));
        const r = await room.send({type: 'pre', pre: next});
        setPending(null);
        if (!r.ok) toast.error(r.message);
    };

    return (
        <div role="group" aria-label={ACTION_COPY.preHeading} className="chrome-surface flex items-stretch gap-1.5 rounded-[var(--control-radius)] p-1.5" data-pn-pre=""
             data-pn-armed={shield.armed ? '' : undefined}>
            {pre.options.map((option) => {
                const on = samePre(option, pre.selected);
                const key = preKeyOf(option);
                return (
                    <button key={key} type="button" aria-pressed={on} disabled={disabled || pending !== null} aria-busy={pending === key}
                            onClick={(e) => void choose(option, e)} data-pre={key}
                            className={cn(
                                'control-type min-h-12 flex-1 rounded-[var(--control-radius)] border px-2 text-xs transition-colors disabled:opacity-60',
                                on ? 'border-brand bg-brand text-on-brand' : 'border-line-strong/40 text-fg-soft hover:text-fg',
                            )}>
                        {ACTION_COPY.pre(option)}
                    </button>
                );
            })}
        </div>
    );
};

export default PreActions;
