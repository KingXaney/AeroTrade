'use client';

import Link from "next/link";
import {useState, useTransition} from "react";
import {toast} from "sonner";
import {markCourseLessonDone} from "@/lib/actions/learn.actions";
import {COURSE_COPY} from "@/lib/learn/copy/learn";
import ActionButton, {actionButton} from "@/components/primitives/ActionButton";

type Props = {
    lessonId: string;
    // Done already: by this button on an earlier visit, or by doing the thing the lesson is about.
    done: boolean;
    next: {id: string; title: string} | null;
};

// The end of a lesson: one button that marks it done (markCourseLessonDone stamps the id once),
// then the way on to the next lesson. Reading the lesson is the whole of it — no question and
// no score. The page's own "Done" badge follows on the action's re-render; until then the local
// state says so, so the button never offers itself twice.
const LessonDone = ({lessonId, done, next}: Props) => {
    const [marked, setMarked] = useState(false);
    const [pending, startTransition] = useTransition();
    const isDone = done || marked;

    const mark = () => startTransition(async () => {
        const result = await markCourseLessonDone(lessonId).catch(() => ({success: false as const, message: COURSE_COPY.notSaved}));
        if (result.success) setMarked(true);
        else toast.error(result.message ?? COURSE_COPY.notSaved);
    });

    return (
        <div className="flex flex-wrap items-center justify-between gap-3" data-lesson-finish>
            <p className="text-sm leading-relaxed text-fg-soft" data-lesson-marked={isDone ? '' : undefined}>
                {isDone ? COURSE_COPY.doneLine : COURSE_COPY.markLead}
            </p>
            {!isDone && (
                <ActionButton size="md" onClick={mark} disabled={pending} data-lesson-mark-done>
                    {pending ? COURSE_COPY.marking : COURSE_COPY.markDone}
                </ActionButton>
            )}
            {isDone && next && (
                <Link href={`/learn/course/${next.id}`} className={actionButton({size: 'md'})} data-lesson-continue={next.id}>
                    {COURSE_COPY.nextLesson(next.title)}
                </Link>
            )}
        </div>
    );
};

export default LessonDone;
