// Copy for the /learn hub's frame: its title lines, its tabs and the heading over the
// strategies' one-line summaries, and (COURSE_COPY) the lines around the beginner course. The
// definitions themselves are lib/learn/glossary.ts, the lessons lib/learn/copy/course/*, and the
// strategy lines are the catalog's, and so is their count; the tests hold these to the 'copy'
// tier of lib/learn/banned.ts.

import {STRATEGIES} from "@/lib/strategies/catalog";
import {numberWord} from "@/lib/text";

export const LEARN_PAGE_COPY = {
    subtitle: 'A short course from the start, a lesson and a question each day, and what every number in AeroTrade measures.',
    glossaryLead: 'What every number in AeroTrade measures, in the app\'s own words — and where to see the real one on your account.',
    note: 'Definitions describe. No definition is a recommendation.',
    strategiesHeading: `The ${numberWord(STRATEGIES.length)} strategies, one line each`,
    tabs: {course: 'Course', today: 'Today', glossary: 'Glossary', strategies: 'Strategies'},
    todayLesson: "Today's lesson",
    todayQuiz: 'Daily quiz',
    todayFirstWeek: 'First week',
} as const;

// The beginner course's frame: the lines around the lessons.
export const COURSE_COPY = {
    heading: 'The beginner course',
    lead: 'Sixteen short lessons, from what a share is to how a headline becomes a narrative. Each takes a minute or two and ends on one question.',
    // "3 of 16 lessons done"
    progress: (done: number, total: number): string => `${done} of ${total} lessons done`,
    // "2 of 4 done"
    moduleDone: (done: number, total: number): string => `${done} of ${total} done`,
    // "Lesson 2 of 16"
    lessonOf: (number: number, total: number): string => `Lesson ${number} of ${total}`,
    complete: 'Every lesson is done. The glossary and the daily lesson carry on from here.',
    continueHeading: 'Continue the course',
    continueCta: 'Open the lesson',
    backToCourse: 'All lessons',
    termsHeading: 'Words in this lesson',
    tryHeading: 'See it on a real screen',
    checkHeading: 'One question',
    right: 'That is it.',
    wrong: 'Not that one.',
    saved: 'Lesson marked done',
    notSaved: 'Could not save that — the lesson is not marked done yet',
    notSignedIn: 'Not authenticated',
    invalid: 'That is not a lesson',
    previous: 'Previous',
    next: 'Next',
    doneLabel: 'Done',
} as const;
