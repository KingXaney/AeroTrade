// The shape of a beginner-course lesson's text (lib/learn/copy/course/*). Import-free apart
// from the glossary's key type, so the copy files and lib/learn/course.ts can both use it
// without a cycle.

import type {GlossaryKey} from "@/lib/learn/glossary";

// The first-week facts a lesson can also be completed by: doing the thing the lesson is about.
export type CourseFact = 'hasUserTrade' | 'followedStrategies' | 'topicOpened' | 'hasWatchlist';

export type CourseCheck = {
    question: string;
    options: readonly string[];
    // Index into `options`.
    answer: number;
    // Shown once an option is chosen, whichever it was.
    explain: string;
};

export type CourseLessonCopy = {
    // The lesson's address (/learn/course/<id>) and the key its completion is stamped under.
    // Never renamed: a stored id never changes meaning.
    id: string;
    title: string;
    // Two or three framing sentences. They say what the listed definitions do not.
    intro: readonly string[];
    // The glossary entries printed beside the lesson, from lib/learn/glossary.ts only.
    terms: readonly GlossaryKey[];
    // The real screen the lesson is about.
    tryIt: {label: string; href: string};
    check: CourseCheck;
    doneFrom?: CourseFact;
};
