import {describe, expect, it} from 'vitest';
import {ROLE_IDS} from '@/lib/agent-world/config';
import {
    approvalState,
    comparisonRows,
    elapsedText,
    fetchesByVendor,
    formatCents,
    formatTokens,
    hasText,
    latestRole,
    ratingParts,
    stageViews,
    vendorBadges,
} from '@/lib/agent-world/page-view';
import {finishedRun, runningRun, session} from '@/lib/agent-world/__tests__/fixtures';

describe('the stage strip', () => {
    it('lists the twelve roles in run order, waiting where nothing started', () => {
        const stages = stageViews(finishedRun());
        expect(stages.map((stage) => stage.role)).toEqual([...ROLE_IDS]);
        expect(stages.find((s) => s.role === 'market')).toMatchObject({status: 'done', llmCalls: 2, hasReport: true, vendors: [{vendor: 'openbb', count: 1}, {vendor: 'yfinance', count: 1}]});
        expect(stages.find((s) => s.role === 'sentiment')?.status).toBe('waiting');
        expect(stageViews(null).every((stage) => stage.status === 'waiting')).toBe(true);
    });

    it('marks a role that was working when its run stopped as not finished', () => {
        const stopped = {...runningRun(), status: 'failed' as const};
        expect(stageViews(stopped).find((s) => s.role === 'market')?.status).toBe('failed');
    });

    it('counts the providers a role read from, in the order first seen, leaving out a fetch with no answer', () => {
        expect(vendorBadges(finishedRun().toolResults, 'news')).toEqual([]);
        expect(vendorBadges(finishedRun().toolResults, 'market').map((v) => v.vendor)).toEqual(['openbb', 'yfinance']);
    });

    it('clocks a stage from its start to its finish or to now', () => {
        expect(elapsedText(null, null, 5000)).toBe('');
        expect(elapsedText(0, 125_000, 999_999)).toBe('2:05');
        expect(elapsedText(0, null, 61_000)).toBe('1:01');
    });
});

describe('the texts and the decision', () => {
    it('follows the newest text, a turn included, and knows which roles have one', () => {
        expect(latestRole(finishedRun())).toBe('portfolio-manager');
        expect(latestRole({...finishedRun(), stages: {}})).toBe('risk-neutral');
        expect(latestRole({...finishedRun(), stages: {}, risk: []})).toBe('bear');
        expect(latestRole(null)).toBeNull();
        expect(hasText(finishedRun(), 'bull')).toBe(true);
        expect(hasText(finishedRun(), 'risk-aggressive')).toBe(false);
        expect(hasText(finishedRun(), 'trader')).toBe(true);
    });

    it('says where the decision stands', () => {
        expect(approvalState(session({status: 'awaiting-approval'}))).toBe('pending');
        expect(approvalState(session({kind: 'preview'}))).toBe('preview');
        expect(approvalState(session({status: 'approved', decision: {decision: 'approved', by: 'auto', at: 1}}))).toBe('approved-auto');
        expect(approvalState(session({status: 'approved', decision: {decision: 'approved', by: 'owner@example.com', at: 1}}))).toBe('approved');
        expect(approvalState(session({status: 'lapsed', decision: {decision: 'lapsed', by: null, at: 1}}))).toBe('lapsed');
        expect(approvalState(session())).toBe('none');
    });

    it('names each symbol before its rating, so no line opens on a rating word', () => {
        expect(ratingParts(session())).toEqual(['AAPL Buy']);
    });
});

describe('the record and the data', () => {
    it('states the desk and SPY in that order whatever their returns', () => {
        expect(comparisonRows({totalReturnPct: -4, benchmarkReturnPct: 9, since: '2026-10-26'}).map((row) => row.id)).toEqual(['desk', 'spy']);
        expect(comparisonRows(null)).toEqual([{id: 'desk', returnPct: null, since: null}, {id: 'spy', returnPct: null, since: null}]);
    });

    it('groups the fetches by the provider that answered, the busiest first', () => {
        const groups = fetchesByVendor([finishedRun()]);
        expect(groups.map((g) => [g.vendor, g.calls.length])).toEqual([['none', 1], ['openbb', 1], ['yfinance', 1]]);
        expect(groups.find((g) => g.vendor === 'yfinance')?.totalMs).toBe(900);
    });

    it('prints tokens and cents the way a tile does', () => {
        expect([formatTokens(950), formatTokens(12_400), formatTokens(2_500_000)]).toEqual(['950', '12.4k', '2.5M']);
        expect([formatCents(0), formatCents(0.4), formatCents(123.4)]).toEqual(['$0.00', '<$0.01', '$1.23']);
    });
});
