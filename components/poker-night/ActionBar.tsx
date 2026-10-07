'use client';

// The action bar on the viewer's turn (role="toolbar"): Fold, then Check or "Call 40" ("Call 35, all
// in" when it takes the last chip), then Bet or Raise, which opens the raise panel — exactly the
// moves lib/poker-night/betting.legalFor offers, the function the server checks them with. Folding
// when checking is free asks first ("Checking is free here.": Fold anyway, Check instead). Keys:
// F, C, R, A, and 1–4 / Enter / Escape in the raise panel (lib/poker-night/keys; never with ⌘, Ctrl
// or Alt, never while typing, never over a dialog, only with the focus on the table — not the top
// bar — and the single characters only while the player keeps them on in My look; Enter on a
// focused button is that button's). Every button is at least 48 px tall and says its key
// (aria-keyshortcuts). When the turn starts, focus moves to the bar itself — unless the viewer is
// typing somewhere or a dialog holds the focus; when the raise panel closes, to the Raise button. A
// move goes to the action route with the turn it answers, and the buttons wait while it is on its
// way; a refusal is said in a toast.
//
// The dock mounts it fresh for each turn (keyed by the turn number), so nothing carries over.

import {useEffect, useEffectEvent, useRef, useState} from "react";
import {toast} from "sonner";
import ActionButton from "@/components/primitives/ActionButton";
import RaisePanel from "@/components/poker-night/RaisePanel";
import {useRoom} from "@/components/poker-night/room-controller";
import {ACTION_COPY} from "@/lib/learn/copy/poker-night";
import {quickSizes} from "@/lib/poker-night/bet-sizing";
import type {DockView} from "@/lib/poker-night/dock";
import {intentForKey, isControlTarget, isEditableTarget, KEY_SHORTCUTS, keyAllowed, type FocusPlace} from "@/lib/poker-night/keys";
import type {Move} from "@/lib/poker-night/types";
import {cn} from "@/lib/utils";

const BUTTON = 'min-h-12 flex-1 px-2 text-sm';

// A keydown aimed at a dialog, a menu or a drawer belongs to it.
const insideOverlay = (target: EventTarget | null): boolean =>
    target instanceof Element && target.closest('[role="dialog"], [role="menu"], [data-slot="sheet-content"], [data-slot="dialog-content"]') !== null;

// Where a keydown's focus is: the page itself, the table and the dock, or anywhere else (the top bar).
const placeOf = (target: EventTarget | null): FocusPlace => {
    if (!(target instanceof Element) || target === document.body || target === document.documentElement) return 'body';
    return target.closest('[data-pn-dock], .pn-table') ? 'table' : 'elsewhere';
};

