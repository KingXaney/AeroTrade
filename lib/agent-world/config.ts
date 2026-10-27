// The trading agent world's knobs (docs/specs/2026-10-27-trading-agent-world.md): a desk of twelve
// model roles (TradingAgents, in services/agent-world) reads data through OpenBB, rates a few
// symbols once a week, and trades one shared paper account under rails fixed here; Paperclip keeps
// the company around it (budgets, an issue per session, the approval stage).
//
// Import-free and client-safe (type imports only): the page, the live reducer, the glossary, the
// legend, the job and the tests read one table. The service has its own copy of the role and
// vendor tables; lib/agent-world/__tests__/fixture.test.ts holds the two to the same ids.

import type {AllocatorRails} from "@/lib/navigator/config";

// The desk's paper account, owned by a sentinel no person signs in as (never 'global', the
// culture brain's or the strategies' sentinel). Its name carries the deployment outside
// production, so a preview or a local server sharing production's database never trades
// production's account.
export const AGENT_WORLD_OWNER_ID = 'system:agent-world';
export const AGENT_WORLD_ACCOUNT_NAME = 'Trading agent world';
export const agentWorldAccountName = (deployment: 'production' | 'preview' | 'development'): string =>
    deployment === 'production' ? AGENT_WORLD_ACCOUNT_NAME : `${AGENT_WORLD_ACCOUNT_NAME} (${deployment})`;
export const AGENT_WORLD_STARTING_BALANCE = 100_000;
// Bumped when the meaning of a stored session changes; stored on every session row.
export const AGENT_WORLD_ENGINE_VERSION = '1';

// The symbols a session rates, one TradingAgents run each, in this order. AGENT_WORLD_UNIVERSE
// (lib/agent-world/env.ts) replaces the list, up to MAX_UNIVERSE symbols.
export const AGENT_WORLD_UNIVERSE = ['AAPL', 'MSFT', 'NVDA'] as const;
export const MAX_UNIVERSE = 10;
export const SYMBOL_PATTERN = /^[A-Z][A-Z0-9.-]{0,9}$/;

// ---- the desk ----

export const TEAM_IDS = ['analysts', 'research', 'trading', 'risk', 'portfolio'] as const;
export type TeamId = (typeof TEAM_IDS)[number];

// The twelve roles in the order a run reaches them. `node` is TradingAgents' own graph node name
// (what the service reads off the stream); `paperclip` the agent's name in the Paperclip company.
// The four analysts run at the same time; every other role waits for the one before it.
export const ROLES = [
    {id: 'market', node: 'Market Analyst', team: 'analysts', paperclip: 'Market analyst'},
    {id: 'sentiment', node: 'Sentiment Analyst', team: 'analysts', paperclip: 'Sentiment analyst'},
    {id: 'news', node: 'News Analyst', team: 'analysts', paperclip: 'News analyst'},
    {id: 'fundamentals', node: 'Fundamentals Analyst', team: 'analysts', paperclip: 'Fundamentals analyst'},
    {id: 'bull', node: 'Bull Researcher', team: 'research', paperclip: 'Bull researcher'},
    {id: 'bear', node: 'Bear Researcher', team: 'research', paperclip: 'Bear researcher'},
    {id: 'research-manager', node: 'Research Manager', team: 'research', paperclip: 'Research manager'},
    {id: 'trader', node: 'Trader', team: 'trading', paperclip: 'Trader'},
    {id: 'risk-aggressive', node: 'Aggressive Analyst', team: 'risk', paperclip: 'Aggressive risk analyst'},
    {id: 'risk-conservative', node: 'Conservative Analyst', team: 'risk', paperclip: 'Conservative risk analyst'},
    {id: 'risk-neutral', node: 'Neutral Analyst', team: 'risk', paperclip: 'Neutral risk analyst'},
    {id: 'portfolio-manager', node: 'Portfolio Manager', team: 'portfolio', paperclip: 'Portfolio manager'},
] as const satisfies readonly {id: string; node: string; team: TeamId; paperclip: string}[];

export type RoleId = (typeof ROLES)[number]['id'];
export const ROLE_IDS: readonly RoleId[] = ROLES.map((role) => role.id);
export const isRoleId = (value: unknown): value is RoleId => typeof value === 'string' && (ROLE_IDS as readonly string[]).includes(value);
export const rolesOfTeam = (team: TeamId): readonly RoleId[] => ROLES.filter((role) => role.team === team).map((role) => role.id);
export const DEBATE_SIDES = ['bull', 'bear'] as const;
export type DebateSide = (typeof DEBATE_SIDES)[number];
export const RISK_ROLES = ['risk-aggressive', 'risk-conservative', 'risk-neutral'] as const;
export type RiskRole = (typeof RISK_ROLES)[number];
// A model call the service could not tie to a role (the memory log's settlement, an unknown node)
// is costed to the run, not to a stage.
export const COST_EXTRA_ROLES = ['memory', 'other'] as const;
export type CostRole = RoleId | (typeof COST_EXTRA_ROLES)[number];

