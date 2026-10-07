// What a brand's stored attention series says, as numbers the fold and the pickers read. Pure:
// a series and an `asOf` day in, features out, recomputable for any past day — which is what
// lets the backtest replay the live maths over stored history.
//
// The fold side (this file's first half) turns a day's surprise into a mention the decay maths
// folds like any other. The picker side (lib/culture/picker-features.ts, Slice B) reads the
// same series for the weekly scores.

import {
    APPSTORE_BASELINE_DAYS,
    APPSTORE_FULL_CLIMB,
    APPSTORE_RELEVANCE,
    ATTENTION_FULL_LOG_RATIO,
    WIKI_BASELINE_DAYS,
    WIKI_MIN_BASELINE_DAYS,
    WIKI_RECENT_DAYS,
    WIKI_RELEVANCE,
} from "@/lib/culture/config";
import {addCalendarDays} from "@/lib/dates";
import type {AttentionPoint, CultureFold} from "@/lib/culture/types";

export const mean = (values: readonly number[]): number =>
    values.length === 0 ? 0 : values.reduce((sum, v) => sum + v, 0) / values.length;

export const median = (values: readonly number[]): number => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

// The points dated inside [from, to], by label.
export const pointsBetween = (series: readonly AttentionPoint[], from: string, to: string): AttentionPoint[] =>
    series.filter((point) => point.date >= from && point.date <= to);

// A day's value, 0 when the series has no point for it (a chart a brand was not on).
const valueOn = (series: readonly AttentionPoint[], date: string): number =>
    series.find((point) => point.date === date)?.value ?? 0;

export type AttentionSurprise = {ratio: number; importance: number};

// Wikipedia: the last week's mean views against the brand's own median over the three months
// before that week. Null without a week of views or a month of baseline (a brand whose article
// did not exist yet, a new catalog entry); +1 on both sides so a zero-view day is a number.
export const wikipediaAnomaly = (series: readonly AttentionPoint[], asOf: string): AttentionSurprise | null => {
    const recentFrom = addCalendarDays(asOf, -(WIKI_RECENT_DAYS - 1));
    const baselineTo = addCalendarDays(recentFrom, -1);
    const baselineFrom = addCalendarDays(baselineTo, -(WIKI_BASELINE_DAYS - 1));
    const recent = pointsBetween(series, recentFrom, asOf).map((p) => p.value);
    const baseline = pointsBetween(series, baselineFrom, baselineTo).map((p) => p.value);
    if (recent.length === 0 || baseline.length < WIKI_MIN_BASELINE_DAYS) return null;
    const ratio = (mean(recent) + 1) / (median(baseline) + 1);
    return {ratio, importance: clamp(Math.log(ratio) / ATTENTION_FULL_LOG_RATIO, 0, 1)};
};

// App Store: today's chart score (101 − rank, 0 off the chart) against the median of the three
// months before it, absent days counted as 0. A steady number one is no surprise; a newcomer
// in the top fifty is.
export const appstoreAnomaly = (series: readonly AttentionPoint[], asOf: string): {climb: number; importance: number} | null => {
    const today = valueOn(series, asOf);
    if (today <= 0) return null;
    const baselineTo = addCalendarDays(asOf, -1);
    const baselineFrom = addCalendarDays(asOf, -APPSTORE_BASELINE_DAYS);
    const points = pointsBetween(series, baselineFrom, baselineTo);
    const values = [...points.map((p) => p.value), ...new Array(Math.max(0, APPSTORE_BASELINE_DAYS - points.length)).fill(0)];
    const climb = today - median(values);
    return {climb, importance: clamp(climb / APPSTORE_FULL_CLIMB, 0, 1)};
};

export type BrandSeries = {wikipedia: readonly AttentionPoint[]; appstore: readonly AttentionPoint[]};

// One fold per brand and source whose surprise is above zero: a single-entity mention with no
// sentiment (a pageview says nothing about how people feel) that the planner weighs by source.
export const attentionFoldsFor = (byBrand: ReadonlyMap<string, BrandSeries>, asOf: string): CultureFold[] => {
    const folds: CultureFold[] = [];
    for (const [brand, series] of byBrand) {
        const wiki = wikipediaAnomaly(series.wikipedia, asOf);
        if (wiki && wiki.importance > 0) {
            folds.push({kind: 'attention', source: 'wikipedia', importance: wiki.importance, entities: [{key: brand, sentiment: 0, relevance: WIKI_RELEVANCE}]});
        }
        const app = appstoreAnomaly(series.appstore, asOf);
        if (app && app.importance > 0) {
            folds.push({kind: 'attention', source: 'appstore', importance: app.importance, entities: [{key: brand, sentiment: 0, relevance: APPSTORE_RELEVANCE}]});
        }
    }
    return folds;
};