const ActionBar = ({dock, turn, disabled}: {dock: DockView; turn: number; disabled: boolean}) => {
    const room = useRoom();
    const legal = dock.legal;
    const sizing = dock.sizing;
    const bar = useRef<HTMLDivElement>(null);
    const raiseButton = useRef<HTMLButtonElement>(null);
    const [pending, setPending] = useState(false);
    const [raiseOpen, setRaiseOpen] = useState(false);
    const [raiseTo, setRaiseTo] = useState(() => sizing?.min ?? 0);
    const [askFold, setAskFold] = useState(false);

    const act = async (move: Move) => {
        if (pending || disabled) return;
        setPending(true);
        const r = await room.send({type: 'act', turn, move});
        setPending(false);
        if (!r.ok) toast.error(r.message);
    };
    const fold = () => {
        if (legal?.check && !askFold) {
            setAskFold(true);
            return;
        }
        void act({kind: 'fold'});
    };
    const checkOrCall = () => void act(legal?.check ? {kind: 'check'} : {kind: 'call'});
    const confirmRaise = () => {
        if (sizing) void act(raiseTo >= sizing.max ? {kind: 'all-in'} : {kind: 'raise', to: raiseTo});
    };
    // Closed with Back or Escape: the focus goes back to the button that opened it, not to the page.
    const closeRaise = () => {
        setRaiseOpen(false);
        raiseButton.current?.focus({preventScroll: true});
    };

    const onKey = useEffectEvent((e: KeyboardEvent) => {
        if (e.defaultPrevented || insideOverlay(e.target)) return;
        if (!keyAllowed(e.key, placeOf(e.target), room.personal.shortcuts)) return;
        const intent = intentForKey({
            key: e.key, metaKey: e.metaKey, ctrlKey: e.ctrlKey, altKey: e.altKey, repeat: e.repeat,
            editable: isEditableTarget(e.target), control: isControlTarget(e.target),
        }, {raiseOpen});
        if (!intent) return;
        e.preventDefault();
        switch (intent) {
            case 'fold':
                fold();
                break;
            case 'check-call':
                checkOrCall();
                break;
            case 'raise':
                if (sizing) setRaiseOpen(true);
                break;
            case 'all-in':
                if (sizing) {
                    setRaiseOpen(true);
                    setRaiseTo(sizing.max);
                } else if (legal?.callAllIn) {
                    checkOrCall();
                }
                break;
            case 'confirm':
                confirmRaise();
                break;
            case 'close':
                closeRaise();
                break;
            default: {
                const size = sizing ? quickSizes(sizing)[Number(intent.slice(-1)) - 1] : undefined;
                if (size) setRaiseTo(size.to);
            }
        }
    });

    useEffect(() => {
        const listener = (e: KeyboardEvent) => onKey(e);
        window.addEventListener('keydown', listener);
        return () => window.removeEventListener('keydown', listener);
    }, []);

    // The turn has started: the bar takes the focus, unless the viewer is busy elsewhere.
    useEffect(() => {
        const el = bar.current;
        if (!el) return;
        const active = document.activeElement;
        const scope = el.closest('main');
        if (active && active !== document.body && !(scope?.contains(active) ?? false)) return;
        if (isEditableTarget(active) || insideOverlay(active)) return;
        el.focus({preventScroll: true});
    }, []);

    if (!legal) return null;
    const off = pending || disabled;
    return (
        <>
            {raiseOpen && sizing && (
                <RaisePanel sizing={sizing} value={raiseTo} onValue={setRaiseTo} onConfirm={confirmRaise} onClose={closeRaise} pending={pending} disabled={disabled}/>
            )}
            {askFold && (
                <p className="pn-fold-free chrome-surface rounded-full px-3 py-1 text-xs font-semibold text-fg" role="status" data-pn-fold-free="">
                    {ACTION_COPY.foldFree}
                </p>
            )}
            <div ref={bar} role="toolbar" aria-label={ACTION_COPY.toolbar} tabIndex={-1} aria-busy={pending}
                 className="chrome-surface flex items-stretch gap-1.5 rounded-[var(--control-radius)] p-1.5 outline-none focus-visible:outline-2 focus-visible:outline-brand"
                 data-pn-actions="">
                {askFold ? (
                    <>
                        <ActionButton variant="danger" className={BUTTON} disabled={off} onClick={() => void act({kind: 'fold'})} aria-keyshortcuts={KEY_SHORTCUTS.fold}
                                      data-pn-action="fold-anyway">
                            {ACTION_COPY.foldConfirm}
                        </ActionButton>
                        <ActionButton variant="primary" className={BUTTON} disabled={off} onClick={() => void act({kind: 'check'})} aria-keyshortcuts={KEY_SHORTCUTS['check-call']}
                                      data-pn-action="check-instead">
                            {ACTION_COPY.checkInstead}
                        </ActionButton>
                    </>
                ) : (
                    <>
                        <ActionButton variant="danger" className={BUTTON} disabled={off} onClick={fold} aria-keyshortcuts={KEY_SHORTCUTS.fold} data-pn-action="fold">
                            {ACTION_COPY.fold}
                        </ActionButton>
                        <ActionButton variant={sizing ? 'secondary' : 'primary'} className={BUTTON} disabled={off} onClick={checkOrCall}
                                      aria-keyshortcuts={KEY_SHORTCUTS['check-call']} data-pn-action={legal.check ? 'check' : 'call'}>
                            {legal.check ? ACTION_COPY.check : legal.callAllIn ? ACTION_COPY.callAllIn(legal.call) : ACTION_COPY.call(legal.call)}
                        </ActionButton>
                        {sizing && (
                            <ActionButton ref={raiseButton} variant="strong" className={cn(BUTTON, raiseOpen && 'ring-2 ring-brand')} disabled={off} onClick={() => setRaiseOpen((open) => !open)}
                                          aria-expanded={raiseOpen} aria-keyshortcuts={KEY_SHORTCUTS.raise} data-pn-action="raise">
                                {sizing.kind === 'bet' ? ACTION_COPY.openBet : ACTION_COPY.openRaise}
                            </ActionButton>
                        )}
                    </>
                )}
            </div>
        </>
    );
};

export default ActionBar;
