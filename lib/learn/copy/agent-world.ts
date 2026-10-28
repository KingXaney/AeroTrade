// Every sentence of the trading agent world (/agent-world), as pure exports. Held to the 'copy'
// tier of lib/learn/banned by lib/learn/__tests__/agent-world-copy.test.ts, and the legend's
// sentences to mechanism only. The ratings' own words (Buy … Sell) are data labels, kept in
// lib/agent-world/config.ts RATING_LABELS and drawn inside a badge or a table cell: no sentence
// here opens on one.

import type {DataCategory, RoleId, RunStatus, SessionKind, SessionStatus, StageStatus, TeamId} from "@/lib/agent-world/config";

const plural = (n: number, one: string, many: string): string => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

export const ROLE_COPY: Readonly<Record<RoleId, {name: string; line: string}>> = {
    'market': {name: 'Market analyst', line: 'Reads the price bars and technical indicators for the symbol and files the market report.'},
    'sentiment': {name: 'Sentiment analyst', line: 'Reads what is being said about the company in public posts and files the sentiment report.'},
    'news': {name: 'News analyst', line: 'Reads company and world news for the window and files the news report.'},
    'fundamentals': {name: 'Fundamentals analyst', line: 'Reads the statements, the key metrics and the insider filings, and files the fundamentals report.'},
    'bull': {name: 'Bull researcher', line: 'Argues the case for the symbol from the four reports, one turn per round.'},
    'bear': {name: 'Bear researcher', line: 'Argues the case against it from the same reports, answering the bull.'},
    'research-manager': {name: 'Research manager', line: 'Weighs the debate and writes the plan the trader starts from.'},
    'trader': {name: 'Trader', line: 'Turns the plan into a trading proposal for the risk desk.'},
    'risk-aggressive': {name: 'Aggressive risk analyst', line: 'Weighs the proposal from the side that favours taking the risk.'},
    'risk-conservative': {name: 'Conservative risk analyst', line: 'Weighs the proposal from the side that favours keeping risk down.'},
    'risk-neutral': {name: 'Neutral risk analyst', line: 'Weighs the proposal between the other two sides.'},
    'portfolio-manager': {name: 'Portfolio manager', line: "Reads the risk desk's views and names the rating the orders are built from."},
};

export const TEAM_COPY: Readonly<Record<TeamId, string>> = {
    analysts: 'Analysts',
    research: 'Research',
    trading: 'Trading',
    risk: 'Risk desk',
    portfolio: 'Portfolio manager',
};

export const STATUS_COPY: Readonly<Record<SessionStatus, string>> = {
    'queued': 'Queued',
    'running': 'Running',
    'awaiting-approval': 'Awaiting a decision',
    'approved': 'Approved',
    'declined': 'Declined',
    'lapsed': 'Lapsed',
    'completed': 'Completed',
    'failed': 'Stopped',
};

export const STAGE_STATUS_COPY: Readonly<Record<StageStatus, string>> = {
    waiting: 'Waiting',
    working: 'Working',
    done: 'Done',
    failed: 'Did not finish',
};

export const RUN_STATUS_COPY: Readonly<Record<RunStatus, string>> = {
    pending: 'Waiting',
    running: 'Running',
    completed: 'Rated',
    failed: 'Did not finish',
};

export const KIND_COPY: Readonly<Record<SessionKind, string>> = {
    weekly: 'Weekly',
    manual: 'Manual',
    preview: 'Preview',
};

export const DATA_CATEGORY_COPY: Readonly<Record<DataCategory, string>> = {
    prices: 'Prices',
    indicators: 'Technical indicators',
    fundamentals: 'Fundamentals and statements',
    news: 'News and insider filings',
    macro: 'Macro series and event odds',
};

// Providers as their own names read.
export const VENDOR_LABELS: Readonly<Record<string, string>> = {
    'openbb': 'OpenBB',
    'yfinance': 'yfinance',
    'sec_edgar': 'SEC EDGAR',
    'fred': 'FRED',
    'alpha_vantage': 'Alpha Vantage',
    'polymarket': 'Polymarket',
};
export const vendorLabel = (vendor: string): string => VENDOR_LABELS[vendor] ?? vendor;

