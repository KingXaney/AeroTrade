"""The one signature both directions carry (lib/agent-world/signing.ts is the other half).

HMAC-SHA256 over ``f"{timestamp}.{body}"`` with the shared secret, lowercase hex, honoured for
``window_s`` either side of now. The timestamp is unix seconds as sent in the header; the body is
the exact bytes on the wire.
"""

from __future__ import annotations

import hashlib
import hmac
import re

TIMESTAMP_HEADER = "X-Agent-World-Timestamp"
SIGNATURE_HEADER = "X-Agent-World-Signature"
HEARTBEAT_HEADER = "X-Agent-World-Heartbeat"
WINDOW_S = 300

_TIMESTAMP = re.compile(r"^\d{9,11}$")
_SIGNATURE = re.compile(r"^[0-9a-f]{64}$")


def _bytes(value: str | bytes) -> bytes:
    return value if isinstance(value, bytes) else value.encode("utf-8")


def sign(secret: str, ts: int | str, body: str | bytes) -> str:
    """Hex HMAC-SHA256 of ``"{ts}.{body}"``."""
    message = f"{ts}.".encode() + _bytes(body)
    return hmac.new(_bytes(secret), message, hashlib.sha256).hexdigest()


def verify(secret: str | None, ts_header: str | None, sig_header: str | None, body: str | bytes,
           now: float, window_s: int = WINDOW_S) -> bool:
    """Whether a request is signed with ``secret`` within the window. Constant-time compare."""
    if not secret or not ts_header or not sig_header:
        return False
    ts_header, sig_header = ts_header.strip(), sig_header.strip()
    if not _TIMESTAMP.match(ts_header) or not _SIGNATURE.match(sig_header):
        return False
    if abs(now - int(ts_header)) > window_s:
        return False
    return hmac.compare_digest(sign(secret, ts_header, body), sig_header)


def signed_headers(secret: str, body: str | bytes, now: float) -> dict[str, str]:
    """The headers of a signed JSON request; send ``body`` byte for byte as signed."""
    ts = int(now)
    return {
        "Content-Type": "application/json",
        TIMESTAMP_HEADER: str(ts),
        SIGNATURE_HEADER: sign(secret, ts, body),
    }


def same_secret(expected: str | None, given: str | None) -> bool:
    """Constant-time equality for a shared header secret; an unset secret matches nothing."""
    if not expected or given is None:
        return False
    return hmac.compare_digest(_bytes(expected), _bytes(given))
