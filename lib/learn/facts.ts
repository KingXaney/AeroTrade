// What the learn surfaces know about an account, derived from stored rows — never a
// flag that says "new user". A mission is done when the row it asks for exists; the
// checklist leaves when every row exists, when it was dismissed once, or when the
// account is older than the first month. Pure types and date maths only; the reads
// live in facts-store.ts.

import type {StrategyId} from "@/lib/strategies/types";

export type OnboardingFacts = {
    // ET calendar dates, 'YYYY-MM-DD'.
    today: string;
    // The oldest paper account's creation date; null before the first render creates one.
    accountCreatedOn: string | null;
    hasUserTrade: boolean;
    followedStrategies: readonly string[];
    topicOpened: boolean;
    hasWatchlist: boolean;
    navigatorEnrolled: boolean;
    // ISO timestamp of the one-time "Hide" click, or null.
    missionsDismissedAt: string | null;
};

// The firsts Today's lesson can point at, read from rows (lib/learn/facts-store.ts
// getLearnFacts). Every date is an ET calendar date, 'YYYY-MM-DD'.
export type LearnFill = {date: string; symbol: string; side: 'buy' | 'sell'; quantity: number; price: number};
export type LearnSell = {date: string; symbol: string; quantity: number; price: number; realizedPnl: number | null};
// A credited dividend row (dated on or before its account's incomeThrough watermark).
export type LearnDividend = {date: string; symbol: string; amount: number; perShare: number | null; quantity: number | null; exDate: string | null};
// The first day an account's snapshots stood DRAWDOWN_MOMENT_THRESHOLD or more below their
// running peak (lib/learn/moments.ts firstDrawdownCrossing).
export type LearnDrawdown = {date: string; peakDate: string; peakValue: number; value: number; pct: number};
// A followed strategy's last evaluated rebalance; `traded` = it also placed orders that day.
export type LearnRebalance = {strategyId: StrategyId; date: string; traded: boolean};

export type LearnFacts = OnboardingFacts & {
    firstFill: LearnFill | null;
    firstSell: LearnSell | null;
    firstDividend: LearnDividend | null;
    firstDrawdown: LearnDrawdown | null;
    rebalances: readonly LearnRebalance[];
    // Stamp-once "Got it" keys (lib/learn/moments.ts lessonKey), newest last, capped.
    lessonsSeen: readonly string[];
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Whole calendar days from `from` to `to` ('YYYY-MM-DD'); negative when `to` is earlier.
export const daysBetween = (from: string, to: string): number =>
    Math.round((Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10)) -
        Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10))) / MS_PER_DAY);
