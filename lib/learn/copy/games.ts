// Copy for the games (/games, the daily puzzle and its archive, the streak on Home, Learn ›
// Today and the dashboard). The games are the one place the app keeps a score: the streak counts
// days the day's puzzle was solved on its day, and a record is a reader's own highest. The
// sentences describe the games; none says what to do with money. Held to the 'copy' tier of
// lib/learn/banned.ts by lib/learn/__tests__/games-copy.test.ts.

import type {PuzzleCategory, PuzzleDifficulty, PuzzleStatus} from "@/lib/games/types";
import {shortDate} from "@/lib/learn/copy/portfolio";
import {formatSigned} from "@/lib/format";

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

const clock = (seconds: number): string => {
    const s = Math.max(0, Math.ceil(seconds));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export const ARITHMETIC_COPY = {
    title: 'Arithmetic',
    subtitle: 'Mental arithmetic against the clock: each problem moves on the moment the answer is right.',
    modeLabel: 'Arithmetic modes',
    modes: {sprint: 'Sprint', custom: 'Custom', interview: 'Interview'},
    sprintLead: 'Two minutes of addition, subtraction, multiplication and division, Zetamac-style: sums of 2–100 and 2–100, products of 2–12 and 2–100, and both in reverse.',
    customLead: 'Choose the operations, the ranges and the time. A record is kept for each set of settings.',
    interviewLead: 'Eighty multiple-choice problems in eight minutes — large sums, products, decimals, fractions, percentages, squares and roots — in the style of the mental-maths tests trading firms set. Keys 1 to 5 choose an option.',
    start: 'Start',
    playAgain: 'Play again',
    stop: 'End the round',
    answerLabel: 'Answer',
    timeLeft: (seconds: number): string => `${clock(seconds)} left`,
    questionOf: (n: number, total: number): string => `Question ${n} of ${total}`,
    operations: {add: 'Addition', subtract: 'Subtraction', multiply: 'Multiplication', divide: 'Division'},
    rangesHeading: 'Ranges',
    addRange: 'Addition: a number from',
    addBy: 'plus one from',
    multiplyRange: 'Multiplication: a number from',
    rangeTo: 'to',
    multiplyBy: 'times one from',
    reverseNote: 'Subtraction and division are addition and multiplication in reverse.',
    // Each range's two ends, for a screen reader.
    bounds: {
        addLeft: {min: 'First number, lowest', max: 'First number, highest'},
        addRight: {min: 'Second number, lowest', max: 'Second number, highest'},
        multiplyLeft: {min: 'First factor, lowest', max: 'First factor, highest'},
        multiplyRight: {min: 'Second factor, lowest', max: 'Second factor, highest'},
    },
    durationLabel: 'Time',
    duration: (seconds: number): string => (seconds < 60 ? `${seconds} s` : `${seconds / 60} min`),
    invalid: 'Those settings cannot make a round: each range runs low to high within 0–10,000, and a divisor starts at 1 or more.',
    // The end of a round.
    scoreHeading: 'Score',
    correct: (n: number): string => `${n.toLocaleString('en-US')} correct`,
    wrong: (n: number): string => `${n.toLocaleString('en-US')} wrong`,
    perProblem: (seconds: number): string => `${seconds.toFixed(1)} s a problem`,
    newRecord: 'New record',
    record: (n: number): string => `Record: ${n.toLocaleString('en-US')}`,
    firstRound: 'The first round on these settings.',
    recentHeading: 'Your last rounds',
    saving: 'Saving the round…',
    notSaved: 'The round could not be saved; its score is only shown here.',
    tooFast: 'That was a lot of rounds in a minute. Wait a moment, then play again.',
    notKept: 'That round could not have been played as reported, so it was not kept.',
    // The games hub's card.
    cardTitle: 'Arithmetic sprint',
    cardBody: 'Zetamac-style mental arithmetic against the clock, a custom mode, and eighty interview problems in eight minutes.',
    cardSprint: 'Sprint record',
    cardInterview: 'Interview record',
    cardNone: 'No round yet',
    play: 'Play',
} as const;

const dollars = (cents: number): string =>
    `$${(cents / 100).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;

export const KELLY_COPY = {
    title: 'Kelly coin',
    subtitle: 'A coin that lands heads 60% of the time, $25 to start and any bet you like each flip — the experiment Haghani and Dewey ran with finance students in 2016.',
    rules: [
        'The coin lands heads 60% of the time, and every bet pays even money.',
        'You start with $25. Winnings stop at $250: the game ends there, at $0, or after 300 flips.',
        'Bet any amount up to the bankroll on heads or tails each flip, or stop whenever you like.',
    ],
    start: 'Start a game',
    bankroll: 'Bankroll',
    flipOf: (n: number): string => `Flip ${n} of 300`,
    betLabel: 'Bet ($)',
    presets: 'Of the bankroll',
    all: 'All',
    onHeads: 'Bet on heads',
    onTails: 'Bet on tails',
    invalidBet: 'A bet is at least $0.01 and at most the bankroll.',
    lastFlip: (heads: boolean, won: boolean, cents: number): string =>
        `${heads ? 'Heads' : 'Tails'}: the bet ${won ? 'won' : 'lost'} ${dollars(cents)}.`,
    stop: 'Stop here',
    ended: {
        bust: 'The bankroll reached $0.',
        cap: 'The bankroll reached the $250 cap.',
        flips: 'All 300 flips are played.',
        stopped: 'You stopped the game.',
    },
    final: (cents: number): string => `Finished at ${dollars(cents)}.`,
    money: dollars,
    comparisonHeading: 'The same flips, three fixed rules',
    comparisonLead: 'Each rule below bet on heads every flip of your game, by its own rule.',
    ruleNames: {
        kelly: 'Kelly: 20% of the bankroll on heads',
        'half-kelly': 'Half Kelly: 10% on heads',
        'all-in': 'Everything on heads',
    },
    growth: (growth: number): string =>
        (Number.isFinite(growth) ? `expected log growth ${(growth * 100).toFixed(2)}% a flip` : 'one tails ends it'),
    pathLabel: 'The bankroll after each flip, yours and the fixed rules\'',
    recordLabel: 'Highest finish',
    cardTitle: 'Kelly coin',
    cardBody: 'Bet on a 60% coin from $25, with winnings capped at $250, beside the Kelly fraction on the same flips.',
} as const;

export const MARKET_COPY = {
    title: 'Market making',
    subtitle: 'Make a market on the sum of four hidden dice. Three traders come by each round, and one of them knows the sum to within one.',
    rules: [
        'Four dice are rolled and hidden. Their sum, 4 to 24, settles the market at the end.',
        'Each round you quote a bid and an ask, 1 to 4 apart. A trader buys one from you at the ask when they believe the sum is higher, and sells one to you at the bid when they believe it is lower.',
        'After each round one die is shown. Your position stays within 10 either way.',
    ],
    start: 'Start a game',
    roundOf: (n: number): string => `Round ${n} of 4`,
    shown: 'Dice shown',
    hiddenDie: 'hidden',
    bid: 'Bid',
    ask: 'Ask',
    quote: 'Quote',
    invalid: 'A bid and an ask are whole numbers 1 to 4 apart, the ask above the bid.',
    traderBought: (trader: number, price: number): string => `Trader ${trader} bought one from you at ${price}.`,
    traderSold: (trader: number, price: number): string => `Trader ${trader} sold one to you at ${price}.`,
    noTrades: 'No one traded at that quote.',
    fairValueLabel: 'Fair value now',
    positionLabel: 'Position',
    pnlLabel: 'Profit and loss',
    // A whole signed figure: "+7", "−4", "0".
    signed: (n: number): string => (n === 0 ? '0' : formatSigned(n, 0)),
    settled: (dice: readonly number[], sum: number): string => `The dice were ${dice.join(', ')}: the sum is ${sum}.`,
    tradersHeading: 'What each trader believed',
    informed: 'Informed: knew the sum to within one',
    noise: 'Knew only the dice shown, give or take',
    believed: (belief: number): string => `believed ${belief.toFixed(1)}`,
    fromInformed: (n: number): string => `Trades with the informed traders: ${n === 0 ? '0' : formatSigned(n, 0)}`,
    fromNoise: (n: number): string => `Trades with the others: ${n === 0 ? '0' : formatSigned(n, 0)}`,
    recordLabel: 'Highest profit',
    cardTitle: 'Market making',
    cardBody: 'Quote a market on four hidden dice against three traders, one of whom knows the sum.',
} as const;

export const CORRELATION_COPY = {
    title: 'Guess the correlation',
    subtitle: 'Ten scatter plots of fifty points. Guess how correlated each one is; the score is the average miss, and lower is the record.',
    start: 'Start a game',
    plotOf: (n: number): string => `Plot ${n} of 10`,
    guessLabel: 'Your guess',
    guess: 'Guess',
    next: 'Next plot',
    finish: 'See the score',
    reveal: (r: number, miss: number): string => `r = ${r.toFixed(2)} · off by ${miss.toFixed(2)}`,
    close: 'Close: within 0.05.',
    run: (n: number): string => `${n} close in a row`,
    score: (thousandths: number): string => `Average miss: ${(thousandths / 1000).toFixed(3)}`,
    closeCount: (n: number): string => `${n} of 10 within 0.05`,
    longestRun: (n: number): string => `Longest run: ${n}`,
    record: (thousandths: number): string => `Record: ${(thousandths / 1000).toFixed(3)}`,
    recordLabel: 'Lowest average miss',
    scoreLabel: 'Average miss',
    plotLabel: (n: number): string => `Scatter plot ${n}: fifty points`,
    cardTitle: 'Guess the correlation',
    cardBody: 'Read the correlation off ten scatter plots; the score is the average miss.',
} as const;
