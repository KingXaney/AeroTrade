import {describe, expect, it} from 'vitest';
import {strategyBySlug} from '@/lib/strategies/catalog';
import {UNIVERSES} from '@/lib/strategies/universe';
import {REPLAY_COPY} from '@/lib/learn/copy/replay';
import {fillReplayFor, quizRowsFor, strategyMetaLine, toStrategyDetailView, type StrategyDetailInput} from '@/lib/strategies/detail-view';
import type {StrategyRunView} from '@/lib/strategies/views';
import type {SeriesStats} from '@/lib/strategies/types';
import type {PaperTradeRecord} from '@/lib/trading/types';

const def = (slug: string) => {
    const found = strategyBySlug(slug);
    if (!found) throw new Error(slug);
    return found;
};
const goldenCross = def('golden-cross');

const run: StrategyRunView = {
    date: '2026-09-25', asOf: '2026-09-24', mode: 'live', status: 'done', staleCount: 0, universeSize: 11,
    rebalanceTriggered: false,
    board: [
        {symbol: 'XLF', state: 'enter', values: {close: 42.1, sma50: 42.1, sma200: 40, spread: 0.053, trendOn: true}},
        {symbol: 'XLE', state: 'watch', values: {close: 80, sma50: 79, sma200: 81, spread: null, trendOn: false}},
    ],
    orders: [{symbol: 'XLF', side: 'buy', quantity: 10, kind: 'enter', reason: 'enter: SMA50 42.10 > SMA200 40.00 (+5.3%)', executed: true, price: 42.2, message: null}],
    skippedOrders: [], dataIssues: [], equity: 100_000, summary: '',
};

const fill = (over: Partial<PaperTradeRecord>): PaperTradeRecord => ({
    id: 't1', symbol: 'XLF', company: 'XLF', side: 'buy', quantity: 10, price: 42.2, total: 422,
    source: 'strategy', reason: 'enter: SMA50 42.10 > SMA200 40.00 (+5.3%)',
    createdAt: Date.UTC(2026, 8, 25, 13, 35), ...over,
});

const detail = (over: Partial<StrategyDetailInput> = {}): StrategyDetailInput => ({
    def: goldenCross, state: null, analytics: null, trades: [], latestRun: run, backtest: null,
    benchmarkReturnPct: null, snapshotDays: 0, replays: {}, ...over,
});

describe('strategyMetaLine', () => {
    it('names the family, the long cadence and the universe size', () => {
        expect(strategyMetaLine(goldenCross)).toBe(`Trend following · checked daily · ${UNIVERSES.sectors.length} symbols`);
        expect(strategyMetaLine(def('buy-and-hold-spy'))).toBe('Baseline · buys once · 1 symbol');
    });
});

describe('quizRowsFor', () => {
    it('is empty with no run or an empty board', () => {
        expect(quizRowsFor(goldenCross, null)).toEqual([]);
        expect(quizRowsFor(goldenCross, {...run, board: []})).toEqual([]);
    });

    it('fills only the columns the board shows and decodes the verdict', () => {
        const rows = quizRowsFor(goldenCross, run);
        const xlf = rows.find((r) => r.symbol === 'XLF');
        expect(xlf?.answer).toBe('enter');
        expect(xlf?.cells.map((c) => c.label)).toEqual(goldenCross.signalColumns.map((c) => c.label));
        expect(xlf?.gloss.length).toBeGreaterThan(0);
    });
});

describe('fillReplayFor', () => {
    const replays = {'2026-09-25': {asOf: run.asOf, board: run.board, orders: run.orders}};

    it('carries no disclosure for a fill the rule did not place', () => {
        expect(fillReplayFor(fill({source: 'user'}), replays, '2026-09-26')).toBeNull();
        expect(fillReplayFor(fill({source: undefined}), replays, '2026-09-26')).toBeNull();
    });

    it('pairs a strategy fill with the row and order of its run date', () => {
        const replay = fillReplayFor(fill({}), replays, '2026-09-26');
        expect(replay?.row?.symbol).toBe('XLF');
        expect(replay?.order?.side).toBe('buy');
        expect(replay?.caption).toBe(REPLAY_COPY.caption(run.asOf));
        expect(replay?.reason).toBe(run.orders[0].reason);
    });

    it('keeps the fill\'s own reason when the run record is gone', () => {
        const replay = fillReplayFor(fill({}), {}, '2026-09-26');
        expect(replay?.row).toBeNull();
        expect(replay?.caption).toBe(REPLAY_COPY.missing);
        expect(replay?.reason).toBe(fill({}).reason);
    });
});

describe('toStrategyDetailView', () => {
    it('reads a not-started strategy: no live record, the board still explained', () => {
        const view = toStrategyDetailView(detail({trades: [fill({id: 'a'}), fill({id: 'b', source: 'user'})]}), '2026-09-26');
        expect(view.started).toBe(false);
        expect(view.liveSince).toBeNull();
        expect(view.performance).toEqual({initialMode: 'live', live: null, simulated: null});
        expect(view.boardReading?.symbol).toBeDefined();
        expect(view.boardTerms).toContain('sma50');
        expect(Object.keys(view.fillReplays)).toEqual(['a']);
    });

    it('opens on the simulated curve while the live one has fewer than two points', () => {
        const backtest = {
            from: '2023-09-25', to: '2026-09-24', closeFills: 0,
            points: [{date: '2026-09-23', value: 100}, {date: '2026-09-24', value: 110}],
            benchmark: [{date: '2026-09-23', value: 50}, {date: '2026-09-24', value: 51}],
            stats: {} as SeriesStats,
        };
        const view = toStrategyDetailView(detail({backtest}), '2026-09-26');
        expect(view.performance.initialMode).toBe('simulated');
        expect(view.performance.simulated?.series).toHaveLength(2);
    });
});
