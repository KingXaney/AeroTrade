// Per-account performance math. Deliberately PURE — no DB, no server imports —
// so vitest can cover it without a database (the import chain through
// account.ts reaches better-auth's top-level connection). The server fetcher
// that feeds these lives in account.ts (getAccountAnalytics).

export const toReturnPct = (value: number, base: number): number =>
    base > 0 ? (value / base - 1) * 100 : 0;

// Largest peak-to-trough decline over the series, as a positive percentage.
// Null until there are at least two points (a single day can't draw down).
export const computeMaxDrawdown = (series: SnapshotPoint[]): number | null => {
    if (series.length < 2) return null;
    let peak = series[0].value;
    let maxDrawdown = 0;
    for (const point of series) {
        if (point.value > peak) peak = point.value;
        if (peak > 0) {
            maxDrawdown = Math.max(maxDrawdown, ((peak - point.value) / peak) * 100);
        }
    }
    return maxDrawdown;
};

export type TradeForStats = {side: string; realizedPnl?: number};

// Closed trades are sells with a recorded realizedPnl; a win is a positive one.
// Win rate is null until at least one position has been (partially) closed.
export const computeWinStats = (trades: TradeForStats[]): {wins: number; losses: number; winRatePct: number | null} => {
    const closed = trades.filter((t) => t.side === 'sell' && typeof t.realizedPnl === 'number');
    const wins = closed.filter((t) => (t.realizedPnl as number) > 0).length;
    const losses = closed.length - wins;
    return {wins, losses, winRatePct: closed.length > 0 ? (wins / closed.length) * 100 : null};
};

export const computeRealizedPnl = (trades: TradeForStats[]): number =>
    trades.reduce((sum, t) => sum + (typeof t.realizedPnl === 'number' ? t.realizedPnl : 0), 0);

// Sort snapshots by date and merge in a live "today" point: replace today's
// snapshot if one exists (live is fresher), append otherwise.
export const mergeLivePoint = (snapshots: SnapshotPoint[], live?: SnapshotPoint): SnapshotPoint[] => {
    const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
    if (!live) return sorted;
    const existing = sorted.findIndex((p) => p.date === live.date);
    if (existing >= 0) {
        sorted[existing] = live;
        return sorted;
    }
    if (sorted.length > 0 && live.date < sorted[sorted.length - 1].date) return sorted;
    return [...sorted, live];
};

// Account and benchmark as %-return since account inception, aligned by date.
// The benchmark is normalized to its close on the first date it covers, and
// forward-filled across dates without a benchmark row (market holidays);
// dates before the first benchmark point get null.
export const buildPerfSeries = (
    snapshots: SnapshotPoint[],
    benchmarks: SnapshotPoint[],
    live?: SnapshotPoint,
): PerfPoint[] => {
    const points = mergeLivePoint(snapshots, live);
    if (points.length === 0) return [];

    const accountBase = points[0].value;
    const sortedBench = [...benchmarks].sort((a, b) => a.date.localeCompare(b.date));

    let benchIdx = -1;
    let benchBase: number | null = null;
    return points.map((point) => {
        while (benchIdx + 1 < sortedBench.length && sortedBench[benchIdx + 1].date <= point.date) {
            benchIdx++;
        }
        const benchClose = benchIdx >= 0 ? sortedBench[benchIdx].value : null;
        if (benchClose !== null && benchBase === null) benchBase = benchClose;
        return {
            date: point.date,
            accountPct: toReturnPct(point.value, accountBase),
            benchmarkPct: benchClose !== null && benchBase !== null && benchBase > 0
                ? toReturnPct(benchClose, benchBase)
                : null,
        };
    });
};
