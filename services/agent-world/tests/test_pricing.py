import math

import pytest

from agent_world.pricing import PRICES, PRICES_CHECKED, PricesError, cost_cents, merge_prices, parse_prices, price_for
from agent_world.stats import AgentWorldStatsHandler
from conftest import make_settings


def test_longest_prefix_wins():
    lite = price_for("gemini-2.5-flash-lite")
    flash = price_for("gemini-2.5-flash")
    assert (lite.input_per_m, lite.output_per_m) == PRICES["gemini-2.5-flash-lite"]
    assert (flash.input_per_m, flash.output_per_m) == PRICES["gemini-2.5-flash"]
    # A dated or suffixed id falls to the longest row that prefixes it.
    assert price_for("gemini-2.5-flash-lite-preview-09-2025").input_per_m == PRICES["gemini-2.5-flash-lite"][0]
    assert price_for("models/gemini-2.5-flash-001").known


def test_unknown_model_costs_nothing_and_says_so():
    price = price_for("gemini-3.8-flash")
    assert not price.known
    cents, known = cost_cents("gemini-3.8-flash", 10_000, 2_000)
    assert cents == 0 and not known


def test_cost_in_cents():
    # 1M input tokens of flash-lite at $0.10 and 1M output at $0.40: 50 cents.
    cents, known = cost_cents("gemini-2.5-flash-lite", 1_000_000, 1_000_000)
    assert known and math.isclose(cents, 50.0)
    cents, _ = cost_cents("gemini-2.5-flash", 2_000, 500)
    assert math.isclose(cents, (2_000 * 0.30 + 500 * 2.50) / 1_000_000 * 100)


def test_environment_rows_merge_over_the_table():
    rows = parse_prices('{"gemini-3.8-flash": [0.5, 3], "gemini-2.5-flash": {"input": 1, "output": 2}}')
    merged = merge_prices(rows)
    assert price_for("gemini-3.8-flash", merged).known
    assert (price_for("gemini-2.5-flash", merged).input_per_m, price_for("gemini-2.5-flash", merged).output_per_m) == (1.0, 2.0)
    # Untouched rows stay.
    assert price_for("gemini-2.5-flash-lite", merged).input_per_m == PRICES["gemini-2.5-flash-lite"][0]


@pytest.mark.parametrize("raw", ["not json", "[1, 2]", '{"m": [1]}', '{"m": ["a", 1]}', '{"m": [-1, 1]}'])
def test_unreadable_prices_are_refused(raw):
    with pytest.raises(PricesError):
        parse_prices(raw)


def test_settings_carry_the_merged_table():
    settings = make_settings(AGENT_WORLD_PRICES='{"claude-sonnet-5": [3, 15]}')
    assert price_for("claude-sonnet-5", settings.prices).known
    assert PRICES_CHECKED == "2026-10-27"


class _Generation:
    def __init__(self, message):
        self.message = message


class _Result:
    def __init__(self, message):
        self.generations = [[_Generation(message)]]
        self.llm_output = None


def test_stats_handler_attributes_and_prices_each_call():
    from langchain_core.messages import AIMessage

    ticks = []
    handler = AgentWorldStatsHandler("AAPL", on_tick=ticks.append)
    calls = [
        ("r1", {"langgraph_node": "agent", "langgraph_checkpoint_ns": "Market Analyst:abc|agent:def",
                "ls_model_name": "gemini-2.5-flash-lite"}, 1000, 200, "gemini-2.5-flash-lite"),
        ("r2", {"langgraph_node": "Research Manager", "ls_model_name": "gemini-2.5-flash"}, 3000, 400, "gemini-2.5-flash"),
        ("r3", {"langgraph_node": "Memory Log", "ls_model_name": "gemini-2.5-flash-lite"}, 500, 50, "gemini-2.5-flash-lite"),
        ("r4", {"langgraph_node": "Something Else"}, 10, 10, "mystery-model"),
    ]
    for run_id, metadata, tin, tout, model in calls:
        handler.on_chat_model_start({}, [[]], run_id=run_id, metadata=metadata)
        message = AIMessage(content="x", usage_metadata={"input_tokens": tin, "output_tokens": tout, "total_tokens": tin + tout},
                            response_metadata={"model_name": model})
        handler.on_llm_end(_Result(message), run_id=run_id)
    assert [t.role for t in ticks] == ["market", "research-manager", "memory", "other"]
    assert ticks[0].model == "gemini-2.5-flash-lite" and ticks[0].pricing == "known"
    assert ticks[3].pricing == "unknown" and ticks[3].costCents == 0
    totals = handler.totals()
    assert totals["llmCalls"] == 4 and totals["tokensIn"] == 4510 and totals["tokensOut"] == 660
    expected = sum(cost_cents(m, i, o)[0] for _, _, i, o, m in calls)
    assert math.isclose(totals["costCents"], round(expected, 6))
    roles = [row["role"] for row in handler.usage()]
    assert roles == ["market", "research-manager", "memory", "other"]


def test_muted_handler_counts_but_does_not_tick():
    from langchain_core.messages import AIMessage

    ticks = []
    handler = AgentWorldStatsHandler("AAPL", on_tick=ticks.append)
    handler.muted = True
    handler.on_chat_model_start({}, [[]], run_id="x", metadata={"langgraph_node": "Trader"})
    handler.on_llm_end(_Result(AIMessage(content="", usage_metadata={"input_tokens": 5, "output_tokens": 5, "total_tokens": 10},
                                         response_metadata={"model_name": "gemini-2.5-flash-lite"})), run_id="x")
    assert ticks == []
    assert handler.totals()["tokensIn"] == 5
