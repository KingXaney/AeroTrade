'use client';

// One radio group of swatches — the avatar builder's faces, colours, frames and badges, the look
// pickers' scenes, felts, card backs, card faces and chip sets: role="radiogroup" with one
// role="radio" button per choice, aria-checked on the chosen one, a roving tab stop (only the chosen
// choice is in the tab order) and the arrow keys, Home and End moving the choice
// (lib/poker-night/picker.stepChoice). A choice's name is its accessible name and its tooltip; what
// it draws is the caller's. Every button is at least 44 px each way.

import {useRef, type KeyboardEvent, type ReactNode} from "react";
import {stepChoice} from "@/lib/poker-night/picker";
import {cn} from "@/lib/utils";

type Props<T extends string> = {
    label: string;
    ids: readonly T[];
    value: T;
    onChange: (id: T) => void;
    name: (id: T) => string;
    render: (id: T, checked: boolean) => ReactNode;
    disabled?: boolean;
    className?: string; // the group's layout (a grid or a row)
    optionClassName?: string;
    hook: string; // data-pn-choice on the group, data-pn-option on each choice: the hooks a test reads
};

const ChoiceGroup = <T extends string>({label, ids, value, onChange, name, render, disabled = false, className, optionClassName, hook}: Props<T>) => {
    const buttons = useRef<(HTMLButtonElement | null)[]>([]);
    const at = Math.max(0, ids.indexOf(value));

    const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
        const next = stepChoice(index, event.key, ids.length);
        if (next === null) return;
        event.preventDefault();
        onChange(ids[next]);
        buttons.current[next]?.focus();
    };

    return (
        <div role="radiogroup" aria-label={label} aria-disabled={disabled || undefined} className={className} data-pn-choice={hook}>
            {ids.map((id, i) => {
                const checked = id === value;
                return (
                    <button
                        key={id}
                        ref={(el) => {
                            buttons.current[i] = el;
                        }}
                        type="button"
                        role="radio"
                        aria-checked={checked}
                        aria-label={name(id)}
                        title={name(id)}
                        tabIndex={i === at ? 0 : -1}
                        disabled={disabled}
                        className={cn(
                            'relative grid min-h-11 min-w-11 place-items-center rounded-lg outline-offset-2 transition-colors',
                            'hover:bg-surface-3/60 focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-50',
                            checked && 'bg-surface-3/70 outline-2 outline-brand',
                            optionClassName,
                        )}
                        onClick={() => onChange(id)}
                        onKeyDown={(event) => onKeyDown(event, i)}
                        data-pn-option={id}
                    >
                        {render(id, checked)}
                    </button>
                );
            })}
        </div>
    );
};

export default ChoiceGroup;
