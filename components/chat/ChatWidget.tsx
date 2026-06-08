'use client';

import {useCallback, useEffect, useState} from "react";
import {createPortal} from "react-dom";
import type {UIMessage} from "ai";
import ChatPanel from "@/components/chat/ChatPanel";
import {cn} from "@/lib/utils";

type ChatWidgetProps = {
    userId: string;
};

const storageKey = (userId: string) => `algotest:chat:${userId}`;

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
    // Lazily restore persisted messages on first render. The launcher button renders identically
    // on server and client, so reading localStorage here causes no hydration mismatch.
    const [initialMessages] = useState<UIMessage[]>(() => loadMessages(userId));

    // Render through a portal to <body> so the widget's fixed position is anchored to the
    // viewport and can never be displaced by an ancestor's transform/filter/overflow.
    const [mounted, setMounted] = useState(false);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time flag to enable the body portal client-side
    useEffect(() => setMounted(true), []);

    const persist = useCallback((messages: UIMessage[]) => {
        if (typeof window === 'undefined') return;
        try {
            window.localStorage.setItem(storageKey(userId), JSON.stringify(messages));
        } catch {
            // Quota or serialization error — ignore.
        }
    }, [userId]);

    if (!mounted) return null;

    return createPortal(
        <>
            {!open && (
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    aria-label="Open Aero-AI Assistant"
                    className={cn(
                        'fixed bottom-5 right-5 z-[80] inline-flex size-14 items-center justify-center rounded-full transition-all hover:scale-110 active:scale-95 sm:bottom-6 sm:right-6 group',
                    )}
                    style={{
                        backgroundColor: '#00f0ff',
                        color: '#006970',
                        boxShadow: '0 0 20px rgba(0, 240, 255, 0.4)',
                    }}
                >
                    <span className="material-symbols-outlined text-3xl">smart_toy</span>
                </button>
            )}

            {open && (
                <ChatPanel
                    userId={userId}
                    initialMessages={initialMessages}
                    onMessagesChange={persist}
                    onClose={() => setOpen(false)}
                />
            )}
        </>,
        document.body,
    );
};

export default ChatWidget;
