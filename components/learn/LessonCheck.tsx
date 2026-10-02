'use client';

import {useState, useTransition} from "react";
import {toast} from "sonner";
import {cn} from "@/lib/utils";
import {markCourseLessonDone} from "@/lib/actions/learn.actions";
import {COURSE_COPY} from "@/lib/learn/copy/learn";
import type {CourseCheck} from "@/lib/learn/course-types";

// A lesson's one question. Choosing an option reveals which is right and why, and — whichever
// was chosen — marks the lesson done: the point is to have met the question, not to have passed
// it. No score, no streak. The stamp is written once; answering again changes nothing.
const LessonCheck = ({lessonId, check, done}: {lessonId: string; check: CourseCheck; done: boolean}) => {
    const [chosen, setChosen] = useState<number | null>(null);
    const [pending, startTransition] = useTransition();
    const revealed = chosen !== null;

    const choose = (index: number) => {
        if (revealed) return;
        setChosen(index);
        if (done) return;
        startTransition(async () => {
            const result = await markCourseLessonDone(lessonId).catch(() => ({success: false as const, message: COURSE_COPY.notSaved}));
            if (!result.success) toast.error(result.message ?? COURSE_COPY.notSaved);
        });
    };

    return (
        <div data-lesson-check>
            <p className="text-sm font-semibold text-fg">{check.question}</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-3" role="group" aria-label={COURSE_COPY.checkHeading}>
                {check.options.map((option, index) => {
                    const right = index === check.answer;
                    return (
                        <button
                            key={option}
                            type="button"
                            disabled={pending && !revealed}
                            aria-pressed={chosen === index}
                            data-option={index}
                            onClick={() => choose(index)}
                            className={cn(
                                'row-card px-4 py-3 text-left text-sm transition-colors',
                                !revealed && 'text-fg hover:border-brand/40',
                                revealed && right && 'border-positive/50 text-positive',
                                revealed && !right && chosen === index && 'border-negative/50 text-negative',
                                revealed && !right && chosen !== index && 'text-fg-muted',
                            )}
                        >
                            {option}
                        </button>
                    );
                })}
            </div>
            {revealed && (
                <p className="mt-3 text-sm leading-relaxed text-fg-soft" role="status" data-lesson-explain>
                    <span className="font-semibold text-fg">{chosen === check.answer ? COURSE_COPY.right : COURSE_COPY.wrong}</span>{' '}
                    {check.explain}
                </p>
            )}
        </div>
    );
};

export default LessonCheck;
