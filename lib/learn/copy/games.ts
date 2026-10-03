// Copy for the games (/games, the daily puzzle and its archive, the streak on Home, Learn ›
// Today and the dashboard). The games are the one place the app keeps a score: the streak counts
// days the day's puzzle was solved on its day, and a record is a reader's own highest. The
// sentences describe the games; none says what to do with money. Held to the 'copy' tier of
// lib/learn/banned.ts by lib/learn/__tests__/games-copy.test.ts.

import type {PuzzleCategory, PuzzleDifficulty, PuzzleStatus} from "@/lib/games/types";
import {shortDate} from "@/lib/learn/copy/portfolio";

const plural = (n: number, one: string, many: string): string => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

export const PUZZLE_CATEGORY_LABEL: Record<PuzzleCategory, string> = {
    probability: 'Probability',
    'expected-value': 'Expected value',
    combinatorics: 'Counting',
    logic: 'Logic',
    estimation: 'Estimation',
    strategy: 'Strategy',
};

export const PUZZLE_DIFFICULTY_LABEL: Record<PuzzleDifficulty, string> = {1: 'Warm-up', 2: 'Medium', 3: 'Hard'};

export const GAMES_COPY = {
    title: 'Games',
    subtitle: 'A quant puzzle every day, and a streak for every day you solve it.',
    note: 'The games describe how chance and numbers behave. No figure here is a recommendation.',
    dailyHeading: "Today's puzzle",
    archiveLink: 'Past puzzles',
    allGames: 'All games',
    openPuzzle: "Open today's puzzle",
    seeSolution: 'See the solution',
    noPuzzleYet: 'The first puzzle has not been posted yet.',
} as const;

export const STREAK_COPY = {
    // "5-day streak"
    streak: (days: number): string => `${days}-day streak`,
    none: 'No streak yet',
    longest: (days: number): string => `Longest: ${plural(days, 'day', 'days')}`,
    longestLabel: 'Longest streak',
    solvedLabel: 'Solved on the day',
    days: (n: number): string => (n === 1 ? 'day' : 'days'),
    puzzles: (n: number): string => (n === 1 ? 'puzzle' : 'puzzles'),
    solvedOnTheDay: (n: number): string => `${plural(n, 'puzzle', 'puzzles')} solved on the day`,
    doneToday: "Today's puzzle is solved: the streak counts today.",
    atRisk: (days: number): string => `Solve today's puzzle by midnight Eastern to keep the ${days}-day streak.`,
    start: "Solve today's puzzle to start a streak.",
    rule: 'A day counts when that day\'s puzzle is solved before midnight Eastern. A day with no solve starts the count again.',
    weekHeading: 'This week',
    gridHeading: 'The last 12 weeks',
    // A day's square in the grid.
    dayLabel: (date: string, solved: boolean): string => `${shortDate(date, true)}: ${solved ? 'solved' : 'not solved'}`,
    weekdays: ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const,
    // Home's chip, beside the market status.
    chipTodo: "Today's puzzle",
    chipAria: (days: number, done: boolean): string =>
        days > 0 ? `${days}-day puzzle streak; today's puzzle ${done ? 'solved' : 'not solved yet'}` : "Today's puzzle, not solved yet",
} as const;

export const PUZZLE_COPY = {
    // "Puzzle #12"
    number: (n: number): string => `Puzzle #${n}`,
    answerLabel: 'Your answer',
    answerHint: 'A whole number, a fraction (1/4), a decimal (0.25) or a percent (25%).',
    check: 'Check',
    checking: 'Checking…',
    correct: 'Solved.',
    close: 'Close: give it exactly, or to three significant figures.',
    closeEstimate: 'Close, but outside what this estimate accepts.',
    wrong: 'Not this one. Have another go.',
    unreadable: 'That does not read as a number. Fractions (1/4), decimals (0.25) and percents (25%) all work.',
    attempts: (n: number): string => plural(n, 'try', 'tries'),
    takeHint: 'Take a hint',
    hintsLeft: (n: number): string => `${plural(n, 'hint', 'hints')} left`,
    hint: (i: number): string => `Hint ${i}`,
    reveal: 'Show the solution',
    revealConfirm: 'Showing the solution ends this puzzle without a solve.',
    revealYes: 'Show it',
    revealNo: 'Keep trying',
    answerHeading: 'Answer',
    solutionHeading: 'Solution',
    // "Solved Oct 3, 9:14 PM ET · 2 tries · 1 hint"
    solvedLine: (when: string, attempts: number, hints: number): string =>
        `Solved ${when} · ${plural(attempts, 'try', 'tries')}${hints > 0 ? ` · ${plural(hints, 'hint', 'hints')}` : ''}`,
    revealedLine: 'Solution shown: no solve counted.',
    dailyRule: "Solving today's puzzle today, Eastern time, counts toward the streak.",
    archiveRule: 'An archive puzzle can be solved any time; only a day\'s own puzzle on its day counts toward the streak.',
    closedEarlier: 'This puzzle was closed on the day it was the daily puzzle.',
    notToday: "That puzzle is no longer today's: it is in the archive now, and a solve there does not count toward the streak.",
    notShown: 'That puzzle has not been posted yet.',
    notSignedIn: 'Not authenticated',
    notSaved: 'Could not save that just now — nothing was counted.',
    tooFast: 'That was a lot of answers in a minute. Wait a moment, then try again.',
    unit: (unit: string): string => unit,
} as const;

export const ARCHIVE_COPY = {
    title: 'Past puzzles',
    subtitle: 'Every puzzle posted so far, newest first. Solve any of them; only a day\'s own puzzle on its day counts toward the streak.',
    back: 'All games',
    status: {solved: 'Solved', revealed: 'Solution shown', open: 'Started'} satisfies Record<PuzzleStatus, string>,
    notTried: 'Not tried',
    onItsDay: 'on its day',
    posted: (date: string): string => `Posted ${shortDate(date)}`,
    empty: 'No puzzle has been posted yet.',
    // The hub's line: "4 of 9 posted puzzles solved"
    hubLine: (solved: number, posted: number): string => `${solved} of ${plural(posted, 'posted puzzle', 'posted puzzles')} solved`,
    hubLead: 'Every puzzle stays playable after its day; the streak counts only a day\'s own puzzle on its day.',
} as const;
