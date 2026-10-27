import json
import threading

import pytest

from agent_world.emitter import EventEmitter, OriginError
from agent_world.events import CostTick, RoleReport, RoleStarted, RunCompleted, RunStats, SessionCompleted, ToolCalled
from agent_world.signing import verify

SECRET = "agent-world-test-secret"
ORIGIN = "https://aerotrade.example"
CALLBACK = f"{ORIGIN}/api/agent-world/events"


class FakeTransport:
    """Answers with the statuses given, then 200; records every attempt."""

    def __init__(self, statuses=(), fail_with=None):
        self.statuses = list(statuses)
        self.fail_with = list(fail_with or [])
        self.calls = []
        self.lock = threading.Lock()

    def __call__(self, url, body, headers):
        with self.lock:
            self.calls.append((url, body, dict(headers)))
            if self.fail_with:
                exc = self.fail_with.pop(0)
                if exc is not None:
                    raise exc
            return self.statuses.pop(0) if self.statuses else 200

    def batches(self):
        return [json.loads(body) for _, body, _ in self.calls]


class Clock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now


def make(transport, **kw):
    kw.setdefault("sleep", lambda s: None)
    return EventEmitter("aw-test", CALLBACK, SECRET, aerotrade_url=ORIGIN, transport=transport, **kw)


def started(role, symbol="AAPL"):
    return RoleStarted(symbol=symbol, role=role)


def test_order_and_seq_hold_through_failures_and_retries():
    delays = []
    transport = FakeTransport(statuses=[503, 502], fail_with=[None, None, ConnectionError("down")])
    emitter = make(transport, batch_max_events=3, start=False, sleep=delays.append)
    roles = ["market", "sentiment", "news", "fundamentals", "bull", "bear", "trader"]
    for role in roles:
        emitter.emit(started(role))
    emitter._thread.start()
    stats = emitter.close(budget_s=10)
    delivered = transport.batches()
    # Three failed attempts of the first batch, all with the same body, then the rest in order.
    assert transport.calls[0][1] == transport.calls[1][1] == transport.calls[2][1] == transport.calls[3][1]
    seqs = [e["seq"] for batch in delivered[3:] for e in batch["events"]]
    assert seqs == list(range(1, len(roles) + 1))
    assert [e["role"] for batch in delivered[3:] for e in batch["events"]] == roles
    assert delays == [0.5, 1.0, 2.0]
    assert stats.delivered == len(roles) and stats.retries == 3 and stats.rejected == 0


def test_every_post_is_signed_and_compact():
    transport = FakeTransport()
    emitter = make(transport)
    emitter.emit(started("market"))
    emitter.close(budget_s=5)
    url, body, headers = transport.calls[0]
    assert url == CALLBACK
    assert headers["Content-Type"] == "application/json"
    assert verify(SECRET, headers["X-Agent-World-Timestamp"], headers["X-Agent-World-Signature"], body,
                  int(headers["X-Agent-World-Timestamp"]))
    text = body.decode()
    assert text.startswith('{"sessionId":"aw-test","events":[{"seq":1,"at":"') and ", " not in text
    event = json.loads(text)["events"][0]
    assert list(event)[:4] == ["seq", "at", "type", "sessionId"] and event["at"].endswith("Z")


def test_batches_respect_count_and_size():
    transport = FakeTransport()
    emitter = make(transport, start=False)
    for i in range(150):
        emitter.emit(started("market" if i % 2 else "news"))
    for _ in range(30):
        emitter.emit(RoleReport(symbol="AAPL", role="market", text="é" * 12_000))
    emitter._thread.start()
    emitter.close(budget_s=10)
    sizes = [len(body) for _, body, _ in transport.calls]
    counts = [len(b["events"]) for b in transport.batches()]
    assert max(counts) <= 100 and max(sizes) <= 256 * 1024
    assert sum(counts) == 180
    seqs = [e["seq"] for b in transport.batches() for e in b["events"]]
    assert seqs == list(range(1, 181))


def tick(role, tokens, model="gemini-2.5-flash-lite", symbol="AAPL", pricing="known"):
    return CostTick(symbol=symbol, role=role, model=model, inputTokens=tokens, outputTokens=tokens // 10,
                    costCents=tokens / 1000, llmCalls=1, pricing=pricing)


