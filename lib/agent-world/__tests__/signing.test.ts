import {describe, expect, it} from 'vitest';
import {readCappedBody, readSignedRequest, signAgentWorld, signedHeaders, verifyAgentWorld} from '@/lib/agent-world/signing';

// The one vector both halves sign (services/agent-world/tests/test_signing.py holds the same).
const SECRET = 'agent-world-test-secret';
const TS = 1761580800;
const BODY = '{"sessionId":"aw-2026-10-26","events":[{"seq":1,"at":"2026-10-27T12:00:00Z","type":"session.started","sessionId":"aw-2026-10-26","symbols":["AAPL"],"tradeDate":"2026-10-27","approval":"owner","dryRun":false}]}';
const SIGNATURE = 'db47e5bc61b5d475afe7a9fc86859ede7f9c7a48b19863de35b860eda011b039';
const NOW = TS * 1000;

const post = (body: string, headers: Record<string, string>) => new Request('https://aerotrade.test/api/agent-world/events', {method: 'POST', body, headers});

describe('the agent world signature', () => {
    it('signs the shared vector exactly as the service does', () => {
        expect(signAgentWorld(SECRET, TS, BODY)).toBe(SIGNATURE);
    });

    it('verifies inside the window and refuses a stale, a future, a forged or an unsigned request', () => {
        const base = {secret: SECRET, timestamp: String(TS), signature: SIGNATURE, body: BODY};
        expect(verifyAgentWorld({...base, nowMs: NOW})).toEqual({ok: true});
        expect(verifyAgentWorld({...base, nowMs: NOW + 4 * 60_000})).toEqual({ok: true});
        expect(verifyAgentWorld({...base, nowMs: NOW + 6 * 60_000})).toEqual({ok: false, reason: 'window'});
        expect(verifyAgentWorld({...base, nowMs: NOW - 6 * 60_000})).toEqual({ok: false, reason: 'window'});
        expect(verifyAgentWorld({...base, body: `${BODY} `, nowMs: NOW})).toEqual({ok: false, reason: 'signature'});
        expect(verifyAgentWorld({...base, secret: 'another', nowMs: NOW})).toEqual({ok: false, reason: 'signature'});
        expect(verifyAgentWorld({...base, signature: null, nowMs: NOW})).toEqual({ok: false, reason: 'missing'});
        expect(verifyAgentWorld({...base, timestamp: 'yesterday', nowMs: NOW})).toEqual({ok: false, reason: 'timestamp'});
        expect(verifyAgentWorld({...base, signature: 'XYZ', nowMs: NOW})).toEqual({ok: false, reason: 'signature'});
    });

    it('builds headers a verifier accepts', () => {
        const headers = signedHeaders(SECRET, BODY, NOW);
        expect(headers['X-Agent-World-Timestamp']).toBe(String(TS));
        expect(verifyAgentWorld({secret: SECRET, timestamp: headers['X-Agent-World-Timestamp'], signature: headers['X-Agent-World-Signature'], body: BODY, nowMs: NOW})).toEqual({ok: true});
    });

    it('reads a signed request whole, and answers 413, 400 or 401 before trusting a byte', async () => {
        const good = await readSignedRequest(post(BODY, signedHeaders(SECRET, BODY, NOW)), SECRET, {nowMs: NOW, max: 4096});
        expect(good).toEqual({ok: true, text: BODY});
        const unsigned = await readSignedRequest(post(BODY, {'Content-Type': 'application/json'}), SECRET, {nowMs: NOW, max: 4096});
        expect(unsigned).toEqual({ok: false, status: 401, reason: 'missing'});
        const big = await readSignedRequest(post('x'.repeat(5000), signedHeaders(SECRET, 'x'.repeat(5000), NOW)), SECRET, {nowMs: NOW, max: 4096});
        expect(big).toMatchObject({ok: false, status: 413});
    });

    it('stops reading a body once it runs over the cap', async () => {
        const stream = new ReadableStream<Uint8Array>({
            start(controller) {
                for (let i = 0; i < 10; i++) controller.enqueue(new Uint8Array(1000));
                controller.close();
            },
        });
        expect(await readCappedBody({body: stream}, 3000)).toEqual({ok: false, reason: 'too-large'});
        expect(await readCappedBody({body: null}, 10)).toEqual({ok: true, text: ''});
    });
});
