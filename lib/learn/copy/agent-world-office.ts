// Every sentence of the office (/agent-world/office), the trading agent world drawn as one floor of
// fourteen seats, as pure exports. Held to the 'copy' tier of lib/learn/banned by
// lib/learn/__tests__/agent-world-office-copy.test.ts, and the legend's sentences to mechanism only.
// Labels (a status word, a heading, a button) carry no full stop; every sentence ends with one.
// The ratings' own words are data labels (RATING_LABELS), passed in mid-sentence or drawn in a
// badge: no sentence here opens on one.

import type {DataTool, PaperclipDesk, RoleId, WorkerId, WorkerStatus} from "@/lib/agent-world/config";
import {ROLE_COPY} from "@/lib/learn/copy/agent-world";

const plural = (n: number, one: string, many: string): string => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

// ---- labels ---------------------------------------------------------------------------------

export const WORKER_STATUS_COPY: Readonly<Record<WorkerStatus, string>> = {
    idle: 'Idle',
    waiting: 'Waiting',
    fetching: 'Fetching',
    working: 'Busy',
    talking: 'Talking',
    filed: 'Filed',
    done: 'Done',
    stopped: 'Did not finish',
};

export const DESK_COPY: Readonly<Record<PaperclipDesk, {name: string; line: string}>> = {
    'head-trader': {name: 'Head trader', line: "Holds the session's issue in the company: opens it, watches the desk run, and hands it in once the ratings are on it."},
    'execution-desk': {name: 'Execution desk', line: "Holds the approval stage: it records the owner's decision on the issue and sends the orders to the paper account."},
};

// A seat's name, whichever kind of seat it is.
export const workerName = (id: WorkerId): string => (id === 'head-trader' || id === 'execution-desk' ? DESK_COPY[id].name : ROLE_COPY[id].name);

export const ZONE_COPY = {
    front: 'Front desk',
    bullpen: 'Bullpen',
    table: 'Research table',
    trading: 'Trader',
    risk: 'Risk desk',
    corner: 'Corner office',
    execution: 'Execution desk',
    dataWall: 'Data wall',
    chute: 'Exchange',
    coffee: 'Coffee',
    corkboard: 'Ratings',
    issueOpen: 'Open',
    issueReview: 'In review',
    issueDone: 'Done',
    wallSessions: 'Sessions to date',
    wallCost: 'Model cost to date',
    sent: 'Sent',
    returned: 'Returned',
    bin: 'Refusals',
} as const;

export const OFFICE_PRESET_COPY = {
    overview: 'Floor',
    front: 'Front desk',
    bullpen: 'Bullpen',
    table: 'Table',
    trading: 'Trader',
    risk: 'Risk desk',
    corner: 'Corner office',
    execution: 'Execution',
} as const;

// The providers the session's limits name (lib/limits ids), as they read.
export const PROVIDER_LABELS: Readonly<Record<string, string>> = {
    'gemini': 'Gemini',
    'anthropic': 'Anthropic',
    'openbb-yfinance': 'OpenBB (yfinance)',
    'sec': 'SEC EDGAR',
    'fred': 'FRED',
    'paperclip': 'Paperclip',
};
export const providerLabel = (provider: string): string => PROVIDER_LABELS[provider] ?? provider;

