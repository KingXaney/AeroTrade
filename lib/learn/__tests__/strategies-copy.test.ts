// The quant-strategy surfaces' own copy (lib/learn/copy/strategies.ts): the /strategies page,
// the detail page's placeholders, the explainer's headings, the signal board, the performance
// panel and the dashboard widget. Each line is rendered on a grid of inputs and held to the
// 'copy' tier of lib/learn/banned.ts; the composed lines read exactly as the page printed them.

import {afterEach, describe, expect, it, vi} from 'vitest';
import {findBanned} from '@/lib/learn/banned';
import {
    EXPLAINER_COPY,
    HOW_TO_READ_COPY,
    QUANT_WIDGET_COPY,
    SIGNAL_BOARD_COPY,
    SIMULATED_TRADES_COPY,
    STRATEGIES_PAGE_COPY,
    STRATEGY_PAGE_COPY,
    STRATEGY_PERFORMANCE_COPY,
    STRATEGY_STATUS_COPY,
} from '@/lib/learn/copy/strategies';

const clean = (text: string) => {
    expect(text, text).not.toMatch(/undefined|NaN|null|\[object|Infinity/);
    expect(findBanned(text, 'copy'), text).toEqual([]);
};

const strings = (copy: Record<string, unknown>): string[] =>
    Object.values(copy).filter((value): value is string => typeof value === 'string');

describe('strategies copy', () => {
    it('composes the lines the pages printed', () => {
        expect(STRATEGIES_PAGE_COPY.rankedBy(STRATEGIES_PAGE_COPY.valuation('closed'))).toBe('ranked by live return · valued at the last close');
        expect(STRATEGY_PAGE_COPY.simulatedLog(312)).toBe('Simulated trade log — 312 hypothetical fills at the next day\'s open');
        expect(STRATEGY_PAGE_COPY.simulatedLog(null)).toBe('Simulated trade log — not computed yet');
        expect(SIGNAL_BOARD_COPY.stamp('2026-09-29', '2026-09-30', 0, 40)).toBe('As of the 2026-09-29 close · decided for 2026-09-30');
        expect(SIGNAL_BOARD_COPY.stamp('2026-09-29', '2026-09-30', 3, 40))
            .toBe('As of the 2026-09-29 close · decided for 2026-09-30 · 3 of 40 symbols had no fresh bar');
        expect(STRATEGY_PERFORMANCE_COPY.liveLine('2026-09-02', 1, '+0.40%', '+0.10%'))
            .toBe('Live since 2026-09-02 · 1 daily snapshot at 16:10 ET · return +0.40% vs SPY +0.10%');
        expect(STRATEGY_PERFORMANCE_COPY.simulatedLine('2023-09-01', '2026-09-01', 2))
            .toBe('2023-09-01 → 2026-09-01 · next-open fills · no fees or slippage · interest and dividends included · 2 fills used the close');
        expect(EXPLAINER_COPY.universeSize(1)).toBe('1 symbol');
        expect(EXPLAINER_COPY.universeSize(40)).toBe('40 symbols');
    });

    it('never advises, on any line', () => {
        const lines = [
            ...strings(STRATEGIES_PAGE_COPY), ...strings(QUANT_WIDGET_COPY), ...strings(STRATEGY_PAGE_COPY),
            ...strings(EXPLAINER_COPY), ...strings(SIGNAL_BOARD_COPY), ...strings(SIMULATED_TRADES_COPY),
            ...strings(STRATEGY_PERFORMANCE_COPY), ...strings(STRATEGY_STATUS_COPY),
            HOW_TO_READ_COPY.summary, ...HOW_TO_READ_COPY.points.flatMap((point) => [point.title, point.body]),
            ...(['open', 'closed', 'not-started'] as const).map((state) => STRATEGIES_PAGE_COPY.rankedBy(STRATEGIES_PAGE_COPY.valuation(state))),
            STRATEGIES_PAGE_COPY.young(30), STRATEGIES_PAGE_COPY.backtestTitle('2023-09-01', '2026-09-01'),
            STRATEGY_PAGE_COPY.oneLine('Owns the index.'), STRATEGY_PAGE_COPY.liveSince('2026-09-02'),
            STRATEGY_PAGE_COPY.simulatedLog(1), STRATEGY_PAGE_COPY.simulatedLog(null),
            EXPLAINER_COPY.universeSize(11), SIGNAL_BOARD_COPY.stamp('2026-09-29', '2026-09-30', 2, 11),
            STRATEGY_PERFORMANCE_COPY.liveLine('2026-09-02', 20, '−1.2%', '+0.3%'), STRATEGY_PERFORMANCE_COPY.liveStarts('2026-09-02'),
            STRATEGY_PERFORMANCE_COPY.simulatedLine('2023-09-01', '2026-09-01', 0), STRATEGY_PERFORMANCE_COPY.simulatedLine('2023-09-01', '2026-09-01', 1),
        ];
        for (const line of lines) clean(line);
    });
});

describe('the counts and rails the copy states', () => {
    afterEach(() => {
        vi.doUnmock('@/lib/strategies/catalog');
        vi.doUnmock('@/lib/strategies/config');
        vi.doUnmock('@/lib/strategies/universe');
        vi.resetModules();
    });

    it('reads as before with today\'s constants', () => {
        expect(STRATEGIES_PAGE_COPY.subtitle).toBe('Eight classic rules, paper-traded live against the S&P 500.');
        expect(STRATEGIES_PAGE_COPY.loadingSubtitle).toBe('Valuing eight strategy accounts…');
        expect(STRATEGIES_PAGE_COPY.young(30)).toContain('each rule\'s three-year backtest');
        expect(HOW_TO_READ_COPY.points.map((point) => point.body).join(' ')).toContain('with $100,000 and traded');
        expect(HOW_TO_READ_COPY.points.map((point) => point.body).join(' ')).toContain('over three years of stored daily closes');
        expect(HOW_TO_READ_COPY.points.map((point) => point.body).join(' ')).toContain('with a 1% buffer, keeping at least 1% cash');
        expect(HOW_TO_READ_COPY.points.map((point) => point.body).join(' ')).toContain('the eleven sector ETFs and forty large caps');
        expect(EXPLAINER_COPY.cashFloorValue).toBe('1%');
    });

    it('counts the strategies from the catalog, wherever prose says how many there are', async () => {
        vi.resetModules();
        vi.doMock('@/lib/strategies/catalog', async (importOriginal) => {
            const original = await importOriginal<typeof import('@/lib/strategies/catalog')>();
            const seven = original.STRATEGIES.slice(0, 7);
            return {...original, STRATEGIES: seven, STRATEGY_SLUGS: seven.map((def) => def.id)};
        });
        const strategies = await import('@/lib/learn/copy/strategies');
        expect(strategies.STRATEGIES_PAGE_COPY.subtitle).toBe('Seven classic rules, paper-traded live against the S&P 500.');
        expect(strategies.STRATEGIES_PAGE_COPY.loadingSubtitle).toBe('Valuing seven strategy accounts…');
        expect((await import('@/lib/learn/copy/learn')).LEARN_PAGE_COPY.strategiesHeading).toBe('The seven strategies, one line each');
        const followLesson = (await import('@/lib/learn/copy/missions')).MISSION_COPY.find((mission) => mission.id === 'follow-strategy');
        expect(followLesson?.lesson[0]).toMatch(/^Seven rule-based strategies trade/);
        const chat = await import('@/lib/chat/quant-strategies');
        expect(chat.QUANT_STANCE).toContain("the app's seven rule-based paper strategies");
        expect(chat.QUANT_NOTES.unknown).toContain('These are the seven, by slug and name.');
        expect((await import('@/lib/chat/tool-copy')).TOOL_DESCRIPTIONS.getQuantStrategies).toContain("Read the app's seven rule-based quant strategies");
        expect((await import('@/lib/chat/system-prompt')).ADVISOR_SYSTEM_PROMPT).toContain('the seven rule-based paper strategies');
        expect((await import('@/lib/dashboard/catalog')).WIDGETS['quant-strategies'].description).toContain('the seven classic strategies');
    });

    it('moves the balance, buffer, floor, backtest length and universe sizes with their constants', async () => {
        vi.resetModules();
        vi.doMock('@/lib/strategies/config', async (importOriginal) => ({
            ...(await importOriginal<typeof import('@/lib/strategies/config')>()),
            STRATEGY_STARTING_BALANCE: 50_000, PRICE_BUFFER: 0.02, CASH_FLOOR: 0.03, SIM_RESULT_BARS: 504,
        }));
        vi.doMock('@/lib/strategies/universe', async (importOriginal) => {
            const original = await importOriginal<typeof import('@/lib/strategies/universe')>();
            return {...original, UNIVERSES: {...original.UNIVERSES, sectors: original.UNIVERSES.sectors.slice(0, 9), largecaps: original.UNIVERSES.largecaps.slice(0, 30)}};
        });
        const {EXPLAINER_COPY: explainer, HOW_TO_READ_COPY: howTo, STRATEGIES_PAGE_COPY: page} = await import('@/lib/learn/copy/strategies');
        const bodies = howTo.points.map((point) => point.body).join(' ');
        for (const phrase of ['with $50,000 and traded', 'over two years of stored daily closes', 'with a 2% buffer, keeping at least 3% cash',
            'the nine sector ETFs and thirty large caps']) {
            expect(bodies, phrase).toContain(phrase);
        }
        expect(page.young(30)).toContain('each rule\'s two-year backtest');
        expect(explainer.cashFloorValue).toBe('3%');
        for (const point of howTo.points) clean(point.body);
    });
});
