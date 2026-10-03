// The beginner course: four modules of four short lessons, in one fixed order. Pure — the text
// is lib/learn/copy/course/*, the stamps are read by lib/learn/course-store.ts.
//
// A lesson is done when the reader marked it done (a stamp-once id in the `learn` preference
// sub-schema, written by lib/actions/learn.actions.markCourseLessonDone) or when the reader has
// done the thing it is about — a first paper trade completes "The order ticket". Derived from
// rows first, a stamp second (invariant 9); no flag says "is a learner".

import {MARKET_LESSONS, MARKET_MODULE} from "@/lib/learn/copy/course/market";
import {NEWS_LESSONS, NEWS_MODULE} from "@/lib/learn/copy/course/news";
import {PORTFOLIO_LESSONS, PORTFOLIO_MODULE} from "@/lib/learn/copy/course/portfolio";
import {TRADE_LESSONS, TRADE_MODULE} from "@/lib/learn/copy/course/trade";
import type {CourseFact, CourseLessonCopy} from "@/lib/learn/course-types";
import type {OnboardingFacts} from "@/lib/learn/facts";

export type CourseModule = {id: string; title: string; summary: string; lessons: readonly CourseLessonCopy[]};

export const COURSE_MODULES: readonly CourseModule[] = [
    {...MARKET_MODULE, lessons: MARKET_LESSONS},
    {...TRADE_MODULE, lessons: TRADE_LESSONS},
    {...PORTFOLIO_MODULE, lessons: PORTFOLIO_LESSONS},
    {...NEWS_MODULE, lessons: NEWS_LESSONS},
];

export type CourseLesson = CourseLessonCopy & {moduleId: string; moduleTitle: string; number: number};

// Every lesson in reading order, numbered from one across the whole course.
export const COURSE_LESSONS: readonly CourseLesson[] = COURSE_MODULES
    .flatMap((section) => section.lessons.map((lesson) => ({...lesson, moduleId: section.id, moduleTitle: section.title})))
    .map((lesson, i) => ({...lesson, number: i + 1}));

export const COURSE_LESSON_IDS: readonly string[] = COURSE_LESSONS.map((lesson) => lesson.id);

export const lessonById = (id: string): CourseLesson | undefined => COURSE_LESSONS.find((lesson) => lesson.id === id);

// What the page needs of the first-week facts; a subset, so a test builds it by hand.
export type CourseFacts = Pick<OnboardingFacts, 'hasUserTrade' | 'followedStrategies' | 'topicOpened' | 'hasWatchlist'>;

const FACT: Record<CourseFact, (facts: CourseFacts) => boolean> = {
    hasUserTrade: (f) => f.hasUserTrade,
    followedStrategies: (f) => f.followedStrategies.length > 0,
    topicOpened: (f) => f.topicOpened,
    hasWatchlist: (f) => f.hasWatchlist,
};

export const lessonDone = (lesson: CourseLessonCopy, stamped: ReadonlySet<string>, facts: CourseFacts): boolean =>
    stamped.has(lesson.id) || (lesson.doneFrom !== undefined && FACT[lesson.doneFrom](facts));

export type CourseProgress = {
    done: number;
    total: number;
    // The ids that count as done, stamped or derived.
    doneIds: ReadonlySet<string>;
    // The first lesson in reading order not yet done; null once the course is complete.
    next: CourseLesson | null;
};

// `stamped` is whatever the preference holds: ids the registry no longer has are ignored, so
// a removed lesson can never count toward the total.
export const courseProgress = (stamped: readonly string[], facts: CourseFacts): CourseProgress => {
    const known = new Set(stamped.filter((id) => COURSE_LESSON_IDS.includes(id)));
    const doneIds = new Set(COURSE_LESSONS.filter((lesson) => lessonDone(lesson, known, facts)).map((lesson) => lesson.id));
    return {
        done: doneIds.size,
        total: COURSE_LESSONS.length,
        doneIds,
        next: COURSE_LESSONS.find((lesson) => !doneIds.has(lesson.id)) ?? null,
    };
};

// The lessons either side of one, in reading order.
export const neighbours = (id: string): {previous: CourseLesson | null; next: CourseLesson | null} => {
    const i = COURSE_LESSONS.findIndex((lesson) => lesson.id === id);
    if (i < 0) return {previous: null, next: null};
    return {previous: COURSE_LESSONS[i - 1] ?? null, next: COURSE_LESSONS[i + 1] ?? null};
};
