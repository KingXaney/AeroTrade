from pathlib import Path

import pytest

from agent_world.config import DEFAULT_DATA_VENDORS, ConfigError, Settings, origin_of, same_origin
from conftest import make_settings


def test_required_variables_are_named():
    with pytest.raises(ConfigError) as error:
        Settings.from_env({})
    assert "AGENT_WORLD_SECRET" in str(error.value) and "AEROTRADE_URL" in str(error.value)
    with pytest.raises(ConfigError, match="at least 16"):
        Settings.from_env({"AGENT_WORLD_SECRET": "short", "AEROTRADE_URL": "https://a.example"})
    with pytest.raises(ConfigError, match="http"):
        Settings.from_env({"AGENT_WORLD_SECRET": "x" * 20, "AEROTRADE_URL": "ftp://a.example"})


def test_defaults():
    s = make_settings()
    assert (s.port, s.llm_provider, s.quick_model, s.deep_model) == (8789, "google", "gemini-2.5-flash-lite", "gemini-2.5-flash")
    assert (s.max_debate_rounds, s.max_risk_rounds, s.max_tool_rounds, s.run_timeout_s) == (1, 1, 8, 600)
    assert s.data_vendors == DEFAULT_DATA_VENDORS
    assert s.aerotrade_origin == "https://aerotrade.example"
    assert not s.paperclip_configured and s.paperclip_role_keys == {}


def test_overrides_and_their_checks():
    s = make_settings(AGENT_WORLD_LLM_PROVIDER="anthropic", AGENT_WORLD_QUICK_MODEL="claude-haiku-4-5",
                      AGENT_WORLD_MAX_TOOL_ROUNDS="12", AGENT_WORLD_DATA_VENDORS='{"news_data": "yfinance"}',
                      PAPERCLIP_URL="http://localhost:3100/", PAPERCLIP_API_KEY="k", PAPERCLIP_COMPANY_ID="c",
                      PAPERCLIP_ROLE_KEYS='{"market": "km", "execution-desk": "ignored"}', GOOGLE_API_KEY="set")
    assert s.llm_provider == "anthropic" and s.quick_model == "claude-haiku-4-5" and s.max_tool_rounds == 12
    assert s.data_vendors["news_data"] == "yfinance" and s.data_vendors["core_stock_apis"] == "openbb,yfinance"
    assert s.paperclip_configured and s.paperclip_url == "http://localhost:3100"
    assert s.paperclip_role_keys == {"market": "km"} and s.google_key_present
    for bad in ({"AGENT_WORLD_LLM_PROVIDER": "openai"}, {"AGENT_WORLD_MAX_DEBATE_ROUNDS": "0"},
                {"AGENT_WORLD_RUN_TIMEOUT_S": "abc"}, {"AGENT_WORLD_DATA_VENDORS": '{"news_data": "bloomberg"}'},
                {"AGENT_WORLD_DATA_VENDORS": '{"nope": "yfinance"}'}, {"PAPERCLIP_ROLE_KEYS": "[1]"},
                {"AGENT_WORLD_PRICES": '{"m": [1]}'}):
        with pytest.raises(ConfigError):
            make_settings(**bad)


def test_ta_config_is_complete_over_a_base():
    s = make_settings()
    base = {"llm_provider": "openai", "max_recur_limit": 100, "data_vendors": {"core_stock_apis": "yfinance",
            "prediction_markets": "polymarket"}, "checkpoint_enabled": True}
    config = s.ta_config(base)
    assert config["llm_provider"] == "google" and config["max_recur_limit"] == 100
    assert config["checkpoint_enabled"] is False and config["max_tool_rounds"] == 8
    assert config["data_vendors"]["core_stock_apis"] == "openbb,yfinance"
    assert config["data_vendors"]["fundamental_data"] == "openbb,sec_edgar,yfinance"
    assert Path(config["results_dir"]).parts[-2:] == ("tradingagents", "results")
    assert base["checkpoint_enabled"] is True  # the base is not changed


def test_origins():
    assert origin_of("https://Example.com:443/a?b") == "https://example.com"
    assert origin_of("http://localhost:3000/api") == "http://localhost:3000"
    assert origin_of("http://user:pw@example.com") is None
    assert origin_of("javascript:alert(1)") is None
    assert same_origin("https://example.com/x", "https://example.com")
    assert not same_origin("https://example.com.evil.net/x", "https://example.com")