// What each data tool reads: its label in a table, and the thing it reads mid-sentence.
export const TOOL_COPY: Readonly<Record<DataTool, {label: string; what: (symbol: string) => string}>> = {
    get_stock_data: {label: 'Price bars', what: (s) => `${s}'s price bars`},
    get_verified_market_snapshot: {label: 'Market snapshot', what: (s) => `${s}'s market snapshot`},
    get_indicators: {label: 'Technical indicators', what: (s) => `${s}'s technical indicators`},
    get_fundamentals: {label: 'Key metrics', what: (s) => `${s}'s key metrics`},
    get_balance_sheet: {label: 'Balance sheet', what: (s) => `${s}'s balance sheet`},
    get_cashflow: {label: 'Cash flow statement', what: (s) => `${s}'s cash flow statement`},
    get_income_statement: {label: 'Income statement', what: (s) => `${s}'s income statement`},
    get_news: {label: 'Company news', what: (s) => `the news on ${s}`},
    get_global_news: {label: 'World news', what: () => 'the world news'},
    get_insider_transactions: {label: 'Insider filings', what: (s) => `${s}'s insider filings`},
    get_macro_indicators: {label: 'Macro series', what: () => 'the macro series'},
    get_prediction_markets: {label: 'Event odds', what: () => 'the event odds'},
};
const isDataTool = (name: string): name is DataTool => Object.prototype.hasOwnProperty.call(TOOL_COPY, name);
export const toolWhat = (name: string, symbol: string): string => (isDataTool(name) ? TOOL_COPY[name].what(symbol) : `${symbol}'s data from ${name}`);
export const toolLabel = (name: string): string => (isDataTool(name) ? TOOL_COPY[name].label : name);

// ---- what a seat is doing (the nameplate's line, one sentence) -----------------------------------

export const ROLE_TASK_COPY: {
    waiting: Readonly<Record<RoleId, string>>;
    started: Readonly<Record<RoleId, (symbol: string) => string>>;
    filed: Readonly<Record<RoleId, string>>;
    done: Readonly<Record<RoleId, string>>;
} = {
    waiting: {
        'market': 'Waiting for the run to open.',
        'sentiment': 'Waiting for the run to open.',
        'news': 'Waiting for the run to open.',
        'fundamentals': 'Waiting for the run to open.',
        'bull': 'Waiting for the four reports.',
        'bear': 'Waiting for the four reports.',
        'research-manager': 'Waiting for the debate.',
        'trader': 'Waiting for the plan.',
        'risk-aggressive': 'Waiting for the proposal.',
        'risk-conservative': 'Waiting for the proposal.',
        'risk-neutral': 'Waiting for the proposal.',
        'portfolio-manager': 'Waiting for the risk desk.',
    },
    started: {
        'market': (s) => `Reading ${s}'s price bars and indicators.`,
        'sentiment': (s) => `Reading what is being said about ${s}.`,
        'news': (s) => `Reading the news on ${s}.`,
        'fundamentals': (s) => `Reading ${s}'s statements and filings.`,
        'bull': (s) => `Reading the four reports on ${s}.`,
        'bear': (s) => `Reading the bull's turn on ${s}.`,
        'research-manager': (s) => `Weighing the debate on ${s}.`,
        'trader': (s) => `Drafting the proposal for ${s}.`,
        'risk-aggressive': (s) => `Reading the proposal for ${s}.`,
        'risk-conservative': (s) => `Reading the proposal for ${s}.`,
        'risk-neutral': (s) => `Reading the proposal for ${s}.`,
        'portfolio-manager': (s) => `Reading the risk desk's views on ${s}.`,
    },
    filed: {
        'market': 'Filed the market report.',
        'sentiment': 'Filed the sentiment report.',
        'news': 'Filed the news report.',
        'fundamentals': 'Filed the fundamentals report.',
        'bull': 'Put the bull case on the record.',
        'bear': 'Put the bear case on the record.',
        'research-manager': 'Filed the plan.',
        'trader': 'Filed the proposal.',
        'risk-aggressive': 'Put a view on the record.',
        'risk-conservative': 'Put a view on the record.',
        'risk-neutral': 'Put a view on the record.',
        'portfolio-manager': 'Filed the decision.',
    },
    done: {
        'market': 'The market report is in.',
        'sentiment': 'The sentiment report is in.',
        'news': 'The news report is in.',
        'fundamentals': 'The fundamentals report is in.',
        'bull': 'The bull case is on the record.',
        'bear': 'The bear case is on the record.',
        'research-manager': 'The plan is with the trader.',
        'trader': 'The proposal is with the risk desk.',
        'risk-aggressive': 'Spoke for taking the risk.',
        'risk-conservative': 'Spoke for keeping risk down.',
        'risk-neutral': 'Spoke for the middle ground.',
        'portfolio-manager': 'The decision is filed.',
    },
};

