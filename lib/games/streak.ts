// The streak, Duolingo-style: the count of consecutive ET days on which something on the
// reader's Learn list was done — a puzzle solved on its day, a round of a game kept, a lab
// session, a manual tick (lib/learn/activity.ts gathers the days). Derived from those rows'
// days alone, never stored, so it cannot drift from them. Pure and client-safe.
//
// A streak is alive through yesterday until today ends: before today counts it still stands,
// and the reader is told it is at risk. A day with nothing done resets it. Days are ET labels
// ('YYYY-MM-DD', lib/dates.ts), moved in UTC so no timezone or DST can shift one.

import {addCalendarDays} from "@/lib/dates";

export type StreakDay = {date: string; solved: boolean; today: boolean; future: boolean};

export type Streak = {
    current: number;
    longest: number;
    // Distinct days with a solve.
    total: number;
    todayDone: boolean;
    // A streak that will end tonight unless today's puzzle is solved.
    atRisk: boolean;
    // The seven days ending today, oldest first.
    week: StreakDay[];
    // Whole weeks, Sunday first, the last one holding today; days after today are `future`.
    weeks: StreakDay[][];
};

export const STREAK_WEEKS = 12;

// The marks the hero counts toward: the first past the current streak is "n to go".
export const STREAK_MILESTONES: readonly number[] = [3, 7, 14, 30, 60, 100, 365];

export type Milestone = {target: number; toGo: number};

// The next milestone above the current run, or null past the last one.
export const nextMilestone = (current: number, milestones: readonly number[] = STREAK_MILESTONES): Milestone | null => {
    const target = milestones.find((mark) => mark > current);
    return target === undefined ? null : {target, toGo: target - current};
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const weekday = (date: string): number => {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

const runEndingAt = (days: ReadonlySet<string>, last: string): number => {
    let count = 0;
    for (let day = last; days.has(day); day = addCalendarDays(day, -1)) count += 1;
    return count;
};

export const streakFrom = (solvedDays: readonly string[], today: string, weekCount = STREAK_WEEKS): Streak => {
    // A future-dated or malformed day is not a solve the reader made.
    const days = new Set(solvedDays.filter((day) => DATE.test(day) && day <= today));
    const todayDone = days.has(today);
    const current = runEndingAt(days, todayDone ? today : addCalendarDays(today, -1));

    let longest = 0;
    let run = 0;
    let previous: string | null = null;
    for (const day of [...days].sort()) {
        run = previous !== null && addCalendarDays(previous, 1) === day ? run + 1 : 1;
        longest = Math.max(longest, run);
        previous = day;
    }

    const cell = (date: string): StreakDay => ({date, solved: days.has(date), today: date === today, future: date > today});
    const week = Array.from({length: 7}, (_, i) => cell(addCalendarDays(today, i - 6)));
    const firstSunday = addCalendarDays(today, -weekday(today) - 7 * (weekCount - 1));
    const weeks = Array.from({length: weekCount}, (_, w) =>
        Array.from({length: 7}, (_, d) => cell(addCalendarDays(firstSunday, w * 7 + d))));

    return {current, longest, total: days.size, todayDone, atRisk: !todayDone && current > 0, week, weeks};
};
