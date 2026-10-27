import {describe, expect, it} from 'vitest';
import {CLAMPS, TURNS_KEPT} from '@/lib/agent-world/config';
import {foldHead, parseBatch, runUpdateFor, symbolOf, type AgentWorldEvent, type SessionHead} from '@/lib/agent-world/events';

const SID = 'aw-2026-10-26';
const at = (minute: number) => `2026-10-26T12:${String(minute).padStart(2, '0')}:00Z`;
const raw = (seq: number, type: string, extra: Record<string, unknown> = {}) => ({seq, at: at(seq % 60), type, sessionId: SID, ...extra});
const parsed = (items: unknown[]): AgentWorldEvent[] => {
    const batch = parseBatch({sessionId: SID, events: items});
    if (!batch.ok) throw new Error('batch refused');
    return batch.events;
};

const HEAD: SessionHead = {
    status: 'queued',
    seq: 0,
    startedAt: null,
    finishedAt: null,
    serviceFinishedAt: null,
    current: null,
    runs: [{symbol: 'AAPL', status: 'pending', rating: null, review: false, costCents: 0}],
    cost: {totalCents: 0, tokensIn: 0, tokensOut: 0, llmCalls: 0, toolCalls: 0},
    limits: [],
    service: null,
    models: null,
    dropped: 0,
};

describe('reading a batch from the service', () => {
    it('keeps each valid event in seq order and counts the rest, never refusing their neighbours', () => {
        const batch = parseBatch({
            sessionId: SID,
            events: [
                raw(3, 'role.started', {symbol: 'AAPL', role: 'market'}),
                raw(1, 'run.started', {symbol: 'AAPL', index: 0, total: 1}),
                raw(2, 'role.started', {symbol: 'AAPL', role: 'not-a-role'}),
                {...raw(4, 'role.done', {symbol: 'AAPL', role: 'market'}), sessionId: 'aw-other'},
                raw(3, 'role.done', {symbol: 'AAPL', role: 'market'}),
                raw(5, 'mystery.event'),
            ],
        });
        expect(batch.ok).toBe(true);
        if (!batch.ok) return;
        expect(batch.events.map((event) => [event.seq, event.type])).toEqual([[1, 'run.started'], [3, 'role.started']]);
        expect(batch.invalid).toBe(4);
    });

    it('refuses a batch that is not one', () => {
        expect(parseBatch({events: []}).ok).toBe(false);
        expect(parseBatch({sessionId: 'has spaces', events: [raw(1, 'run.started')]}).ok).toBe(false);
        expect(parseBatch('text').ok).toBe(false);
    });

    it('cuts a long text at its clamp instead of refusing it, and reads times as epoch milliseconds', () => {
        const [report] = parsed([raw(1, 'role.report', {symbol: 'AAPL', role: 'market', text: 'x'.repeat(CLAMPS.report + 500)})]);
        expect(report.type === 'role.report' && report.text.length).toBe(CLAMPS.report);
        expect(report.at).toBe(Date.parse(at(1)));
    });
});