// What a role filed, mid-sentence ("filed the market report").
export const ROLE_OUTPUT_COPY: Readonly<Record<RoleId, string>> = {
    'market': 'the market report',
    'sentiment': 'the sentiment report',
    'news': 'the news report',
    'fundamentals': 'the fundamentals report',
    'bull': 'the bull case',
    'bear': 'the bear case',
    'research-manager': 'the plan',
    'trader': 'the proposal',
    'risk-aggressive': 'a risk view',
    'risk-conservative': 'a risk view',
    'risk-neutral': 'a risk view',
    'portfolio-manager': 'the decision',
};

export const TASK_COPY = {
    idle: 'Between sessions.',
    fetching: (what: string, vendor: string): string => `Reading ${what} through ${vendor}.`,
    fellBack: (from: string, note: string, to: string): string => `${from} answered ${note}; trying ${to}.`,
    fellBackSilent: (from: string, to: string): string => `${from} gave no answer; trying ${to}.`,
    read: (what: string, vendor: string): string => `Read ${what} through ${vendor}.`,
    readAfter: (what: string, vendor: string, from: string, note: string): string => `Read ${what} through ${vendor} after ${from} answered ${note}.`,
    readAfterSilent: (what: string, vendor: string, from: string): string => `Read ${what} through ${vendor} after ${from} gave no answer.`,
    unanswered: (what: string): string => `No provider answered for ${what}.`,
    noData: (what: string, vendor: string): string => `${vendor} had no data for ${what}.`,
    bullTurn: (round: number): string => `Arguing the bull case, round ${round}.`,
    bearTurn: (round: number): string => `Arguing the bear case, round ${round}.`,
    riskAggressiveTurn: (round: number): string => `Arguing for taking the risk, round ${round}.`,
    riskConservativeTurn: (round: number): string => `Arguing for keeping risk down, round ${round}.`,
    riskNeutralTurn: (round: number): string => `Arguing for the middle ground, round ${round}.`,
    spoke: (round: number): string => `Spoke in round ${round}; the others have the floor.`,
    rated: (symbol: string, label: string): string => `Rated ${symbol} ${label}.`,
    review: (symbol: string): string => `Named no readable rating for ${symbol}.`,
    stopped: (symbol: string): string => `The run on ${symbol} stopped here.`,
} as const;

export const DESK_TASK_COPY = {
    headIdle: 'Between sessions.',
    opening: 'Opening the session.',
    watching: 'Watching the desk run.',
    watchingIssue: (identifier: string): string => `Watching the desk run; issue ${identifier} is open.`,
    handedIn: 'Handed the issue in.',
    handedInIssue: (identifier: string): string => `Handed issue ${identifier} in.`,
    handedInPreview: 'The preview is done; there is nothing to approve.',
    blocked: (message: string): string => `Blocked: ${message}.`,
    blockedUnexplained: 'Blocked: the session stopped.',
    execIdle: 'Between sessions.',
    execWaiting: 'Waiting for the ratings.',
    planning: 'Planning the orders from the ratings.',
    awaitingOwner: 'Waiting for the owner.',
    stampedOwner: 'Stamped: approved by the owner.',
    stampedAuto: 'Stamped: approved without a pause.',
    declined: 'Declined; nothing traded.',
    lapsed: 'Lapsed; nothing traded.',
    filled: (filled: number, total: number): string => `${filled} of ${plural(total, 'ticket', 'tickets')} filled.`,
    noOrders: 'No ticket: every rating kept the book as it is.',
    nothingSent: 'Completed; no ticket reached the account.',
    previewNone: 'Preview: no approval asked.',
    previewPlanned: (orders: number): string => `Preview: ${plural(orders, 'order', 'orders')} planned, none sent.`,
    stoppedBefore: 'The session stopped before a decision.',
} as const;

