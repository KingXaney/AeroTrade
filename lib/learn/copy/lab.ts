// Copy for the owner's lab at /learn and its unit pages: every heading, button, count line and
// empty state. Every sentence is held to the 'copy' tier of lib/learn/banned.ts by
// lib/learn/__tests__/lab-copy.test.ts; the units themselves are the bank in ./lab/ (server-only).

import type {LabTrack} from "@/lib/learn/copy/lab/types";
import type {LabWidgetId} from "@/lib/lab/widgets";
import {ARITHMETIC_COPY, CORRELATION_COPY, GAMES_COPY, KELLY_COPY, MARKET_COPY, PUZZLE_COPY} from "@/lib/learn/copy/games";
import {POKER_NIGHT_COPY} from "@/lib/learn/copy/poker-night";

export const LAB_TRACK_LABELS: Readonly<Record<LabTrack, string>> = {cv: 'Computer vision', ml: 'Machine learning', quant: 'Quantitative finance'};

// "Good morning, Ada." — the first name only, and the greeting alone when there is no name.
const greet = (opening: string) => (name: string | null | undefined): string => {
    const first = (name ?? '').trim().split(/\s+/)[0];
    return first ? `${opening}, ${first}.` : `${opening}.`;
};

export const LAB_COPY = {
    title: 'Lab',
    subtitle: 'A daily study of computer vision, machine learning and quantitative finance, as a list for the day: one unit with its quiz, the cards due, a problem, the day\'s papers and the games you add.',
    views: {today: 'Today', papers: 'Papers', library: 'Library'},
    viewsLabel: 'Lab views',

    // The check-in at the top of Today (lib/lab/checkin.ts; components/lab/CheckIn, DayFocus).
    checkIn: {
        greeting: {morning: greet('Good morning'), afternoon: greet('Good afternoon'), evening: greet('Good evening')},
        focusLabel: 'Today\'s focus',
        question: 'What would you like to accomplish today?',
        placeholder: 'One line: what the day is for.',
        save: 'Save',
        saving: 'Saving…',
        edit: 'Edit',
        cancel: 'Cancel',
        planLabel: 'Yesterday\'s note for today',
        usePlan: 'Make it today\'s focus',
        yesterdayHeading: 'Yesterday',
        yesterdayDone: (n: number): string => `${n} done`,
        yesterdayLeft: (n: number): string => `${n} left`,
        yesterdayNothing: 'Nothing counted yesterday.',
        doneLabel: 'Done',
        leftLabel: 'Left',
        unitDone: (title: string): string => `Studied ${title}`,
        unitLeft: (title: string): string => `Study ${title}`,
        cards: (n: number): string => `${n} ${n === 1 ? 'card' : 'cards'} graded`,
        problem: 'The problem',
        puzzle: 'The puzzle',
    },

    // The end of the day (components/lab/Reflection; saved to the day's note).
    reflection: {
        heading: 'End of day',
        lead: 'A minute at the close: what the day held, and what tomorrow is for. Tomorrow\'s line comes back as the morning\'s note.',
        doneLabel: 'Done today',
        leftLabel: 'Still open',
        nothingDone: 'Nothing yet.',
        nothingLeft: 'Nothing.',
        notesLabel: 'Notes on the day',
        notesPlaceholder: 'What went well, what got in the way.',
        nextLabel: 'Tomorrow\'s focus',
        nextPlaceholder: 'One line for tomorrow morning.',
        save: 'Save',
        saving: 'Saving…',
        saved: 'Saved.',
    },

    // The game widgets' layout (lib/lab/layout.ts; components/lab/LabWidgets on Today, the
    // arranging view components/lab/LabArrange at /learn?arrange=1, the account menu's entry).
    layout: {
        menuItem: 'Lab layout',
        arrange: 'Arrange',
        heading: 'Arrange Today\'s games',
        lead: 'Drag a card by its handle or use the arrows, pick its width, add or remove games, then save. Below a tablet\'s width every card takes the full row.',
        add: 'Add a game',
        reset: 'Reset',
        resetTitle: 'Back to the puzzle alone (applied on Save)',
        cancel: 'Cancel',
        save: 'Save',
        saved: 'Layout saved.',
        empty: 'No games on Today. Add one, or reset to the puzzle alone.',
        saveToLoad: 'Save to load',
        library: {
            title: 'Add a game',
            lead: 'A game added is a card on Today and an item on the list; a round played counts the day.',
            full: 'Every game is on Today.',
            none: 'Every game is already on Today.',
            addRow: 'Add',
            inApp: 'In the app',
            elsewhere: GAMES_COPY.outside.heading,
        },
        // What a screen reader hears while a card is dragged.
        announce: {
            pickedUp: (title: string): string => `Picked up ${title}. Drop it on another card to move it there.`,
            over: (title: string, target: string): string => `${title} moves to ${target}'s place.`,
            moved: (title: string, target: string): string => `Moved ${title} to ${target}'s place.`,
            notMoved: (title: string): string => `${title} was not moved.`,
            cancelled: (title: string): string => `Cancelled moving ${title}.`,
        },
    },

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
        groups: {study: 'Study', play: 'Play', elsewhere: 'Elsewhere'} as const,
        states: {done: 'Done', todo: 'To do', started: 'Started', overdue: 'Overdue', none: 'Nothing today'} as const,
        unit: (title: string): string => `Study ${title}`,
        unitLine: 'Read it, pass its quiz, then mark it studied.',
        unitQuizPassed: 'Quiz passed. Mark it studied to move on.',
        unitStudied: 'Studied today.',
        unitNothing: 'The next unit is not written yet.',
        review: (n: number): string => `Grade ${n} due ${n === 1 ? 'card' : 'cards'}`,
        reviewLine: 'The review deck is below.',
        reviewOverdue: (n: number): string => `${n} past ${n === 1 ? 'its' : 'their'} day. The review deck is below.`,
        reviewStarted: (n: number): string => `${n} to go. The review deck is below.`,
        reviewNone: 'No cards due today',
        reviewDone: 'Every due card graded.',
        problem: 'Answer today\'s problem',
        problemLine: 'A number checked on the server, or the worked solution opened.',
        problemDone: 'Closed for today.',
        papers: 'Read the day in papers',
        papersLine: 'The digest is below; tick it once read.',
        puzzle: 'Solve today\'s puzzle',
        puzzleLine: 'The quant puzzle, on its own page.',
        puzzleStarted: 'Started; the answer is still open.',
        puzzleRevealed: PUZZLE_COPY.revealedLine,
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
        empty: 'Nothing on the list: add a game from the arranging view.',
        widgetsHeading: 'Games on Today',
        noWidgets: 'No games on Today yet.',
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

// One line each, in the arranging view's library: the hub's own card bodies.
export const LAB_WIDGET_BLURBS: Readonly<Record<LabWidgetId, string>> = {
    'daily-puzzle': 'Today\'s quant puzzle and the streak, with the way to the puzzle.',
    'arithmetic': ARITHMETIC_COPY.cardBody,
    'kelly': KELLY_COPY.cardBody,
    'market-making': MARKET_COPY.cardBody,
    'correlation': CORRELATION_COPY.cardBody,
    'poker-night': POKER_NIGHT_COPY.cardBody,
    'lichess': GAMES_COPY.outside.links.lichess.body,
    'monkeytype': GAMES_COPY.outside.links.monkeytype.body,
    'codeforces': GAMES_COPY.outside.links.codeforces.body,
    'leetcode': GAMES_COPY.outside.links.leetcode.body,
};
