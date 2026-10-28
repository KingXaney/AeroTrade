"""AeroTrade's trading agent world: TradingAgents over OpenBB, streamed to AeroTrade as signed events."""

from agent_world.bootstrap import guard_tradingagents_dotenv

__version__ = "0.1.0"

# Before anything else can import TradingAgents: its import-time dotenv walk must not reach a
# parent directory's .env (see agent_world/bootstrap.py).
guard_tradingagents_dotenv()
