// The beginner course: its structure (lib/learn/course.ts) and every sentence of it
// (lib/learn/copy/course/*), held to the 'copy' tier of lib/learn/banned.ts and to the rule that
// a lesson frames its terms without restating their definitions.

import {describe, expect, it} from 'vitest';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {findBanned} from '@/lib/learn/banned';
import {GLOSSARY, isGlossaryKey} from '@/lib/learn/glossary';
import {COURSE_LESSON_IDS, COURSE_LESSONS, COURSE_MODULES, courseProgress, lessonById, neighbours, type CourseFacts} from '@/lib/learn/course';
import {COURSE_COPY} from '@/lib/learn/copy/learn';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const NOTHING: CourseFacts = {hasUserTrade: false, followedStrategies: [], topicOpened: false, hasWatchlist: false};

const clean = (text: string) => {
    expect(text, text).not.toMatch(/undefined|NaN|null|\[object|Infinity/);
    expect(findBanned(text, 'copy'), text).toEqual([]);
};

// The same run test lib/learn/__tests__/panel-method.test.ts applies to a panel's lead.
const RUN = 5;
const words = (text: string): string[] => text.toLowerCase().replace(/[^a-z0-9%]+/g, ' ').trim().split(' ').filter(Boolean);
const sentences = (text: string): string[] => text.split(/(?<=[.;])\s+/).filter((s) => s.trim().length > 0);
const runs = (sentence: string): Set<string> => {
    const w = words(sentence);
    const out = new Set<string>();
    for (let i = 0; i + RUN <= w.length; i += 1) out.add(w.slice(i, i + RUN).join(' '));
    return out;
};

describe('the course registry', () => {
    it('is four modules of four lessons, numbered in reading order', () => {
        expect(COURSE_MODULES.map((m) => m.id)).toEqual(['market', 'trade', 'portfolio', 'news']);
        for (const section of COURSE_MODULES) expect(section.lessons.length, section.id).toBe(4);
        expect(COURSE_LESSONS.map((l) => l.number)).toEqual(Array.from({length: 16}, (_, i) => i + 1));
    });

    it('gives every lesson an id that is its own and fit for a URL', () => {
        expect(new Set(COURSE_LESSON_IDS).size).toBe(COURSE_LESSON_IDS.length);
        for (const id of COURSE_LESSON_IDS) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
        expect(lessonById('the-order-ticket')?.moduleId).toBe('trade');
        expect(lessonById('no-such-lesson')).toBeUndefined();
    });

    it('lists only glossary terms, each once', () => {
        for (const lesson of COURSE_LESSONS) {
            expect(lesson.terms.length, lesson.id).toBeGreaterThan(0);
            expect(new Set(lesson.terms).size, lesson.id).toBe(lesson.terms.length);
            for (const key of lesson.terms) expect(isGlossaryKey(key), `${lesson.id}: ${key}`).toBe(true);
        }
    });

    it('sends "try it" to a page that exists', () => {
        for (const lesson of COURSE_LESSONS) {
            const path = lesson.tryIt.href.split(/[?#]/)[0];
            const file = path.startsWith('/stocks/') ? 'app/(root)/stocks/[symbol]/page.tsx'
                : path.startsWith('/strategies/') ? 'app/(root)/strategies/[slug]/page.tsx'
                : `app/(root)${path}/page.tsx`;
            expect(existsSync(`${root}${file}`), `${lesson.id}: ${lesson.tryIt.href}`).toBe(true);
        }
    });

    it('asks one question with one right answer among three', () => {
        for (const lesson of COURSE_LESSONS) {
            const {check} = lesson;
            expect(check.options.length, lesson.id).toBe(3);
            expect(new Set(check.options).size, lesson.id).toBe(3);
            expect(Number.isInteger(check.answer) && check.answer >= 0 && check.answer < 3, lesson.id).toBe(true);
        }
    });
});

describe('the course text', () => {
    it('never advises, in any line', () => {
        for (const section of COURSE_MODULES) {
            clean(section.title);
            clean(section.summary);
        }
        for (const lesson of COURSE_LESSONS) {
            clean(lesson.title);
            lesson.intro.forEach(clean);
            clean(lesson.tryIt.label);
            clean(lesson.check.question);
            lesson.check.options.forEach(clean);
            clean(lesson.check.explain);
        }
        for (const value of Object.values(COURSE_COPY)) {
            if (typeof value === 'string') clean(value);
        }
        for (const text of [COURSE_COPY.progress(3, 16), COURSE_COPY.lessonOf(2, 16), COURSE_COPY.moduleDone(2, 4)]) clean(text);
    });

    it('frames in two or three sentences', () => {
        for (const lesson of COURSE_LESSONS) {
            expect(lesson.intro.length, lesson.id).toBeGreaterThanOrEqual(2);
            expect(lesson.intro.length, lesson.id).toBeLessThanOrEqual(3);
        }
    });

    it('says what its definitions do not: no lesson repeats a run of a term it lists', () => {
        const repeats = COURSE_LESSONS.flatMap((lesson) => lesson.intro.flatMap(sentences).flatMap((sentence) => {
            const own = runs(sentence);
            return lesson.terms.flatMap((key) => sentences(GLOSSARY[key].long).flatMap((definition) =>
                [...runs(definition)].filter((run) => own.has(run)).map((run) => `${lesson.id} / ${key}: "${run}"`)));
        }));
        expect(repeats).toEqual([]);
    });
});

describe('courseProgress', () => {
    it('starts at the first lesson with nothing done', () => {
        const progress = courseProgress([], NOTHING);
        expect([progress.done, progress.total, progress.next?.id]).toEqual([0, 16, COURSE_LESSON_IDS[0]]);
    });

    it('counts a stamped lesson and moves on to the next not done', () => {
        const progress = courseProgress([COURSE_LESSON_IDS[0], COURSE_LESSON_IDS[2]], NOTHING);
        expect(progress.done).toBe(2);
        expect(progress.next?.id).toBe(COURSE_LESSON_IDS[1]);
    });

    it('counts a lesson done by doing the thing it is about', () => {
        const progress = courseProgress([], {...NOTHING, hasUserTrade: true, followedStrategies: ['sixty-forty']});
        expect([...progress.doneIds].sort()).toEqual(['a-rule-instead-of-a-hunch', 'the-order-ticket']);
        expect(courseProgress([], {...NOTHING, topicOpened: true, hasWatchlist: true}).done).toBe(2);
    });

    it('counts a lesson once when it is both stamped and done', () => {
        expect(courseProgress(['the-order-ticket', 'the-order-ticket'], {...NOTHING, hasUserTrade: true}).done).toBe(1);
    });

    it('ignores an id the registry does not have', () => {
        expect(courseProgress(['a-lesson-since-removed', '__proto__'], NOTHING).done).toBe(0);
    });

    it('has no next lesson once every one is done', () => {
        const progress = courseProgress([...COURSE_LESSON_IDS], NOTHING);
        expect([progress.done, progress.next]).toEqual([16, null]);
    });
});

describe('neighbours', () => {
    it('steps through the course in reading order, across modules', () => {
        expect(neighbours(COURSE_LESSON_IDS[0])).toMatchObject({previous: null, next: {id: COURSE_LESSON_IDS[1]}});
        expect(neighbours(COURSE_LESSON_IDS[3]).next?.moduleId).toBe('trade');
        expect(neighbours(COURSE_LESSON_IDS[15])).toMatchObject({previous: {id: COURSE_LESSON_IDS[14]}, next: null});
        expect(neighbours('no-such-lesson')).toEqual({previous: null, next: null});
    });
});
