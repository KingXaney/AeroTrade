// The HTTP contract: every error code has a status of the right family; every engine refusal maps to
// a code; a request without the protocol header is a reload; the same-origin matrix for POSTs;
// the JSON and size checks a body passes before it is parsed, and the capped read of it.

import {describe, expect, it} from 'vitest';
import {
    bodyTextOk, declaredLengthOk, ERROR_CODES, errorBody, errorStatus, isErrorCode, jsonContentType, PASS_HEADER, PN_PROTOCOL, protocolOk,
    PROTOCOL_HEADER, readCappedText, refusalToCode, sameOriginRequest,
} from '@/lib/poker-night/http';
import type {Refusal} from '@/lib/poker-night/types';

const h = (entries: Record<string, string>) => new Headers(entries);

const REFUSALS: Refusal[] = [
    'closed', 'not-now', 'not-host', 'not-seated', 'already-seated', 'seat-taken', 'bad-seat', 'bad-amount', 'below-buy-in', 'over-cap',
    'rebuys-off', 'rebuy-cap', 'no-request', 'not-your-turn', 'stale', 'illegal', 'below-min-raise', 'bad-config', 'bad-deck', 'not-due',
    'asks-off', 'ask-waiting', 'ask-limit', 'ask-cooldown',
];

describe('the error codes', () => {
    it('give every code a status', () => {
        expect(ERROR_CODES.length).toBeGreaterThan(20);
        expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
        for (const code of ERROR_CODES) {
            expect([400, 401, 403, 404, 409, 410, 422, 426, 429, 503]).toContain(errorStatus(code));
            expect(code).toMatch(/^[a-z]+(_[a-z]+)*$/);
            expect(isErrorCode(code)).toBe(true);
            expect(errorBody(code)).toEqual({error: code});
        }
        expect(isErrorCode('toString')).toBe(false);
        expect(isErrorCode('nope')).toBe(false);
    });

    it('pin the statuses the client acts on', () => {
        expect(errorStatus('reload')).toBe(426);
        expect(errorStatus('rate_limited')).toBe(429);
        expect(errorStatus('closed')).toBe(410);
        expect(errorStatus('not_found')).toBe(404);
        expect(errorStatus('no_identity')).toBe(401);
        expect(errorStatus('banned')).toBe(403);
        expect(errorStatus('busy')).toBe(503);
        expect(errorStatus('unavailable')).toBe(503);
        expect(errorStatus('stale')).toBe(409);
        expect(errorStatus('bad_request')).toBe(400);
        expect(errorStatus('invalid_action')).toBe(422);
    });

    it('map every refusal to a code, the clock\'s own to an invalid action', () => {
        for (const r of REFUSALS) expect(ERROR_CODES).toContain(refusalToCode(r));
        expect(refusalToCode('stale')).toBe('stale');
        expect(refusalToCode('not-your-turn')).toBe('not_your_turn');
        expect(refusalToCode('seat-taken')).toBe('seat_taken');
        expect(refusalToCode('illegal')).toBe('invalid_action');
        expect(refusalToCode('bad-deck')).toBe('invalid_action');
        expect(refusalToCode('not-due')).toBe('invalid_action');
        expect(refusalToCode('ask-cooldown')).toBe('ask_cooldown');
        // Each refusal but the three that share invalid_action has a code of its own.
        const codes = REFUSALS.map(refusalToCode);
        expect(new Set(codes).size).toBe(REFUSALS.length - 2);
    });
});

