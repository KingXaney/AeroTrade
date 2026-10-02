'use client';

import {useCallback, useEffect, useRef, useState} from "react";
import {createPortal} from "react-dom";
import type {UIMessage} from "ai";
import ChatPanel from "@/components/chat/ChatPanel";
import {subscribeAsk} from "@/lib/chat/ask";
import {cn} from "@/lib/utils";

type ChatWidgetProps = {
    userId: string;
};

const storageKey = (userId: string) => `aero-chat:${userId}`;

// Restore messages from localStorage at mount. Returns [] if nothing or parse fails — keep failure silent.
const loadMessages = (userId: string): UIMessage[] => {
    if (typeof window === 'undefined') return [];
    try {
        const raw = window.localStorage.getItem(storageKey(userId));
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? (parsed as UIMessage[]) : [];
    } catch {
        return [];
    }
};

const ChatWidget = ({userId}: ChatWidgetProps) => {
    const [open, setOpen] = useState(false);
    // The question an "Ask in chat" link typed before the panel was open; the panel seeds
    // its composer from it on mount and it is cleared on close so it cannot come back.
    const [pendingInput, setPendingInput] = useState<string | null>(null);
    // Lazily restore persisted messages on first render. The launcher button renders identically
    // on server and client, so reading localStorage here causes no hydration mismatch.
    const [initialMessages, setInitialMessages] = useState<UIMessage[]>(() => loadMessages(userId));
    // The panel's live list. ChatPanel unmounts on close and useChat seeds a new Chat from
    // initialMessages on every mount, so the list is handed back on close: otherwise a reopen
    // showed the page-load conversation, dropping new turns and restoring a cleared one.
    // A ref, not state, so a streaming reply does not re-render the widget on every token.
    const latestMessages = useRef<UIMessage[] | null>(null);

    // Render through a portal to <body> so the widget's fixed position is anchored to the
    // viewport and can never be displaced by an ancestor's transform/filter/overflow.
    const [mounted, setMounted] = useState(false);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time flag to enable the body portal client-side
    useEffect(() => setMounted(true), []);

    // An Ask link anywhere on the page opens the panel with its question in the composer.
    // A click while the panel is already open is handled by the panel itself.
    useEffect(() => subscribeAsk((text) => {
        setPendingInput(text);
        setOpen(true);
    }), []);

    const persist = useCallback((messages: UIMessage[]) => {
        latestMessages.current = messages;
        if (typeof window === 'undefined') return;
        try {
            window.localStorage.setItem(storageKey(userId), JSON.stringify(messages));
        } catch {
            // Quota or serialization error — ignore.
        }
    }, [userId]);

    const close = () => {
        if (latestMessages.current) setInitialMessages(latestMessages.current);
        setOpen(false);
        setPendingInput(null);
    };

    if (!mounted) return null;

    return createPortal(
        <>
            {!open && (
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    aria-label="Open Aero-AI Assistant"
                    className={cn(
                        // Floating over the page below lg; at lg it takes the end of the top bar, which
                        // Header keeps clear for it, so it no longer sits on a panel's corner.
                        'fixed bottom-5 right-5 z-[80] inline-flex size-14 items-center justify-center rounded-full transition-all hover:scale-110 active:scale-95 sm:bottom-6 sm:right-6 group bg-brand-strong text-on-brand [box-shadow:var(--glow)]',
                        'lg:bottom-auto lg:top-3 lg:right-6 lg:size-10',
                    )}
                >
                    <span className="material-symbols-outlined text-3xl lg:text-2xl">smart_toy</span>
                </button>
            )}

            {open && (
                <ChatPanel
                    userId={userId}
                    initialMessages={initialMessages}
                    onMessagesChange={persist}
                    initialInput={pendingInput}
                    onClose={close}
                />
            )}
        </>,
        document.body,
    );
};

export default ChatWidget;
