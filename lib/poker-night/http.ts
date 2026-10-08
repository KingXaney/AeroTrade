// Poker night's HTTP contract: the protocol header every request carries, the error codes every
// route answers with and their statuses, the engine's refusals mapped onto them, and the checks a
// request passes before anything is read — same origin for a POST, a JSON body of at most 2 KiB.
// Pure and client-safe: the table's fetch helper sends the same header and reads the same codes,
// and every code has its sentence in lib/learn/copy/poker-night's POKER_NIGHT_ERRORS.
//
// Why a custom header: X-PN-Protocol is not a CORS-safelisted header, so a cross-site page that
// sends it must pass a preflight, which fails — no route ever sends an Access-Control-Allow-*
// header. A deploy that changes the request schema bumps PN_PROTOCOL, and a page still running the
// old code gets 426 'reload' instead of a confusing refusal.

import {LIMITS} from '@/lib/poker-night/limits';
import type {Refusal} from '@/lib/poker-night/types';

export const PN_PROTOCOL = 2;
export const PROTOCOL_HEADER = 'x-pn-protocol';
export const PASS_HEADER = 'x-pn-pass';

// Every code and its status. Codes named after a refusal say the same thing it does.
const ERROR_STATUS = {
    bad_request: 400,
    no_identity: 401,
    cross_origin: 403,
    not_player: 403,
    banned: 403,
    locked: 403,
    forbidden: 403,
    not_host: 403,
    needs_account: 403,
    not_found: 404,
    watchers_full: 409,
    room_full: 409,
    host_cap: 409,
    stale: 409,
    not_your_turn: 409,
    not_now: 409,
    not_seated: 409,
    already_seated: 409,
    seat_taken: 409,
    no_request: 409,
    rebuys_off: 409,
    rebuy_cap: 409,
    asks_off: 409,
    ask_waiting: 409,
    ask_limit: 409,
    ask_cooldown: 409,
    asks_full: 409,
    closed: 410,
    invalid_action: 422,
    bad_seat: 422,
    bad_amount: 422,
    below_buy_in: 422,
    over_cap: 422,
    below_min_raise: 422,
    bad_config: 422,
    reload: 426,
    rate_limited: 429,
    busy: 503,
    unavailable: 503,
} as const;

export type PokerNightErrorCode = keyof typeof ERROR_STATUS;

export const ERROR_CODES = Object.keys(ERROR_STATUS) as PokerNightErrorCode[];

export const isErrorCode = (value: unknown): value is PokerNightErrorCode =>
    typeof value === 'string' && Object.prototype.hasOwnProperty.call(ERROR_STATUS, value);

export const errorStatus = (code: PokerNightErrorCode): number => ERROR_STATUS[code];

export type ErrorBody = {error: PokerNightErrorCode};

export const errorBody = (code: PokerNightErrorCode): ErrorBody => ({error: code});

// Keyed on every refusal, so a new one does not compile without its code. The clock's own
// refusals (a bad deck, a step not yet due) never answer a request; they read as an invalid action.
const REFUSAL_CODES: Record<Refusal, PokerNightErrorCode> = {
    closed: 'closed',
    'not-now': 'not_now',
    'not-host': 'not_host',
    'not-seated': 'not_seated',
    'already-seated': 'already_seated',
    'seat-taken': 'seat_taken',
    'bad-seat': 'bad_seat',
    'bad-amount': 'bad_amount',
    'below-buy-in': 'below_buy_in',
    'over-cap': 'over_cap',
    'rebuys-off': 'rebuys_off',
    'rebuy-cap': 'rebuy_cap',
    'no-request': 'no_request',
    'not-your-turn': 'not_your_turn',
    stale: 'stale',
    illegal: 'invalid_action',
    'below-min-raise': 'below_min_raise',
    'bad-config': 'bad_config',
    'bad-deck': 'invalid_action',
    'not-due': 'invalid_action',
    'asks-off': 'asks_off',
    'ask-waiting': 'ask_waiting',
    'ask-limit': 'ask_limit',
    'ask-cooldown': 'ask_cooldown',
    'asks-full': 'asks_full',
};

export const refusalToCode = (reason: Refusal): PokerNightErrorCode => REFUSAL_CODES[reason];

type HeaderReader = {get(name: string): string | null};

export const protocolOk = (headers: HeaderReader): boolean => headers.get(PROTOCOL_HEADER)?.trim() === String(PN_PROTOCOL);

// A POST from the table's own page. Sec-Fetch-Site, which a browser sets and a page cannot, says
// so when present; an older browser's Origin must then equal the request's own origin. Neither
// header means the request did not come from a browser page we can vouch for: refused.
export const sameOriginRequest = (headers: HeaderReader, url: string): boolean => {
    const site = headers.get('sec-fetch-site');
    if (site !== null) return site.trim().toLowerCase() === 'same-origin';
    const origin = headers.get('origin');
    if (origin === null) return false;
    try {
        return origin.trim() === new URL(url).origin;
    } catch {
        return false;
    }
};

// application/json, with or without a charset.
export const jsonContentType = (headers: HeaderReader): boolean =>
    /^application\/json\s*(;|$)/i.test(headers.get('content-type')?.trim() ?? '');

// False when the request declares a body longer than a POST may be; a request that declares none
// is checked again on the text it sends (route-kit reads at most that much).
export const declaredLengthOk = (headers: HeaderReader, max: number = LIMITS.postBodyBytes): boolean => {
    const raw = headers.get('content-length');
    if (raw === null) return true;
    const n = Number(raw);
    return Number.isSafeInteger(n) && n >= 0 && n <= max;
};

// The body's size in bytes as sent (UTF-8), held to the same cap.
export const bodyTextOk = (text: string, max: number = LIMITS.postBodyBytes): boolean =>
    text.length <= max && new TextEncoder().encode(text).length <= max;

// A POST body's text, read from its stream and given up as soon as it passes `max` bytes, so a
// body that declared no length (or lied about it) is never read whole. Null when it is too long or
// is not UTF-8.
export const readCappedText = async (request: {body: ReadableStream<Uint8Array> | null}, max: number = LIMITS.postBodyBytes): Promise<string | null> => {
    if (request.body === null) return '';
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
        for (;;) {
            const {done, value} = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > max) {
                await reader.cancel().catch(() => undefined);
                return null;
            }
            chunks.push(value);
        }
    } catch {
        return null;
    }
    const bytes = new Uint8Array(size);
    let at = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, at);
        at += chunk.byteLength;
    }
    try {
        return new TextDecoder('utf-8', {fatal: true}).decode(bytes);
    } catch {
        return null;
    }
};
