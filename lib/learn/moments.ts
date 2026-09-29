// Today's lesson, moment mode: a first from the learner's own account (a dividend, a 5% drop,
// a sell, a fill) or a followed strategy's rebalance, shown for a few days after it happened
// and gone once "Got it" stamps its key into the no-default `learn.lessonsSeen` preference.
// Pure: the facts come from lib/learn/facts-store.ts getLearnFacts, the copy from
// lib/learn/copy/lesson.ts. Nothing here reads beginnerLine — a moment describes what the
// account or the rule did, in the rule's cadence and the rows' own numbers.

import {z} from 'zod';
import {daysBetween, type LearnDividend, type LearnDrawdown, type LearnFacts, type LearnFill, type LearnRebalance, type LearnSell} from "@/lib/learn/facts";
import {STRATEGY_SLUGS, strategyBySlug} from "@/lib/strategies/catalog";
import type {StrategyId} from "@/lib/strategies/types";

export const MOMENT_WINDOW_DAYS = 7;
export const REBALANCE_WINDOW_DAYS = 3;
// A fall from the running peak at least this deep is "the first 5% drop".
export const DRAWDOWN_MOMENT_THRESHOLD = 0.05;
// `learn.lessonsSeen` keeps the newest keys only ($push {$each, $slice: -LESSONS_SEEN_CAP}).
export const LESSONS_SEEN_CAP = 32;
export const MAX_LESSON_KEY_CHARS = 64;

export const FIRST_KINDS = ['first-dividend', 'first-drawdown', 'first-sell', 'first-fill'] as const;
export type FirstKind = (typeof FIRST_KINDS)[number];
export type MomentKind = FirstKind | 'rebalance';
export type RebalanceLessonId = {kind: 'rebalance'; strategyId: StrategyId; date: string};
export type LessonId = FirstKind | RebalanceLessonId;

export const MOMENT_PRIORITY: readonly MomentKind[] = [...FIRST_KINDS, 'rebalance'];

export type Moment =
    | {kind: 'first-dividend'; id: 'first-dividend'; occurredOn: string; dividend: LearnDividend}
    | {kind: 'first-drawdown'; id: 'first-drawdown'; occurredOn: string; drawdown: LearnDrawdown}
    | {kind: 'first-sell'; id: 'first-sell'; occurredOn: string; sell: LearnSell}
    | {kind: 'first-fill'; id: 'first-fill'; occurredOn: string; fill: LearnFill}
    | {kind: 'rebalance'; id: RebalanceLessonId; occurredOn: string; rebalance: LearnRebalance};

export const lessonKey = (id: LessonId): string =>
    typeof id === 'string' ? id : `rebalance:${id.strategyId}:${id.date}`;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// 'YYYY-MM-DD' moved by whole calendar days; string arithmetic in UTC, so no zone moves it.
export const shiftDate = (date: string, days: number): string =>
    new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) + days * MS_PER_DAY).toISOString().slice(0, 10);

const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/;

// Shape first: zod runs a refinement even after the regex check failed, and a malformed
// string would make Date throw.
const isCalendarDate = (value: string): boolean => {
    if (!DATE_SHAPE.test(value)) return false;
    const time = Date.UTC(+value.slice(0, 4), +value.slice(5, 7) - 1, +value.slice(8, 10));
    return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
};

const etDateSchema = z.string().refine(isCalendarDate);

// The one shape markLessonSeen accepts: one of the four firsts, or a rebalance named by a
// catalog strategy and a real ET date. Strict, so a stray field (or an operator) never rides in.
export const lessonIdSchema = z.union([
    z.enum(FIRST_KINDS),
    z.strictObject({kind: z.literal('rebalance'), strategyId: z.enum(STRATEGY_SLUGS), date: etDateSchema}),
]).refine((id) => lessonKey(id).length <= MAX_LESSON_KEY_CHARS);

export const parseLessonId = (input: unknown): LessonId | null => {
    const parsed = lessonIdSchema.safeParse(input);
    return parsed.success ? parsed.data : null;
};

