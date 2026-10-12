'use client';

// What the table's overlays share: the drawer frame (a Sheet from the right, from the bottom on a
// phone, with its heading and Close), a player's small look and name, the toasts' 44 px action, the
// clipboard with its fallback, and the two browser facts read without a mismatch between the server's render and
// the first one in the browser (a phone-width screen, navigator.share).

import type {ReactNode} from "react";
import {useSyncExternalStore} from "react";
import {X} from "lucide-react";
import {Sheet, SheetContent} from "@/components/primitives/Sheet";
import SectionHeading from "@/components/primitives/SectionHeading";
import {iconButton} from "@/components/primitives/iconButton";
import AvatarDisc from "@/components/poker-night/AvatarDisc";
import {OVERLAY_COPY} from "@/lib/learn/copy/poker-night";
import {cn} from "@/lib/utils";

// ── browser facts ──

const NARROW = '(max-width: 639px)';

const subscribeNarrow = (onChange: () => void) => {
    const query = window.matchMedia(NARROW);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
};

// A phone-width screen: drawers rise from the bottom there.
export const useNarrow = (): boolean => useSyncExternalStore(subscribeNarrow, () => window.matchMedia(NARROW).matches, () => false);

const noSubscribe = () => () => {};

// navigator.share, on phones and a few desktops.
export const useCanShare = (): boolean =>
    useSyncExternalStore(noSubscribe, () => typeof navigator !== 'undefined' && typeof navigator.share === 'function', () => false);

// ── toasts ──

// A toast's action button at the table (the host's Approve, the leave's Stay): a full 44 px target,
// where sonner's own is 24 px tall — these are the quick paths a phone uses.
export const TOAST_ACTION = {actionButton: 'min-h-11 px-3'} as const;

// ── the clipboard ──

// Copies the text; 'blocked' where the browser refuses (an http origin, an in-app browser), and the
// caller shows the text in a box to copy by hand.
export const copyText = async (text: string): Promise<'copied' | 'blocked'> => {
    try {
        await navigator.clipboard.writeText(text);
        return 'copied';
    } catch {
        return 'blocked';
    }
};

// ── a player ──

// A player's name as typed: isolated from the words around it, and kept out of the wording checks.
export const PlayerName = ({name, className}: {name: string; className?: string}) => (
    <bdi data-user-text="" className={cn('min-w-0 truncate', className)}>{name}</bdi>
);

// A player's look, small: the face on its colour, in its frame, with its badge (AvatarDisc, at a
// size of its own, since a drawer is portaled out of the room that sets one).
const MINI_SIZE = {sm: 32, md: 40, lg: 64} as const;

export const MiniAvatar = ({avatar, size = 'sm', label}: {avatar: string | null; size?: keyof typeof MINI_SIZE; label?: string}) => (
    <AvatarDisc avatar={avatar} size={MINI_SIZE[size]} label={label} className="shrink-0"/>
);

// ── closing for the viewer's turn ──

// What a drawer or a dialog does with the focus as it closes: when it closed because the viewer's
// turn came round, the action bar takes it (Radix would hand it back to the trigger — the top bar,
// or nothing at all when a host drawer stepped aside); otherwise Radix's own return.
export const focusTableOnClose = (toTable: boolean) => (event: Event): void => {
    if (!toTable) return;
    const bar = document.querySelector<HTMLElement>('main [role="toolbar"]');
    if (!bar) return;
    event.preventDefault();
    bar.focus({preventScroll: true});
};

// ── the drawer ──

type DrawerProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    // When the drawer closes because the viewer's turn came round: focus goes to the action bar,
    // not back to the top bar's button.
    toTable?: boolean;
    wide?: boolean;
    children: ReactNode;
    'data-pn-drawer': string;
};

// Every drawer at the table: from the right on a wide screen, from the bottom on a phone, with its
// heading and a Close button; the body scrolls.
export const Drawer = ({open, onOpenChange, title, toTable = false, wide = false, children, ...rest}: DrawerProps) => {
    const narrow = useNarrow();
    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                title={title}
                side={narrow ? 'bottom' : 'right'}
                className={cn(!narrow && (wide ? 'w-[30rem] max-w-[92vw]' : 'w-96 max-w-[92vw]'), 'text-fg')}
                onCloseAutoFocus={focusTableOnClose(toTable)}
                data-pn-drawer={rest['data-pn-drawer']}
            >
                <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line-strong/15 px-4 py-3">
                    {/* The sheet's own title (visually hidden) names it for a screen reader; this is its face. */}
                    <div aria-hidden="true" className="min-w-0"><SectionHeading as="h2" spacing="none">{title}</SectionHeading></div>
                    <button type="button" className={cn(iconButton, 'size-11')} aria-label={OVERLAY_COPY.close} onClick={() => onOpenChange(false)}>
                        <X className="size-5" aria-hidden="true"/>
                    </button>
                </div>
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4">{children}</div>
            </SheetContent>
        </Sheet>
    );
};
