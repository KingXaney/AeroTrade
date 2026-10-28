// Small hand-made views the floor's pure modules are tested on: one session of two symbols, the
// first run finished, the second half-way.

import type {LiveView, RunView, SessionView} from '@/lib/agent-world/types';

export const T0 = Date.parse('2026-10-26T12:30:00Z');
const min = (m: number) => T0 + m * 60_000;

export const session = (over: Partial<SessionView> = {}): SessionView => ({
    sessionId: 'aw-2026-10-26',
    kind: 'weekly',
    weekKey: '2026-10-26',
    tradeDate: '2026-10-26',
    status: 'running',
    approval: 'owner',
    symbols: ['AAPL', 'MSFT'],
    seq: 40,
    version: 12,
    current: {symbol: 'MSFT', index: 1},
    runs: [
        {symbol: 'AAPL', status: 'completed', rating: 'Buy', review: false, costCents: 3.2},
        {symbol: 'MSFT', status: 'running', rating: null, review: false, costCents: 1},
    ],
    orders: [],
    fills: [],
    decision: null,
    lapseAt: null,
    cost: {totalCents: 4.2, tokensIn: 40_000, tokensOut: 9000, llmCalls: 30, toolCalls: 12},
    paperclip: {issueId: null, identifier: null, url: null, mirrored: null, note: null},
    limits: [],
    service: null,
    models: {provider: 'google', quick: 'gemini-2.5-flash-lite', deep: 'gemini-2.5-flash'},
    dropped: 0,
    note: null,
    createdAt: T0,
    startedAt: T0,
    finishedAt: null,
    serviceFinishedAt: null,
    ...over,
});

const stage = (start: number, end: number | null, report: number | null = end) => ({
    status: end === null ? 'working' as const : 'done' as const,
    startedAt: min(start),
    finishedAt: end === null ? null : min(end),
    reportAt: report === null ? null : min(report),
    llmCalls: 2,
    tokensIn: 1000,
    tokensOut: 200,
    costCents: 0.3,
});

export const finishedRun = (): RunView => ({
    symbol: 'AAPL',
    index: 0,
    status: 'completed',
    seq: 30,
    rating: 'Buy',
    review: false,
    decision: 'Rating: Buy. The desk adds the name at a fifth of the account.',
    startedAt: min(0),
    finishedAt: min(10),
    stages: {
        'market': stage(0, 2),
        'news': stage(0, 3),
        'bull': stage(3, 5, null),
        'trader': stage(6, 7),
        'portfolio-manager': stage(8, 10),
    },
    reports: {'market': 'Market report.', 'news': 'News report.', 'trader': 'Trader proposal.', 'portfolio-manager': 'Rating: Buy.'},
    debate: [{seq: 12, side: 'bull', round: 1, text: 'The case for.', at: min(4)}, {seq: 13, side: 'bear', round: 1, text: 'The case against.', at: min(5)}],
    risk: [{seq: 20, role: 'risk-neutral', round: 1, text: 'A neutral view.', at: min(8)}],
    tools: [{seq: 3, callId: 'c1', role: 'market', name: 'get_stock_data', args: '{"symbol":"AAPL"}', at: min(1)}],
    toolResults: [
        {seq: 4, callId: 'c1', role: 'market', name: 'get_stock_data', status: 'ok', vendor: 'openbb', ms: 420, chars: 3000, attempts: [], at: min(1)},
        {seq: 5, callId: 'c2', role: 'market', name: 'get_indicators', status: 'ok', vendor: 'yfinance', ms: 900, chars: 2000, attempts: [{vendor: 'openbb', ok: false, error: 'timed out'}, {vendor: 'yfinance', ok: true, error: null}], at: min(2)},
        {seq: 6, callId: 'c3', role: 'news', name: 'get_news', status: 'unavailable', vendor: null, ms: 50, chars: 80, attempts: [], at: min(2)},
    ],
    cost: {totalCents: 3.2, tokensIn: 30_000, tokensOut: 7000, llmCalls: 20, toolCalls: 3},
    extraCost: {},
    memoryNote: null,
    failure: null,
});

export const runningRun = (): RunView => ({
    ...finishedRun(),
    symbol: 'MSFT',
    index: 1,
    status: 'running',
    seq: 40,
    rating: null,
    decision: null,
    startedAt: min(11),
    finishedAt: null,
    stages: {market: stage(11, null, null)},
    reports: {},
    debate: [],
    risk: [],
    tools: [],
    toolResults: [],
    cost: {totalCents: 1, tokensIn: 10_000, tokensOut: 2000, llmCalls: 10, toolCalls: 0},
});

export const liveView = (over: Partial<LiveView> = {}): LiveView => ({
    version: 12,
    seq: 40,
    serverNow: min(12),
    session: session(),
    runs: [finishedRun(), runningRun()],
    partial: false,
    ...over,
});