export const AGENT_WORLD_COPY = {
    title: 'Trading agent world',
    pageSubtitle: (symbols: number): string =>
        `Twelve model agents run a trading desk over ${plural(symbols, 'symbol', 'symbols')} each week, inside a company that budgets their spending, on one shared paper account. Every step shows as it happens.`,
    caveat: "Every report, turn and rating here is model text about the desk's own paper account, shown as written: a record of what the desk did, not advice to a reader.",
    views: {floor: 'Floor', company: 'Company', data: 'Data'},
    off: {
        'disabled': 'The trading agent world is switched off on this deployment: no session runs and nothing trades. The last session stays here as it was.',
        'unconfigured': 'The service that runs the desk is not set up on this deployment yet, so no session runs. What is below is the record so far.',
        'no-approver': 'No owner is set to decide the sessions, so none runs: under owner approval every session would lapse.',
    },
    emptyTitle: 'No session yet',
    emptyBody: "The first session opens the desk's paper account and runs the twelve roles over the week's symbols; this floor fills in as it goes.",
    emptyOwner: 'A session can start now, or the weekly one starts on its own.',
    nextSession: (when: string): string => `The next weekly session starts ${when}.`,
} as const;

export const FLOOR_COPY = {
    heading: 'The floor',
    live: (seconds: number): string => `Live, checking every ${seconds} seconds`,
    idle: 'Last session',
    replaying: 'Replaying the last session',
    reconnecting: 'Reconnecting',
    lanes: 'Symbols in this session',
    follow: 'Follow the run',
    tileStats: (calls: number, tokens: string, cost: string): string => `${plural(calls, 'model call', 'model calls')} · ${tokens} tokens · ${cost}`,
    notStarted: 'Not started',
    vendorsLabel: 'Read from',
    reportsHeading: 'Reports and the debate',
    reportPending: (name: string): string => `${name} has not filed yet.`,
    reportMissing: (name: string): string => `${name} filed no report in this run.`,
    debateHeading: 'The research debate',
    debateNone: 'No turn yet.',
    round: (n: number): string => `Round ${n}`,
    planHeading: "The research manager's plan",
    traderHeading: "The trader's proposal",
    riskHeading: 'The risk desk',
    decisionHeading: "The portfolio manager's decision",
    ratingLabel: 'Rating',
    reviewNote: 'The decision named no rating the desk could read, so this symbol trades nothing.',
    runFailed: (message: string): string => `This run did not finish (${message}); its symbol trades nothing.`,
    memoryNote: 'Memory log',
    ordersHeading: 'Orders from the ratings',
    ordersLead: 'Each rating maps to a share of the account by a fixed table, and code sizes the orders in whole shares.',
    ordersPending: 'The orders appear once every symbol has its rating.',
    ordersNone: 'No order: every rating kept the book as it is.',
    ruleSaw: 'What the rule saw',
    columns: {symbol: 'Symbol', rating: 'Rating', target: 'Target', held: 'Held now', side: 'Side', shares: 'Shares'},
    targetKeep: 'keep',
    fillsHeading: 'Fills',
    fillsNone: 'No fill yet.',
    fillLine: (symbol: string, sold: boolean, shares: number, price: string): string => `${symbol}: ${sold ? 'sold' : 'bought'} ${plural(shares, 'share', 'shares')} at ${price}`,
    fillFailed: (symbol: string, message: string): string => `${symbol}: not filled (${message})`,
    costLine: (calls: number, fetches: number, tokensIn: string, tokensOut: string, cost: string): string =>
        `${plural(calls, 'model call', 'model calls')} · ${plural(fetches, 'data fetch', 'data fetches')} · ${tokensIn} tokens in, ${tokensOut} out · ${cost}`,
    planning: 'The desk is done; the orders are being planned.',
    waitingOpen: 'Approved: the orders wait for the market to open.',
    serviceStopped: (message: string): string => `The service stopped this session (${message}).`,
    modelText: 'Model text',
    runNow: 'Run now',
    runNowBusy: 'Starting',
    runNowLive: 'A session is in progress.',
    preview: 'Preview',
    previewHint: 'Runs the desk and plans the orders; nothing is traded.',
    previewBadge: 'Preview, nothing traded',
} as const;

