from agent_world.signing import same_secret, sign, signed_headers, verify

# The vector lib/agent-world/__tests__/signing.test.ts shares.
SECRET = "agent-world-test-secret"
TS = "1761580800"
BODY = ('{"sessionId":"aw-2026-10-26","events":[{"seq":1,"at":"2026-10-27T12:00:00Z","type":"session.started",'
        '"sessionId":"aw-2026-10-26","symbols":["AAPL"],"tradeDate":"2026-10-27","approval":"owner","dryRun":false}]}')
SIGNATURE = "db47e5bc61b5d475afe7a9fc86859ede7f9c7a48b19863de35b860eda011b039"


def test_shared_vector():
    assert sign(SECRET, TS, BODY) == SIGNATURE
    assert sign(SECRET, int(TS), BODY.encode()) == SIGNATURE


def test_verify_accepts_the_vector_inside_the_window():
    assert verify(SECRET, TS, SIGNATURE, BODY, now=int(TS))
    assert verify(SECRET, TS, SIGNATURE, BODY.encode(), now=int(TS) + 300)
    assert verify(SECRET, TS, SIGNATURE, BODY, now=int(TS) - 300)


def test_verify_window_edges():
    assert not verify(SECRET, TS, SIGNATURE, BODY, now=int(TS) + 301)
    assert not verify(SECRET, TS, SIGNATURE, BODY, now=int(TS) - 301)


def test_verify_refuses_tampering_and_malformed_headers():
    now = int(TS)
    assert not verify(SECRET, TS, SIGNATURE, BODY + " ", now)
    assert not verify("another-secret-value", TS, SIGNATURE, BODY, now)
    assert not verify(SECRET, TS, SIGNATURE.upper(), BODY, now)
    assert not verify(SECRET, TS, SIGNATURE[:-1], BODY, now)
    assert not verify(SECRET, "17615808xx", SIGNATURE, BODY, now)
    assert not verify(SECRET, None, SIGNATURE, BODY, now)
    assert not verify(SECRET, TS, None, BODY, now)
    assert not verify("", TS, SIGNATURE, BODY, now)


def test_signed_headers_round_trip():
    body = b'{"hello":"world"}'
    headers = signed_headers(SECRET, body, 1761580800.9)
    assert headers["X-Agent-World-Timestamp"] == "1761580800"
    assert headers["Content-Type"] == "application/json"
    assert verify(SECRET, headers["X-Agent-World-Timestamp"], headers["X-Agent-World-Signature"], body, 1761580801)


def test_same_secret():
    assert same_secret("abc", "abc")
    assert not same_secret("abc", "abd")
    assert not same_secret(None, "abc")
    assert not same_secret("abc", None)