describe('the request checks', () => {
    it('want the protocol header, and a mismatch means reload', () => {
        expect(PN_PROTOCOL).toBe(2);
        expect(PROTOCOL_HEADER).toBe('x-pn-protocol');
        expect(PASS_HEADER).toBe('x-pn-pass');
        expect(protocolOk(h({'X-PN-Protocol': '2'}))).toBe(true);
        expect(protocolOk(h({'x-pn-protocol': ' 2 '}))).toBe(true);
        expect(protocolOk(h({'x-pn-protocol': '1'}))).toBe(false);
        expect(protocolOk(h({}))).toBe(false);
    });

    it('take a POST from the same origin only', () => {
        const url = 'https://aero.example/api/poker-night/K7QXM4/action';
        const matrix: [Record<string, string>, boolean][] = [
            [{'sec-fetch-site': 'same-origin'}, true],
            [{'sec-fetch-site': 'same-origin', origin: 'https://aero.example'}, true],
            [{'sec-fetch-site': 'same-site'}, false],
            [{'sec-fetch-site': 'cross-site', origin: 'https://aero.example'}, false],
            [{'sec-fetch-site': 'none'}, false],
            [{origin: 'https://aero.example'}, true],
            [{origin: 'https://evil.example'}, false],
            [{origin: 'http://aero.example'}, false],
            [{origin: 'https://aero.example:8443'}, false],
            [{origin: 'null'}, false],
            [{}, false],
        ];
        for (const [headers, ok] of matrix) expect(sameOriginRequest(h(headers), url), JSON.stringify(headers)).toBe(ok);
        expect(sameOriginRequest(h({origin: 'http://localhost:3000'}), 'http://localhost:3000/api/poker-night/K7QXM4/join')).toBe(true);
        expect(sameOriginRequest(h({origin: 'https://aero.example'}), 'not a url')).toBe(false);
    });

    it('want a JSON body of at most 2 KiB', () => {
        expect(jsonContentType(h({'content-type': 'application/json'}))).toBe(true);
        expect(jsonContentType(h({'content-type': 'application/json; charset=utf-8'}))).toBe(true);
        expect(jsonContentType(h({'content-type': 'text/plain'}))).toBe(false);
        expect(jsonContentType(h({'content-type': 'application/jsonp'}))).toBe(false);
        expect(jsonContentType(h({}))).toBe(false);
        expect(declaredLengthOk(h({'content-length': '2048'}))).toBe(true);
        expect(declaredLengthOk(h({'content-length': '2049'}))).toBe(false);
        expect(declaredLengthOk(h({'content-length': 'lots'}))).toBe(false);
        expect(declaredLengthOk(h({}))).toBe(true);
        expect(bodyTextOk('x'.repeat(2048))).toBe(true);
        expect(bodyTextOk('x'.repeat(2049))).toBe(false);
        // Counted in bytes: 700 three-byte characters are 2,100 bytes.
        expect(bodyTextOk('€'.repeat(700))).toBe(false);
    });
});

describe('reading a body', () => {
    // A request whose body arrives in the given chunks, with no declared length.
    const streamed = (...chunks: Uint8Array[]) => {
        let pulled = 0;
        let cancelled = false;
        const body = new ReadableStream<Uint8Array>({
            pull(controller) {
                if (pulled < chunks.length) controller.enqueue(chunks[pulled++]);
                else controller.close();
            },
            cancel() {
                cancelled = true;
            },
        });
        return {request: {body}, pulled: () => pulled, cancelled: () => cancelled};
    };
    const bytes = (text: string) => new TextEncoder().encode(text);

    it('reads a body up to the cap, in UTF-8', async () => {
        expect(await readCappedText(new Request('https://aero.example/', {method: 'POST', body: '{"a":1}'}))).toBe('{"a":1}');
        expect(await readCappedText({body: null})).toBe('');
        expect(await readCappedText(streamed(bytes('€'.repeat(10))).request)).toBe('€'.repeat(10));
        expect(await readCappedText(streamed(bytes('x'.repeat(2048))).request)).toHaveLength(2048);
    });

    it('stops reading as soon as the body passes the cap', async () => {
        const body = streamed(bytes('x'.repeat(1500)), bytes('x'.repeat(1500)), bytes('x'.repeat(1500)));
        expect(await readCappedText(body.request)).toBeNull();
        expect(body.pulled()).toBe(2);
        expect(body.cancelled()).toBe(true);
        expect(await readCappedText(streamed(bytes('x'.repeat(11))).request, 10)).toBeNull();
    });

    it('refuses bytes that are not UTF-8', async () => {
        expect(await readCappedText(streamed(new Uint8Array([0x7b, 0xff, 0x7d])).request)).toBeNull();
    });
});
