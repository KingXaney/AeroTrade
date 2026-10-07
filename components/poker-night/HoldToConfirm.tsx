'use client';

// A button that acts only when kept pressed: removing a player (RemovePlayerDialog). Pressing it —
// the pointer down, or Space or Enter held — starts a fill across it; letting go, sliding off or a
// cancelled touch before the fill is full empties it and nothing happens; a click alone does
// nothing. The fill is a CSS transition on a scaled bar for its look, and a JS timer is what acts,
// so the two never disagree about whether it happened. Under reduced motion the fill still shows,
// in steps rather than a glide, because it is the only sign the press is counting.

import {useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent} from "react";
import {Loader2} from "lucide-react";
import {cn} from "@/lib/utils";
import {HOLD_TO_CONFIRM_MS} from "@/lib/poker-night/overlays";

type Props = {
    label: string;
    hint: string; // how the press works, read with the button (aria-describedby)
    onConfirm: () => void;
    busy?: boolean;
    disabled?: boolean;
    durationMs?: number;
};

const reducedMotion = (): boolean =>
    document.documentElement.dataset.motion === 'reduced' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const HoldToConfirm = ({label, hint, onConfirm, busy = false, disabled = false, durationMs = HOLD_TO_CONFIRM_MS}: Props) => {
    const hintId = useId();
    // How the fill moves this press: null while nothing is pressed.
    const [press, setPress] = useState<{stepped: boolean} | null>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const stop = () => {
        if (timer.current !== null) clearTimeout(timer.current);
        timer.current = null;
    };

    // A dialog closed mid-press never acts later.
    useEffect(() => {
        const pending = timer;
        return () => {
            if (pending.current !== null) clearTimeout(pending.current);
        };
    }, []);

    const start = () => {
        if (disabled || busy || timer.current !== null) return;
        setPress({stepped: reducedMotion()});
        timer.current = setTimeout(() => {
            timer.current = null;
            setPress(null);
            onConfirm();
        }, durationMs);
    };

    const cancel = () => {
        if (timer.current === null) return;
        stop();
        setPress(null);
    };

    const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
        if (event.button !== 0) return;
        start();
    };

    const holdKey = (key: string) => key === ' ' || key === 'Enter';

    const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
        if (!holdKey(event.key)) return;
        // Neither key clicks the button or scrolls the dialog: the press itself is the action.
        event.preventDefault();
        if (!event.repeat) start();
    };

    const onKeyUp = (event: KeyboardEvent<HTMLButtonElement>) => {
        if (!holdKey(event.key)) return;
        event.preventDefault();
        cancel();
    };

    const holding = press !== null;
    return (
        <div className="space-y-1.5">
            <button
                type="button"
                aria-describedby={hintId}
                aria-disabled={disabled || busy}
                data-hold-confirm=""
                data-holding={holding ? '' : undefined}
                onPointerDown={onPointerDown}
                onPointerUp={cancel}
                onPointerLeave={cancel}
                onPointerCancel={cancel}
                onKeyDown={onKeyDown}
                onKeyUp={onKeyUp}
                onBlur={cancel}
                // A tap is not a press: nothing happens on click.
                onClick={(event) => event.preventDefault()}
                onContextMenu={(event) => event.preventDefault()}
                className={cn(
                    'control-type relative inline-flex min-h-11 w-full touch-none select-none items-center justify-center gap-2 overflow-hidden rounded-lg',
                    'border border-negative/40 px-4 py-2 text-xs text-negative transition-colors',
                    (disabled || busy) && 'opacity-50',
                )}
            >
                <span
                    aria-hidden="true"
                    className="absolute inset-0 origin-left bg-negative/25"
                    style={{
                        transform: holding ? 'scaleX(1)' : 'scaleX(0)',
                        transitionProperty: 'transform',
                        transitionDuration: holding ? `${durationMs}ms` : '0ms',
                        transitionTimingFunction: press?.stepped ? 'steps(8, end)' : 'linear',
                    }}
                />
                <span className="relative inline-flex items-center gap-2">
                    {busy && <Loader2 className="size-3.5 animate-spin" aria-hidden="true"/>}
                    {label}
                </span>
            </button>
            <p id={hintId} className="text-[11px] leading-relaxed text-fg-muted">{hint}</p>
        </div>
    );
};

export default HoldToConfirm;
