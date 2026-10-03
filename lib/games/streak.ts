// The daily-puzzle streak, Duolingo-style: the count of consecutive ET days on which the day's
// puzzle was solved on that day. Derived from the solved rows' days alone, never stored, so it
// cannot drift from them. Pure and client-safe.
//
// A streak is alive through yesterday until today ends: before today's solve it still counts,
// and the reader is told it is at risk. A day with no solve resets it. Days are ET labels
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
