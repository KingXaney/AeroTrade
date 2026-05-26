'use client';

import {useCallback, useEffect, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent} from "react";
import {useChat} from "@ai-sdk/react";
import {DefaultChatTransport, type UIMessage} from "ai";
import {useRouter} from "next/navigation";
import {X, Trash2, Send, Loader2} from "lucide-react";
import ChatMessage from "@/components/chat/ChatMessage";
import {CHAT_WELCOME_MESSAGE, CHAT_SUGGESTIONS} from "@/lib/constants";
import {cn} from "@/lib/utils";

type ChatPanelProps = {
    userId: string;
    onClose: () => void;
    initialMessages: UIMessage[];
    onMessagesChange: (messages: UIMessage[]) => void;
};

const SIZE_KEY = (userId: string) => `algotest:chat:size:${userId}`;
const DEFAULT_SIZE = {width: 380, height: 560};
const MIN = {width: 320, height: 400};

type ResizeEdge = 'top' | 'left' | 'corner';

const ChatPanel = ({userId, onClose, initialMessages, onMessagesChange}: ChatPanelProps) => {
    const router = useRouter();
    const [input, setInput] = useState('');
    const listRef = useRef<HTMLDivElement>(null);

    // Resizable size — restore from localStorage post-mount, persist on change.
    const [size, setSize] = useState(DEFAULT_SIZE);
    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            const raw = window.localStorage.getItem(SIZE_KEY(userId));
            if (!raw) return;
            const parsed = JSON.parse(raw) as {width?: number; height?: number};
            if (typeof parsed.width === 'number' && typeof parsed.height === 'number') {
                setSize({width: parsed.width, height: parsed.height});
            }
        } catch {
            // Ignore corrupt data.
        }
    }, [userId]);
    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            window.localStorage.setItem(SIZE_KEY(userId), JSON.stringify(size));
        } catch {
            // Quota — ignore.
        }
    }, [size, userId]);

    const dragRef = useRef<{edge: ResizeEdge; startX: number; startY: number; startW: number; startH: number} | null>(null);
    const beginResize = useCallback((edge: ResizeEdge) => (e: ReactPointerEvent<HTMLDivElement>) => {
        e.preventDefault();
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        dragRef.current = {edge, startX: e.clientX, startY: e.clientY, startW: size.width, startH: size.height};
    }, [size.width, size.height]);

    const onResizeMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current;
        if (!drag) return;
        // Panel is anchored bottom-right, so growing toward the top-left means: width up as cursor moves left,
        // height up as cursor moves up.
        const dx = drag.startX - e.clientX;
        const dy = drag.startY - e.clientY;
        const maxW = Math.max(MIN.width, window.innerWidth - 32);
        const maxH = Math.max(MIN.height, window.innerHeight - 32);
        const widthsEnabled = drag.edge === 'left' || drag.edge === 'corner';
        const heightsEnabled = drag.edge === 'top' || drag.edge === 'corner';
        setSize({
            width: widthsEnabled ? Math.min(maxW, Math.max(MIN.width, drag.startW + dx)) : drag.startW,
            height: heightsEnabled ? Math.min(maxH, Math.max(MIN.height, drag.startH + dy)) : drag.startH,
        });
    }, []);

    const endResize = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
        (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
        dragRef.current = null;
    }, []);

    const {messages, sendMessage, status, error, setMessages} = useChat({
        id: `chat-${userId}`,
        messages: initialMessages,
        transport: new DefaultChatTransport({api: '/api/chat'}),
        onFinish: ({message}) => {
            // After the assistant settles, if any tool mutated the watchlist, refresh server components.
            const hasMutation = message.parts.some((p) => {
                if (!p.type.startsWith('tool-')) return false;
                const name = p.type.slice(5);
                return name === 'addStockToWatchlist' || name === 'removeStockFromWatchlist';
            });
            if (hasMutation) router.refresh();
        },
    });

    // Persist messages upstream whenever they change.
    useEffect(() => {
        onMessagesChange(messages);
    }, [messages, onMessagesChange]);

    // Auto-scroll to bottom on new messages or token streams.
    useEffect(() => {
        if (listRef.current) {
            listRef.current.scrollTop = listRef.current.scrollHeight;
        }
    }, [messages]);

    const onSubmit = (e: FormEvent) => {
        e.preventDefault();
        const text = input.trim();
        if (!text || status !== 'ready') return;
        sendMessage({text});
        setInput('');
    };

    const onSuggestion = (text: string) => {
        if (status !== 'ready') return;
        sendMessage({text});
    };

    const onClear = () => {
        setMessages([]);
    };

    const isBusy = status === 'submitted' || status === 'streaming';

    return (
        <div
            className="fixed bottom-4 right-4 z-50 flex max-w-[calc(100vw-2rem)] max-h-[calc(100vh-2rem)] flex-col rounded-xl border border-gray-700 bg-gray-900 shadow-2xl sm:bottom-6 sm:right-6"
            style={{width: `${size.width}px`, height: `${size.height}px`}}
        >
            {/* Resize handles — top edge, left edge, and top-left corner. Anchored bottom-right so
                dragging away from those edges grows the panel. */}
            <div
                onPointerDown={beginResize('top')}
                onPointerMove={onResizeMove}
                onPointerUp={endResize}
                className="absolute -top-1 left-2 right-2 h-2 cursor-ns-resize"
            />
            <div
                onPointerDown={beginResize('left')}
                onPointerMove={onResizeMove}
                onPointerUp={endResize}
                className="absolute top-2 bottom-2 -left-1 w-2 cursor-ew-resize"
            />
            <div
                onPointerDown={beginResize('corner')}
                onPointerMove={onResizeMove}
                onPointerUp={endResize}
                className="absolute -top-1 -left-1 size-4 cursor-nwse-resize rounded-tl-xl"
                title="Drag to resize"
            />

            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
                <div>
                    <h3 className="text-sm font-semibold text-gray-100">AlgoTest Advisor</h3>
                    <p className="text-xs text-gray-500">Financial assistant</p>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        type="button"
                        onClick={onClear}
                        title="Clear chat"
                        className="rounded p-1.5 text-gray-500 hover:bg-gray-800 hover:text-gray-300"
                    >
                        <Trash2 className="size-4" />
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        title="Close"
                        className="rounded p-1.5 text-gray-500 hover:bg-gray-800 hover:text-gray-300"
                    >
                        <X className="size-4" />
                    </button>
                </div>
            </div>

            {/* Message list */}
            <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                {messages.length === 0 && (
                    <div className="space-y-3">
                        <div className="rounded-lg bg-gray-800 px-3 py-2 text-sm text-gray-100">
                            {CHAT_WELCOME_MESSAGE}
                        </div>
                        <div className="flex flex-col gap-2">
                            {CHAT_SUGGESTIONS.map((s) => (
                                <button
                                    key={s}
                                    type="button"
                                    onClick={() => onSuggestion(s)}
                                    className="text-left rounded-md border border-gray-700 bg-gray-800/40 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800 hover:text-gray-100 transition-colors"
                                >
                                    {s}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {messages.map((m) => (
                    <ChatMessage key={m.id} message={m} />
                ))}

                {isBusy && messages[messages.length - 1]?.role === 'user' && (
                    <div className="flex items-center gap-2 text-xs text-gray-500 px-1">
                        <Loader2 className="size-3 animate-spin" /> thinking…
                    </div>
                )}

                {error && (
                    <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                        Something went wrong. {error.message}
                    </div>
                )}
            </div>

            {/* Input */}
            <form onSubmit={onSubmit} className="flex items-center gap-2 border-t border-gray-800 px-3 py-3">
                <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Ask about a stock…"
                    disabled={isBusy}
                    className="flex-1 rounded-md bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 outline-none focus:ring-1 focus:ring-yellow-500"
                />
                <button
                    type="submit"
                    disabled={isBusy || !input.trim()}
                    className={cn(
                        'inline-flex size-9 items-center justify-center rounded-md bg-yellow-500 text-gray-900 transition-colors hover:bg-yellow-400',
                        (isBusy || !input.trim()) && 'opacity-50 cursor-not-allowed',
                    )}
                    aria-label="Send message"
                >
                    <Send className="size-4" />
                </button>
            </form>
        </div>
    );
};

export default ChatPanel;
