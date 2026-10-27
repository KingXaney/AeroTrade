// What a provider's refusal means (pure): the kind of limit an error or a response status names,
// per provider, or null when it was something else (a bad symbol, a parse error, a network
// blip). Only a hit the app would act on is recorded (lib/limits/record.ts): a quota the day is
// over for, a rate the next call waits out, an auth that needs a key, an outage that is theirs.

import type {LimitKind, LimitProviderId} from "@/lib/limits/registry";

export type LimitSignal = {status?: number; message?: string};

const textOf = (error: unknown): string => {
    if (error instanceof Error) return `${error.message} ${typeof error.cause === 'string' ? error.cause : safeJson(error.cause)}`;
    if (typeof error === 'string') return error;
    return safeJson(error);
};

const safeJson = (value: unknown): string => {
    try {
        return value === undefined ? '' : JSON.stringify(value) ?? '';
    } catch {
        return '';
    }
};

// The HTTP status an error text names, if any ("HTTP 429", "status 503", "responded 403").
const statusIn = (text: string): number | null => {
    const match = /\b(?:HTTP|status|responded|error:?)\s*(\d{3})\b/i.exec(text) ?? /\b(429|503|502|504|401|403)\b/.exec(text);
    return match ? Number(match[1]) : null;
};

const kindOfStatus = (status: number): LimitKind | null => {
    if (status === 429) return 'rate';
    if (status === 401 || status === 403) return 'auth';
    if (status === 502 || status === 503 || status === 504) return 'outage';
    return null;
};

// Gemini: a daily quota is a quota; any other 429 or RESOURCE_EXHAUSTED is a rate.
const geminiKind = (text: string): LimitKind | null => {
    if (/RESOURCE_EXHAUSTED|\b429\b|quota/i.test(text)) return /PerDay|per day|daily/i.test(text) ? 'quota' : 'rate';
    if (/\b(401|403)\b|API key not valid|PERMISSION_DENIED/i.test(text)) return 'auth';
    if (/\b(502|503|504)\b|overloaded|UNAVAILABLE/i.test(text)) return 'outage';
    return null;
};

// YouTube names its daily quota in the error's reason.
const youtubeKind = (text: string, status: number | null): LimitKind | null => {
    if (/quotaExceeded|dailyLimitExceeded/i.test(text)) return 'quota';
    if (/rateLimitExceeded|userRateLimitExceeded/i.test(text)) return 'rate';
    return status === null ? null : kindOfStatus(status);
};

// A Finnhub quote that came back empty is its free plan's answer under a burst, not a 429.
const finnhubKind = (text: string, status: number | null): LimitKind | null => {
    if (status !== null) return kindOfStatus(status);
    if (/live price|no price/i.test(text)) return 'rate';
    return null;
};

export const classifyLimit = (provider: LimitProviderId, signal: unknown): LimitKind | null => {
    const text = typeof signal === 'object' && signal !== null && 'message' in (signal as LimitSignal) && !(signal instanceof Error)
        ? String((signal as LimitSignal).message ?? '')
        : textOf(signal);
    const status = typeof signal === 'object' && signal !== null && typeof (signal as LimitSignal).status === 'number'
        ? (signal as LimitSignal).status as number
        : statusIn(text);
    switch (provider) {
        case 'gemini':
        case 'anthropic':
            return geminiKind(text) ?? (status === null ? null : kindOfStatus(status));
        case 'youtube':
            return youtubeKind(text, status);
        case 'finnhub':
            return finnhubKind(text, status);
        case 'stooq':
            // Stooq answers a 200 whose body says the daily hits limit was exceeded; an empty
            // file is its other way of refusing a burst.
            if (/daily hits limit/i.test(text)) return 'quota';
            if (/empty|blocked|no data/i.test(text)) return 'rate';
            return status === null ? null : kindOfStatus(status);
        case 'alpaca':
            // Alpaca's 403 is "buying power or shares is not sufficient" — an answer, not a limit.
            if (status === 403) return null;
            return status === null ? null : kindOfStatus(status);
        case 'agent-world':
            // A 409 is the service saying a session is already running: an answer, not a limit.
            if (status === 409) return null;
            if (status === null && /unreachable|timed out|ECONNREFUSED|fetch failed/i.test(text)) return 'outage';
            return status === null ? null : kindOfStatus(status);
        case 'paperclip':
            // A 409 (someone else's checkout) or a 422 (not this agent's stage) is an answer.
            if (status === 409 || status === 422) return null;
            if (status === null && /unreachable|timed out|ECONNREFUSED|fetch failed/i.test(text)) return 'outage';
            return status === null ? null : kindOfStatus(status);
        case 'openbb-yfinance':
            // Yahoo, behind OpenBB, refuses a burst with a 429 or "Too Many Requests" in the text.
            if (/too many requests|rate limit/i.test(text)) return 'rate';
            if (status === null && /unreachable|timed out/i.test(text)) return 'outage';
            return status === null ? null : kindOfStatus(status);
        case 'mailer':
            // Gmail's daily sending limit is a 550 or 421 with "limit" in the text.
            if (/\b(421|550)\b.*limit|limit exceeded|quota/i.test(text)) return 'quota';
            if (/\b(534|535)\b|invalid login|authentication/i.test(text)) return 'auth';
            return status === null ? null : kindOfStatus(status);
        default:
            return status === null ? null : kindOfStatus(status);
    }
};
