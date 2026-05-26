'use client';

import ReactMarkdown from "react-markdown";
import type {UIMessage} from "ai";
import {cn} from "@/lib/utils";
import ChatToolChip from "@/components/chat/ChatToolChip";

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
    }

    if (toolName === 'getWatchlist' && Array.isArray(output)) {
        return `${output.length} stocks`;
    }
    if (toolName === 'getMarketNews' && Array.isArray(output)) {
        return `${output.length} articles`;
    }

    return undefined;
};

const ChatMessage = ({message}: ChatMessageProps) => {
    const isUser = message.role === 'user';

    return (
        <div className={cn('flex gap-2', isUser ? 'justify-end' : 'justify-start')}>
            <div
                className={cn(
                    'max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed',
                    isUser
                        ? 'bg-yellow-500 text-gray-900'
                        : 'bg-gray-800 text-gray-100',
                )}
            >
                {message.parts.map((part, idx) => {
                    if (part.type === 'text') {
                        return isUser ? (
                            <span key={idx}>{part.text}</span>
                        ) : (
                            <div key={idx} className="prose prose-invert prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0">
                                <ReactMarkdown>{part.text}</ReactMarkdown>
                            </div>
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
