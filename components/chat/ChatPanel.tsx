'use client';

import {useCallback, useEffect, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent} from "react";
import {useChat} from "@ai-sdk/react";
import {DefaultChatTransport, type UIMessage} from "ai";
import {useRouter} from "next/navigation";
import {X, Trash2} from "lucide-react";
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

// Restore the saved panel size from localStorage, falling back to the default on miss or corrupt data.
const loadSize = (userId: string): {width: number; height: number} => {
    if (typeof window === 'undefined') return DEFAULT_SIZE;
    try {
        const raw = window.localStorage.getItem(SIZE_KEY(userId));
        if (!raw) return DEFAULT_SIZE;
        const parsed = JSON.parse(raw) as {width?: number; height?: number};
        if (typeof parsed.width === 'number' && typeof parsed.height === 'number') {
            return {width: parsed.width, height: parsed.height};
        }
    } catch {
        // Ignore corrupt data.
    }
    return DEFAULT_SIZE;
};

type ResizeEdge = 'top' | 'left' | 'corner';

const ChatPanel = ({userId, onClose, initialMessages, onMessagesChange}: ChatPanelProps) => {
    const router = useRouter();
    const [input, setInput] = useState('');
    const listRef = useRef<HTMLDivElement>(null);

    // Resizable size — restore from localStorage on first render (panel only mounts client-side),
    // persist on change.
    const [size, setSize] = useState(() => loadSize(userId));
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
            className="fixed bottom-5 right-5 z-[80] flex max-w-[calc(100vw-2rem)] max-h-[calc(100vh-2rem)] flex-col rounded-2xl shadow-2xl sm:bottom-6 sm:right-6 overflow-hidden"
            style={{
                width: `${size.width}px`,
                height: `${size.height}px`,
                backgroundColor: 'rgba(17, 19, 24, 0.95)',
                backdropFilter: 'blur(24px)',
                WebkitBackdropFilter: 'blur(24px)',
                border: '1px solid rgba(125, 244, 255, 0.15)',
                boxShadow: '0 0 40px rgba(0, 240, 255, 0.08)',
            }}
        >
            {/* Resize handles */}
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
                className="absolute -top-1 -left-1 size-4 cursor-nwse-resize rounded-tl-2xl"
                title="Drag to resize"
            />

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3"
                 style={{
                     backgroundColor: 'rgba(0, 240, 255, 0.08)',
                     borderBottom: '1px solid rgba(59, 73, 75, 0.3)',
                 }}>
                <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#7df4ff] animate-pulse">smart_toy</span>
                    <span className="text-xs font-bold tracking-[0.1em] uppercase text-[#7df4ff]"
                          style={{ fontFamily: 'var(--font-jetbrains)' }}>
                        Aero-AI Assistant
                    </span>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        type="button"
                        onClick={onClear}
                        title="Clear chat"
                        className="rounded p-1.5 text-[#b9cacb] hover:bg-[rgba(40,42,46,0.8)] hover:text-[#e2e2e8] transition-colors"
                    >
                        <Trash2 className="size-4" />
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        title="Close"
                        className="rounded p-1.5 text-[#b9cacb] hover:bg-[rgba(40,42,46,0.8)] hover:text-[#e2e2e8] transition-colors"
                    >
                        <X className="size-4" />
                    </button>
                </div>
            </div>

            {/* Message list */}
            <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 scrollbar-hide">
                {messages.length === 0 && (
                    <div className="space-y-3">
                        <div className="rounded-xl rounded-tl-none px-3 py-2 text-sm text-[#e2e2e8] max-w-[85%]"
                             style={{ backgroundColor: '#282a2e' }}>
                            {CHAT_WELCOME_MESSAGE}
                        </div>
                        <div className="flex flex-col gap-2">
                            {CHAT_SUGGESTIONS.map((s) => (
                                <button
                                    key={s}
                                    type="button"
                                    onClick={() => onSuggestion(s)}
                                    className="text-left rounded-md px-3 py-1.5 text-xs text-[#b9cacb] hover:text-[#e2e2e8] transition-colors"
                                    style={{
                                        backgroundColor: 'rgba(30, 32, 36, 0.4)',
                                        border: '1px solid rgba(59, 73, 75, 0.3)',
                                    }}
                                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(30, 32, 36, 0.8)'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(30, 32, 36, 0.4)'; }}
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
                    <div className="flex items-center gap-1.5 p-3 rounded-xl rounded-tl-none w-fit text-[rgba(125,244,255,0.6)]"
                         style={{ backgroundColor: '#282a2e' }}>
                        <div className="typing-dot"></div>
                        <div className="typing-dot"></div>
                        <div className="typing-dot"></div>
                    </div>
                )}

                {error && (
                    <div className="rounded-md px-3 py-2 text-xs"
                         style={{
                             backgroundColor: 'rgba(147, 0, 10, 0.15)',
                             border: '1px solid rgba(255, 180, 171, 0.3)',
                             color: '#ffb4ab',
                         }}>
                        Something went wrong. {error.message}
                    </div>
                )}
            </div>

            {/* Input */}
            <form onSubmit={onSubmit} className="flex items-center gap-2 px-3 py-3"
                  style={{ borderTop: '1px solid rgba(59, 73, 75, 0.3)' }}>
                <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Query market data..."
                    disabled={isBusy}
                    className="flex-1 rounded-lg px-3 py-2 text-sm text-[#e2e2e8] outline-none border-none"
                    style={{
                        backgroundColor: '#1e2024',
                        fontFamily: 'var(--font-hanken)',
                    }}
                />
                <button
                    type="submit"
                    disabled={isBusy || !input.trim()}
                    className={cn(
                        'inline-flex size-9 items-center justify-center rounded-md transition-colors',
                        (isBusy || !input.trim()) && 'opacity-50 cursor-not-allowed',
                    )}
                    style={{
                        backgroundColor: '#00f0ff',
                        color: '#002022',
                    }}
                    aria-label="Send message"
                >
                    <span className="material-symbols-outlined text-lg">send</span>
                </button>
            </form>
        </div>
    );
};

export default ChatPanel;
