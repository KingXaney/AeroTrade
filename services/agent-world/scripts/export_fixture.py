"""Write the event stream AeroTrade's QA plays: scripts/qa/fixtures/agent-world-events.json.

Folds tests/fixtures/stream_chunks.json through the StageMachine (with one synthetic cost tick per
role and the session's envelope events), numbers the events 1..N and stamps them over about twenty
minutes from 2026-10-26T12:30:00Z, as a real session would arrive.

    uv run python scripts/export_fixture.py [--out PATH] [--check]

``--check`` compares with the file on disk instead of writing it (exit 1 when they differ).
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from collections import Counter
from datetime import UTC, datetime, timedelta
from pathlib import Path

os.environ.setdefault("AGENT_WORLD_NO_DOTENV", "1")

from agent_world import fixture  # noqa: E402
from agent_world.events import (  # noqa: E402
    Models,
    RunSummary,
    SessionCompleted,
    SessionStarted,
    parse_event,
    to_wire,
)
from agent_world.roles import ROLE_IDS  # noqa: E402

SERVICE_DIR = Path(__file__).resolve().parent.parent
REPO_DIR = SERVICE_DIR.parent.parent
DEFAULT_OUT = REPO_DIR / "scripts" / "qa" / "fixtures" / "agent-world-events.json"
START = datetime(2026, 10, 26, 12, 30, 0, tzinfo=UTC)
GAP_BETWEEN_RUNS_S = 12.0
STEP_SPACING_S = 0.05
BANNED = ("should", "recommend", "best", "optimal", "consider", "better", "beat", "outperform", "mistake",
          "guaranteed", "will rise", "will fall")


def stamp(offset_s: float) -> str:
    moment = START + timedelta(seconds=offset_s)
    return moment.strftime("%Y-%m-%dT%H:%M:%S.") + f"{moment.microsecond // 1000:03d}Z"


def build(source: dict) -> dict:
    session_id = source["sessionId"]
    runs = source["runs"]
    symbols = [run["symbol"] for run in runs]
    timeline: list[tuple[float, object]] = [(0.4, SessionStarted(
        symbols=symbols, tradeDate=source["tradeDate"], approval="owner", dryRun=False,
        models=Models(**source["models"])))]

    offset = 1.0
    totals = Counter()
    cents = 0.0
    summaries = []
    for index, run in enumerate(runs):
        folded = fixture.fold_run(run, index=index, total=len(runs),
                                  max_debate_rounds=source["maxDebateRounds"],
                                  max_risk_rounds=source["maxRiskRounds"],
                                  max_tool_rounds=source["maxToolRounds"])
        for t, event in folded:
            timeline.append((offset + t, event))
            if event.type == "run.completed":
                stats = event.stats
                totals.update({"tokensIn": stats.tokensIn, "tokensOut": stats.tokensOut,
                               "llmCalls": stats.llmCalls, "toolCalls": stats.toolCalls})
                cents += stats.costCents
                summaries.append(RunSummary(symbol=event.symbol, rating=event.rating, review=event.review))
        offset += float(run["end"]) + GAP_BETWEEN_RUNS_S

    timeline.append((offset - GAP_BETWEEN_RUNS_S + 1.0, SessionCompleted(
        runs=summaries, tokensIn=totals["tokensIn"], tokensOut=totals["tokensOut"], costCents=round(cents, 6),
        llmCalls=totals["llmCalls"], toolCalls=totals["toolCalls"], dropped=0)))

    events = []
    last = -1.0
    for seq, (t, event) in enumerate(timeline, start=1):
        moment = max(t, last + STEP_SPACING_S)
        last = moment
        data = to_wire(event)
        data.update(seq=seq, at=stamp(moment), sessionId=session_id)
        events.append(to_wire(parse_event(data)))
    return {"sessionId": session_id, "symbols": symbols, "events": events}


def check(payload: dict) -> list[str]:
    problems = []
    events = payload["events"]
    if [e["seq"] for e in events] != list(range(1, len(events) + 1)):
        problems.append("seq does not run 1..N")
    if events[0]["type"] != "session.started" or events[-1]["type"] != "session.completed":
        problems.append("the stream must open with session.started and end with session.completed")
    stamps = [e["at"] for e in events]
    if stamps != sorted(stamps):
        problems.append("timestamps go backwards")
    roles = {e.get("role") or e.get("side") for e in events if e.get("symbol") == "AAPL"}
    missing = [r for r in ROLE_IDS if r not in roles]
    if missing:
        problems.append(f"AAPL lacks roles {missing}")
    text = json.dumps(payload).lower()
    for word in BANNED:
        if re.search(re.escape(word), text):
            problems.append(f"banned word {word!r} in the fixture")
    return problems


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    payload = build(fixture.load())
    problems = check(payload)
    if problems:
        for problem in problems:
            print("problem:", problem, file=sys.stderr)
        return 1
    rendered = json.dumps(payload, indent=1, ensure_ascii=False) + "\n"
    counts = Counter(e["type"] for e in payload["events"])
    if args.check:
        same = args.out.exists() and args.out.read_text(encoding="utf-8") == rendered
        print("up to date" if same else f"{args.out} differs from the stream fixture")
        return 0 if same else 1
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(rendered, encoding="utf-8")
    first, last = payload["events"][0]["at"], payload["events"][-1]["at"]
    print(f"wrote {args.out} — {len(payload['events'])} events from {first} to {last}")
    for kind, n in sorted(counts.items()):
        print(f"  {kind:18} {n}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
