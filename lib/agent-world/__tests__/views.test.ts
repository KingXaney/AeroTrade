import {describe, expect, it} from 'vitest';
import {headFields, newSessionFields, toRunView, toSessionHead, toSessionView} from '@/lib/agent-world/views';

const stored = {
    env: 'production',
    sessionId: 'aw-2026-10-26',
    kind: 'weekly',
    weekKey: '2026-10-26',
    tradeDate: '2026-10-26',
    status: 'awaiting-approval',
    approval: 'owner',
    symbols: ['AAPL'],
    seq: 41,
    version: 15,
    current: null,
    runs: [{symbol: 'AAPL', status: 'completed', rating: 'Buy', review: false, costCents: 3}],
    orders: [{symbol: 'AAPL', side: 'buy', quantity: 100, reason: 'rated Buy → target 20%', rating: 'Buy', targetWeight: 0.2, currentWeight: 0}, {symbol: 'X', side: 'hold'}],
    fills: [],
    decision: null,
    lapseAt: new Date('2026-10-29T12:30:00Z'),
    cost: {totalCents: 3, tokensIn: 100, tokensOut: 50, llmCalls: 4, toolCalls: 2},
    paperclip: {issueId: 'i-1', identifier: 'TAW-1', url: null, mirrored: null, note: null},
    limits: [{provider: 'gemini', status: 429, message: 'rate', fatal: false, at: new Date('2026-10-26T12:40:00Z'), symbol: 'AAPL'}],
    service: null,
    models: null,
    dropped: 0,
    note: null,
    createdAt: new Date('2026-10-26T12:30:00Z'),
    startedAt: new Date('2026-10-26T12:30:05Z'),
    finishedAt: null,
    serviceFinishedAt: new Date('2026-10-26T12:45:00Z'),
};

describe('a stored session as the page sees it', () => {
    it('turns dates into epoch milliseconds and drops a malformed order', () => {
        const view = toSessionView(stored);
        expect(view.lapseAt).toBe(Date.parse('2026-10-29T12:30:00Z'));
        expect(view.serviceFinishedAt).toBe(Date.parse('2026-10-26T12:45:00Z'));
        expect(view.orders).toHaveLength(1);
        expect(view.limits[0].at).toBe(Date.parse('2026-10-26T12:40:00Z'));
        expect(view.paperclip.identifier).toBe('TAW-1');
        expect(view.version).toBe(15);
    });

    it('fills every field of a row that has almost none', () => {
        const view = toSessionView({sessionId: 'aw-x'});
        expect(view).toMatchObject({status: 'queued', kind: 'weekly', approval: 'owner', symbols: [], runs: [], orders: [], decision: null, service: null});
        expect(view.cost).toEqual({totalCents: 0, tokensIn: 0, tokensOut: 0, llmCalls: 0, toolCalls: 0});
    });

    it('writes back exactly the head it read', () => {
        const head = toSessionHead(stored);
        expect(toSessionHead(headFields(head))).toEqual(head);
    });

    it('opens a new session queued, every symbol pending, version one', () => {
        const fields = newSessionFields({env: 'development', sessionId: 'aw-x', kind: 'weekly', weekKey: 'w', tradeDate: 'd', approval: 'owner', source: 'schedule', requestedBy: null, accountId: 'a', symbols: ['AAPL', 'MSFT'], lapseAt: null});
        expect(fields).toMatchObject({status: 'queued', seq: 0, version: 1, lapseAt: null});
        expect(fields.runs.map((run) => [run.symbol, run.status])).toEqual([['AAPL', 'pending'], ['MSFT', 'pending']]);
    });
});

describe('a stored run as the page sees it', () => {
    it('keeps the roles it knows, in order, and lets the run\'s own total stand for ticks that never arrived', () => {
        const view = toRunView({
            symbol: 'AAPL',
            status: 'completed',
            stages: {market: {status: 'done', startedAt: new Date(1000), finishedAt: new Date(2000), llmCalls: 2}, wizard: {status: 'done'}},
            reports: {market: 'Market report.', wizard: 'x'},
            cost: {totalCents: 1, llmCalls: 2},
            stats: {costCents: 2.5, llmCalls: 3, toolCalls: 1, tokensIn: 10, tokensOut: 5},
            tools: [{seq: 1, callId: 'c', role: 'market', name: 'get_stock_data', args: '{}', at: new Date(1500)}, {role: 'wizard'}],
            toolResults: [{seq: 2, callId: 'c', role: 'market', name: 'get_stock_data', status: 'ok', vendor: 'openbb', ms: 10, chars: 5, attempts: [{vendor: 'openbb', ok: true}], at: new Date(1600)}],
            extraCost: {memory: 0.2, mystery: 9},
        });
        expect(Object.keys(view.stages)).toEqual(['market']);
        expect(view.stages.market).toMatchObject({status: 'done', startedAt: 1000, finishedAt: 2000, llmCalls: 2, costCents: 0});
        expect(view.reports).toEqual({market: 'Market report.'});
        expect(view.cost.totalCents).toBe(2.5);
        expect(view.tools).toHaveLength(1);
        expect(view.toolResults[0].attempts).toEqual([{vendor: 'openbb', ok: true, error: null}]);
        expect(view.extraCost).toEqual({memory: 0.2});
    });
});
