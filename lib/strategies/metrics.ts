// Statistics for an equity curve. Pure; reuses the same drawdown and win-rate maths the
// live accounts report so a simulated number means the same thing as a live one.

import {computeMaxDrawdown, computeWinStats} from "@/lib/trading/analytics";
import type {SeriesPoint, SeriesStats} from "@/lib/strategies/types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DAYS_PER_YEAR = 365.25;
const TRADING_DAYS_PER_YEAR = 252;

const calendarDaysBetween = (from: string, to: string): number =>
    Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / MS_PER_DAY);

export const totalReturnPct = (points: readonly SeriesPoint[]): number | null => {
    if (points.length < 2) return null;
    const first = points[0].value;
    const last = points[points.length - 1].value;
    return first > 0 ? (last / first - 1) * 100 : null;
};

// Compound annual growth over the calendar span of the series.
export const cagrPct = (points: readonly SeriesPoint[]): number | null => {
    if (points.length < 2) return null;
    const first = points[0].value;
    const last = points[points.length - 1].value;
    const days = calendarDaysBetween(points[0].date, points[points.length - 1].date);
    if (!(first > 0) || !(last > 0) || days < 1) return null;
    return ((last / first) ** (DAYS_PER_YEAR / days) - 1) * 100;
};

// Population stdev of daily log returns × √252, as a percentage.
export const annualizedVolPct = (points: readonly SeriesPoint[]): number | null => {
    if (points.length < 3) return null;
    const logs: number[] = [];
    for (let i = 1; i < points.length; i += 1) {
        const prev = points[i - 1].value;
        const next = points[i].value;
        if (!(prev > 0) || !(next > 0)) return null;
        logs.push(Math.log(next / prev));
    }
    const mean = logs.reduce((sum, r) => sum + r, 0) / logs.length;
    const variance = logs.reduce((sum, r) => sum + (r - mean) ** 2, 0) / logs.length;
    return Math.sqrt(variance) * Math.sqrt(TRADING_DAYS_PER_YEAR) * 100;
};

// The benchmark over the same first/last dates as the series (or the closest rows inside
// that span), so the comparison covers one window.
const benchmarkReturnOver = (benchmark: readonly SeriesPoint[], from: string, to: string): number | null => {
    const inside = benchmark.filter((p) => p.date >= from && p.date <= to);
    if (inside.length < 2) return null;
    const first = inside[0].value;
    const last = inside[inside.length - 1].value;
    return first > 0 ? (last / first - 1) * 100 : null;
};

export const summarizeSeries = (
    points: readonly SeriesPoint[],
    trades: readonly {side: string; realizedPnl?: number}[],
    benchmark: readonly SeriesPoint[],
): SeriesStats => {
    const total = totalReturnPct(points);
    const bench = points.length >= 2 ? benchmarkReturnOver(benchmark, points[0].date, points[points.length - 1].date) : null;
    const win = computeWinStats(trades.map((t) => ({side: t.side, realizedPnl: t.realizedPnl})));
    return {
        totalReturnPct: total,
        cagrPct: cagrPct(points),
        annualizedVolPct: annualizedVolPct(points),
        maxDrawdownPct: computeMaxDrawdown(points.map((p) => ({date: p.date, value: p.value}))),
        winRatePct: win.winRatePct,
        wins: win.wins,
        losses: win.losses,
        tradeCount: trades.length,
        benchmarkReturnPct: bench,
        excessReturnPct: total === null || bench === null ? null : total - bench,
    };
};
