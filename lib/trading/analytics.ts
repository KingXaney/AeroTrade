import type {DrawdownWindow, EnrichedPosition, PaperPosition, PerfPoint, SnapshotPoint} from '@/lib/trading/types';

// Per-account performance math. Deliberately PURE — no DB, no server imports —
// so vitest can cover it without a database. The server reads that feed these
// live in analytics-store.ts (getAccountAnalytics, getComparisonStats).

export const toReturnPct = (value: number, base: number): number =>
    base > 0 ? (value / base - 1) * 100 : 0;

export type PriceInfo = {price?: number; changePercent?: number};

// One held position priced against the quote map.
//
// When the quote is missing, marketValue falls back to the cost basis — on purpose.
// holdingsValue → totalValue → AccountSnapshot rows → the performance chart all sit
// downstream of this number, so changing the fallback would silently rewrite history.
// What changes instead is that the position is *flagged*: every surface that renders
// unrealizedPnl checks priceStale first, so a missing quote can no longer show up as a
// perfectly flat "+$0.00 (0.00%)" that looks like a real, priced position.
export const enrichPosition = (p: PaperPosition, info: PriceInfo | undefined): EnrichedPosition => {
    const currentPrice = info?.price;
    const priceStale = typeof currentPrice !== 'number';
    const costBasis = p.avgCost * p.quantity;
    const marketValue = typeof currentPrice === 'number' ? currentPrice * p.quantity : costBasis;
    const unrealizedPnl = marketValue - costBasis;
    const unrealizedPnlPct = costBasis > 0 ? (unrealizedPnl / costBasis) * 100 : 0;
    return {
        symbol: p.symbol,
        quantity: p.quantity,
        avgCost: p.avgCost,
        company: p.company || p.symbol,
        currentPrice,
        changePercent: info?.changePercent,
        costBasis,
        marketValue,
        unrealizedPnl,
        unrealizedPnlPct,
        priceStale,
    };
};

export const countUnpriced = (positions: readonly {priceStale: boolean}[]): number =>
    positions.reduce((n, p) => n + (p.priceStale ? 1 : 0), 0);

// Compact marker for rows that quote a return (leaderboard, strategy comparison,
// account switcher): "unpriced" when nothing behind the number is live, "partly
// unpriced" when some of it is, nothing when it all is.
export const unpricedLabel = (unpriced: number, holdings: number): string | null => {
    if (unpriced <= 0 || holdings <= 0) return null;
    return unpriced >= holdings ? 'unpriced' : 'partly unpriced';
};

// One note per panel rather than one per row: the QA harness runs without a Finnhub
// key, so every position is unpriced there and a per-row warning becomes a wall.
export const describeUnpriced = (stale: number, total: number): string | null => {
    if (stale <= 0 || total <= 0) return null;
    const scope = stale >= total
        ? (total === 1 ? 'This holding is unpriced' : `All ${total} holdings are unpriced`)
        : `${stale} of ${total} holdings ${stale === 1 ? 'is' : 'are'} unpriced`;
    return `${scope} — valued at cost, P&L withheld`;
};