export const APPROVAL_COPY = {
    heading: 'Decision',
    prompt: 'The orders above wait for a decision; none is placed until one is made.',
    approve: 'Approve',
    decline: 'Decline',
    approving: 'Approving',
    declining: 'Declining',
    waiting: 'Waiting for the owner to approve or decline.',
    lapses: (when: string, left: string): string => `Undecided, it lapses ${when} (${left} left) and trades nothing.`,
    // Who decided, as a reader who is not an owner sees it: an owner's address is shown to owners only.
    ownerWord: 'the owner',
    approved: (by: string, at: string): string => `Approved by ${by} at ${at}.`,
    approvedAuto: 'Approval is set to automatic: the orders went without a pause.',
    declined: (by: string, at: string): string => `Declined by ${by} at ${at}; nothing was traded.`,
    lapsed: (at: string): string => `Lapsed at ${at} with no decision; nothing was traded.`,
    mirrorFailed: 'Recorded here; Paperclip could not be reached, so its issue was not updated.',
    mirrored: 'Recorded on the Paperclip issue too.',
    previewNone: 'A preview plans the orders and asks for no decision.',
} as const;

export const REPLAY_COPY = {
    start: 'Replay',
    stop: 'Stop',
    running: (pct: number): string => `Replaying, ${pct}%`,
    note: (seconds: number): string => `Plays the stored session back over ${seconds} seconds; with motion reduced it shows the end at once.`,
} as const;

export const RECORD_COPY = {
    heading: 'The account and SPY',
    lead: "The desk's paper account since its first session, beside SPY's total return over the same days; neither is ranked.",
    desk: 'Trading agent world',
    spy: 'SPY',
    since: (date: string): string => `since ${date}`,
    notStarted: 'not started',
    sessions: 'Sessions',
    spent: 'Model cost to date',
    curvePending: 'A curve appears after the second daily snapshot.',
    noAccount: 'The account opens with the first session.',
} as const;

export const SESSIONS_COPY = {
    heading: 'Sessions',
    empty: 'No session yet.',
    line: (week: string, kind: string, symbols: number): string => `Week of ${week} · ${kind} · ${plural(symbols, 'symbol', 'symbols')}`,
    cost: (cost: string): string => `model cost ${cost}`,
    fills: (filled: number, total: number): string => `${filled} of ${plural(total, 'order', 'orders')} filled`,
} as const;

export const COMPANY_COPY = {
    heading: 'The company',
    lead: "Paperclip keeps the company around the desk: each role is an agent with a title, a manager and a monthly budget, each session is an issue, and the owner's decision is recorded as the Execution desk's.",
    howSummary: 'How the company runs',
    unconfigured: 'No Paperclip company is set up on this deployment (PAPERCLIP_URL, PAPERCLIP_API_KEY and PAPERCLIP_COMPANY_ID). Sessions run without it.',
    unreachable: 'Paperclip did not answer, so the org chart, budgets and activity cannot be shown right now. Sessions and decisions here are not affected.',
    board: 'Open the Paperclip board',
    orgHeading: 'Org chart',
    budgetsHeading: 'Budgets this month',
    companyBudget: (spent: string, cap: string): string => `The company: ${spent} of ${cap} this month`,
    agentBudget: (spent: string, cap: string): string => `${spent} of ${cap}`,
    noCap: 'no cap set',
    issueHeading: "This session's issue",
    issueNone: 'No issue yet: a session opens one when it starts, and a preview never does.',
    stage: {none: 'No approval stage', idle: 'In progress', pending: 'Waiting for the Execution desk', completed: 'Approved', changes: 'Sent back'},
    activityHeading: 'Recent activity',
    activityEmpty: 'No activity recorded.',
    costsHeading: 'Model cost by agent, this month',
    costsEmpty: 'No cost reported this month.',
    costColumns: {agent: 'Agent', tokens: 'Tokens in / out', cost: 'Cost'},
} as const;

