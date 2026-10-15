// Copy for the owner's lab at /learn and its unit pages: every heading, button, count line and
// empty state. Every sentence is held to the 'copy' tier of lib/learn/banned.ts by
// lib/learn/__tests__/lab-copy.test.ts; the units themselves are the bank in ./lab/ (server-only).

import type {LabTrack} from "@/lib/learn/copy/lab/types";
import type {LabWidgetId} from "@/lib/lab/widgets";
import {ARITHMETIC_COPY, CORRELATION_COPY, GAMES_COPY, KELLY_COPY, MARKET_COPY} from "@/lib/learn/copy/games";
import {POKER_NIGHT_COPY} from "@/lib/learn/copy/poker-night";

export const LAB_TRACK_LABELS: Readonly<Record<LabTrack, string>> = {cv: 'Computer vision', ml: 'Machine learning', quant: 'Quantitative finance'};

export const LAB_COPY = {
    title: 'Lab',
    subtitle: 'A daily study of computer vision, machine learning and quantitative finance, as a list for the day: one unit with its quiz, the cards due, a problem, the day\'s papers and the games you add.',
    views: {today: 'Today', papers: 'Papers', library: 'Library'},
    viewsLabel: 'Lab views',

    // Today's unit.
    unitHeading: {study: 'Today\'s unit', 'studied-today': 'Studied today', revisit: 'A revisit', 'nothing-written': 'The next unit'} as const,
    revisitLine: (firstDay: string, lastDay: string): string => `First studied ${firstDay}, last on ${lastDay}. Every written unit is studied; the least recent comes round again.`,
    nothingWritten: (title: string): string => `${title} is on the syllabus and not written yet. The review cards, the problem and the papers carry on.`,
    nothingAtAll: 'No unit is written yet.',
    readingTime: (minutes: number): string => `${minutes} min read`,
    cardsCount: (n: number): string => `${n} review ${n === 1 ? 'card' : 'cards'}`,
    openUnit: 'Open the unit',
    studiedOn: (day: string): string => `Studied on ${day}`,

    // Review.
    reviewHeading: 'Review',
    reviewDue: (n: number): string => `${n} due`,
    reviewNothing: 'Nothing due today. Cards return as their intervals end, and a unit\'s cards join the day after it is studied.',
    reviewAllDone: 'Every due card is graded for today.',
    reviewLeft: (n: number): string => `${n} left`,
    showAnswer: 'Show the answer',
    grades: {again: 'Again', hard: 'Hard', good: 'Good', easy: 'Easy'} as const,
    gradeLine: 'Again: tomorrow · Hard: a little later · Good: on schedule · Easy: later still.',
    why: {overdue: 'Overdue', due: 'Due', new: 'New'} as const,
    fromUnit: (title: string): string => `From ${title}`,

    // The problem.
    problemHeading: 'Today\'s problem',
    hintOf: (n: number, total: number): string => `Hint ${n} of ${total}`,
    nextHint: 'Next hint',
    answerLabel: 'Your answer',
    check: 'Check',
    checked: {correct: 'Correct.', close: 'Close: within the tolerance.', wrong: 'Not it. The worked solution is a click away.', unreadable: 'That is not a number the checker reads.'} as const,
    reveal: 'Show the worked solution',
    solutionHeading: 'Worked solution',
    closedOn: (day: string, how: 'revealed' | 'solved'): string => (how === 'solved' ? `Answered on ${day}.` : `Solution opened on ${day}.`),
    kinds: {derivation: 'derivation', coding: 'coding', quant: 'calculation'} as const,

    // Today's list (lib/lab/todo.ts builds it; components/lab/TodayList draws it).
    list: {
        heading: 'Today\'s list',
        progress: (done: number, total: number): string => `${done} of ${total} done`,
        unit: (title: string): string => `Study ${title}`,
        unitLine: 'Read it, pass its quiz, then mark it studied.',
        unitQuizPassed: 'Quiz passed. Mark it studied to move on.',
        unitStudied: 'Studied today.',
        unitNothing: 'The next unit is not written yet.',
        review: (n: number): string => `Grade ${n} due ${n === 1 ? 'card' : 'cards'}`,
        reviewLine: 'The review deck is below.',
        reviewNone: 'No cards due today',
        reviewDone: 'Every due card graded.',
        problem: 'Answer today\'s problem',
        problemLine: 'A number checked on the server, or the worked solution opened.',
        problemDone: 'Closed for today.',
        papers: 'Read the day in papers',
        papersLine: 'The digest is below; tick it once read.',
        puzzle: 'Solve today\'s puzzle',
        puzzleLine: 'The quant puzzle, on its own page.',
        round: (title: string): string => `Play a round of ${title}`,
        roundLine: 'A round kept today ticks it.',
        site: (title: string): string => `A session on ${title}`,
        siteLine: 'Outside the app: tick it yourself.',
        table: 'A hand or two at poker night',
        tableLine: 'Tick it after a table.',
        tick: 'Done',
        untick: 'Undo',
        ticked: (day: string): string => `Ticked ${day}`,
        open: 'Open',
        empty: 'Nothing on the list: add a game below.',
        widgetsHeading: 'Games on Today',
        pickerSummary: 'Add games to Today',
        pickerLead: 'Each game added is a card here and an item on the list; a round played counts the day.',
        noWidgets: 'No games added yet.',
    },

    // A unit's quiz (components/lab/QuizCard; lib/lab/quiz scores it on the server).
    quiz: {
        heading: 'Check your understanding',
        lead: (n: number): string => `${n} questions, one answer each; at most one wrong passes. A pass is what lets the unit be marked studied.`,
        check: 'Check answers',
        checking: 'Checking…',
        passed: (correct: number, total: number): string => `Passed: ${correct} of ${total}.`,
        failed: (correct: number, total: number): string => `${correct} of ${total}: not passed yet. The wrong ones are marked; change them and check again.`,
        tryAgain: 'Try again',
        passedOn: (day: string): string => `Passed on ${day}.`,
        whyHeading: 'Why',
        unanswered: 'Answer every question first.',
        quizFirst: 'Pass the quiz under the unit before marking it studied.',
        gateNote: 'The quiz above is passed first; then this button marks the unit studied.',
    },

    // Progress.
    progressHeading: 'Progress',
    unitsOf: (done: number, total: number): string => `${done} of ${total}`,
    unitsLabel: 'units studied',
    learnedLabel: 'cards learned',
    dueLabel: 'due today',
    streakLabel: 'streak',
    streakRule: 'A day counts when any item on the list is done before midnight Eastern: a unit, a card, a problem, a quiz, the puzzle, a round of a game or a tick. A day with nothing done starts the count again.',
    sessionDoneToday: 'Today counts.',
    sessionAtRisk: (days: number): string => `Do one item on the list today to keep the ${days}-day streak.`,
    sessionStart: 'Do one item on the list to start a streak.',

    // The library.
    libraryHeading: 'The syllabus',
    libraryLead: 'Ten units a track, in reading order. A unit on the syllabus and not yet written is greyed; it is never today\'s unit.',
    planned: 'Not written yet',
    unitNumber: (n: number): string => `Unit ${n}`,

    // The papers.
    papersHeading: 'Papers',
    papersLead: 'New on arXiv and in Hugging Face\'s daily papers for the three fields, read each weekday morning: at most twelve a field, none older than a week, none shown on two days. Upvotes are Hugging Face readers\'.',
    papersNone: 'No papers read yet. The feed runs on weekday mornings.',
    papersStale: (day: string): string => `The latest day read is ${day}; nothing newer has been fetched.`,
    papersDay: (day: string): string => `Papers of ${day}`,
    trackPapers: (n: number): string => `${n} ${n === 1 ? 'paper' : 'papers'}`,
    moreAuthors: (n: number): string => `and ${n} more`,
    upvotes: (n: number): string => `${n} ${n === 1 ? 'upvote' : 'upvotes'}`,
    abstractLabel: 'Abstract',
    onArxiv: 'arXiv',
    onHf: 'Hugging Face',
    allPapers: 'All of the day\'s papers',
    digestHeading: 'The day in papers',
    digestCaveat: (day: string): string => `${day} · AI summary written from the abstracts · may contain errors`,
    digestRefs: 'Papers cited',
    todayPapersHeading: 'Today\'s papers',

    // A unit page.
    sectionHeadings: {idea: 'The idea', maths: 'The maths', code: 'A sketch in code', whyNow: 'Why it matters now', pitfalls: 'Pitfalls'} as const,
    sourcesHeading: 'Sources',
    cardsHeading: (n: number): string => `${n} review ${n === 1 ? 'card' : 'cards'} from this unit`,
    markHeading: 'Done reading',
    markLead: 'Marking it studied counts it in the track; its cards join the review tomorrow, and the lab moves on to the next unit.',
    markStudied: 'Mark as studied',
    markAgain: 'Studied again',
    marking: 'Saving…',
    markedLine: (day: string): string => `Marked studied on ${day}.`,
    backToLab: 'Back to the lab',
    previous: 'Previous unit',
    next: 'Next unit',
    trackOf: (track: LabTrack, number: number, total: number): string => `${LAB_TRACK_LABELS[track]} · unit ${number} of ${total}`,

    // Actions.
    notSignedIn: 'Not authenticated',
    notOwner: 'The lab is not open to this account',
    invalid: 'Not something the lab knows',
    notSaved: 'That could not be saved just now',
    tooFast: 'Over the minute\'s limit of actions; try again shortly',
} as const;

// What each widget is called on Today and on the list: the games hub's own titles.
export const LAB_WIDGET_TITLES: Readonly<Record<LabWidgetId, string>> = {
    'daily-puzzle': GAMES_COPY.dailyHeading,
    'arithmetic': ARITHMETIC_COPY.cardTitle,
    'kelly': KELLY_COPY.cardTitle,
    'market-making': MARKET_COPY.cardTitle,
    'correlation': CORRELATION_COPY.cardTitle,
    'poker-night': POKER_NIGHT_COPY.cardTitle,
    'lichess': GAMES_COPY.outside.links.lichess.title,
    'monkeytype': GAMES_COPY.outside.links.monkeytype.title,
    'codeforces': GAMES_COPY.outside.links.codeforces.title,
    'leetcode': GAMES_COPY.outside.links.leetcode.title,
};
