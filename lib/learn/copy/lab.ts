// Copy for the owner's lab at /learn and its unit pages: every heading, button, count line and
// empty state. Every sentence is held to the 'copy' tier of lib/learn/banned.ts by
// lib/learn/__tests__/lab-copy.test.ts; the units themselves are the bank in ./lab/ (server-only).

import type {LabTrack} from "@/lib/learn/copy/lab/types";

export const LAB_TRACK_LABELS: Readonly<Record<LabTrack, string>> = {cv: 'Computer vision', ml: 'Machine learning', quant: 'Quantitative finance'};

export const LAB_COPY = {
    title: 'Lab',
    subtitle: 'A daily study of computer vision, machine learning and quantitative finance: one unit, the cards due, a problem and the day\'s papers.',
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

    // Progress.
    progressHeading: 'Progress',
    unitsOf: (done: number, total: number): string => `${done} of ${total}`,
    unitsLabel: 'units studied',
    learnedLabel: 'cards learned',
    dueLabel: 'due today',
    streakLabel: 'streak',
    streakRule: 'A day counts when a card is graded or a unit is marked studied before midnight Eastern. A day with neither starts the count again.',
    sessionDoneToday: 'Today counts.',
    sessionAtRisk: (days: number): string => `Grade a card or mark a unit today to keep the ${days}-day streak.`,
    sessionStart: 'Grade a card or mark a unit to start a streak.',

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
