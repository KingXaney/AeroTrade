"""The twelve desk roles, in run order, and where each lives in TradingAgents.

The ids and their order are the contract with AeroTrade (lib/agent-world/config.ts ROLES): never
rename or reorder one. Each role maps to the TradingAgents v0.7.1 graph node that plays it and the
state key that carries its text.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Role:
    id: str
    node: str
    report_key: str
    team: str


ROLES: tuple[Role, ...] = (
    Role("market", "Market Analyst", "market_report", "analysts"),
    Role("sentiment", "Sentiment Analyst", "sentiment_report", "analysts"),
    Role("news", "News Analyst", "news_report", "analysts"),
    Role("fundamentals", "Fundamentals Analyst", "fundamentals_report", "analysts"),
    Role("bull", "Bull Researcher", "investment_debate_state.bull_history", "research"),
    Role("bear", "Bear Researcher", "investment_debate_state.bear_history", "research"),
    Role("research-manager", "Research Manager", "investment_plan", "research"),
    Role("trader", "Trader", "trader_investment_plan", "trading"),
    Role("risk-aggressive", "Aggressive Analyst", "risk_debate_state.aggressive_history", "risk"),
    Role("risk-conservative", "Conservative Analyst", "risk_debate_state.conservative_history", "risk"),
    Role("risk-neutral", "Neutral Analyst", "risk_debate_state.neutral_history", "risk"),
    Role("portfolio-manager", "Portfolio Manager", "final_trade_decision", "portfolio"),
)

ROLE_IDS: tuple[str, ...] = tuple(role.id for role in ROLES)
ROLE_BY_ID: dict[str, Role] = {role.id: role for role in ROLES}
NODE_TO_ROLE: dict[str, str] = {role.node: role.id for role in ROLES}

# Cost that belongs to no stage: the Memory Log step's reflections, and anything unattributed.
MEMORY_ROLE = "memory"
OTHER_ROLE = "other"
COST_ROLES: tuple[str, ...] = (*ROLE_IDS, MEMORY_ROLE, OTHER_ROLE)
MEMORY_NODE = "Memory Log"

# TradingAgents' analyst config keys, and the role each one plays. "social" is the key saved
# configs use for the Sentiment Analyst.
ANALYST_KEYS: dict[str, str] = {
    "market": "market",
    "social": "sentiment",
    "news": "news",
    "fundamentals": "fundamentals",
}
SELECTED_ANALYSTS: tuple[str, ...] = tuple(ANALYST_KEYS)

ANALYST_ROLES: tuple[str, ...] = ("market", "sentiment", "news", "fundamentals")
ANALYST_REPORT_KEYS: dict[str, str] = {role: ROLE_BY_ID[role].report_key for role in ANALYST_ROLES}
REPORT_KEY_TO_ANALYST: dict[str, str] = {key: role for role, key in ANALYST_REPORT_KEYS.items()}

DEBATE_SIDES: dict[str, str] = {"bull": "bull_history", "bear": "bear_history"}
RISK_SIDES: dict[str, str] = {
    "risk-aggressive": "aggressive_history",
    "risk-conservative": "conservative_history",
    "risk-neutral": "neutral_history",
}
# What each speaker's turn opens with in the history TradingAgents keeps.
TURN_PREFIXES: dict[str, str] = {
    "bull": "Bull Analyst:",
    "bear": "Bear Analyst:",
    "risk-aggressive": "Aggressive Analyst:",
    "risk-conservative": "Conservative Analyst:",
    "risk-neutral": "Neutral Analyst:",
}

# Which analyst offers which data tool, for a tool message seen outside an analyst's graph.
TOOL_ROLES: dict[str, str] = {
    "get_stock_data": "market",
    "get_indicators": "market",
    "get_verified_market_snapshot": "market",
    "get_news": "news",
    "get_global_news": "news",
    "get_macro_indicators": "news",
    "get_prediction_markets": "news",
    "get_fundamentals": "fundamentals",
    "get_balance_sheet": "fundamentals",
    "get_cashflow": "fundamentals",
    "get_income_statement": "fundamentals",
    "get_insider_transactions": "fundamentals",
}


def node_of(namespace_segment: str) -> str:
    """The node name in a LangGraph namespace segment such as ``"Market Analyst:<task id>"``."""
    return namespace_segment.split(":", 1)[0]


def role_for_namespace(namespace) -> str | None:
    """The role whose subgraph produced a streamed step, from its namespace's first segment."""
    if not namespace:
        return None
    return NODE_TO_ROLE.get(node_of(str(namespace[0])))


def role_for_metadata(metadata: dict | None) -> str:
    """The role a model call belongs to, from LangGraph's run metadata.

    Inside an analyst's subgraph ``langgraph_node`` is the inner node (agent / wrap_up), so the
    analyst is read off the checkpoint namespace's first segment; elsewhere the node is the role.
    The Memory Log step's reflections are ``memory``; anything else is ``other``.
    """
    metadata = metadata or {}
    namespace = str(metadata.get("langgraph_checkpoint_ns") or "")
    if namespace:
        first = node_of(namespace.split("|", 1)[0])
        if first in NODE_TO_ROLE:
            return NODE_TO_ROLE[first]
        if first == MEMORY_NODE:
            return MEMORY_ROLE
    node = str(metadata.get("langgraph_node") or "")
    if node in NODE_TO_ROLE:
        return NODE_TO_ROLE[node]
    if node == MEMORY_NODE:
        return MEMORY_ROLE
    return OTHER_ROLE
