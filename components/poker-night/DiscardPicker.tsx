'use client';

// Triple T's throw-away, in the viewer's dock (P7): right after the deal everyone still in throws one
// of their three cards away at the same time, on one clock. The three cards are a radio group ("Card
// to throw away"), each card a radio of 44 px or more: a tap picks it — again and again, never a
// toggle — and the card picked rises, dims and carries an ✕; arrows, Home and End move the pick
// (lib/poker-night/picker.stepChoice, the focus with it), and Enter on the card picked throws it. The
// confirm under them (ThrowAwayButton), full width, names the card ("Throw away 7♣︎"), or says "Pick a
// card first" while none is; it sends the room's 'discard' with the turn the throw-away opened at,
// and waits ("Throwing away…") while that is on its way. Keys with the focus on the table: 1, 2 and 3
// pick a card, Enter throws the card picked, Escape takes the pick back (lib/poker-night/keys
// .discardIntentForKey; the digits only while the player keeps single-key shortcuts on). When the
// throw-away starts the focus moves to the group, unless the viewer is typing or a dialog holds it.
// Both the cards and the confirm drop a tap that lands within keys.TAP_SHIELD_MS of their appearing
// (useTapShield): the thumb was on its way to something the deal took away.
//
// With Peek on (the personal look's `peek`) the three are drawn face down until the viewer presses on
// them — a pointer held anywhere on them, or Space held on one — and letting go on a card picks it; a
// card's name and the confirm's never say which card it is while they are face down.
//
// The pick is the dock's (useThrowAway), kept for the hand it was made in: a reload or a new hand
// starts with none. A refusal (the deadline passed) is said in a toast, and the view brings the card
// the clock threw away instead.

import {useEffect, useEffectEvent, useRef, useState, type KeyboardEvent} from "react";
import {toast} from "sonner";
import {X} from "lucide-react";
import ActionButton from "@/components/primitives/ActionButton";
import PlayingCard from "@/components/poker-night/PlayingCard";
import {useRoom} from "@/components/poker-night/room-controller";
import {useTapShield} from "@/components/poker-night/useTapShield";
import {DISCARD_COPY, HAND_COPY} from "@/lib/learn/copy/poker-night";
import type {Card} from "@/lib/poker/cards";
import {DISCARD_KEY_SHORTCUTS, discardIntentForKey, isControlTarget, isEditableTarget, keyAllowed, type FocusPlace} from "@/lib/poker-night/keys";
import {stepChoice} from "@/lib/poker-night/picker";
import {cn} from "@/lib/utils";

export type ThrowAway = {
    picked: Card | null;
    pick: (card: Card) => void;
    unpick: () => void;
    throwAway: () => Promise<void>;
    busy: boolean;
};

// The card picked to throw away, for the hand it was picked in, and the throw itself.
export const useThrowAway = (handNo: number | null, turn: number): ThrowAway => {
    const room = useRoom();
    const [pick, setPick] = useState<{hand: number | null; card: Card | null}>({hand: null, card: null});
    const [busy, setBusy] = useState(false);
    const picked = pick.hand === handNo ? pick.card : null;
    const throwAway = async () => {
        if (picked === null || busy) return;
        setBusy(true);
        const r = await room.send({type: 'discard', turn, card: picked});
        setBusy(false);
        if (!r.ok) toast.error(r.message);
    };
    return {picked, pick: (card) => setPick({hand: handNo, card}), unpick: () => setPick({hand: handNo, card: null}), throwAway, busy};
};

// A keydown aimed at a dialog, a menu or a drawer belongs to it.
const insideOverlay = (target: EventTarget | null): boolean =>
    target instanceof Element && target.closest('[role="dialog"], [role="menu"], [data-slot="sheet-content"], [data-slot="dialog-content"], [data-slot="popover-content"]') !== null;

// Where a keydown's focus is: the page itself, the table and the dock, or anywhere else.
const placeOf = (target: EventTarget | null): FocusPlace => {
    if (!(target instanceof Element) || target === document.body || target === document.documentElement) return 'body';
    return target.closest('[data-pn-dock], .pn-table') ? 'table' : 'elsewhere';
};

type PickerProps = {
    cards: readonly Card[];
    throwing: ThrowAway;
    disabled: boolean;
    // Peek: null when it is off; else whether the viewer is pressing now, and how to say so.
    peek: {peeking: boolean; onPeek: (peeking: boolean) => void} | null;
};