// The two agents of the company that are not on the desk: the Head trader the session's issue is
// assigned to (its address is the service), and the Execution desk that holds the approval stage
// (its address is this app). Names as they read in Paperclip.
export const PAPERCLIP_DESKS = {'head-trader': 'Head trader', 'execution-desk': 'Execution desk'} as const;
export type PaperclipDesk = keyof typeof PAPERCLIP_DESKS;
export type PaperclipAgentKey = RoleId | PaperclipDesk;

// The models a session runs on unless the service is told otherwise: the research manager and the
// portfolio manager use the deep one, every other role the quick one (TradingAgents' tiers).
export const AGENT_WORLD_MODELS = {provider: 'google', quick: 'gemini-2.5-flash-lite', deep: 'gemini-2.5-flash'} as const;
// Rounds of the research debate and of the risk desk (the service's AGENT_WORLD_MAX_*_ROUNDS).
export const DEBATE_ROUNDS = 1;
export const RISK_ROUNDS = 1;

// ---- the rating and what it moves ----

// The portfolio manager's five-tier scale, strongest first, and REVIEW for a decision whose text
// named none (it trades nothing).
export const RATINGS = ['Buy', 'Overweight', 'Hold', 'Underweight', 'Sell', 'REVIEW'] as const;
export type Rating = (typeof RATINGS)[number];
export const isRating = (value: unknown): value is Rating => typeof value === 'string' && (RATINGS as readonly string[]).includes(value);

// The share of the account each rating aims at. null keeps the position as it is (Hold, REVIEW).
// Underweight trims a holding to its weight and opens nothing; the others open or resize.
export const RATING_TARGET_WEIGHTS: Readonly<Record<Rating, number | null>> = {
    Buy: 0.2,
    Overweight: 0.12,
    Hold: null,
    Underweight: 0.05,
    Sell: 0,
    REVIEW: null,
};

// The words the page prints for a rating: data labels, drawn inside a badge or a table cell,
// never the start of a sentence (lib/learn/copy/agent-world.ts carries every sentence).
export const RATING_LABELS: Readonly<Record<Rating, string>> = {
    Buy: 'Buy',
    Overweight: 'Overweight',
    Hold: 'Hold',
    Underweight: 'Underweight',
    Sell: 'Sell',
    REVIEW: 'Review',
};

// An order's side as the orders table prints it: a data label in a cell, never a sentence.
export const ORDER_SIDE_LABELS = {buy: 'Buy', sell: 'Sell'} as const;

// The rails between the rating and the account. Only the rating moves the book: no score, thesis
// or hard-stop exit of the allocator's own (those thresholds are set where they never fire), every
// name capped, a cash floor kept, a drift under the band left alone.
export const AGENT_WORLD_RAILS: AllocatorRails = {
    maxPositions: MAX_UNIVERSE,
    maxPositionWeight: 0.25,
    minCashWeight: 0.05,
    maxTradesPerWeek: MAX_UNIVERSE,
    minHoldingTradingDays: 0,
    rebalanceBand: 0.02,
    entryScoreThreshold: Number.NEGATIVE_INFINITY,
    exitScoreThreshold: Number.NEGATIVE_INFINITY,
    hardStopDrawdown: 1,
};

// ---- sessions ----

export const SESSION_KINDS = ['weekly', 'manual', 'preview'] as const;
export type SessionKind = (typeof SESSION_KINDS)[number];
export const SESSION_STATUSES = ['queued', 'running', 'awaiting-approval', 'approved', 'declined', 'lapsed', 'completed', 'failed'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];
// A session in one of these holds the desk: a second session is refused until it ends.
export const LIVE_STATUSES: readonly SessionStatus[] = ['queued', 'running', 'awaiting-approval', 'approved'];
export const isLiveStatus = (status: SessionStatus): boolean => LIVE_STATUSES.includes(status);
export const RUN_STATUSES = ['pending', 'running', 'completed', 'failed'] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];
export const STAGE_STATUSES = ['waiting', 'working', 'done', 'failed'] as const;
export type StageStatus = (typeof STAGE_STATUSES)[number];
// Why the service's part of a session did not complete.
export const SERVICE_OUTCOMES = ['error', 'limit', 'budget', 'timeout', 'refused', 'no-answer'] as const;
export type ServiceOutcome = (typeof SERVICE_OUTCOMES)[number];
export const APPROVAL_MODES = ['owner', 'auto'] as const;
export type ApprovalMode = (typeof APPROVAL_MODES)[number];