export const DATA_COPY = {
    heading: 'The data',
    lead: "The desk's analysts read through OpenBB first and fall back to yfinance and SEC EDGAR, keyless; the service reports which providers it loaded, and the fetches of the newest session that ran a symbol are listed as they were made.",
    howSummary: 'How the data is read',
    vendorsHeading: 'Where each tool reads',
    columns: {tool: 'Tool', category: 'Data', chain: 'Read from, in order', route: 'OpenBB route'},
    notOpenbb: 'not through OpenBB',
    healthHeading: 'The service',
    healthUnreachable: 'The service did not answer its health check.',
    healthUnconfigured: 'No service is set up on this deployment.',
    worker: (busy: boolean): string => (busy ? 'running a session now' : 'idle'),
    keySet: 'set',
    keyMissing: 'not set',
    checked: (ago: string): string => `checked ${ago}`,
    fetchesHeading: 'What the desk last fetched',
    fetchesNone: 'No session has fetched anything yet.',
    fetchedIn: (sessionId: string): string => `Session ${sessionId}, the newest that ran a symbol.`,
    vendorGroup: (vendor: string, fetches: number, ms: string): string => `${vendor} · ${plural(fetches, 'fetch', 'fetches')} · ${ms} in all`,
    callStatus: {'ok': 'answered', 'unavailable': 'no answer', 'no-data': 'no data'},
    fellBack: (from: string): string => `after ${from} gave no answer`,
    jobsHeading: 'The job',
    limitsNote: 'Only the services this desk calls are listed here; every provider is on the News Brain system view.',
} as const;

export const ACTION_COPY = {
    notSignedIn: 'Sign in first.',
    notOwner: 'Only the owner can start or decide a session.',
    tooFast: 'Requests are limited to a few a minute; try again shortly.',
    invalid: 'That request was not understood.',
    off: 'The desk is not set up to run on this deployment.',
    live: 'A session is already in progress.',
    notQueued: 'The session could not be queued; try again in a moment.',
    started: 'Session started: the floor fills in as the desk runs.',
    previewStarted: 'Preview started: the desk runs and plans; nothing is traded.',
    approved: 'Approved: the orders go to the paper account while the market is open.',
    declined: 'Declined: nothing is traded.',
    notAwaiting: 'That session is not waiting for a decision.',
    notSaved: 'Something went wrong; nothing was changed.',
} as const;

// The order reasons read clause by clause (lib/learn/agent-world-reasons.ts): narration of what the
// code did with a rating, held to the advice tier and to mechanism only.
export const AGENT_WORLD_GLOSS = {
    rated: (rating: string): string => `The portfolio manager's decision for this symbol named ${rating}, the word the service read off its text.`,
    target: (target: string): string => `The fixed table maps that rating to ${target} of the account; the order moves the holding toward it in whole shares.`,
    scaled: (target: string, table: string): string => `The table's ${table} came to ${target} under the rails: a cap on one name, and the cash kept aside across every target.`,
} as const;

