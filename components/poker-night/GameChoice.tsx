'use client';

// The game a table deals, as one card per game this deploy deals (lib/poker-night/lobby
// GAME_CHOICES: Texas hold'em first, then PLO): its name and what each player is dealt, with the
// betting limit (MODE_COPY.pick) — what the game is, the Hands guide says. A radio group of 44 px or
// taller cards side by side (ChoiceGroup: arrows, Home and End move the choice), each card's
// accessible name its spoken name with that line. The lobby's start form and the host drawer's Game
// section both draw it; a change there applies from the next hand.

import ChoiceGroup from "@/components/poker-night/ChoiceGroup";
import {MODE_COPY} from "@/lib/learn/copy/poker-night";
import {GAME_CHOICES} from "@/lib/poker-night/lobby";
import type {Variant} from "@/lib/poker-night/types";

type Props = {
    value: Variant;
    onChange: (variant: Variant) => void;
    hook: string; // data-pn-choice on the group
    disabled?: boolean;
};

const GameChoice = ({value, onChange, hook, disabled = false}: Props) => (
    <ChoiceGroup<Variant>
        label={MODE_COPY.gameLabel}
        ids={GAME_CHOICES}
        value={value}
        onChange={onChange}
        name={(variant) => `${MODE_COPY.spoken[variant]}: ${MODE_COPY.pick[variant]}`}
        disabled={disabled}
        className={GAME_CHOICES.length <= 2 ? 'grid grid-cols-2 gap-2' : 'grid grid-cols-1 gap-2 sm:grid-cols-3'}
        optionClassName="min-h-14 place-items-start content-center border border-line-strong/40 px-3 py-2 text-left"
        hook={hook}
        render={(variant) => (
            <span className="grid gap-0.5">
                <span className="text-sm font-medium text-fg">{MODE_COPY.short[variant]}</span>
                <span className="text-[11px] leading-snug text-fg-muted">{MODE_COPY.pick[variant]}</span>
            </span>
        )}
    />
);

export default GameChoice;