// The events the weekly job waits on: the events route sends `finished` once the service says the
// desk is done (or failed), the owner's actions send `decided`. Neither starts a function.
export const AGENT_WORLD_EVENTS = {finished: 'app/agent.world.session.finished', decided: 'app/agent.world.session.decided'} as const;

// When the weekly session runs (the cron in lib/jobs/registry.ts says the same; job.test holds
// the two together): Mondays before the open, with a Tuesday run for a holiday Monday.
export const SESSION_SCHEDULE = {day: 'Monday', retryDay: 'Tuesday', hour: 8, minute: 30} as const;
// How long the job waits for the service: rounds of one wait each, Mongo read between them.
export const SESSION_WAIT_ROUNDS = 6;
export const SESSION_WAIT_ROUND_MINUTES = 8;
// An undecided session lapses at whichever comes first: this many hours after it started, or the
// next Friday at 15:30 ET.
export const LAPSE_HOURS = 72;
export const LAPSE_WEEKDAY = {day: 'Friday', hour: 15, minute: 30} as const;

// ---- the live floor ----

export const POLL_LIVE_MS = 3000;
export const POLL_IDLE_MS = 30_000;
export const POLL_BACKOFF_CAP_MS = 30_000;
// A finished session plays back over this long (none at all with motion reduced).
export const REPLAY_MS = 20_000;

// ---- what the service may send, and what is kept ----

// Texts are cut, never refused, at these lengths (the service clamps to the same).
export const CLAMPS = {report: 12_000, turn: 6_000, decision: 8_000, toolArgs: 400, message: 300, note: 2_000} as const;
export const TURNS_KEPT = 40;
export const TOOLS_KEPT = 160;
export const LIMITS_KEPT = 20;
export const EVENTS_PER_BATCH = 100;
export const EVENT_BODY_BYTES = 256 * 1024;
// A signed request is honoured this long after its timestamp, either way.
export const SIGNATURE_WINDOW_MS = 5 * 60_000;

// Paperclip's budget thresholds: it warns at the first and pauses the agent at the second.
export const BUDGET_SOFT_PCT = 80;
export const BUDGET_HARD_PCT = 100;

// ---- the data chain ----

// Where each of the agents' data tools reads from, in order (the service's
// agent_world/vendors/__init__.py DATA_VENDORS says the same). `openbb` names the OpenBB route the
// first link uses; null where OpenBB has no keyless provider for the tool.
export const DATA_TOOLS = [
    {tool: 'get_stock_data', category: 'prices', chain: ['openbb', 'yfinance'], openbb: 'equity.price.historical'},
    // TradingAgents' own snapshot reads Yahoo directly, outside the router's chains.
    {tool: 'get_verified_market_snapshot', category: 'prices', chain: ['yfinance'], openbb: null},
    {tool: 'get_indicators', category: 'indicators', chain: ['openbb', 'yfinance'], openbb: 'equity.price.historical + stockstats'},
    {tool: 'get_fundamentals', category: 'fundamentals', chain: ['openbb', 'yfinance'], openbb: 'equity.fundamental.metrics'},
    {tool: 'get_balance_sheet', category: 'fundamentals', chain: ['openbb', 'sec_edgar', 'yfinance'], openbb: 'equity.fundamental.balance'},
    {tool: 'get_cashflow', category: 'fundamentals', chain: ['openbb', 'sec_edgar', 'yfinance'], openbb: 'equity.fundamental.cash'},
    {tool: 'get_income_statement', category: 'fundamentals', chain: ['openbb', 'sec_edgar', 'yfinance'], openbb: 'equity.fundamental.income'},
    {tool: 'get_news', category: 'news', chain: ['openbb', 'yfinance'], openbb: 'news.company'},
    {tool: 'get_global_news', category: 'news', chain: ['yfinance'], openbb: null},
    {tool: 'get_insider_transactions', category: 'news', chain: ['openbb', 'yfinance'], openbb: 'equity.ownership.insider_trading'},
    {tool: 'get_macro_indicators', category: 'macro', chain: ['fred', 'openbb'], openbb: 'economy.fred_series'},
    {tool: 'get_prediction_markets', category: 'macro', chain: ['polymarket'], openbb: null},
] as const;
export const DATA_CATEGORIES = ['prices', 'indicators', 'fundamentals', 'news', 'macro'] as const;
export type DataCategory = (typeof DATA_CATEGORIES)[number];

// The kill switch's name, for the page's note and the legend.
export const AGENT_WORLD_ENABLED_ENV = 'AGENT_WORLD_ENABLED';
