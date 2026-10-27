// The trading agent world's view types: what the page, the live route and the client reducer pass
// between them. Client-safe (type imports only); every time is epoch milliseconds, so a view
// crosses from a server component to a client one as it is.

import type {
    ApprovalMode,
    CostRole,
    DebateSide,
    Rating,
    RiskRole,
    RoleId,
    RunStatus,
    ServiceOutcome,
    SessionKind,
    SessionStatus,
    StageStatus,
} from "@/lib/agent-world/config";
import type {ReasonClause} from "@/lib/learn/reasons";

export type OrderSide = 'buy' | 'sell';

// An order the session planned from a rating (lib/agent-world/orders.ts), before any approval. Its
// reason arrives decoded (lib/learn/agent-world-reasons.ts, on the server) as `gloss`.
export type SessionOrder = {
    symbol: string;
    side: OrderSide;
    quantity: number;
    reason: string;
    rating: Rating;
    targetWeight: number | null;
    currentWeight: number;
    gloss?: ReasonClause[];
};

// What the paper account did with an order.
export type SessionFill = {
    symbol: string;
    side: OrderSide;
    quantity: number;
    executed: boolean;
    price: number | null;
    message: string | null;
    at: number;
};

export type SessionRunSummary = {symbol: string; status: RunStatus; rating: Rating | null; review: boolean; costCents: number};

export type SessionCost = {totalCents: number; tokensIn: number; tokensOut: number; llmCalls: number; toolCalls: number};

export type SessionDecision = {decision: 'approved' | 'declined' | 'lapsed'; by: string | null; at: number};

export type SessionPaperclip = {
    issueId: string | null;
    identifier: string | null;
    url: string | null;
    // Whether the decision reached the issue: null before there is one to send.
    mirrored: boolean | null;
    note: string | null;
};

export type SessionLimit = {provider: string; status: number; message: string; fatal: boolean; at: number; symbol: string | null};

export type SessionModels = {provider: string; quick: string; deep: string};

export type SessionView = {
    sessionId: string;
    kind: SessionKind;
    weekKey: string;
    tradeDate: string;
    status: SessionStatus;
    approval: ApprovalMode;
    symbols: string[];
    // The last service event applied (the runs' own seqs are on or below it).
    seq: number;
    // Moves on every write to the session, the job's and the owner's included: the live poll's
    // "nothing new" test.
    version: number;
    current: {symbol: string; index: number} | null;
    runs: SessionRunSummary[];
    orders: SessionOrder[];
    fills: SessionFill[];
    decision: SessionDecision | null;
    lapseAt: number | null;
    cost: SessionCost;
    paperclip: SessionPaperclip;
    limits: SessionLimit[];
    service: {outcome: ServiceOutcome; message: string} | null;
    models: SessionModels | null;
    dropped: number;
    note: string | null;
    createdAt: number;
    startedAt: number | null;
    finishedAt: number | null;
    // When the service said the desk was done (before the orders, the approval and the fills).
    serviceFinishedAt: number | null;
};

export type StageRecord = {
    status: StageStatus;
    startedAt: number | null;
    finishedAt: number | null;
    reportAt: number | null;
    llmCalls: number;
    tokensIn: number;
    tokensOut: number;
    costCents: number;
};

export type DebateTurn = {seq: number; side: DebateSide; round: number; text: string; at: number};
export type RiskTurn = {seq: number; role: RiskRole; round: number; text: string; at: number};
export type ToolCall = {seq: number; callId: string; role: RoleId; name: string; args: string; at: number};
export type ToolAttempt = {vendor: string; ok: boolean; error: string | null};
export type ToolResult = {
    seq: number;
    callId: string;
    role: RoleId;
    name: string;
    status: 'ok' | 'unavailable' | 'no-data';
    vendor: string | null;
    ms: number | null;
    chars: number;
    attempts: ToolAttempt[];
    at: number;
};

export type RunView = {
    symbol: string;
    index: number;
    status: RunStatus;
    // The last event applied to this run: a poll asks only for runs past the seq it holds.
    seq: number;
    rating: Rating | null;
    review: boolean;
    decision: string | null;
    startedAt: number | null;
    finishedAt: number | null;
    stages: Partial<Record<RoleId, StageRecord>>;
    reports: Partial<Record<RoleId, string>>;
    debate: DebateTurn[];
    risk: RiskTurn[];
    tools: ToolCall[];
    toolResults: ToolResult[];
    cost: SessionCost;
    // Model cost the service could not tie to a role (the memory log, an unknown node).
    extraCost: Partial<Record<CostRole, number>>;
    memoryNote: string | null;
    failure: {reason: string; message: string} | null;
};

// What GET /api/agent-world/live answers. A full view carries every run of the session; a partial
// one only the runs that moved past the seq the poll named (the session itself always whole).
export type LiveView = {version: number; seq: number; serverNow: number; session: SessionView | null; runs: RunView[]; partial: boolean};
export type LiveUnchanged = {unchanged: true; version: number; seq: number; serverNow: number; sessionId: string | null};
export type LiveAnswer = LiveView | LiveUnchanged;

export const isLiveUnchanged = (answer: LiveAnswer): answer is LiveUnchanged => 'unchanged' in answer && answer.unchanged === true;

// A row of the sessions list.
export type SessionRow = Pick<SessionView, 'sessionId' | 'kind' | 'weekKey' | 'tradeDate' | 'status' | 'runs' | 'cost' | 'decision' | 'createdAt' | 'fills'>;
