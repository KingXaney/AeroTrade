// Turning a failed chat request into something a person can act on.
//
// The constraint that shapes this: the AI SDK's HttpChatTransport throws
// `new Error(await response.text())` for any non-OK response. The client never sees the
// status code — only the body string. So the route has to make its body machine-readable
// and the panel has to parse it back, or the only thing the UI can say is "something
// went wrong".
//
// Pure module (no React, no next/server) so it can be unit-tested from both sides.

export type ChatErrorCode =
    | 'unauthorized'
    | 'bad_request'
    | 'conversation_too_long'
    | 'unavailable';

type Spec = {status: number; message: string};

const SPECS: Record<ChatErrorCode, Spec> = {
    unauthorized: {status: 401, message: 'Your session expired. Sign in again to keep chatting.'},
    bad_request: {status: 400, message: "That message couldn't be sent. Try rephrasing it."},
    conversation_too_long: {
        status: 413,
        message: 'This conversation got too long for one request. Clear the chat to start fresh — your topics and watchlist are unaffected.',
    },
    unavailable: {status: 503, message: 'The assistant is unavailable right now. Try again in a moment.'},
};

/** What the panel should offer the user next. */
export type ChatErrorAction = 'retry' | 'clear' | 'sign_in' | 'none';

const ACTIONS: Record<ChatErrorCode, ChatErrorAction> = {
    unauthorized: 'sign_in',
    // Re-sending the identical payload fails identically, so retry is the wrong verb.
    conversation_too_long: 'clear',
    bad_request: 'none',
    unavailable: 'retry',
};

export const chatErrorBody = (code: ChatErrorCode) => ({
    error: {code, message: SPECS[code].message},
});

export const chatErrorStatus = (code: ChatErrorCode): number => SPECS[code].status;

export type ChatErrorDescription = {
    code: ChatErrorCode | 'unknown';
    message: string;
    action: ChatErrorAction;
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null;

const asCode = (v: unknown): ChatErrorCode | null =>
    typeof v === 'string' && v in SPECS ? (v as ChatErrorCode) : null;

/**
 * Map whatever the transport threw into copy and an affordance. Never surfaces the raw
 * message: it can be a provider error, an HTML error page from the host, or an in-stream
 * masked string — none of which is user copy, and some of which leaks infrastructure.
 */
export const describeChatError = (error: unknown): ChatErrorDescription => {
    const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : '';

    // A network failure never reaches the route, so it has no body to parse.
    if (/failed to fetch|networkerror|load failed/i.test(raw)) {
        return {
            code: 'unavailable',
            message: "Couldn't reach the server — check your connection and try again.",
            action: 'retry',
        };
    }

    try {
        const parsed: unknown = JSON.parse(raw);
        if (isRecord(parsed) && isRecord(parsed.error)) {
            const code = asCode(parsed.error.code);
            if (code) return {code, message: SPECS[code].message, action: ACTIONS[code]};
        }
    } catch {
        // Not our JSON — fall through to the generic case below.
    }

    return {
        code: 'unknown',
        message: "The assistant couldn't finish that. Try again.",
        action: 'retry',
    };
};
