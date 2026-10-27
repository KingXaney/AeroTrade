"""What has to happen before TradingAgents and OpenBB are imported.

TradingAgents runs ``load_dotenv(find_dotenv(usecwd=True))`` when it is imported, which walks up
from the working directory to the first ``.env`` it finds — from ``services/agent-world`` that
can be the AeroTrade repository's own ``.env``. ``guard_tradingagents_dotenv()`` imports the
package with ``find_dotenv`` contained to this service's directory, so TradingAgents reads
``services/agent-world/.env`` if it exists and nothing else. It runs when ``agent_world`` is
imported; ``AGENT_WORLD_NO_DOTENV=1`` (the tests set it) makes it read no file at all.

OpenBB keeps its settings in ``~/.openbb_platform`` and its caches in ``~/OpenBBUserData``, read
from ``Path.home()`` when it is imported. ``prepare_openbb()`` points both under the service's data
directory instead, before the first import.
"""

from __future__ import annotations

import json
import logging
import os
import sys
from pathlib import Path

logger = logging.getLogger(__name__)

SERVICE_DIR = Path(__file__).resolve().parent.parent
NO_DOTENV = "AGENT_WORLD_NO_DOTENV"


def service_env_file(name: str = ".env") -> Path | None:
    """This service's own dotenv file, when it exists and dotenv files are allowed."""
    if os.environ.get(NO_DOTENV) == "1":
        return None
    path = SERVICE_DIR / name
    return path if path.is_file() else None


def guard_tradingagents_dotenv() -> bool:
    """Import TradingAgents with its dotenv walk confined to this service; False if too late."""
    if "tradingagents" in sys.modules:
        return False
    import dotenv

    original = dotenv.find_dotenv

    def contained(filename: str = ".env", raise_error_if_not_found: bool = False, usecwd: bool = False) -> str:
        path = service_env_file(filename)
        return str(path) if path else ""

    dotenv.find_dotenv = contained
    try:
        import tradingagents  # noqa: F401  (its __init__ is the dotenv load)
    finally:
        dotenv.find_dotenv = original
    return True


def load_service_env() -> Path | None:
    """Load ``services/agent-world/.env`` into the environment (never over a set variable)."""
    path = service_env_file()
    if path is None:
        return None
    from dotenv import load_dotenv

    load_dotenv(path, override=False)
    return path


def prepare_openbb(data_dir: Path) -> bool:
    """Keep OpenBB's settings and caches under ``data_dir/openbb``; False when OpenBB was
    already imported (its paths are then wherever that import put them)."""
    root = Path(data_dir) / "openbb"
    platform_dir = root / "platform"
    cache_dir = root / "cache"
    for folder in (platform_dir, cache_dir / "sec", cache_dir / "fred", root / "data"):
        folder.mkdir(parents=True, exist_ok=True)
    os.environ.setdefault("OPENBB_SEC_CACHE_DIR", str(cache_dir / "sec"))
    os.environ.setdefault("OPENBB_FRED_DISK_CACHE_DIR", str(cache_dir / "fred"))

    user_settings = platform_dir / "user_settings.json"
    if not user_settings.exists():
        user_settings.write_text(json.dumps({
            "credentials": {},
            "preferences": {
                "cache_directory": str(cache_dir),
                "data_directory": str(root / "data"),
                "export_directory": str(root / "data" / "exports"),
            },
            "defaults": {"commands": {}},
        }, indent=4), encoding="utf-8")
    system_settings = platform_dir / "system_settings.json"
    if not system_settings.exists():
        system_settings.write_text("{}", encoding="utf-8")

    already = any(name == "openbb" or name.startswith("openbb_core.app.") and name != "openbb_core.app.constants"
                  for name in sys.modules)
    if already:
        logger.warning("OpenBB was imported before its paths were set; it keeps its default home directories")
        return False
    import openbb_core.app.constants as constants

    constants.OPENBB_DIRECTORY = platform_dir
    constants.USER_SETTINGS_PATH = user_settings
    constants.SYSTEM_SETTINGS_PATH = system_settings
    return True


def prepare_yfinance(data_dir: Path) -> None:
    """yfinance's time-zone and cookie cache under the data directory rather than the home one."""
    folder = Path(data_dir) / "yfinance"
    folder.mkdir(parents=True, exist_ok=True)
    try:
        import yfinance

        yfinance.set_tz_cache_location(str(folder))
    except Exception as exc:  # a cache location is a convenience, never a reason to stop
        logger.warning("Could not move yfinance's cache: %s", type(exc).__name__)


def prepare(settings) -> None:
    """Data directories, then OpenBB's and yfinance's paths, then the SEC identity."""
    for folder in (settings.data_dir, settings.ta_results_dir, settings.ta_cache_dir,
                   settings.ta_memory_log_path.parent, settings.undelivered_dir):
        Path(folder).mkdir(parents=True, exist_ok=True)
    prepare_openbb(settings.data_dir)
    prepare_yfinance(settings.data_dir)
    if settings.sec_edgar_user_agent:
        # TradingAgents' SEC vendor reads it from the environment.
        os.environ.setdefault("SEC_EDGAR_USER_AGENT", settings.sec_edgar_user_agent)
