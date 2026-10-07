// The table's requests: fetch wrappers over the poker night routes (app/api/poker-night/[code]/*),
// the only way the /play page talks to the server — never a server action, which would queue behind
// every other action from this tab and change its id on each deploy. Every request carries
// X-PN-Protocol (lib/poker-night/http: a custom header, so a cross-site page's request fails its
// preflight, and a page left open across a deploy gets 'reload'), JSON for a POST, the seat pass
// where the route takes one, and its own AbortSignal. An answer is the body as a route sent it, or
// an error code — a dropped connection reads as 'unavailable', never as a throw.

import {isErrorCode, PASS_HEADER, PN_PROTOCOL, PROTOCOL_HEADER, type PokerNightErrorCode} from "@/lib/poker-night/http";
import type {ActionInput, JoinBody as JoinInputBody, TickInput} from "@/lib/poker-night/input";
import type {DetailView, JoinReply, PlayerView, TokenReply, Unchanged} from "@/lib/poker-night/view-types";

export type ApiResult<T> =
    | {ok: true; body: T; status: number; sentAt: number; receivedAt: number}
    | {ok: false; code: PokerNightErrorCode; status: number; sentAt: number; receivedAt: number; aborted: boolean};

const base = (code: string) => `/api/poker-night/${encodeURIComponent(code)}`;

type Options = {pass?: string | null; signal?: AbortSignal};

const request = async <T>(url: string, init: {method: 'GET' | 'POST'; body?: unknown} & Options): Promise<ApiResult<T>> => {
    const headers: Record<string, string> = {[PROTOCOL_HEADER]: String(PN_PROTOCOL), Accept: 'application/json'};
    if (init.body !== undefined) headers['Content-Type'] = 'application/json';
    if (init.pass) headers[PASS_HEADER] = init.pass;
    const sentAt = Date.now();
    try {
        const response = await fetch(url, {
            method: init.method, headers, body: init.body === undefined ? undefined : JSON.stringify(init.body),
            cache: 'no-store', credentials: 'same-origin', signal: init.signal,
        });
        const receivedAt = Date.now();
        let body: unknown = null;
        try {
            body = await response.json();
        } catch {
            body = null;
        }
        if (response.ok && body !== null && typeof body === 'object' && !('error' in body)) {
            return {ok: true, body: body as T, status: response.status, sentAt, receivedAt};
        }
        const named = body !== null && typeof body === 'object' ? (body as {error?: unknown}).error : undefined;
        const code: PokerNightErrorCode = isErrorCode(named) ? named : response.status === 429 ? 'rate_limited' : 'unavailable';
        return {ok: false, code, status: response.status, sentAt, receivedAt, aborted: false};
    } catch (error) {
        const aborted = error instanceof DOMException && error.name === 'AbortError';
        return {ok: false, code: 'unavailable', status: 0, sentAt, receivedAt: Date.now(), aborted};
    }
};

// GET state?since=&esince=: the viewer's view, or Unchanged when neither version moved.
export const getState = (code: string, q: {since: number | null; esince: number | null}, opts: Options = {}) => {
    const params = new URLSearchParams();
    if (q.since !== null) params.set('since', String(q.since));
    if (q.esince !== null) params.set('esince', String(q.esince));
    const query = params.toString();
    return request<PlayerView | Unchanged>(`${base(code)}/state${query ? `?${query}` : ''}`, {method: 'GET', ...opts});
};

export type DetailQuery = {part: 'log'; hand?: number | null} | {part: 'history'; before?: number | null} | {part: 'bank'};

// GET detail: a hand's whole log, a page of history, or the bank's events.
export const getDetail = (code: string, q: DetailQuery, opts: Options = {}) => {
    const params = new URLSearchParams({part: q.part});
    if (q.part === 'log' && q.hand !== undefined && q.hand !== null) params.set('hand', String(q.hand));
    if (q.part === 'history' && q.before !== undefined && q.before !== null) params.set('before', String(q.before));
    return request<DetailView>(`${base(code)}/detail?${params.toString()}`, {method: 'GET', ...opts});
};

// GET token: the room's realtime channel and a subscribe-only Ably token for it, or {realtime:
// false} when this deployment polls.
export const getToken = (code: string, opts: Options = {}) => request<TokenReply>(`${base(code)}/token`, {method: 'GET', ...opts});

// POST join: the identity is always read in full (no pass).
export const postJoin = (code: string, body: JoinInputBody, opts: Pick<Options, 'signal'> = {}) =>
    request<JoinReply>(`${base(code)}/join`, {method: 'POST', body, ...opts});

// POST action: the identity is always read in full; the pass, when sent, only names the player's own
// rate bucket, so players behind one address (a household's Wi-Fi) never share one.
export const postAction = (code: string, body: ActionInput, opts: Options = {}) =>
    request<PlayerView>(`${base(code)}/action`, {method: 'POST', body, ...opts});

// POST tick: the clock's nudge, with a presence beat while the page is visible.
export const postTick = (code: string, body: TickInput, opts: Options = {}) =>
    request<PlayerView | Unchanged>(`${base(code)}/tick`, {method: 'POST', body, ...opts});

export const isUnchanged = (body: PlayerView | Unchanged): body is Unchanged => 'unchanged' in body && body.unchanged === true;

const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

// An id for one intent (an action, a join), made in the event handler that starts it and reused on
// its retry: a UUID where the browser has one (secure contexts), else 22 characters of base64url
// from the Web Crypto API — both inside lib/poker-night/input's ACTION_ID.
export const newActionId = (): string => {
    const c = globalThis.crypto;
    if (typeof c?.randomUUID === 'function') return c.randomUUID();
    // Each byte's low six bits pick a symbol: 256 is a multiple of 64, so every symbol is as likely.
    const bytes = c.getRandomValues(new Uint8Array(22));
    let out = '';
    for (const byte of bytes) out += B64URL[byte & 63];
    return out;
};
