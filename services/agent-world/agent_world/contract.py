"""The bodies the service accepts: AeroTrade's signed ``POST /runs`` and Paperclip's heartbeat.

Mirrors lib/agent-world/job.ts ``runRequestBody`` (the TypeScript half).
"""

from __future__ import annotations

from datetime import date
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

SESSION_ID_PATTERN = r"^[A-Za-z0-9-]{1,80}$"
SYMBOL_PATTERN = r"^[A-Z][A-Z0-9.-]{0,9}$"
MAX_SYMBOLS = 10
# The one wake the relay passes to AeroTrade: a run of the company's "Weekly session" routine, which
# Paperclip delivers as {wakeReason: 'issue_assigned', source: 'routine.dispatch'}. Every other wake
# (the runs this service asks for on a session's issue, an issue handed back, Paperclip's repair
# wakes) is answered and ignored.
RELAYED_SOURCES = frozenset({"routine.dispatch"})

SessionId = Annotated[str, Field(pattern=SESSION_ID_PATTERN)]
Symbol = Annotated[str, Field(pattern=SYMBOL_PATTERN)]


class PortfolioPosition(BaseModel):
    model_config = ConfigDict(extra="ignore")
    ticker: Symbol
    quantity: float
    averagePrice: float | None = None


class Portfolio(BaseModel):
    model_config = ConfigDict(extra="ignore")
    cash: float | None = None
    currency: str | None = Field(default="USD", max_length=8)
    positions: list[PortfolioPosition] = Field(default_factory=list, max_length=100)


class PaperclipRef(BaseModel):
    model_config = ConfigDict(extra="ignore")
    issueId: str | None = Field(default=None, max_length=80)
    runId: str | None = Field(default=None, max_length=80)
    agentIds: dict[str, str] = Field(default_factory=dict)

    @field_validator("agentIds")
    @classmethod
    def _small(cls, value: dict[str, str]) -> dict[str, str]:
        if len(value) > 32 or any(len(k) > 40 or len(str(v)) > 80 for k, v in value.items()):
            raise ValueError("agentIds is too large")
        return value


class RunRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    sessionId: SessionId
    symbols: list[Symbol] = Field(min_length=1, max_length=MAX_SYMBOLS)
    tradeDate: date
    portfolio: Portfolio = Field(default_factory=Portfolio)
    callbackUrl: str = Field(max_length=2048)
    paperclip: PaperclipRef | None = None
    approval: Literal["owner", "auto"] = "owner"
    dryRun: bool = False

    @field_validator("symbols")
    @classmethod
    def _distinct(cls, value: list[str]) -> list[str]:
        if len(set(value)) != len(value):
            raise ValueError("symbols must be distinct")
        return value

    @field_validator("tradeDate", mode="before")
    @classmethod
    def _day(cls, value: Any) -> Any:
        if isinstance(value, str) and len(value) != 10:
            raise ValueError("tradeDate must be YYYY-MM-DD")
        return value

    @property
    def trade_date(self) -> str:
        return self.tradeDate.isoformat()

    @property
    def issue_id(self) -> str | None:
        return self.paperclip.issueId if self.paperclip else None

    @property
    def agent_ids(self) -> dict[str, str]:
        return dict(self.paperclip.agentIds) if self.paperclip else {}


class HeartbeatContext(BaseModel):
    model_config = ConfigDict(extra="ignore")
    source: str | None = None
    issueId: str | None = None
    taskId: str | None = None
    wakeReason: str | None = None
    wakeSource: str | None = None
    commentId: str | None = None


class Heartbeat(BaseModel):
    """Paperclip's http adapter payload: ``{agentId, runId, context: {source, issueId, taskId, wakeReason,
    wakeSource, ...the issue as markdown...}, ...}`` (only the fields named here are read)."""

    model_config = ConfigDict(extra="ignore")
    agentId: str | None = None
    runId: str | None = None
    context: HeartbeatContext = Field(default_factory=HeartbeatContext)
