// The /agent-world legend: every figure comes from the trading agent world's constants (a mocked
// constant moves the text), and nothing says the desk works, fails or beats anything.

import {afterEach, describe, expect, it, vi} from 'vitest';
import {agentWorldLegend} from '@/lib/agent-world/legend';
import {findBanned} from '@/lib/learn/banned';

const MECHANISM_ONLY = /\b(works?|worked|working|fails?|failed|beat(s|en|ing)?|outperform\w*|underperform\w*|lags?|lagged|wins?|loses)\b/i;

const clean = (text: string) => {
    expect(text, text).not.toMatch(/undefined|NaN|null|\[object|Infinity/);
    expect(findBanned(text, 'copy'), text).toEqual([]);
    expect(text, text).not.toMatch(MECHANISM_ONLY);
};

const legendText = (legend: ReturnType<typeof agentWorldLegend>): string =>
    [legend.summary, ...legend.sections.flatMap((section) => [section.heading, ...section.lines])].join('\n');

describe('agentWorldLegend', () => {
    it('describes the mechanism in the constants\' own figures', () => {
        const text = legendText(agentWorldLegend('owner', ['AAPL', 'MSFT', 'NVDA']));
        for (const figure of [
            'once for each of 3 symbols (AAPL, MSFT, NVDA)', 'opened with $100,000',
            'Analysts (Market analyst, Sentiment analyst, News analyst, Fundamentals analyst), then Research (Bull researcher, Bear researcher, Research manager), then Trading (Trader), then Risk desk (Aggressive risk analyst, Conservative risk analyst, Neutral risk analyst), then Portfolio manager',
            'argue for 1 round and the risk desk for 1 round', 'run on gemini-2.5-flash by default; every other role on gemini-2.5-flash-lite',
            'Buy 20%, Overweight 12%, Hold keeps the position, Underweight 5% of a holding, Sell 0%',
            'at most 25% of the account in one name, 5% kept in cash, and a change smaller than 2%',
            'Under owner approval', 'the next Friday 15:30 ET or 72 hours after it started',
            'warns at 80% of the budget and pauses the agent at 100%',
            'prices from OpenBB then yfinance', 'fundamentals and statements from OpenBB then SEC EDGAR then yfinance', 'macro series and event odds from FRED then OpenBB',
            'starts Mondays at 08:30 ET; a Tuesday run takes the week when Monday is a market holiday', 'up to 48 minutes',
            'every 3 seconds while a session is in progress and every 30 seconds otherwise', 'over 20 seconds', 'With AGENT_WORLD_ENABLED set to false',
        ]) {
            expect(text, figure).toContain(figure);
        }
    });

    it('says automatic approval when that is the setting', () => {
        const text = legendText(agentWorldLegend('auto', ['AAPL']));
        expect(text).toContain('Approval is set to automatic');
        expect(text).not.toContain('Under owner approval a session');
        expect(text).toContain('once for each of 1 symbol (AAPL)');
    });

    it('holds every line to the copy tier and to mechanism only', () => {
        const legend = agentWorldLegend('owner', ['AAPL', 'MSFT', 'NVDA']);
        expect(legend.sections).toHaveLength(7);
        clean(legend.summary);
        for (const section of legend.sections) {
            clean(section.heading);
            expect(section.lines.length).toBeGreaterThan(0);
            for (const line of section.lines) {
                clean(line);
                expect(line.endsWith('.'), line).toBe(true);
            }
        }
    });
});

describe('agentWorldLegend follows the constants', () => {
    afterEach(() => {
        vi.doUnmock('@/lib/agent-world/config');
        vi.resetModules();
    });

    it('prints every figure from its constant: each one moved to a sentinel moves the text', async () => {
        vi.resetModules();
        vi.doMock('@/lib/agent-world/config', async (importOriginal) => {
            const original = await importOriginal<typeof import('@/lib/agent-world/config')>();
            return {
                ...original,
                AGENT_WORLD_STARTING_BALANCE: 77_000,
                RATING_TARGET_WEIGHTS: {...original.RATING_TARGET_WEIGHTS, Buy: 0.17, Underweight: 0.03},
                AGENT_WORLD_RAILS: {...original.AGENT_WORLD_RAILS, maxPositionWeight: 0.21, minCashWeight: 0.07, rebalanceBand: 0.03},
                LAPSE_HOURS: 48,
                LAPSE_WEEKDAY: {day: 'Thursday', hour: 14, minute: 45},
                BUDGET_SOFT_PCT: 75,
                SESSION_SCHEDULE: {day: 'Wednesday', retryDay: 'Thursday', hour: 7, minute: 15},
                SESSION_WAIT_ROUNDS: 5,
                POLL_LIVE_MS: 4000,
                REPLAY_MS: 12_000,
                DEBATE_ROUNDS: 2,
            };
        });
        const {agentWorldLegend: moved} = await import('@/lib/agent-world/legend');
        const text = legendText(moved('owner', ['AAPL']));
        for (const figure of [
            'opened with $77,000', 'Buy 17%', 'Underweight 3% of a holding', 'at most 21% of the account in one name, 7% kept in cash, and a change smaller than 3%',
            'the next Thursday 14:45 ET or 48 hours after it started', 'warns at 75%', 'starts Wednesdays at 07:15 ET; a Thursday run takes the week when Wednesday',
            'up to 40 minutes', 'every 4 seconds while', 'over 12 seconds', 'argue for 2 rounds',
        ]) {
            expect(text, figure).toContain(figure);
        }
        for (const stale of ['$100,000', 'Buy 20%', '72 hours', '08:30 ET', '48 minutes', 'every 3 seconds', 'over 20 seconds']) {
            expect(text, stale).not.toContain(stale);
        }
    });
});
