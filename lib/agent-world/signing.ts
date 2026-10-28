// The one signature both directions carry: the job's POST /runs to the service, and every batch of
// events the service posts back. HMAC-SHA256 over `${timestamp}.${body}` with the shared secret,
// hex, honoured for SIGNATURE_WINDOW_MS either side of now (services/agent-world/agent_world/
// signing.py is the other half; the two tests share one vector). Server-only (node:crypto).

import {createHmac, timingSafeEqual} from 'node:crypto';
import {SIGNATURE_WINDOW_MS} from "@/lib/agent-world/config";

export const TIMESTAMP_HEADER = 'x-agent-world-timestamp';
export const SIGNATURE_HEADER = 'x-agent-world-signature';
export const HEARTBEAT_HEADER = 'x-agent-world-heartbeat';

export const signAgentWorld = (secret: string, timestampSec: number, body: string): string =>
    createHmac('sha256', secret).update(`${timestampSec}.${body}`).digest('hex');

// Constant-time equality for two strings of any length.
export const sameText = (a: string, b: string): boolean => {
    const x = Buffer.from(a, 'utf8');
    const y = Buffer.from(b, 'utf8');
    return x.length === y.length && timingSafeEqual(x, y);
};

export type VerifyResult = {ok: true} | {ok: false; reason: 'missing' | 'timestamp' | 'window' | 'signature'};

export const verifyAgentWorld = ({secret, timestamp, signature, body, nowMs, windowMs = SIGNATURE_WINDOW_MS}: {
    secret: string;
    timestamp: string | null;
    signature: string | null;
    body: string;
    nowMs: number;
    windowMs?: number;
}): VerifyResult => {
    if (!timestamp || !signature) return {ok: false, reason: 'missing'};
    if (!/^\d{9,11}$/.test(timestamp)) return {ok: false, reason: 'timestamp'};
    const seconds = Number(timestamp);
    if (Math.abs(nowMs - seconds * 1000) > windowMs) return {ok: false, reason: 'window'};
    if (!/^[0-9a-f]{64}$/.test(signature)) return {ok: false, reason: 'signature'};
    return sameText(signAgentWorld(secret, seconds, body), signature) ? {ok: true} : {ok: false, reason: 'signature'};
};

// The headers a signed JSON request carries; `body` must be sent byte for byte as signed.
export const signedHeaders = (secret: string, body: string, nowMs: number): Record<string, string> => {
    const timestamp = Math.floor(nowMs / 1000);
    return {
        'Content-Type': 'application/json',
        'X-Agent-World-Timestamp': String(timestamp),
        'X-Agent-World-Signature': signAgentWorld(secret, timestamp, body),
    };
};

// A request body read to at most `max` bytes: the reader is cancelled the moment it runs over,
// so an oversized post costs no more than the cap. Kept apart from poker night's copy so this
// feature imports nothing of it.
export const readCappedBody = async (request: {body: ReadableStream<Uint8Array> | null}, max: number): Promise<{ok: true; text: string} | {ok: false; reason: 'too-large' | 'invalid'}> => {
    if (request.body === null) return {ok: true, text: ''};
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
                return {ok: false, reason: 'too-large'};
            }
            chunks.push(value);
        }
    } catch {
        return {ok: false, reason: 'invalid'};
    }
    const bytes = new Uint8Array(size);
    let at = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, at);
        at += chunk.byteLength;
    }
    try {
        return {ok: true, text: new TextDecoder('utf-8', {fatal: true}).decode(bytes)};
    } catch {
        return {ok: false, reason: 'invalid'};
    }
};

export type SignedRead = {ok: true; text: string} | {ok: false; status: 400 | 401 | 413; reason: string};

// A signed request's body, or the status to answer it with: 413 over the cap, 400 unreadable,
// 401 unsigned, stale or forged. The declared length is checked first, so an honest oversized
// post is refused before a byte is read.
export const readSignedRequest = async (request: Request, secret: string, {nowMs, max}: {nowMs: number; max: number}): Promise<SignedRead> => {
    const declared = Number(request.headers.get('content-length') ?? '');
    if (Number.isFinite(declared) && declared > max) return {ok: false, status: 413, reason: 'too-large'};
    const read = await readCappedBody(request, max);
    if (!read.ok) return read.reason === 'too-large' ? {ok: false, status: 413, reason: 'too-large'} : {ok: false, status: 400, reason: 'invalid'};
    const verdict = verifyAgentWorld({
        secret,
        timestamp: request.headers.get(TIMESTAMP_HEADER),
        signature: request.headers.get(SIGNATURE_HEADER),
        body: read.text,
        nowMs,
    });
    return verdict.ok ? {ok: true, text: read.text} : {ok: false, status: 401, reason: verdict.reason};
};
