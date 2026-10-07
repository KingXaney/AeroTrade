'use client';

// The early choices, while the action is on someone else in a hand the viewer is still in: with
// nothing to call, Check/fold, Check or Call any; facing a bet, Check/fold, "Call 40" or Call any
// (lib/poker-night/dock.preOptions). They are the server's (the action route's 'pre'): the table
// makes the move when the turn comes round, even if this phone has gone to sleep, and clears a
// choice the betting has passed by. Pressing the chosen one again clears it. Chips that carry their
// own on and off state, so plain buttons with aria-pressed rather than ActionButton.

import {useState} from "react";
import {toast} from "sonner";
import {useRoom} from "@/components/poker-night/room-controller";
import {ACTION_COPY} from "@/lib/learn/copy/poker-night";
import {samePre, type DockView} from "@/lib/poker-night/dock";
import type {PreAction} from "@/lib/poker-night/types";
import {cn} from "@/lib/utils";

const keyOf = (p: PreAction): string => (p.kind === 'call' ? `call-${p.amount}` : p.kind);

const PreActions = ({pre, disabled}: {pre: NonNullable<DockView['pre']>; disabled: boolean}) => {
    const room = useRoom();
    const [pending, setPending] = useState<string | null>(null);

    const choose = async (option: PreAction) => {
        if (pending !== null || disabled) return;
        const next = samePre(option, pre.selected) ? null : option;
        setPending(keyOf(option));
        const r = await room.send({type: 'pre', pre: next});
        setPending(null);
        if (!r.ok) toast.error(r.message);
    };

    return (
        <div role="group" aria-label={ACTION_COPY.preHeading} className="chrome-surface flex items-stretch gap-1.5 rounded-[var(--control-radius)] p-1.5" data-pn-pre="">
            {pre.options.map((option) => {
                const on = samePre(option, pre.selected);
                const key = keyOf(option);
                return (
                    <button key={key} type="button" aria-pressed={on} disabled={disabled || pending !== null} aria-busy={pending === key}
                            onClick={() => void choose(option)} data-pre={key}
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
