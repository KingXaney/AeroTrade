import {describe, expect, it} from 'vitest';
import {SESSION_SCHEDULE} from '@/lib/agent-world/config';
import {agentWorldDay, describeRun, lapseDeadline, nextWeeklySession, readEventData, runRequestBody} from '@/lib/agent-world/job';
import {JOBS} from '@/lib/jobs/registry';
import {easternToInstant} from '@/lib/prices/market-hours';

const et = (date: string, hh: number, mm: number) => new Date(easternToInstant(date, hh, mm));

describe('a session\'s day and id', () => {
    it('names a weekly session by its week, so a retry or a re-fired cron finds it', () => {
        const day = agentWorldDay({}, et('2026-10-26', 8, 30));
        expect(day).toMatchObject({kind: 'weekly', sessionId: 'aw-2026-10-26', weekKey: '2026-10-26', today: '2026-10-26', tradingDay: true, source: 'schedule', dryRun: false});
        expect(agentWorldDay(undefined, et('2026-10-27', 8, 30)).sessionId).toBe('aw-2026-10-26');
    });

    it('names a manual session or a preview by the second it was asked for', () => {
        const manual = agentWorldDay({manual: true, force: true, by: 'owner@example.com'}, et('2026-10-27', 10, 12));
        expect(manual.kind).toBe('manual');
        expect(manual.sessionId).toMatch(/^aw-2026-10-26-manual-20261027-101200$/);
        expect(manual.force).toBe(true);
        const preview = agentWorldDay({manual: true, dryRun: true}, et('2026-10-27', 10, 12));
        expect(preview.kind).toBe('preview');
        expect(preview.sessionId).toMatch(/^aw-2026-10-26-preview-/);
    });

    it('reads a Paperclip relay as a manual session, and nonsense as a cron', () => {
        expect(readEventData({source: 'paperclip', paperclip: {runId: 'r1', taskId: 't1'}})).toMatchObject({manual: true, source: 'paperclip', paperclip: {runId: 'r1', taskId: 't1'}});
        expect(readEventData({manual: 'yes', dryRun: 1, by: 42})).toMatchObject({manual: false, dryRun: false, by: null, source: 'schedule'});
    });

    it('keeps the weekly cron and the schedule the legend states together', () => {
        const time = `${SESSION_SCHEDULE.minute} ${SESSION_SCHEDULE.hour}`;
        expect(JOBS.agentWorldWeekly.crons).toEqual([`TZ=America/New_York ${time} * * 1`, `TZ=America/New_York ${time} * * 2`]);
    });
});

describe('the lapse deadline', () => {
    it('is 72 hours on for a Monday session, before Friday\'s 15:30', () => {
        expect(lapseDeadline(et('2026-10-26', 8, 30).getTime())).toBe(et('2026-10-29', 8, 30).getTime());
    });

    it('is the same Friday\'s 15:30 for a Friday morning session', () => {
        expect(lapseDeadline(et('2026-10-30', 10, 0).getTime())).toBe(et('2026-10-30', 15, 30).getTime());
    });

    it('is 72 hours on for a Friday evening session, before the next Friday', () => {
        expect(lapseDeadline(et('2026-10-23', 16, 0).getTime())).toBe(et('2026-10-26', 16, 0).getTime());
    });
});

describe('the next weekly session', () => {
    it('is the coming Monday at 08:30 ET', () => {
        expect(nextWeeklySession(et('2026-10-31', 12, 0).getTime())).toBe(et('2026-11-02', 8, 30).getTime());
        expect(nextWeeklySession(et('2026-10-26', 9, 0).getTime())).toBe(et('2026-11-02', 8, 30).getTime());
    });

    it('is the Tuesday after a Monday the market keeps closed', () => {
        // Labor Day 2026 is Monday 7 September.
        expect(nextWeeklySession(et('2026-09-05', 12, 0).getTime())).toBe(et('2026-09-08', 8, 30).getTime());
    });
});

describe('what the service is sent and what the strip says', () => {
    it('sends the book as TradingAgents\' portfolio, the bytes signed once', () => {
        const body = JSON.parse(runRequestBody({
            day: {sessionId: 'aw-2026-10-26', today: '2026-10-26', dryRun: false},
            symbols: ['AAPL'],
            book: {totalValue: 100_000, cash: 80_000.123, positions: [{symbol: 'AAPL', quantity: 100, avgCost: 199.996, price: 200}, {symbol: 'MSFT', quantity: 0, avgCost: 0, price: 400}], priceBySymbol: {}},
            callbackUrl: 'https://aerotrading.vercel.app/api/agent-world/events',
            approval: 'owner',
            paperclip: null,
        }));
        expect(body).toEqual({
            sessionId: 'aw-2026-10-26',
            symbols: ['AAPL'],
            tradeDate: '2026-10-26',
            portfolio: {cash: 80000.12, currency: 'USD', positions: [{ticker: 'AAPL', quantity: 100, averagePrice: 200}]},
            callbackUrl: 'https://aerotrading.vercel.app/api/agent-world/events',
            paperclip: null,
            approval: 'owner',
            dryRun: false,
        });
    });

    it('stamps each outcome in one line', () => {
        expect(describeRun({outcome: 'off', reason: 'unconfigured'})).toBe('Trading agent world: off (no service configured (AGENT_WORLD_SERVICE_URL and AGENT_WORLD_SERVICE_SECRET))');
        expect(describeRun({outcome: 'already', weekKey: '2026-10-26'})).toBe('Trading agent world (week of 2026-10-26): already ran this week');
        expect(describeRun({outcome: 'preview', sessionId: 'aw-x', ratings: {AAPL: 'Buy', MSFT: 'REVIEW'}, orders: 1})).toBe('Trading agent world (aw-x), preview: ratings AAPL Buy, MSFT REVIEW; 1 order(s) planned, none sent');
        expect(describeRun({outcome: 'executed', sessionId: 'aw-x', auto: false, orders: 2, filled: 1, firstFailure: "Couldn't fetch a live price for MSFT", mirrored: false}))
            .toBe("Trading agent world (aw-x): approved by the owner; 1/2 order(s) filled; 1 failed (Couldn't fetch a live price for MSFT); Paperclip not reached");
        expect(describeRun({outcome: 'executed', sessionId: 'aw-x', auto: true, orders: 1, filled: 1, firstFailure: null, mirrored: null}))
            .toBe('Trading agent world (aw-x): approved automatically; 1/1 order(s) filled');
        expect(describeRun({outcome: 'declined', sessionId: 'aw-x'})).toBe('Trading agent world (aw-x): declined by the owner; nothing traded');
        expect(describeRun({outcome: 'no-answer', sessionId: 'aw-x'})).toBe('Trading agent world (aw-x): no answer from the service in 48 minutes; session failed');
    });
});
