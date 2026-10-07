'use client';

// The raise panel, opened from the action bar's Bet or Raise: the quick sizes (min, ½ pot, ¾ pot,
// pot, all in — lib/poker-night/bet-sizing, within the very limits the server checks), a slider that
// gives the small end most of its travel, the amount as a number ("1,250", "1.5k"), and the confirm
// button that names the total ("Raise to 340", "All in for 2,000"). Keys from the action bar: 1–4
// pick a quick size, A the all-in, Enter confirms, Escape closes — Enter and Escape in the amount
// field too. It floats over the table above the action bar, so opening it moves nothing; on a narrow
// dock (a phone), where the controls wrap under the cards, it rises from the whole dock instead, so
// the viewer's cards and seconds stay in sight (app/globals.css, @container pn-dock).

import {useId, useState} from "react";
import ActionButton from "@/components/primitives/ActionButton";
import TextField from "@/components/primitives/TextField";
import {ACTION_COPY, TABLE_COPY} from "@/lib/learn/copy/poker-night";
import {amountToSlider, clampTo, parseChips, quickSizes, SLIDER_MAX, sliderToAmount, type Sizing} from "@/lib/poker-night/bet-sizing";
import {KEY_SHORTCUTS} from "@/lib/poker-night/keys";
import {cn} from "@/lib/utils";

type Props = {
    sizing: Sizing;
    value: number;
    onValue: (to: number) => void;
    onConfirm: () => void;
    onClose: () => void;
    pending: boolean;
    disabled: boolean;
};

// The confirm button's words for a "raise to".
export const confirmLabel = (sizing: Sizing, to: number): string =>
    to >= sizing.max ? ACTION_COPY.allIn(sizing.max) : sizing.kind === 'bet' ? ACTION_COPY.bet(to) : ACTION_COPY.raiseTo(to);

const RaisePanel = ({sizing, value, onValue, onConfirm, onClose, pending, disabled}: Props) => {
    const id = useId();
    // The field's text while it is being typed; otherwise it shows the value.
    const [text, setText] = useState<string | null>(null);
    const sizes = quickSizes(sizing);
    return (
        <div className="pn-raise chrome-surface space-y-2 text-fg" role="group" aria-label={sizing.kind === 'bet' ? ACTION_COPY.openBet : ACTION_COPY.openRaise} data-pn-raise="">
            <div className="flex gap-1.5" role="group" aria-label={ACTION_COPY.sizesLabel}>
                {sizes.map((size, i) => (
                    <ActionButton key={size.id} variant={size.to === value ? 'primary' : 'secondary'} size="xs" className="min-h-11 flex-1 px-1"
                                  aria-pressed={size.to === value} aria-keyshortcuts={size.id === 'all-in' ? KEY_SHORTCUTS['all-in'] : i < 4 ? String(i + 1) : undefined}
                                  onClick={() => {
                                      setText(null);
                                      onValue(size.to);
                                  }} data-size={size.id}>
                        {ACTION_COPY.sizes[size.id]}
                    </ActionButton>
                ))}
            </div>
            <div className="flex items-center gap-2">
                <input type="range" min={0} max={SLIDER_MAX} step={1} value={amountToSlider(value, sizing)}
                       className={cn('h-11 min-w-0 flex-1 accent-brand')} aria-label={ACTION_COPY.sliderLabel} aria-valuetext={TABLE_COPY.chips(value)}
                       onChange={(e) => {
                           setText(null);
                           onValue(sliderToAmount(Number(e.target.value), sizing));
                       }} data-pn-slider=""/>
                <TextField inputMode="numeric" autoComplete="off" className="h-11 w-24 text-right" aria-label={ACTION_COPY.amountLabel} aria-describedby={`${id}-rule`}
                           value={text ?? TABLE_COPY.chips(value)}
                           onChange={(e) => {
                               setText(e.target.value);
                               const n = parseChips(e.target.value);
                               if (n !== null) onValue(clampTo(n, sizing));
                           }}
                           onBlur={() => setText(null)} data-pn-amount=""/>
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