export const DiscardPicker = ({cards, throwing, disabled, peek}: PickerProps) => {
    const room = useRoom();
    const shield = useTapShield();
    const group = useRef<HTMLDivElement>(null);
    const radios = useRef<(HTMLButtonElement | null)[]>([]);
    const {picked, pick, unpick, throwAway, busy} = throwing;
    const hidden = peek !== null && !peek.peeking;
    const off = disabled || busy;
    const at = picked === null ? -1 : cards.indexOf(picked);
    const focusAt = (k: number) => radios.current[k]?.focus({preventScroll: true});
    const choose = (k: number) => {
        const card = cards[k];
        if (card === undefined || off) return;
        pick(card);
        focusAt(k);
    };

    // The keys with the focus on the table: 1–3 pick, Enter throws, Escape takes the pick back.
    const onKey = useEffectEvent((e: globalThis.KeyboardEvent) => {
        if (e.defaultPrevented || insideOverlay(e.target)) return;
        if (!keyAllowed(e.key, placeOf(e.target), room.personal.shortcuts)) return;
        const intent = discardIntentForKey({
            key: e.key, metaKey: e.metaKey, ctrlKey: e.ctrlKey, altKey: e.altKey, repeat: e.repeat,
            editable: isEditableTarget(e.target), control: isControlTarget(e.target),
        }, {picked: picked !== null});
        if (!intent) return;
        e.preventDefault();
        if (intent === 'throw') void throwAway();
        else if (intent === 'unpick') unpick();
        else choose(Number(intent.slice(-1)) - 1);
    });
    useEffect(() => {
        const listener = (e: globalThis.KeyboardEvent) => onKey(e);
        window.addEventListener('keydown', listener);
        return () => window.removeEventListener('keydown', listener);
    }, []);

    // The throw-away has started: the cards take the focus, unless the viewer is busy elsewhere.
    useEffect(() => {
        const el = group.current;
        if (!el) return;
        const active = document.activeElement;
        const scope = el.closest('main');
        if (active && active !== document.body && !(scope?.contains(active) ?? false)) return;
        if (isEditableTarget(active) || insideOverlay(active)) return;
        radios.current[0]?.focus({preventScroll: true});
    }, []);

    // A pointer let go anywhere ends a peek; on a card, it picks that card (the card's own pointerup).
    useEffect(() => {
        if (!peek?.peeking) return;
        const end = () => peek.onPeek(false);
        window.addEventListener('pointerup', end);
        window.addEventListener('pointercancel', end);
        return () => {
            window.removeEventListener('pointerup', end);
            window.removeEventListener('pointercancel', end);
        };
    }, [peek]);

    const onCardKey = (event: KeyboardEvent<HTMLButtonElement>, k: number) => {
        if (event.key === 'Enter') {
            // Enter on the card picked throws it; on another, picks that one.
            event.preventDefault();
            if (event.repeat) return;
            if (cards[k] === picked) void throwAway();
            else choose(k);
            return;
        }
        if (peek && event.key === ' ') {
            // Space held shows the cards; let go, it picks the one with the focus.
            event.preventDefault();
            if (!event.repeat) peek.onPeek(true);
            return;
        }
        const next = stepChoice(k, event.key, cards.length);
        if (next === null) return;
        event.preventDefault();
        choose(next);
    };

    return (
        <div ref={group} role="radiogroup" aria-label={DISCARD_COPY.groupLabel} className="pn-hole pn-pick" data-pn-hole="" data-pn-pick=""
             data-count={cards.length} data-slots={cards.length} data-pn-armed={shield.armed ? '' : undefined} data-pn-peek={peek ? (hidden ? 'hidden' : 'shown') : undefined}>
            {cards.map((card, k) => {
                const checked = card === picked;
                return (
                    <button
                        key={card}
                        ref={(el) => {
                            radios.current[k] = el;
                        }}
                        type="button"
                        role="radio"
                        aria-checked={checked}
                        aria-label={hidden ? DISCARD_COPY.hiddenCard(k) : HAND_COPY.card(card)}
                        aria-keyshortcuts={DISCARD_KEY_SHORTCUTS.pick[k]}
                        tabIndex={checked || (at === -1 && k === 0) ? 0 : -1}
                        disabled={disabled}
                        className="pn-pick-card select-none [-webkit-touch-callout:none]"
                        data-pn-pick-card={k}
                        data-picked={checked ? '' : undefined}
                        onClick={(e) => {
                            if (shield.lands(e)) choose(k);
                        }}
                        onKeyDown={(e) => onCardKey(e, k)}
                        onKeyUp={(e) => {
                            if (peek && e.key === ' ') {
                                peek.onPeek(false);
                                choose(k);
                            }
                        }}
                        onPointerDown={() => peek?.onPeek(true)}
                        onPointerUp={(e) => {
                            if (!peek) return;
                            peek.onPeek(false);
                            if (shield.lands(e)) choose(k);
                        }}
                        onContextMenu={(e) => e.preventDefault()}
                    >
                        <PlayingCard card={hidden ? null : card}/>
                        {checked && (
                            <span className="pn-pick-x chrome-surface" aria-hidden="true">
                                <X className="size-3" strokeWidth={3}/>
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
};

// The throw-away's confirm: full width, the card picked by name (never while Peek keeps the cards
// face down), "Pick a card first" while none is, "Throwing away…" while it is on its way.
export const ThrowAwayButton = ({throwing, disabled, hidden}: {throwing: ThrowAway; disabled: boolean; hidden: boolean}) => {
    const shield = useTapShield();
    const {picked, throwAway, busy} = throwing;
    const label = busy ? DISCARD_COPY.sending
        : picked === null ? DISCARD_COPY.confirmNone
            : hidden ? DISCARD_COPY.confirmHidden : DISCARD_COPY.confirm(HAND_COPY.cardShort(picked));
    return (
        <ActionButton variant="strong" size="md" className={cn('min-h-12 w-full text-sm motion-reduce:transition-none')} disabled={disabled || busy || picked === null}
                      aria-busy={busy} aria-keyshortcuts={DISCARD_KEY_SHORTCUTS.throw}
                      onClick={(e) => {
                          if (shield.lands(e)) void throwAway();
                      }}
                      data-pn-throw="" data-pn-armed={shield.armed ? '' : undefined}>
            {label}
        </ActionButton>
    );
};
