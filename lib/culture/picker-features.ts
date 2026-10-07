// The pickers' reading of a brand's stored series, pure and dated: each function takes the
// series and an `asOf` day and reads nothing after it, which is what lets the backtest replay
// the live maths over stored history. The fold-side surprise is lib/culture/features.ts.

import {
    APP_RANK_FLOOR,
    APP_RANK_RECENT_DAYS,
    APP_STORE_CHART_SIZE,
    ATTENTION_BASELINE_DAYS,
    ATTENTION_MIN_BASELINE_POINTS,
    ATTENTION_MIN_RECENT_POINTS,
    ATTENTION_RECENT_DAYS,
    PERSISTENCE_CAP_WEEKS,
    PERSISTENCE_MIN_WEEK_POINTS,
    SINCE_REPORT_MIN_POINTS,
    TREND_DAYS,
    TREND_MIN_POINTS,
} from "@/lib/culture/config";
import {mean, median, pointsBetween} from "@/lib/culture/features";
import {addCalendarDays, calendarDaysBetween} from "@/lib/dates";
import type {AttentionPoint} from "@/lib/culture/types";

const values = (points: readonly AttentionPoint[]): number[] => points.map((point) => point.value);

// The median of the six months before a day, the brand's own baseline; null under the floor.
const baselineBefore = (series: readonly AttentionPoint[], day: string): number | null => {
    const to = addCalendarDays(day, -1);
    const from = addCalendarDays(to, -(ATTENTION_BASELINE_DAYS - 1));
    const baseline = values(pointsBetween(series, from, to));
    return baseline.length < ATTENTION_MIN_BASELINE_POINTS ? null : median(baseline);
};

// The brand's baseline level, for weighing its owner's brands against each other.
export const attentionBaseline = (series: readonly AttentionPoint[], asOf: string): number | null =>
    baselineBefore(series, addCalendarDays(asOf, -(ATTENTION_RECENT_DAYS - 1)));

// Surprise: the last four weeks' mean views against the six months before them, as a log
// ratio (0 = at baseline, ln 3 = tripled); +1 on both sides so a zero-view day is a number.
export const attentionSurprise = (series: readonly AttentionPoint[], asOf: string): number | null => {
    const recentFrom = addCalendarDays(asOf, -(ATTENTION_RECENT_DAYS - 1));
    const recent = values(pointsBetween(series, recentFrom, asOf));
    const baseline = baselineBefore(series, recentFrom);
    if (recent.length < ATTENTION_MIN_RECENT_POINTS || baseline === null) return null;
    return Math.log((mean(recent) + 1) / (baseline + 1));
};

// Trend: the least-squares slope of log views against the day over the last three months,
// scaled to the window (the log change the fitted line covers end to end).
export const attentionTrend = (series: readonly AttentionPoint[], asOf: string): number | null => {
    const from = addCalendarDays(asOf, -(TREND_DAYS - 1));
    const points = pointsBetween(series, from, asOf);
    if (points.length < TREND_MIN_POINTS) return null;
    const xs = points.map((point) => calendarDaysBetween(from, point.date));
    const ys = points.map((point) => Math.log(point.value + 1));
    const xMean = mean(xs);
    const yMean = mean(ys);
    let num = 0;
    let den = 0;
    for (let i = 0; i < xs.length; i++) {
        num += (xs[i] - xMean) * (ys[i] - yMean);
        den += (xs[i] - xMean) ** 2;
    }
    // The window spans TREND_DAYS − 1 days end to end.
    return den === 0 ? null : (num / den) * (TREND_DAYS - 1);
};

// Persistence: how many consecutive weeks, counted back from the latest, the brand's mean
// views stayed above its old normal — the median of the six months before the whole
// twenty-six-week block, so a plateau that began long ago still counts every week of it.
// Null when that baseline or the latest week cannot be read; 0 when the latest week sat at
// or under it.
export const attentionPersistence = (series: readonly AttentionPoint[], asOf: string): number | null => {
    const blockFrom = addCalendarDays(asOf, -(7 * PERSISTENCE_CAP_WEEKS - 1));
    const baseline = baselineBefore(series, blockFrom);
    if (baseline === null) return null;
    let weeks = 0;
    for (let w = 0; w < PERSISTENCE_CAP_WEEKS; w++) {
        const weekTo = addCalendarDays(asOf, -7 * w);
        const weekFrom = addCalendarDays(weekTo, -6);
        const week = values(pointsBetween(series, weekFrom, weekTo));
        if (week.length < PERSISTENCE_MIN_WEEK_POINTS) return w === 0 ? null : weeks;
        if (mean(week) <= baseline) return weeks;
        weeks++;
    }
    return weeks;
};

// Views summed over a window (the press and category sums).
export const sumBetween = (series: readonly AttentionPoint[], from: string, to: string): number =>
    pointsBetween(series, from, to).reduce((sum, point) => sum + point.value, 0);

// Since the last report: the mean views after it against the six months before it, so the
// term is what the market could not have learned from the report itself.
export const attentionSinceReport = (series: readonly AttentionPoint[], reportDate: string | null, asOf: string): number | null => {
    if (!reportDate || reportDate >= asOf) return null;
    const since = values(pointsBetween(series, addCalendarDays(reportDate, 1), asOf));
    const baseline = baselineBefore(series, reportDate);
    if (since.length < SINCE_REPORT_MIN_POINTS || baseline === null) return null;
    return Math.log((mean(since) + 1) / (baseline + 1));
};

// App rank: 1 at number one, falling with the log of the rank to 0 at APP_RANK_FLOOR, from
// the latest chart day inside the last week; null when the brand was on no chart.
export const appRankScore = (appstore: readonly AttentionPoint[], asOf: string): number | null => {
    const recent = pointsBetween(appstore, addCalendarDays(asOf, -(APP_RANK_RECENT_DAYS - 1)), asOf).filter((point) => point.value > 0);
    if (recent.length === 0) return null;
    const latest = recent[recent.length - 1];
    const rank = Math.max(1, APP_STORE_CHART_SIZE + 1 - latest.value);
    return Math.min(1, Math.max(0, 1 - Math.log(rank) / Math.log(APP_RANK_FLOOR)));
};

// A log ratio as the percentage change it is: ln 3 → +200.0.
export const logRatioPct = (value: number): number => (Math.exp(value) - 1) * 100;