// The worst peak-to-trough stretch over the series, dated: the peak before it, the low, the
// fall as a positive percentage, whether a later point got back to the peak, and the gain the
// low needed to get there (peak / trough − 1 — a 20% fall needs 25%). Null until there are at
// least two points (a single day can't draw down); a series that never fell gets a zero
// window rather than null, so "no drawdown yet" and "not enough history" stay distinct. Of
// two equally deep stretches, the first is kept. The peak is the LATEST of equal highs: days
// spent flat at the top are not part of the fall, and a window that started on the first of
// them would date the band, the hint and "SPY same days" across a stretch that never fell.
export const drawdownWindow = (series: readonly SnapshotPoint[]): DrawdownWindow | null => {
    if (series.length < 2) return null;
    let peak = series[0];
    let worst = {pct: 0, peak: series[0], trough: series[0], troughIndex: 0};
    series.forEach((point, index) => {
        if (point.value >= peak.value) peak = point;
        if (!(peak.value > 0)) return;
        const pct = ((peak.value - point.value) / peak.value) * 100;
        if (pct > worst.pct) worst = {pct, peak, trough: point, troughIndex: index};
    });
    if (worst.pct === 0) {
        const first = series[0];
        return {pct: 0, peakDate: first.date, peakValue: first.value, troughDate: first.date, troughValue: first.value, recovered: true, recoveryPctNeeded: 0};
    }
    const recovered = series.slice(worst.troughIndex + 1).some((point) => point.value >= worst.peak.value);
    return {
        pct: worst.pct,
        peakDate: worst.peak.date,
        peakValue: worst.peak.value,
        troughDate: worst.trough.date,
        troughValue: worst.trough.value,
        recovered,
        recoveryPctNeeded: worst.trough.value > 0 ? (worst.peak.value / worst.trough.value - 1) * 100 : null,
    };
};

// Largest peak-to-trough decline over the series, as a positive percentage.
// Null until there are at least two points (a single day can't draw down).
export const computeMaxDrawdown = (series: SnapshotPoint[]): number | null => drawdownWindow(series)?.pct ?? null;

// SPY's total return between two dates of a performance series, compounded from the two
// since-inception figures (1.0659 / 1.10 − 1, not 6.59 − 10). Each date reads the last point
// on or before it — the same forward fill buildPerfSeries applies across holidays. Null where
// either end has no benchmark value.
export const benchmarkReturnBetween = (series: readonly PerfPoint[], from: string, to: string): number | null => {
    const at = (date: string): number | null => {
        let found: PerfPoint | undefined;
        for (const point of series) {
            if (point.date > date) break;
            found = point;
        }
        return found?.benchmarkPct ?? null;
    };
    const start = at(from);
    const end = at(to);
    if (start === null || end === null || !(1 + start / 100 > 0)) return null;
    return ((1 + end / 100) / (1 + start / 100) - 1) * 100;
};

export type Concentration = {
    largest: {symbol: string; weight: number; marketValue: number; priceStale: boolean} | null;
    cashWeight: number;
    holdings: number;
};

// How much of the account sits in its largest position and in cash, each as a share of the
// whole account (cash included). A position with no live quote weighs in at cost, as it does
// in net worth, and says so through priceStale.
export const concentration = (
    positions: readonly {symbol: string; marketValue: number; priceStale?: boolean}[],
    cash: number,
    totalValue: number,
): Concentration => {
    const share = (value: number) => (totalValue > 0 ? value / totalValue : 0);
    const top = positions.reduce<(typeof positions)[number] | null>((best, p) => (best === null || p.marketValue > best.marketValue ? p : best), null);
    return {
        largest: top ? {symbol: top.symbol, weight: share(top.marketValue), marketValue: top.marketValue, priceStale: top.priceStale === true} : null,
        cashWeight: share(cash),
        holdings: positions.length,
    };
};

type TradeForStats = {side: string; realizedPnl?: number};

type WinStats = {wins: number; losses: number; winRatePct: number | null};

// Win rate from the two counts it needs — what a database $group returns, so a reader that
// only wants the rate never pulls the trades back to count them.
export const winStatsFromCounts = ({closed, wins}: {closed: number; wins: number}): WinStats =>
    ({wins, losses: closed - wins, winRatePct: closed > 0 ? (wins / closed) * 100 : null});

// Closed trades are sells with a recorded realizedPnl; a win is a positive one.
// Win rate is null until at least one position has been (partially) closed.
export const computeWinStats = (trades: TradeForStats[]): WinStats => {
    const closed = trades.filter((t) => t.side === 'sell' && typeof t.realizedPnl === 'number');
    return winStatsFromCounts({closed: closed.length, wins: closed.filter((t) => (t.realizedPnl as number) > 0).length});
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
