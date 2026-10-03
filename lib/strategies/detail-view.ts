// The strategy detail page's view (app/(root)/strategies/[slug]/page.tsx): everything the page
// prints that is worked out rather than read — the header's meta line, the two performance
// panels, the board's definitions and reading, and each automated fill's "What the rule saw".
// Pure; the reads live in lib/strategies/page-store.ts (getStrategyPageView), which hands this
// module the stored detail and today's ET date.

import {CADENCE_COPY} from "@/lib/learn/copy/cadence";
import {narrateBoard, type BoardReading} from "@/lib/strategies/learn/board-narration";
import {describeReplay, fillDate, isReplayExpired, matchFillToRun, replayReason, type ReplayRun} from "@/lib/strategies/learn/replay";
import {UNIVERSES} from "@/lib/strategies/universe";
import {pickPerfMode, toPerfSeries, visibleSignalColumns, type RunOrderView, type StrategyRunView} from "@/lib/strategies/views";
import type {SeriesStats, SignalRow, StrategyDefinition} from "@/lib/strategies/types";
import {getEasternDateString} from "@/lib/dates";
import type {AccountAnalytics, PaperTradeRecord, PerfPoint} from '@/lib/trading/types';

// The stored detail getStrategyDetail reads — only the fields this view works from.
export type StrategyDetailInput = {
    def: StrategyDefinition;
    state: {lastRebalanceDate: string | null} | null;
    analytics: AccountAnalytics | null;
    trades: readonly PaperTradeRecord[];
    latestRun: StrategyRunView | null;
    backtest: {
        from: string;
        to: string;
        closeFills: number;
        points: {date: string; value: number}[];
        benchmark: {date: string; value: number}[];
        stats: SeriesStats;
    } | null;
    benchmarkReturnPct: number | null;
    snapshotDays: number;
    replays: Record<string, ReplayRun>;
};

// DecisionReplay's props for one fill, less the def the page already holds.
export type FillReplay = {
    row: SignalRow | null;
    order: RunOrderView | null;
    caption: string;
    reason: string | null;
    symbol: string;
};

export type StrategyPerformanceView = {
    initialMode: 'live' | 'simulated';
    live: {
        series: PerfPoint[];
        stats: AccountAnalytics;
        since: string;
        snapshotDays: number;
        benchmarkReturnPct: number | null;
        totalReturnPct: number;
    } | null;
    simulated: {
        series: PerfPoint[];
        stats: SeriesStats;
        from: string;
        to: string;
        closeFills: number;
    } | null;
};

export type StrategyDetailView = {
    // A live record exists: the account has opened and has analytics.
    started: boolean;
    // The account's inception as an ET date; null before the first run.
    liveSince: string | null;
    // The header's meta line up to its live/not-started tail: "family · cadence · N symbols".
    meta: string;
    performance: StrategyPerformanceView;
    // The definitions the board's one "What these mean" lists — only the columns it shows.
    boardTerms: string[];
    // "Read this board": the row the board lists first, read by the rule's own narrator.
    boardReading: BoardReading | null;
    // By trade id: the one "What the rule saw" each strategy fill on the page carries.
    fillReplays: Record<string, FillReplay>;
};

// The one disclosure an automated fill carries: the stored row and planned order the rule
// looked at that morning, and that order's reason. A user's own fill carries none.
export const fillReplayFor = (trade: PaperTradeRecord, replays: Record<string, ReplayRun>, today: string): FillReplay | null => {
    if (trade.source !== 'strategy') return null;
    const date = fillDate(trade.createdAt);
    const run = replays[date] ?? null;
    const match = run ? matchFillToRun(run, trade.symbol, trade.side) : null;
    return {
        row: match?.row ?? null,
        order: match?.order ?? null,
        caption: describeReplay(match, run?.asOf ?? null, isReplayExpired(date, today)),
        reason: replayReason(match, trade.reason),
        symbol: trade.symbol,
    };
};

export const strategyMetaLine = (def: StrategyDefinition): string => {
    const universeSize = UNIVERSES[def.universe].length;
    return `${def.family} · ${CADENCE_COPY.long[def.cadence]} · ${universeSize} symbol${universeSize === 1 ? '' : 's'}`;
};

export const toStrategyDetailView = (detail: StrategyDetailInput, today: string): StrategyDetailView => {
    const {def, analytics, latestRun, backtest} = detail;
    const liveSince = analytics ? getEasternDateString(new Date(analytics.account.inceptionAt)) : null;
    const liveSeries = analytics?.series ?? [];
    const simulatedSeries = backtest ? toPerfSeries(backtest.points, backtest.benchmark) : [];
    const shownColumns = visibleSignalColumns(def.signalColumns, latestRun?.board ?? []);
    const fillReplays: Record<string, FillReplay> = {};
    for (const trade of detail.trades) {
        const replay = fillReplayFor(trade, detail.replays, today);
        if (replay) fillReplays[trade.id] = replay;
    }
    return {
        started: detail.state !== null && analytics !== null,
        liveSince,
        meta: strategyMetaLine(def),
        performance: {
            initialMode: pickPerfMode(liveSeries.length, simulatedSeries.length),
            live: analytics && liveSince ? {
                series: liveSeries,
                stats: analytics,
                since: liveSince,
                snapshotDays: detail.snapshotDays,
                benchmarkReturnPct: detail.benchmarkReturnPct,
                totalReturnPct: analytics.summary.totalReturnPct,
            } : null,
            simulated: backtest ? {
                series: simulatedSeries,
                stats: backtest.stats,
                from: backtest.from,
                to: backtest.to,
                closeFills: backtest.closeFills,
            } : null,
        },
        boardTerms: shownColumns.map((column) => column.glossary ?? column.key),
        boardReading: narrateBoard(def, latestRun),
        fillReplays,
    };
};
