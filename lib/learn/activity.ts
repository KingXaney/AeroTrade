// The days a reader did something on their Learn list, as one set (pure): a lab session (a card
// graded, a unit marked, a problem answered, a quiz passed), a daily puzzle solved on its day, a
// kept round of a game, a manual tick. lib/learn/activity-store reads the four sources and
// lib/games/streak.streakFrom counts the streak over their union; nothing stores the union.

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export type ActivitySources = {
    sessionDays: readonly string[];
    solvedDays: readonly string[];
    roundDays: readonly string[];
    tickedDays: readonly string[];
};

export const activityDays = ({sessionDays, solvedDays, roundDays, tickedDays}: ActivitySources): string[] =>
    [...new Set([...sessionDays, ...solvedDays, ...roundDays, ...tickedDays].filter((day) => DATE.test(day)))].sort();