// The first day any account's snapshots stood `threshold` or more below that account's
// running peak. Accounts are kept apart (two interleaved series would fake a fall); the
// earliest crossing across them wins. Values that are not positive and finite are skipped.
export const firstDrawdownCrossing = (
    points: readonly {accountId: string; date: string; totalValue: number}[],
    threshold: number = DRAWDOWN_MOMENT_THRESHOLD,
): LearnDrawdown | null => {
    const byAccount = new Map<string, {date: string; totalValue: number}[]>();
    for (const point of points) {
        if (!Number.isFinite(point.totalValue) || point.totalValue <= 0) continue;
        const series = byAccount.get(point.accountId) ?? [];
        series.push(point);
        byAccount.set(point.accountId, series);
    }
    let best: LearnDrawdown | null = null;
    for (const series of byAccount.values()) {
        series.sort((a, b) => a.date.localeCompare(b.date));
        let peak = series[0];
        for (const point of series) {
            if (point.totalValue > peak.totalValue) peak = point;
            const pct = 1 - point.totalValue / peak.totalValue;
            // The epsilon keeps an exact 5.00% fall from reading as 4.9999…%.
            if (pct >= threshold - 1e-9) {
                if (!best || point.date < best.date) {
                    best = {date: point.date, peakDate: peak.date, peakValue: peak.totalValue, value: point.totalValue, pct};
                }
                break;
            }
        }
    }
    return best;
};

// A strategy that re-checks every trading day "rebalances" daily; that is its routine, not
// a moment. Rebalance moments are the monthly, quarterly and one-time checks.
const rebalanceMoment = (rebalance: LearnRebalance): Moment | null => {
    const def = strategyBySlug(rebalance.strategyId);
    if (!def || def.cadence === 'daily') return null;
    return {kind: 'rebalance', id: {kind: 'rebalance', strategyId: def.id, date: rebalance.date}, occurredOn: rebalance.date, rebalance};
};

const catalogIndex = (id: StrategyId): number => STRATEGY_SLUGS.indexOf(id);

// Every moment still worth showing, highest priority first: within its window (a first for
// `windowDays`, a rebalance for `rebalance` days), never dated after today, and not yet seen.
export const deriveMoments = (
    facts: LearnFacts,
    today: string,
    {windowDays = MOMENT_WINDOW_DAYS, rebalance = REBALANCE_WINDOW_DAYS}: {windowDays?: number; rebalance?: number} = {},
): Moment[] => {
    const candidates: Moment[] = [];
    if (facts.firstDividend) candidates.push({kind: 'first-dividend', id: 'first-dividend', occurredOn: facts.firstDividend.date, dividend: facts.firstDividend});
    if (facts.firstDrawdown) candidates.push({kind: 'first-drawdown', id: 'first-drawdown', occurredOn: facts.firstDrawdown.date, drawdown: facts.firstDrawdown});
    if (facts.firstSell) candidates.push({kind: 'first-sell', id: 'first-sell', occurredOn: facts.firstSell.date, sell: facts.firstSell});
    if (facts.firstFill) candidates.push({kind: 'first-fill', id: 'first-fill', occurredOn: facts.firstFill.date, fill: facts.firstFill});
    for (const item of facts.rebalances) {
        const moment = rebalanceMoment(item);
        if (moment) candidates.push(moment);
    }

    const seen = new Set(facts.lessonsSeen);
    const visible = candidates.filter((moment) => {
        const age = daysBetween(moment.occurredOn, today);
        const window = moment.kind === 'rebalance' ? rebalance : windowDays;
        return age >= 0 && age <= window && !seen.has(lessonKey(moment.id));
    });

    return visible.sort((a, b) =>
        MOMENT_PRIORITY.indexOf(a.kind) - MOMENT_PRIORITY.indexOf(b.kind)
        || b.occurredOn.localeCompare(a.occurredOn)
        || (a.kind === 'rebalance' && b.kind === 'rebalance' ? catalogIndex(a.id.strategyId) - catalogIndex(b.id.strategyId) : 0));
};