// ---- the ticker (the newest events, one sentence each) ------------------------------------------

export const TICKER_COPY = {
    opened: (symbols: string): string => `The session opened on ${symbols}.`,
    turned: (symbol: string): string => `The desk turned to ${symbol}.`,
    fetched: (name: string, what: string, vendor: string): string => `${name} read ${what} through ${vendor}.`,
    fetchedAfter: (name: string, what: string, vendor: string, from: string, note: string): string => `${name} read ${what} through ${vendor} after ${from} answered ${note}.`,
    fetchedAfterSilent: (name: string, what: string, vendor: string, from: string): string => `${name} read ${what} through ${vendor} after ${from} gave no answer.`,
    unanswered: (name: string, what: string): string => `${name} got no answer for ${what}.`,
    noData: (name: string, what: string, vendor: string): string => `${name} found no data for ${what} at ${vendor}.`,
    filed: (name: string, thing: string, symbol: string): string => `${name} filed ${thing} on ${symbol}.`,
    argued: (name: string, side: string, round: number): string => `${name} argued the ${side} case, round ${round}.`,
    weighed: (name: string, round: number): string => `${name} weighed the proposal, round ${round}.`,
    rated: (symbol: string, label: string): string => `The desk rated ${symbol} ${label}.`,
    review: (symbol: string): string => `The decision on ${symbol} named no readable rating.`,
    runStopped: (symbol: string, message: string): string => `The run on ${symbol} stopped (${message}).`,
    limited: (provider: string, status: number): string => `${provider} refused a request (${status}).`,
    deskDone: 'The desk is done; the ratings went to the execution desk.',
    approved: 'The owner approved the orders.',
    approvedAuto: 'The orders were approved without a pause.',
    declined: 'The owner declined the orders; nothing traded.',
    lapsed: 'The session lapsed with no decision; nothing traded.',
    filled: (symbol: string, sold: boolean, quantity: number, price: string): string =>
        `The paper account ${sold ? 'sold' : 'bought'} ${plural(quantity, 'share', 'shares')} of ${symbol} at ${price}.`,
    notFilled: (symbol: string, message: string): string => `The order for ${symbol} was not filled (${message}).`,
    serviceStopped: (message: string): string => `The service stopped the session (${message}).`,
    empty: 'Nothing has happened yet.',
} as const;

// ---- the wall (the scoreboard) ------------------------------------------------------------------

export const SCOREBOARD_COPY = {
    heading: 'The wall',
    lead: 'The wall keeps the running totals of the session and of every session so far, and the account beside SPY over the same days; it ranks nothing.',
    labels: {
        session: 'Session',
        status: 'Status',
        elapsed: 'Elapsed',
        symbols: 'Symbols',
        calls: 'Model calls',
        fetches: 'Data fetches',
        tokens: 'Tokens in / out',
        cost: 'Model cost',
        refusals: 'Refusals',
        sessions: 'Sessions to date',
        costToDate: 'Model cost to date',
        desk: 'The account',
        spy: 'SPY',
    },
    since: (date: string): string => `since ${date}`,
    notStarted: 'not started',
    next: (when: string): string => `The next weekly session starts ${when}.`,
    lanes: 'Symbols in this session',
} as const;

// ---- a seat's file -------------------------------------------------------------------------------

