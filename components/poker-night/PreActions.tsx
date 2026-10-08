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
//
// A label never spills into its neighbour: in the narrow docks of a phone on its side a button is
// narrower than "Check/fold": each button takes its share by its label (flex-auto, so the longest gets
// the most), none narrower than 44 px or its longest word: a grid whose one column is 30 px at least
// (44 with the padding and border), so the flex item's own minimum, its min-content, is the wider of
// the two — where "overflow-wrap: anywhere" and a bare 44 px minimum let "Check" shrink to "Chec" over
// "k". The label breaks only at a space or after the slash (a <wbr>): a word drawn over the next
// button would make a tap on it choose that one.

import {Fragment, useState, type MouseEvent} from "react";
import {toast} from "sonner";
import {useRoom} from "@/components/poker-night/room-controller";
import {useTapShield} from "@/components/poker-night/useTapShield";
import {ACTION_COPY} from "@/lib/learn/copy/poker-night";
import {preKeyOf, samePre, type DockView} from "@/lib/poker-night/dock";
import type {PreAction} from "@/lib/poker-night/types";
import {cn} from "@/lib/utils";


// A label with a line break offered after each slash ("Check/" "fold").
const breakable = (text: string) => text.split('/').map((part, i, all) => (
    <Fragment key={i}>{part}{i < all.length - 1 && <>/<wbr/></>}</Fragment>
));

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
        <div role="group" aria-label={ACTION_COPY.preHeading} className="chrome-surface flex min-w-0 items-stretch gap-1.5 rounded-[var(--control-radius)] p-1.5" data-pn-pre=""
             data-pn-armed={shield.armed ? '' : undefined}>
            {pre.options.map((option) => {
                const on = samePre(option, pre.selected);
                const key = preKeyOf(option);
                return (
                    <button key={key} type="button" aria-pressed={on} disabled={disabled || pending !== null} aria-busy={pending === key}
                            onClick={(e) => void choose(option, e)} data-pre={key}
                            className={cn(
                                'control-type grid min-h-12 flex-auto grid-cols-[minmax(1.875rem,auto)] place-items-center whitespace-normal rounded-[var(--control-radius)] border px-1.5 text-xs leading-tight transition-colors disabled:opacity-60',
                                on ? 'border-brand bg-brand text-on-brand' : 'border-line-strong/40 text-fg-soft hover:text-fg',
                            )}>
                        <span>{breakable(ACTION_COPY.pre(option))}</span>
                    </button>
                );
            })}
        </div>
    );
};

export default PreActions;
