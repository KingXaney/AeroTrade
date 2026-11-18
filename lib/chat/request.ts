// What one POST /api/chat may carry, read before a counter is spent or the model is asked
// (app/api/chat/route.ts). The body is whatever a signed-in client posted; the panel
// (components/chat/ChatPanel.tsx) only ever posts the stored conversation plus one typed
// question, so that is the whole of what is read:
//
// - a message is a user's or the assistant's. The system prompt is the server's own, and a
//   `system` message from the body would be set beside it;
// - a user message is text. The SDK turns a user `file` part into a file for the model — a
//   megabyte data: URL, an hour of video by URL — which no count of characters ever saw;
// - an assistant message keeps its text, its step boundaries and the settled reads of the tools
//   this caller has, each copied field by field. Anything else (reasoning, files, sources, data
//   parts, another audience's tool, a call that never got its result) is dropped.
//
// Then two sizes, both over what is kept: the text, as before, and everything serialized, since a
// tool's input and output reach the model too and were counted by nothing.
//
// No runtime import (the types are erased), like lib/chat/limits.ts, so the rules are unit-tested:
// lib/chat/__tests__/request.test.ts.

import type {ChatErrorCode} from '@/lib/chat/errors';

// The most messages a body may list, and the newest of them that reach the model: the panel
// posts the whole stored conversation each time.
export const CHAT_MESSAGES_MAX = 200;
export const CHAT_HISTORY_MESSAGES = 40;
export const CHAT_PARTS_MAX = 50;
// A message's id and a tool call's.
export const CHAT_ID_MAX = 200;

// What was typed and what was answered, over the messages that reach the model.
export const CHAT_TEXT_CHARS_MAX = 24_000;
// Everything kept, serialized: the text again plus every tool call's input and output. A ceiling
// of its own, because one ordinary read (the portfolio, the news, a topic's feed) is several
// thousand characters and is posted back with every later question — held to the text's 24,000,
// a conversation would be "too long" after three or four of them. This leaves room for about one
// such read per kept message, and still holds one request to a small fraction of the model's
// context whatever the body says.
export const CHAT_HISTORY_CHARS_MAX = 200_000;

// The one provider field a part carries back: the signature Gemini put on its own text or tool
// call, which it asks to be handed again with that turn.
type ChatSignature = {google: {thoughtSignature: string}};

type ChatTextPart = {type: 'text'; text: string; providerMetadata?: ChatSignature};
type ChatStepStartPart = {type: 'step-start'};
type ChatToolPart =
    | {type: `tool-${string}`; toolCallId: string; state: 'output-available'; input: unknown; output: unknown; callProviderMetadata?: ChatSignature}
    | {type: `tool-${string}`; toolCallId: string; state: 'output-error'; input: unknown; rawInput?: unknown; errorText: string; callProviderMetadata?: ChatSignature};
type ChatAssistantPart = ChatTextPart | ChatStepStartPart | ChatToolPart;

// Declared on its own, and assignable to the SDK's UIMessage: the route hands it to
// convertToModelMessages without a cast.
export type ChatRequestMessage =
    | {id: string; role: 'user'; parts: ChatTextPart[]}
    | {id: string; role: 'assistant'; parts: ChatAssistantPart[]};

type ChatRequestRefusal = Extract<ChatErrorCode, 'bad_request' | 'conversation_too_long'>;
export type ChatRequestRead =
    | {ok: true; messages: ChatRequestMessage[]}
    | {ok: false; code: ChatRequestRefusal};

type Raw = Record<string, unknown>;

const isRecord = (value: unknown): value is Raw =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const signatureOf = (value: unknown): ChatSignature | null => {
    if (!isRecord(value) || !isRecord(value.google)) return null;
    const signature = value.google.thoughtSignature;
    return typeof signature === 'string' ? {google: {thoughtSignature: signature}} : null;
};

const TOOL_PREFIX = 'tool-';

