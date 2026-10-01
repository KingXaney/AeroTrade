'use client';

import type {UIMessage} from "ai";
import {cn} from "@/lib/utils";
import ChatToolChip from "@/components/chat/ChatToolChip";
import SafeMarkdown from "@/components/primitives/SafeMarkdown";

type ChatMessageProps = {
    message: UIMessage;
};

// Build a one-line summary from a tool part's input or output, when reasonable.
const summarizeTool = (toolName: string, part: {input?: unknown; output?: unknown}): string | undefined => {
    const input = part.input as Record<string, unknown> | undefined;
    const output = part.output as unknown;

    // The glossary's name for what was found, else the term as asked; a reason alone
    // (quoted strategy text) is not repeated in the chip.
    if (toolName === 'explainTerm') {
        const entry = output && typeof output === 'object' ? (output as {entry?: {term?: unknown} | null}).entry : undefined;
        if (entry && typeof entry.term === 'string') return entry.term;
        return input && typeof input.term === 'string' && input.term.trim() ? `"${input.term.trim()}"` : undefined;
    }

    // The strategy's name once the tool has read it, else the slug as asked, else the count.
    if (toolName === 'getQuantStrategies') {
        const out = output && typeof output === 'object' ? (output as {strategy?: {name?: unknown} | null; strategies?: unknown}) : undefined;
        if (out?.strategy && typeof out.strategy.name === 'string') return out.strategy.name;
        if (Array.isArray(out?.strategies)) return `${out.strategies.length} ${out.strategies.length === 1 ? 'strategy' : 'strategies'}`;
        return input && typeof input.slug === 'string' && input.slug.trim() ? `"${input.slug.trim()}"` : undefined;
    }

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
                        ? 'rounded-tr-none bg-brand-strong/15 text-brand border border-brand-strong/20'
                        : 'rounded-tl-none bg-surface-3 text-fg',
                )}
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
