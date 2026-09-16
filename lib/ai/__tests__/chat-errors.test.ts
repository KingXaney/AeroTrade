// The route and the chat panel have to agree on this shape, and they only ever meet
// through a string — HttpChatTransport throws `new Error(await response.text())`, so the
// status code never reaches the client. If the encoding and the parsing drift, the panel
// silently falls back to generic copy for every error.

import {describe, expect, it} from 'vitest';

import {
    chatErrorBody,
    chatErrorStatus,
    describeChatError,
    type ChatErrorCode,
} from '@/lib/ai/chat-errors';

const CODES: ChatErrorCode[] = ['unauthorized', 'bad_request', 'conversation_too_long', 'unavailable'];

describe('round trip', () => {
    it('recovers every code the route can send', () => {
        for (const code of CODES) {
            const wire = JSON.stringify(chatErrorBody(code));
            expect(describeChatError(new Error(wire)).code, code).toBe(code);
        }
    });

    it('gives every code a non-empty message and a real status', () => {
        for (const code of CODES) {
            expect(chatErrorBody(code).error.message.length, code).toBeGreaterThan(10);
            expect(chatErrorStatus(code), code).toBeGreaterThanOrEqual(400);
        }
    });
});

describe('actions', () => {
    it('offers clear, not retry, for an over-long conversation', () => {
        // Re-sending the identical payload fails identically — retry would be a trap.
        const wire = JSON.stringify(chatErrorBody('conversation_too_long'));
        expect(describeChatError(new Error(wire)).action).toBe('clear');
    });

    it('sends an expired session to sign-in', () => {
        const wire = JSON.stringify(chatErrorBody('unauthorized'));
        expect(describeChatError(new Error(wire)).action).toBe('sign_in');
    });

    it('offers retry for a transient failure', () => {
        const wire = JSON.stringify(chatErrorBody('unavailable'));
        expect(describeChatError(new Error(wire)).action).toBe('retry');
    });
});

describe('unrecognised input', () => {
    it('never echoes a raw provider message back to the user', () => {
        const leaky = new Error('Error: connect ECONNREFUSED 10.0.0.5:443 at TCPConnectWrap');
        const described = describeChatError(leaky);
        expect(described.code).toBe('unknown');
        expect(described.message).not.toContain('ECONNREFUSED');
        expect(described.message).not.toContain('10.0.0.5');
    });

    it('does not leak an HTML error page', () => {
        const described = describeChatError(new Error('<!DOCTYPE html><title>504 Gateway Timeout</title>'));
        expect(described.message).not.toContain('<');
    });

    it('recognises an offline fetch failure', () => {
        expect(describeChatError(new TypeError('Failed to fetch')).action).toBe('retry');
        expect(describeChatError(new TypeError('Failed to fetch')).message).toMatch(/connection/i);
    });

    it('survives malformed JSON and unexpected shapes', () => {
        for (const input of ['{not json', '{}', '{"error":{}}', '{"error":{"code":"nope"}}', '', null, undefined, 42]) {
            expect(describeChatError(input as unknown).code, String(input)).toBe('unknown');
        }
    });
});
