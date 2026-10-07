'use client';

import {useCallback, useEffect, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent} from "react";
import {useChat} from "@ai-sdk/react";
import {DefaultChatTransport, type UIMessage} from "ai";
import {useRouter} from "next/navigation";
import Link from "next/link";
import {X, Trash2} from "lucide-react";
import ChatMessage from "@/components/chat/ChatMessage";
import RobotMascot from "@/components/chat/RobotMascot";
import {useChatUsage} from "@/components/chat/useChatUsage";
import MicroLabel from "@/components/primitives/MicroLabel";
import {describeChatError} from "@/lib/chat/errors";
import {describeChatUsage} from "@/lib/chat/usage";
import {subscribeAsk} from "@/lib/chat/ask";
import {CHAT_WELCOME_MESSAGE, CHAT_SUGGESTIONS} from "@/lib/learn/copy/chat";
import {cn} from "@/lib/utils";

// Tools that change what the surrounding pages show; the router refreshes after they run.
const MUTATING_TOOLS = new Set(['addStockToWatchlist', 'removeStockFromWatchlist', 'followTopic', 'unfollowTopic']);

type ChatPanelProps = {
    userId: string;
    onClose: () => void;
    initialMessages: UIMessage[];
    onMessagesChange: (messages: UIMessage[]) => void;
    // A question typed by an "Ask in chat" link before the panel opened. Prefill only.
    initialInput?: string | null;
};

const SIZE_KEY = (userId: string) => `aero-chat-size:${userId}`;
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

