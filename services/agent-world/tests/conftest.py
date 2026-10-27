"""Test environment: no dotenv file, no provider keys, OpenBB's files in a temporary directory.

Runs before any test module imports the service, so TradingAgents' import-time dotenv walk reads
nothing and no test can reach a paid model API with a key from the developer's shell.
"""

from __future__ import annotations

import atexit
import os
import shutil
import sys
import tempfile
from pathlib import Path

os.environ["AGENT_WORLD_NO_DOTENV"] = "1"
for _name in ("GOOGLE_API_KEY", "GEMINI_API_KEY", "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "FRED_API_KEY",
              "PAPERCLIP_API_KEY", "PAPERCLIP_URL", "PAPERCLIP_ROLE_KEYS", "AGENT_WORLD_SECRET", "AEROTRADE_URL"):
    os.environ.pop(_name, None)
for _name in [n for n in os.environ if n.startswith("TRADINGAGENTS_")]:
    os.environ.pop(_name, None)

SERVICE_DIR = Path(__file__).resolve().parent.parent
if str(SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(SERVICE_DIR))

TEST_DATA_DIR = Path(tempfile.mkdtemp(prefix="agent-world-tests-"))
# The run removes its own data directory when it ends.
atexit.register(shutil.rmtree, TEST_DATA_DIR, ignore_errors=True)

from agent_world import bootstrap  # noqa: E402  (imports TradingAgents under the dotenv guard)

bootstrap.prepare_openbb(TEST_DATA_DIR)

import pytest  # noqa: E402

from agent_world.config import Settings  # noqa: E402

SECRET = "agent-world-test-secret"
AEROTRADE = "https://aerotrade.example"


def make_settings(**overrides) -> Settings:
    env = {
        "AGENT_WORLD_SECRET": SECRET,
        "AEROTRADE_URL": AEROTRADE,
        "AGENT_WORLD_DATA_DIR": str(TEST_DATA_DIR),
        "PAPERCLIP_HEARTBEAT_SECRET": "heartbeat-test-secret",
    }
    for key, value in overrides.items():
        if value is None:
            env.pop(key, None)
        else:
            env[key] = value
    return Settings.from_env(env)


@pytest.fixture
def settings() -> Settings:
    return make_settings()


@pytest.fixture
def data_dir(tmp_path: Path) -> Path:
    return tmp_path
