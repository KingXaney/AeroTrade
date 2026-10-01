// The quant-strategy surfaces' own copy (lib/learn/copy/strategies.ts): the /strategies page,
// the detail page's placeholders, the explainer's headings, the signal board, the performance
// panel and the dashboard widget. Each line is rendered on a grid of inputs and held to the
// 'copy' tier of lib/learn/banned.ts; the composed lines read exactly as the page printed them.

import {describe, expect, it} from 'vitest';
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