export const DOSSIER_COPY = {
    lead: "A seat's file: what it is doing now, what this session and the last ones took, and the newest text it filed.",
    rightNow: 'Right now',
    thisSession: 'This session',
    career: 'Over the last sessions',
    company: 'Budget this month',
    latest: 'Latest text',
    desk: (n: number, total: number): string => `Desk ${n} of ${total}`,
    team: 'Team',
    model: 'Model',
    tiers: {quick: 'quick', deep: 'deep'},
    status: 'Status',
    task: 'Task',
    on: 'On',
    since: 'For',
    figures: {
        calls: 'Model calls',
        tokens: 'Tokens in / out',
        cost: 'Model cost',
        fetches: 'Data fetches',
        busy: 'Time busy',
        texts: 'Texts filed',
        sessions: 'Sessions',
        runs: 'Symbols',
        favourite: 'Most-read provider',
        decided: 'Decisions',
        filled: 'Tickets filled',
        tickets: 'Tickets',
    },
    careerSince: (date: string, sessions: number): string => `Over ${plural(sessions, 'finished session', 'finished sessions')} since ${date}.`,
    careerNone: 'No finished session yet; these figures start with the first one.',
    favourite: (vendor: string, pct: number): string => `${vendor}, ${pct}% of its fetches`,
    decided: (approved: number, declined: number, lapsed: number): string => `${approved} approved, ${declined} declined, ${lapsed} lapsed.`,
    budgetLine: (spent: string, cap: string): string => `${spent} of ${cap} spent this month.`,
    noCap: 'No monthly cap is set for this agent.',
    paused: 'Paused by its budget; a session that meets it stops.',
    budgetUnknown: 'No Paperclip company is set up on this deployment, so no budget is shown.',
    budgetUnreachable: 'Paperclip did not answer, so the budget is not shown.',
    noText: (name: string): string => `${name} has filed nothing in this session yet.`,
    replaying: 'The decision box comes back when the replay ends.',
    readOnFloor: 'Read in full on the floor',
    close: 'Close',
} as const;

// ---- the page ------------------------------------------------------------------------------------

export const OFFICE_COPY = {
    title: 'The office',
    subtitle: 'Floor 12 of the trading agent world: fourteen seats on one floor, every move a stored event, New York time on the clock.',
    open: 'Open the office',
    openHint: 'Opens in a new tab: the same session as a 3D office of fourteen seats.',
    back: 'Back to the floor',
    loading: 'Opening the office…',
    errorTitle: 'The office could not open',
    errorBody: 'The floor still has the session; try again to open the office.',
    retry: 'Try again',
    live: (seconds: number): string => `Live, checking every ${seconds} seconds`,
    replaying: (pct: number): string => `Replaying, ${pct}%`,
    idle: 'Last session',
    reconnecting: 'Reconnecting',
    replay: 'Replay',
    stop: 'Stop',
    replayNote: (seconds: number): string => `Plays the stored session back over ${seconds} seconds; with motion reduced it shows the end at once.`,
    noSessionTitle: 'No session yet',
    noSessionBody: 'The first session seats the fourteen; the office fills in as the desk runs.',
    engine2d: 'Drawn as a floor plan: this browser has no WebGL here, or the address asked for the plan.',
    stageLabel: 'The office floor: fourteen seats, each a button',
    rosterLabel: 'The seats, in the order a run reaches them',
    tickerLabel: 'What just happened',
    follow: 'Follow the run',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    keys: 'Keys',
    plan: 'Floor plan',
    view3d: '3D view',
    camera: 'Camera',
    clock: (time: string): string => `${time} ET`,
    modelText: 'Model text',
    following: (name: string): string => `Following ${name}.`,
    picked: (name: string, status: string, task: string): string => `${name}: ${status}. ${task}`,
    sound: 'Sound',
    soundOn: 'Sound on: six short cues mark the fetches, the filings, the turns, the pins, the stamp and the end of a session.',
} as const;

export const OFFICE_KEYS_COPY: readonly {keys: string; what: string}[] = [
    {keys: '0–7', what: 'Camera: the floor, then each zone in the order a run reaches it'},
    {keys: 'F', what: 'Follow the run on or off'},
    {keys: '+ / −', what: 'Zoom in or out'},
    {keys: '[ / ]', what: 'The previous or next seat'},
    {keys: 'Enter', what: "Open the focused seat's file"},
    {keys: 'Esc', what: 'Close the file'},
    {keys: 'R', what: 'Replay the last session'},
    {keys: 'P', what: 'The floor plan or the 3D view'},
    {keys: 'M', what: 'Sound on or off'},
];

// ---- the legend (mechanism only) -----------------------------------------------------------------