describe('folding a batch into the session head', () => {
    const events = parsed([
        raw(1, 'session.started', {symbols: ['AAPL'], tradeDate: '2026-10-26', approval: 'owner', dryRun: false, models: {provider: 'google', quick: 'q', deep: 'd'}}),
        raw(2, 'run.started', {symbol: 'AAPL', index: 0, total: 1}),
        raw(3, 'tool.called', {symbol: 'AAPL', role: 'market', name: 'get_stock_data', args: '{}', callId: 'c1'}),
        raw(4, 'cost.tick', {symbol: 'AAPL', role: 'market', model: 'q', inputTokens: 1000, outputTokens: 200, costCents: 0.4, llmCalls: 2}),
        raw(5, 'limit', {symbol: 'AAPL', provider: 'openbb-yfinance', status: 429, message: 'Too Many Requests', fatal: false}),
        raw(6, 'run.completed', {symbol: 'AAPL', rating: 'Buy', review: false, decision: 'Rating: Buy', stats: {llmCalls: 9, toolCalls: 4, tokensIn: 9000, tokensOut: 2000, costCents: 1.5}}),
        raw(7, 'session.completed', {runs: [{symbol: 'AAPL', rating: 'Buy', review: false}], tokensIn: 9000, tokensOut: 2000, costCents: 1.5, llmCalls: 9, toolCalls: 4, dropped: 3}),
    ]);

    it('runs the session, rates the run, counts its cost and keeps the limit', () => {
        const head = foldHead(HEAD, events);
        expect(head.status).toBe('running');
        expect(head.seq).toBe(7);
        expect(head.startedAt).toBe(Date.parse(at(1)));
        expect(head.models).toEqual({provider: 'google', quick: 'q', deep: 'd'});
        expect(head.runs).toEqual([{symbol: 'AAPL', status: 'completed', rating: 'Buy', review: false, costCents: 1.5}]);
        // 0.4 from the tick, then the run's own 1.5 stands for the ticks that never arrived.
        expect(head.cost.totalCents).toBeCloseTo(1.5);
        expect(head.cost.toolCalls).toBe(1);
        expect(head.limits).toHaveLength(1);
        expect(head.serviceFinishedAt).toBe(Date.parse(at(7)));
        expect(head.current).toBeNull();
        expect(head.dropped).toBe(3);
    });

    it('changes nothing for events it already holds, and returns the same head', () => {
        const once = foldHead(HEAD, events);
        expect(foldHead(once, events)).toBe(once);
        expect(foldHead(once, events.slice(0, 3))).toBe(once);
    });

    it('fails a running session, but never moves one the job or the owner already decided', () => {
        const failure = parsed([raw(9, 'session.failed', {outcome: 'budget', message: 'paused at 100%'})]);
        const failed = foldHead({...HEAD, status: 'running', seq: 8}, failure);
        expect(failed.status).toBe('failed');
        expect(failed.service).toEqual({outcome: 'budget', message: 'paused at 100%'});
        const lapsed = foldHead({...HEAD, status: 'lapsed', seq: 8}, failure);
        expect(lapsed.status).toBe('lapsed');
        expect(lapsed.service).toBeNull();
    });
});

describe('the update a run-level event makes', () => {
    it('files a report and its time on the role', () => {
        const [event] = parsed([raw(1, 'role.report', {symbol: 'AAPL', role: 'news', text: 'News report.'})]);
        expect(runUpdateFor(event)).toEqual({$set: {seq: 1, 'reports.news': 'News report.', 'stages.news.reportAt': new Date(event.at)}});
        expect(symbolOf(event)).toBe('AAPL');
    });

    it('counts a cost on its stage and the run, and a cost no role made on the run alone', () => {
        const [stage, memory] = parsed([
            raw(1, 'cost.tick', {symbol: 'AAPL', role: 'trader', model: 'q', inputTokens: 10, outputTokens: 5, costCents: 0.2, llmCalls: 1}),
            raw(2, 'cost.tick', {symbol: 'AAPL', role: 'memory', model: 'q', inputTokens: 10, outputTokens: 5, costCents: 0.1, llmCalls: 1}),
        ]);
        expect(runUpdateFor(stage)?.$inc).toMatchObject({'stages.trader.costCents': 0.2, 'stages.trader.llmCalls': 1, 'cost.totalCents': 0.2});
        expect(runUpdateFor(memory)?.$inc).toMatchObject({'extraCost.memory': 0.1, 'cost.totalCents': 0.1});
        expect(Object.keys(runUpdateFor(memory)?.$inc ?? {})).not.toContain('stages.memory.costCents');
    });

    it('keeps the debate to its cap, and moves nothing for a session-level event', () => {
        const [turn, done] = parsed([
            raw(1, 'debate.turn', {symbol: 'AAPL', side: 'bull', round: 1, text: 'The case for.'}),
            raw(2, 'session.completed', {runs: [], tokensIn: 0, tokensOut: 0, costCents: 0, llmCalls: 0, toolCalls: 0, dropped: 0}),
        ]);
        expect(runUpdateFor(turn)?.$push).toEqual({debate: {$each: [{seq: 1, side: 'bull', round: 1, text: 'The case for.', at: new Date(turn.at)}], $slice: -TURNS_KEPT}});
        expect(runUpdateFor(done)).toBeNull();
        expect(symbolOf(done)).toBeNull();
    });
});