const ChatPanel = ({userId, onClose, initialMessages, onMessagesChange, initialInput}: ChatPanelProps) => {
    const router = useRouter();
    const [input, setInput] = useState(initialInput ?? '');
    const listRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

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

    // What is left of the chat's rate-limit windows, re-read after every request settles. The
    // caption renders from the server's clock (`usage.at`), so nothing here reads Date.now().
    const {usage, refreshUsage} = useChatUsage();
    const caption = usage ? describeChatUsage(usage) : null;

    const {messages, sendMessage, status, error, setMessages, clearError, regenerate} = useChat({
        id: `chat-${userId}`,
        messages: initialMessages,
        transport: new DefaultChatTransport({api: '/api/chat'}),
        onFinish: ({message}) => {
            const hasMutation = message.parts.some((p) => {
                if (!p.type.startsWith('tool-')) return false;
                const name = p.type.slice(5);
                return MUTATING_TOOLS.has(name);
            });
            if (hasMutation) router.refresh();
            refreshUsage();
        },
        // A refused request (429) and a dropped one both land here; the route has spent its
        // windows before it streams, so a read taken now sees the final counts.
        onError: () => refreshUsage(),
    });

    // Persist messages upstream whenever they change.
    useEffect(() => {
        onMessagesChange(messages);
    }, [messages, onMessagesChange]);

    // Opening the panel should put the cursor in the composer — otherwise the first
    // thing a keyboard user does is hunt for it.
    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    // An Ask link clicked while the panel is open replaces the draft and refocuses the
    // composer. Nothing is sent: the reader still presses Send.
    useEffect(() => subscribeAsk((text) => {
        setInput(text);
        inputRef.current?.focus();
    }), []);

    // Auto-scroll to bottom on new messages or token streams.
    useEffect(() => {
        if (listRef.current) {
            listRef.current.scrollTop = listRef.current.scrollHeight;
        }
    }, [messages]);

    const isBusy = status === 'submitted' || status === 'streaming';

    // These guards used to be `status !== 'ready'`, which excluded 'error' — and nothing
    // ever moved status back to 'ready'. The input and Send button stayed enabled (isBusy
    // is false in the error state), so after one failure the panel looked alive and
    // silently swallowed every message until the page was reloaded.
    const send = (text: string) => {
        if (!text || isBusy) return;
        clearError(); // no-op unless we're recovering from a failure
        sendMessage({text});
    };

    const onSubmit = (e: FormEvent) => {
        e.preventDefault();
        const text = input.trim();
        if (!text || isBusy) return;
        send(text);
        setInput('');
    };

    const onSuggestion = (text: string) => send(text);

    const onRetry = () => {
        if (isBusy || messages.length === 0) return;
        clearError();
        void regenerate();
    };

    const onClear = () => {
        setMessages([]);
        clearError(); // otherwise "clear chat" left the panel stuck too
        setInput('');
    };

    return (
        <div
            data-chat-window
            className="fixed bottom-5 right-5 z-[80] flex max-w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)] flex-col rounded-xl sm:bottom-6 sm:right-6 overflow-hidden chrome-surface"
            role="dialog"
            aria-label="AeroTrade assistant"
            onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}
            style={{
                width: `${size.width}px`,
                height: `${size.height}px`,
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
            <div className="flex items-center justify-between px-4 py-3 bg-brand-strong/8 border-b border-line-strong/30">
                <div className="flex items-center gap-2">
                    <RobotMascot className="size-5 text-brand" still/>
                    <span className="label-type text-xs font-bold text-brand">
                        Aero-AI Assistant
                    </span>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        type="button"
                        onClick={onClear}
                        title="Clear chat"
                        className="rounded p-1.5 text-fg-soft hover:bg-surface-3/80 hover:text-fg transition-colors"
                    >
                        <Trash2 className="size-4" />
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        title="Close"
                        className="rounded p-1.5 text-fg-soft hover:bg-surface-3/80 hover:text-fg transition-colors"
                    >
                        <X className="size-4" />
                    </button>
                </div>
            </div>

            {/* What is left of the rate-limit windows; absent while unread. A <div>, never a <p>:
                qa-chat-tutor reads the panel's error copy from its <p> elements. */}
            {caption && (
                <MicroLabel
                    as="div"
                    tone={caption.exhausted ? 'warning' : 'muted'}
                    className="px-4 py-1.5 border-b border-line-strong/30"
                    data-chat-usage={caption.binding}
                >
                    {caption.text}
                </MicroLabel>
            )}

            {/* Message list */}
            <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 scrollbar-hide">
                {messages.length === 0 && (
                    <div className="space-y-3">
                        <div className="rounded-xl rounded-tl-none px-3 py-2 text-sm text-fg max-w-[85%] bg-surface-3">
                            {CHAT_WELCOME_MESSAGE}
                        </div>
                        <div className="flex flex-col gap-2">
                            {CHAT_SUGGESTIONS.map((s) => (
                                <button
                                    key={s}
                                    type="button"
                                    onClick={() => onSuggestion(s)}
                                    className="text-left rounded-md px-3 py-1.5 text-xs text-fg-soft hover:text-fg transition-colors bg-surface-2/40 hover:bg-surface-2/80 border border-line-strong/30"
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
                    <div className="flex items-center gap-1.5 p-3 rounded-xl rounded-tl-none w-fit text-brand/60 bg-surface-3">
                        <div className="typing-dot"></div>
                        <div className="typing-dot"></div>
                        <div className="typing-dot"></div>
                    </div>
                )}

                {error && (() => {
                    // Never render error.message — it can be a provider error, an HTML
                    // error page from the host, or an SDK-masked string, and some of that
                    // leaks infrastructure detail.
                    const described = describeChatError(error);
                    return (
                        <div className="rounded-md px-3 py-2 text-xs space-y-2 bg-negative/15 border border-negative/30 text-negative">
                            <p>{described.message}</p>
                            <div className="flex items-center gap-2">
                                {described.action === 'retry' && (
                                    <button type="button" onClick={onRetry} disabled={isBusy}
                                            className="control-type px-2 py-1 rounded text-[10px] text-negative disabled:opacity-50 border border-negative/40">
                                        Try again
                                    </button>
                                )}
                                {described.action === 'clear' && (
                                    <button type="button" onClick={onClear}
                                            className="control-type px-2 py-1 rounded text-[10px] text-negative border border-negative/40">
                                        Clear chat
                                    </button>
                                )}
                                {described.action === 'sign_in' && (
                                    <Link href="/sign-in"
                                          className="control-type px-2 py-1 rounded text-[10px] text-negative border border-negative/40">
                                        Sign in
                                    </Link>
                                )}
                                <button type="button" onClick={() => clearError()}
                                        className="control-type px-2 py-1 rounded text-[10px] text-fg-muted hover:text-fg-soft">
                                    Dismiss
                                </button>
                            </div>
                        </div>
                    );
                })()}
            </div>

            {/* Input */}
            <form onSubmit={onSubmit} className="flex items-center gap-2 px-3 py-3 border-t border-line-strong/30">
                <input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Query market data..."
                    // Deliberately not disabled while busy: disabling blurs the input, so
                    // focus fell to <body> after every message — you had to click back in,
                    // and Escape stopped reaching the panel. send() already refuses to
                    // submit while a reply is streaming, and composing ahead is useful.
                    className="flex-1 rounded-lg px-3 py-2 text-sm text-fg outline-none field-focus border-none font-sans bg-surface-2"
                />
                <button
                    type="submit"
                    disabled={isBusy || !input.trim()}
                    className={cn(
                        'inline-flex size-9 items-center justify-center rounded-md transition-colors bg-brand-strong text-on-brand',
                        (isBusy || !input.trim()) && 'opacity-50 cursor-not-allowed',
                    )}
                    aria-label="Send message"
                >
                    <span className="material-symbols-outlined text-lg">send</span>
                </button>
            </form>
        </div>
    );
};

export default ChatPanel;
