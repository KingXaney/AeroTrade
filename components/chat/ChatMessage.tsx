'use client';

import type {UIMessage} from "ai";
import {cn} from "@/lib/utils";
import ChatToolChip from "@/components/chat/ChatToolChip";
import SafeMarkdown from "@/components/markdown/SafeMarkdown";

type ChatMessageProps = {
    message: UIMessage;
};

// Build a one-line summary from a tool part's input or output, when reasonable.
const summarizeTool = (toolName: string, part: {input?: unknown; output?: unknown}): string | undefined => {
    const input = part.input as Record<string, unknown> | undefined;
    const output = part.output as unknown;

    if (input && typeof input === 'object') {
        if (typeof input.symbol === 'string') return input.symbol;
        if (typeof input.query === 'string') return `"${input.query}"`;
        if (Array.isArray(input.symbols)) return input.symbols.join(', ');
        if (typeof input.topic === 'string') return `"${input.topic}"`;
        if (typeof input.name === 'string') return `"${input.name}"`;
    }

    if (toolName === 'getWatchlist' && Array.isArray(output)) {
        return `${output.length} stocks`;
    }
    if (toolName === 'getMarketNews' && Array.isArray(output)) {
        return `${output.length} articles`;
    }
    if (toolName === 'getFollowedTopics' && output && typeof output === 'object') {
        const topics = (output as {topics?: unknown}).topics;
        if (Array.isArray(topics)) return `${topics.length} ${topics.length === 1 ? 'topic' : 'topics'}`;
    }
    if (toolName === 'getPaperPortfolio' && output && typeof output === 'object') {
        const {accounts, total} = output as {accounts?: unknown; total?: {totalValue?: number}};
        if (Array.isArray(accounts) && typeof total?.totalValue === 'number') {
            const positions = accounts.reduce(
                (n: number, a) => n + ((a as {positions?: unknown[]}).positions?.length ?? 0),
                0,
            );
            return `${positions} ${positions === 1 ? 'position' : 'positions'} · ${total.totalValue.toLocaleString('en-US', {style: 'currency', currency: 'USD', maximumFractionDigits: 0})}`;
        }
    }

    return undefined;
};

const ChatMessage = ({message}: ChatMessageProps) => {
    const isUser = message.role === 'user';

    return (
        <div className={cn('flex gap-2', isUser ? 'justify-end' : 'justify-start')}>
            <div
                className={cn(
                    'max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed',
                    isUser
                        ? 'rounded-tr-none'
                        : 'rounded-tl-none',
                )}
                style={{
                    backgroundColor: isUser ? 'color-mix(in srgb, var(--brand-strong) 15%, transparent)' : 'var(--surface-3)',
                    color: isUser ? 'var(--brand)' : 'var(--fg)',
                    border: isUser ? '1px solid color-mix(in srgb, var(--brand-strong) 20%, transparent)' : 'none',
                }}
            >
                {message.parts.map((part, idx) => {
                    if (part.type === 'text') {
                        return isUser ? (
                            <span key={idx}>{part.text}</span>
                        ) : (
                            <SafeMarkdown key={idx}>{part.text}</SafeMarkdown>
                        );
                    }

                    // Tool parts are typed as `tool-<toolName>` in AI SDK v6.
                    if (part.type.startsWith('tool-')) {
                        const toolName = part.type.slice(5);
                        const toolPart = part as unknown as {
                            state: 'input-streaming' | 'input-available' | 'output-available' | 'output-error';
                            input?: unknown;
                            output?: unknown;
                            toolCallId: string;
                        };
                        return (
                            <div key={toolPart.toolCallId || idx} className="my-1">
                                <ChatToolChip
                                    toolName={toolName}
                                    state={toolPart.state}
                                    summary={summarizeTool(toolName, toolPart)}
                                />
                            </div>
                        );
                    }

                    return null;
                })}
            </div>
        </div>
    );
};

export default ChatMessage;