def test_cost_ticks_coalesce_within_two_seconds_and_flush_before_the_run_ends():
    clock = Clock()
    transport = FakeTransport()
    emitter = make(transport, start=False, monotonic=clock)
    emitter.emit(tick("market", 1000))
    clock.now += 1.0
    emitter.emit(tick("market", 2000))
    emitter.emit(tick("news", 500))
    clock.now += 1.5  # the market window (opened at 1000.0) has passed
    emitter.emit(tick("market", 4000, pricing="unknown"))
    emitter.emit(ToolCalled(symbol="AAPL", role="market", name="get_stock_data", args="{}", callId="c1"))
    emitter.emit(RunCompleted(symbol="AAPL", rating="Buy", review=False, decision="d", stats=RunStats()))
    emitter._thread.start()
    emitter.close(budget_s=5)
    events = [e for b in transport.batches() for e in b["events"]]
    kinds = [(e["type"], e.get("role"), e.get("inputTokens")) for e in events]
    assert kinds == [
        ("cost.tick", "market", 3000),          # 1000 + 2000, merged; sent once its window passed
        ("tool.called", "market", None),
        ("cost.tick", "market", 4000),          # both still open, flushed before run.completed
        ("cost.tick", "news", 500),
        ("run.completed", None, None),
    ]
    assert events[0]["llmCalls"] == 2 and events[0]["costCents"] == pytest.approx(3.0)
    assert events[2]["pricing"] == "unknown"
    assert emitter.stats.coalesced == 1


def test_back_pressure_drops_only_droppable_events():
    transport = FakeTransport()
    emitter = make(transport, queue_max=5, start=False)
    for role in ("market", "sentiment", "news"):
        emitter.emit(started(role))
    for n in range(5):
        emitter.emit(ToolCalled(symbol="AAPL", role="market", name="get_news", args="{}", callId=f"c{n}"))
    assert emitter.dropped == 3
    emitter.emit(started("fundamentals"))  # takes the place of the oldest tool event
    assert emitter.dropped == 4
    emitter._thread.start()
    emitter.close(budget_s=5)
    events = [e for b in transport.batches() for e in b["events"]]
    assert [e["type"] for e in events] == ["role.started"] * 3 + ["tool.called", "role.started"]
    assert [e["callId"] for e in events if e["type"] == "tool.called"] == ["c1"]


def test_refused_batches_are_dropped_and_counted():
    transport = FakeTransport(statuses=[400, 200])
    emitter = make(transport, batch_max_events=2, start=False)
    for role in ("market", "sentiment", "news", "fundamentals"):
        emitter.emit(started(role))
    emitter._thread.start()
    stats = emitter.close(budget_s=5)
    assert stats.rejected == 2 and stats.delivered == 2
    assert [e["seq"] for e in transport.batches()[1]["events"]] == [3, 4]


@pytest.mark.parametrize("url", [
    "https://evil.example/api/agent-world/events",
    "http://aerotrade.example/api/agent-world/events",
    "https://aerotrade.example:8443/api/agent-world/events",
    "https://user@aerotrade.example/api/agent-world/events",
    "ftp://aerotrade.example/x",
])
def test_callbacks_off_the_origin_are_refused(url):
    with pytest.raises(OriginError):
        EventEmitter("aw-test", url, SECRET, aerotrade_url=ORIGIN, transport=FakeTransport(), start=False)


def test_default_port_is_the_same_origin():
    emitter = EventEmitter("aw-test", "https://aerotrade.example:443/api/agent-world/events", SECRET,
                           aerotrade_url="https://aerotrade.example/", transport=FakeTransport(), start=False)
    assert emitter.callback_url.endswith("/events")


def test_close_keeps_what_could_not_be_delivered(tmp_path):
    transport = FakeTransport(statuses=[503] * 1000)
    emitter = make(transport, data_dir=tmp_path, sleep=None)
    emitter.emit(started("market"))
    emitter.emit(SessionCompleted(runs=[], tokensIn=0, tokensOut=0, costCents=0, llmCalls=0, toolCalls=0, dropped=0))
    stats = emitter.close(budget_s=0.3)
    saved = json.loads((tmp_path / "undelivered" / "aw-test.json").read_text())
    assert stats.undelivered == 2 and saved["callbackUrl"] == CALLBACK
    assert [e["seq"] for e in saved["events"]] == [1, 2]
    assert emitter.emit(started("news")) is False  # closed