export const OFFICE_LEGEND_COPY = {
    summary: 'How to read the office: what a seat is doing, what moves on the floor, and the clock it keeps',
    seatsHeading: 'What a seat is doing',
    idle: 'Idle: no run is open, or the session has not reached this seat.',
    waiting: 'Waiting: the run is open and this seat comes after the one before it, or it has spoken and the others have the floor.',
    fetching: 'Fetching: a data tool was called and its answer is on its way, or has just landed.',
    busy: 'Busy: the model calls for this seat are in flight.',
    talking: 'Talking: a turn of the debate or of the risk desk was just spoken, and the bubble is its first line.',
    filed: 'Filed: a report, a plan, a proposal or a decision just landed, and a check mark rises over the seat.',
    done: 'Done: this seat finished its part of the run.',
    stopped: 'Did not finish: the run stopped while this seat was busy.',
    movesHeading: 'What moves',
    planes: 'A paper plane is one data fetch: it flies from a seat to the shelf of the provider its tool asks first and comes back with the data.',
    fallback: 'A shelf that refuses flashes amber and wears the refusal on a tag; the plane goes on to the next shelf in the chain.',
    papers: 'The robot carries each paper from the seat that filed it to the seats that read it next: the four reports to the researchers, the plan to the trader, the proposal to the risk desk.',
    cards: 'A card is pinned to the corkboard when a run completes, with the symbol and its rating in a badge.',
    lamp: 'The lamp on the execution desk breathes while the orders wait for the owner, and the stamp comes down when a decision is made.',
    tickets: 'A ticket down the chute is one order placed on the paper account; a ticket that comes back was not filled, and its tag says why.',
    board: "The issue board by the front desk shows the session's Paperclip issue: open, in review, done.",
    clockHeading: 'The clock',
    polling: (live: number, idle: number): string =>
        `The office checks for news every ${live} seconds while a session is in progress and every ${idle} seconds otherwise, and not at all while its tab is hidden.`,
    replay: (seconds: number): string =>
        `A finished session plays back over ${seconds} seconds, every seat read from the stored times; with motion reduced it shows the end at once.`,
    windows: (seconds: number): string =>
        `A bubble, a check mark or a plane stays about ${seconds} seconds after its event; in a replay, the same share of the session's own timeline.`,
    daylight: 'The light follows the New York clock, not the session: day, dusk and night, with the lamp by the chute lit while the market is open.',
    readingHeading: 'Reading it',
    keyboard: "Tab moves along the seats in the order a run reaches them; Enter opens a seat's file and Escape closes it.",
    fallbackMap: 'Without WebGL, or with ?engine=2d in the address, the office is a floor plan with the same seats and statuses.',
    caveat: 'Every bubble and every text in a file is model text about the desk\'s own paper account, shown as written.',
    figures: "This session's figures are the stored stage records; the last sessions' add the most recent forty finished sessions; budgets are Paperclip's month to date for each agent.",
    noRank: 'Nothing in the office ranks a seat: the figures say what was spent and read, not who did well.',
} as const;

// The glossary terms each kind of seat's file lists (existing keys only).
export const OFFICE_TERMS = {
    'analysts': ['desk-role', 'analyst-report', 'tool-call', 'data-vendor', 'point-in-time', 'model-tokens'],
    'research': ['desk-role', 'research-debate', 'model-tokens'],
    'trading': ['desk-role', 'model-tokens', 'session-cost'],
    'risk': ['desk-role', 'desk-rails', 'model-tokens'],
    'portfolio': ['desk-role', 'desk-rating', 'rating-target', 'desk-rails'],
    'head-trader': ['desk-session', 'heartbeat', 'agent-budget', 'approval-stage'],
    'execution-desk': ['session-approval', 'approval-lapse', 'approval-stage', 'desk-rails'],
    'board': ['desk-session', 'session-cost', 'model-tokens', 'tool-call'],
} as const;
export type OfficeTermsGroup = keyof typeof OFFICE_TERMS;
