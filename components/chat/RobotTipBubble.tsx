'use client';

import type {FocusEvent, Ref} from "react";
import {X} from "lucide-react";
import ActionButton from "@/components/primitives/ActionButton";
import {iconButton} from "@/components/primitives/iconButton";
import {ROBOT_COPY, type RobotTip} from "@/lib/learn/copy/robot";

// The robot's speech bubble (components/chat/ChatWidget mounts it over the launcher on the topics
// pages while the panel is closed): one tip as text, "Try it" when the tip carries a prompt — the
// widget types it into the composer and sends nothing — and an X that dismisses it. Floating
// chrome, so .chrome-surface and a .chrome-tail on the same tokens, never a Panel. Its controls
// say neither chat, assistant nor advisor: the browser QA finds the launcher by those words.
// It reports the reader's attention — the pointer resting on it, a control in it holding focus —
// so the widget can hold its hide timer: a tip never leaves mid-read or from under the keyboard.

export type RobotTipAttention = 'hover' | 'focus';

type RobotTipBubbleProps = {
    tip: RobotTip;
    onTry: (prompt: string) => void;
    onDismiss: () => void;
    // The pointer entering or leaving the bubble; focus arriving in it or leaving it.
    onAttention: (kind: RobotTipAttention, on: boolean) => void;
    ref?: Ref<HTMLDivElement>;
};

const RobotTipBubble = ({tip, onTry, onDismiss, onAttention, ref}: RobotTipBubbleProps) => {
    const prompt = tip.prompt;
    return (
        <div
            ref={ref}
            data-robot-tip={tip.id}
            onPointerEnter={() => onAttention('hover', true)}
            onPointerLeave={() => onAttention('hover', false)}
            onFocus={() => onAttention('focus', true)}
            // React's onBlur is focusout (bubbles): the hold ends only when focus leaves the bubble.
            onBlur={(e: FocusEvent<HTMLDivElement>) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onAttention('focus', false);
            }}
            // 12px above the 56px disc at its corner (bottom-5/right-5, bottom-6/right-6 from sm);
            // the tail's centre sits 28px in from the right edge, under the disc's centre.
            className="chrome-surface robot-tip-in fixed bottom-22 right-5 z-[80] w-max max-w-64 rounded-xl p-3 sm:bottom-23 sm:right-6"
        >
            <p role="status" className="text-sm leading-snug text-fg">{tip.text}</p>
            <div className="mt-2 flex items-center justify-end gap-1.5">
                {prompt && (
                    <ActionButton size="xs" onClick={() => onTry(prompt)}>{ROBOT_COPY.tryIt}</ActionButton>
                )}
                <button type="button" aria-label={ROBOT_COPY.dismiss} onClick={onDismiss} className={iconButton}>
                    <X className="size-4"/>
                </button>
            </div>
            <span aria-hidden="true" className="chrome-tail absolute -bottom-1.5 right-5.5 size-3 rotate-45"/>
        </div>
    );
};

export default RobotTipBubble;