// A read that settled, by a tool in `tools`: its call and its result, or its call and the error
// it ended in. Any other state would hand the model a call with no result.
const toolPart = (raw: Raw, tools: ReadonlySet<string>): ChatToolPart | null => {
    const {type, toolCallId} = raw;
    if (typeof type !== 'string' || !type.startsWith(TOOL_PREFIX) || !tools.has(type.slice(TOOL_PREFIX.length))) return null;
    if (typeof toolCallId !== 'string' || toolCallId.length > CHAT_ID_MAX) return null;
    const signature = signatureOf(raw.callProviderMetadata);
    const signed = signature ? {callProviderMetadata: signature} : {};
    const name = type as `tool-${string}`;
    if (raw.state === 'output-available') {
        if (raw.input === undefined || raw.output === undefined) return null;
        return {type: name, toolCallId, state: 'output-available', input: raw.input, output: raw.output, ...signed};
    }
    if (raw.state === 'output-error') {
        if (typeof raw.errorText !== 'string') return null;
        // A call the model wrote badly has no input, only the text it wrote.
        const rawInput = raw.rawInput === undefined ? {} : {rawInput: raw.rawInput};
        return {type: name, toolCallId, state: 'output-error', input: raw.input, ...rawInput, errorText: raw.errorText, ...signed};
    }
    return null;
};

const assistantPart = (raw: Raw, tools: ReadonlySet<string>): ChatAssistantPart | null => {
    if (raw.type === 'step-start') return {type: 'step-start'};
    if (raw.type === 'text') {
        if (typeof raw.text !== 'string') return null;
        const signature = signatureOf(raw.providerMetadata);
        return {type: 'text', text: raw.text, ...(signature ? {providerMetadata: signature} : {})};
    }
    return toolPart(raw, tools);
};

// One message of the body, or null for a shape the panel never sends.
const messageOf = (raw: unknown, tools: ReadonlySet<string>): ChatRequestMessage | null => {
    if (!isRecord(raw)) return null;
    const {id, role, parts} = raw;
    if (typeof id !== 'string' || id.length > CHAT_ID_MAX) return null;
    if (!Array.isArray(parts) || parts.length > CHAT_PARTS_MAX || !parts.every(isRecord)) return null;
    if (role === 'user') {
        const text: ChatTextPart[] = [];
        for (const part of parts) {
            if (part.type !== 'text' || typeof part.text !== 'string') return null;
            text.push({type: 'text', text: part.text});
        }
        return text.length > 0 ? {id, role, parts: text} : null;
    }
    if (role === 'assistant') {
        const kept: ChatAssistantPart[] = [];
        for (const part of parts) {
            const read = assistantPart(part, tools);
            if (read) kept.push(read);
        }
        return {id, role, parts: kept};
    }
    return null;
};

const textChars = (messages: readonly ChatRequestMessage[]): number => {
    let chars = 0;
    for (const message of messages) for (const part of message.parts) if (part.type === 'text') chars += part.text.length;
    return chars;
};

// The body of one request, as the messages to hand the model. `toolNames` are the tools this
// caller has (the keys of lib/chat/tools.ts buildTools): only their reads are kept. The whole body
// is held to the shape — a message older than the ones that reach the model too — and the sizes
// are of the newest CHAT_HISTORY_MESSAGES alone, the ones that are sent.
export const readChatRequest = (body: unknown, toolNames: readonly string[]): ChatRequestRead => {
    if (!isRecord(body) || !Array.isArray(body.messages)) return {ok: false, code: 'bad_request'};
    const listed: unknown[] = body.messages;
    if (listed.length < 1 || listed.length > CHAT_MESSAGES_MAX) return {ok: false, code: 'bad_request'};

    const tools = new Set(toolNames);
    const read: ChatRequestMessage[] = [];
    for (const raw of listed) {
        const message = messageOf(raw, tools);
        if (!message) return {ok: false, code: 'bad_request'};
        read.push(message);
    }

    const messages = read.slice(-CHAT_HISTORY_MESSAGES);
    if (textChars(messages) > CHAT_TEXT_CHARS_MAX) return {ok: false, code: 'conversation_too_long'};
    if (JSON.stringify(messages).length > CHAT_HISTORY_CHARS_MAX) return {ok: false, code: 'conversation_too_long'};
    return {ok: true, messages};
};