// The legend: every figure arrives as an argument from config, so a moved constant moves it.
export const AGENT_WORLD_LEGEND_COPY = {
    summary: 'How a session runs, who sits on the desk, and the rules the ratings pass through',
    sessionHeading: 'A session',
    session: (symbols: number, list: string): string => `A session runs the desk once for each of ${plural(symbols, 'symbol', 'symbols')} (${list}), one after another, and trades one shared paper account.`,
    account: (balance: string): string => `The account opened with ${balance}, and every fill is marked as the desk's on its ledger.`,
    kinds: 'A weekly session starts on its own; the owner can start a manual one, which trades the same way, or a preview, which plans orders and trades nothing.',
    deskHeading: 'The desk',
    order: (teams: string): string => `The roles run in this order: ${teams}.`,
    parallel: 'The four analysts run at the same time; every other role waits for the one before it.',
    rounds: (debate: number, risk: number): string => `The researchers argue for ${plural(debate, 'round', 'rounds')} and the risk desk for ${plural(risk, 'round', 'rounds')}.`,
    models: (quick: string, deep: string): string => `The research manager and the portfolio manager run on ${deep} by default; every other role on ${quick}.`,
    ratingsHeading: 'Ratings and orders',
    scale: (weights: string): string => `The portfolio manager names one rating per symbol, which a fixed table turns into a target share of the account (${weights}); a decision with no readable rating counts as REVIEW and changes nothing.`,
    rails: (cap: string, cash: string, band: string): string => `Code sizes the orders in whole shares from those targets: at most ${cap} of the account in one name, ${cash} kept in cash, and a change smaller than ${band} of the account left alone.`,
    once: 'Each order is placed once per session, side and symbol, so a retried step never places it twice.',
    decisionHeading: 'The decision',
    approvalOwner: 'Under owner approval a session that has orders waits for the owner to approve or decline them on this page.',
    approvalAuto: "Approval is set to automatic: a session's orders go without a pause.",
    lapse: (day: string, time: string, hours: number): string => `A session nobody decides lapses at the next ${day} ${time} ET or ${hours} hours after it started, whichever comes first, and trades nothing.`,
    open: 'Approved orders are placed while the market is open; an approval outside the session waits for the next open.',
    companyHeading: 'The company',
    company: (soft: number, hard: number): string => `Paperclip keeps each role as an agent with a monthly budget: it warns at ${soft}% of the budget and pauses the agent at ${hard}%, and a session that meets a paused agent stops.`,
    costs: "Each role's model cost is counted from the tokens its calls used, priced by a table in the service, and reported to Paperclip against that role's agent.",
    issue: "Each session is an issue assigned to the Head trader; under owner approval it waits in review for the Execution desk, whose hand is the owner's decision here.",
    dataHeading: 'The data',
    data: (chains: string): string => `Each data tool asks its providers in order (${chains}); a provider not named is never asked, and a tool with no answer says so in the report.`,
    pointInTime: "Every fetch is cut at the session's trade date: a statement counts only once its filing could have been read, and news and insider filings only up to that day.",
    scheduleHeading: 'The schedule',
    schedule: (day: string, retryDay: string, time: string): string => `The weekly session starts ${day}s at ${time} ET; a ${retryDay} run takes the week when ${day} is a market holiday.`,
    wait: (minutes: number): string => `The job waits up to ${minutes} minutes for the desk to finish before it closes the session.`,
    polling: (live: number, idle: number): string => `The floor checks for news every ${live} seconds while a session is in progress and every ${idle} seconds otherwise, and not at all while its tab is hidden.`,
    replay: (seconds: number): string => `A finished session plays back over ${seconds} seconds.`,
    killSwitch: (name: string): string => `With ${name} set to false the job runs no session, and the page shows its last one.`,
} as const;

// The terms each panel's one "What these mean" lists (lib/learn/glossary keys).
export const STRIP_TERMS = ['desk-role', 'tool-call', 'model-tokens', 'session-cost'] as const;
export const REPORT_TERMS = ['analyst-report', 'research-debate', 'desk-rating'] as const;
export const DECISION_TERMS = ['rating-target', 'desk-rails', 'session-approval', 'approval-lapse', 'market-order'] as const;
export const RECORD_TERMS = ['total-return', 'benchmark', 'desk-session', 'session-cost'] as const;
export const SESSIONS_TERMS = ['desk-session'] as const;
export const COMPANY_TERMS = ['heartbeat', 'agent-budget', 'approval-stage'] as const;
export const DATA_TERMS = ['data-vendor', 'point-in-time', 'tool-call'] as const;
