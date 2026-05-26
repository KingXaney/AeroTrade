'use client';

import {useCallback, useEffect, useState} from "react";
import {MessageSquare} from "lucide-react";
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
    const [hydrated, setHydrated] = useState(false);
    const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);

    // Hydrate from localStorage after mount so server/client HTML matches.
    useEffect(() => {
        setInitialMessages(loadMessages(userId));
        setHydrated(true);
    }, [userId]);

    const persist = useCallback((messages: UIMessage[]) => {
        if (typeof window === 'undefined') return;
        try {
            window.localStorage.setItem(storageKey(userId), JSON.stringify(messages));
        } catch {
            // Quota or serialization error — ignore.
        }
    }, [userId]);

    if (!hydrated) return null;

    return (
        <>
            {!open && (
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    aria-label="Open AlgoTest Advisor chat"
                    className={cn(
                        'fixed bottom-4 right-4 z-50 inline-flex size-12 items-center justify-center rounded-full bg-yellow-500 text-gray-900 shadow-lg transition-transform hover:scale-105 sm:bottom-6 sm:right-6',
                    )}
                >
                    <MessageSquare className="size-5" />
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
        </>
    );
};

export default ChatWidget;
