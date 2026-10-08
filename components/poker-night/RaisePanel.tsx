'use client';

// The raise panel, opened from the action bar's Bet or Raise: the quick sizes (min, ½ pot, ¾ pot,
// pot, all in — lib/poker-night/bet-sizing, within the very limits the server checks; in PLO the pot
// is the top whenever the stack goes past it), a slider that gives the small end most of its travel,
// the amount as a number ("1,250", "1.5k"), and the confirm button that names the total ("Raise to
// 340", "All in for 2,000", "Raise to 340 (pot)"), with a "−" and a "+" (44 px) round the amount that
// step a big blind at a time (bet-sizing.stepRaise: "20 less", "20 more"), since a slider's thumb is
// hard to move finely under a thumb — the slider takes a row of its own where the dock is narrow. It
// opens at the size the player last chose on this half of the hand (before or after the flop), when
// this turn offers it (the action bar's memory, bet-sizing.initialRaiseTo). Keys from the action bar: 1–4 pick a quick size,
// A the top (all in, or the pot in PLO), Enter confirms, Escape closes — Enter and Escape in the
// amount field too. It floats over the table above the action bar, so opening it moves nothing; on a narrow
// dock (a phone), where the controls wrap under the cards, it rises from the whole dock instead, so
// the viewer's cards and seconds stay in sight (app/globals.css, @container pn-dock); on a phone on its
// side, beside the dock's column, over the felt's right side.

import {useId, useState} from "react";
import {Minus, Plus} from "lucide-react";
import ActionButton from "@/components/primitives/ActionButton";
import TextField from "@/components/primitives/TextField";
import {ACTION_COPY, TABLE_COPY} from "@/lib/learn/copy/poker-night";
import {amountToSlider, clampTo, confirmLabel, parseChips, quickSizes, SLIDER_MAX, sliderToAmount, stepRaise, type Sizing} from "@/lib/poker-night/bet-sizing";
import {KEY_SHORTCUTS} from "@/lib/poker-night/keys";
import {cn} from "@/lib/utils";

type Props = {
    sizing: Sizing;
    step: number; // the steppers' step: the big blind
    value: number;
    onValue: (to: number) => void;
    onConfirm: () => void;
    onClose: () => void;
    pending: boolean;
    disabled: boolean;
};

const STEPPER = 'size-11 shrink-0 p-0';

const RaisePanel = ({sizing, step, value, onValue, onConfirm, onClose, pending, disabled}: Props) => {
    const id = useId();
    // The field's text while it is being typed; otherwise it shows the value.
    const [text, setText] = useState<string | null>(null);
    const sizes = quickSizes(sizing);
    return (
        <div className="pn-raise chrome-surface space-y-2 text-fg" role="group" aria-label={sizing.kind === 'bet' ? ACTION_COPY.openBet : ACTION_COPY.openRaise} data-pn-raise="">
            <div className="flex gap-1.5" role="group" aria-label={ACTION_COPY.sizesLabel}>
                {sizes.map((size, i) => (
                    <ActionButton key={size.id} variant={size.to === value ? 'primary' : 'secondary'} size="xs" className="min-h-11 flex-1 px-1"
                                  aria-pressed={size.to === value} aria-keyshortcuts={size.to === sizing.max ? KEY_SHORTCUTS['all-in'] : i < 4 ? String(i + 1) : undefined}
                                  onClick={() => {
                                      setText(null);
                                      onValue(size.to);
                                  }} data-size={size.id}>
                        {ACTION_COPY.sizes[size.id]}
                    </ActionButton>
                ))}
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <input type="range" min={0} max={SLIDER_MAX} step={1} value={amountToSlider(value, sizing)}
                       className={cn('h-11 min-w-0 flex-[1_1_8rem] accent-brand')} aria-label={ACTION_COPY.sliderLabel} aria-valuetext={TABLE_COPY.chips(value)}
                       onChange={(e) => {
                           setText(null);
                           onValue(sliderToAmount(Number(e.target.value), sizing));
                       }} data-pn-slider=""/>
                <div className="flex flex-auto items-center justify-end gap-1">
                    <ActionButton variant="secondary" size="xs" className={STEPPER} aria-label={ACTION_COPY.less(step)} title={ACTION_COPY.less(step)} disabled={value <= sizing.min}
                                  onClick={() => {
                                      setText(null);
                                      onValue(stepRaise(sizing, value, -1, step));
                                  }} data-pn-step="less">
                        <Minus className="size-4" aria-hidden="true"/>
                    </ActionButton>
                    <TextField inputMode="numeric" autoComplete="off" className="h-11 w-20 min-w-0 text-right" aria-label={ACTION_COPY.amountLabel} aria-describedby={`${id}-rule`}
                               value={text ?? TABLE_COPY.chips(value)}
                               onChange={(e) => {
                                   setText(e.target.value);
                                   const n = parseChips(e.target.value);
                                   if (n !== null) onValue(clampTo(n, sizing));
                               }}
                               onBlur={() => setText(null)} data-pn-amount=""/>
                    <ActionButton variant="secondary" size="xs" className={STEPPER} aria-label={ACTION_COPY.more(step)} title={ACTION_COPY.more(step)} disabled={value >= sizing.max}
                                  onClick={() => {
                                      setText(null);
                                      onValue(stepRaise(sizing, value, 1, step));
                                  }} data-pn-step="more">
                        <Plus className="size-4" aria-hidden="true"/>
                    </ActionButton>
                </div>
            </div>
            <p id={`${id}-rule`} className="text-[11px] text-fg-muted">{ACTION_COPY.amountRule(sizing.min, sizing.max)}</p>
            <div className="flex gap-1.5">
                <ActionButton variant="secondary" size="md" className="min-h-11" onClick={onClose} aria-keyshortcuts={KEY_SHORTCUTS.close} data-pn-back="">{ACTION_COPY.back}</ActionButton>
                <ActionButton variant="strong" size="md" glow className="min-h-11 flex-1" onClick={onConfirm} disabled={pending || disabled} aria-busy={pending}
                              aria-keyshortcuts={KEY_SHORTCUTS.confirm} data-pn-action="confirm">
                    {pending ? ACTION_COPY.sending : confirmLabel(sizing, value)}
                </ActionButton>
            </div>
        </div>
    );
};

export default RaisePanel;
