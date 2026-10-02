import Link from "next/link";
import {notFound} from "next/navigation";
import {requireUserId} from "@/lib/auth/session";
import {COURSE_LESSONS, lessonById, neighbours} from "@/lib/learn/course";
import {getCourseProgress} from "@/lib/learn/course-store";
import {COURSE_COPY} from "@/lib/learn/copy/learn";
import {GLOSSARY} from "@/lib/learn/glossary";
import LessonCheck from "@/components/learn/LessonCheck";
import Badge from "@/components/primitives/Badge";
import MicroLabel from "@/components/primitives/MicroLabel";
import PageTitle from "@/components/primitives/PageTitle";
import Panel from "@/components/primitives/Panel";
import SectionHeading from "@/components/primitives/SectionHeading";
import {actionButton} from "@/components/primitives/ActionButton";

type LessonPageProps = {params: Promise<{lesson: string}>};

// One lesson of the beginner course: a few framing sentences, the glossary's own definitions of
// the words it uses (quoted from lib/learn/glossary.ts, never paraphrased — invariant 12), a
// link to the real screen, and one question. Its text is lib/learn/copy/course/*.
const LessonPage = async ({params}: LessonPageProps) => {
    const userId = await requireUserId();
    const lesson = lessonById((await params).lesson);
    if (!lesson) notFound();

    const progress = await getCourseProgress(userId);
    const done = progress.doneIds.has(lesson.id);
    const {previous, next} = neighbours(lesson.id);

    return (
        <div className="mx-auto max-w-3xl space-y-4" data-lesson={lesson.id}>
            <Link href="/learn" className="label-type text-xs text-brand hover:underline">← {COURSE_COPY.backToCourse}</Link>
            <PageTitle
                title={lesson.title}
                subtitle={`${lesson.moduleTitle} · ${COURSE_COPY.lessonOf(lesson.number, COURSE_LESSONS.length)}`}
                actions={done ? <Badge tone="positive" variant="outline" id="lesson-done">{COURSE_COPY.doneLabel}</Badge> : undefined}
            />

            <Panel pad={6}>
                <div className="space-y-3">
                    {lesson.intro.map((sentence) => (
                        <p key={sentence} className="text-base leading-relaxed text-fg">{sentence}</p>
                    ))}
                </div>
            </Panel>

            <Panel aria-labelledby="lesson-terms">
                <SectionHeading id="lesson-terms">{COURSE_COPY.termsHeading}</SectionHeading>
                <dl className="space-y-3">
                    {lesson.terms.map((key) => (
                        <div key={key} data-lesson-term={key}>
                            <dt className="font-heading text-sm font-semibold text-fg">{GLOSSARY[key].term}</dt>
                            <dd className="mt-0.5 text-sm leading-relaxed text-fg-muted">{GLOSSARY[key].long}</dd>
                        </div>
                    ))}
                </dl>
            </Panel>

            <Panel aria-labelledby="lesson-try" className="flex flex-wrap items-center justify-between gap-3">
                <SectionHeading id="lesson-try" spacing="none">{COURSE_COPY.tryHeading}</SectionHeading>
                <Link href={lesson.tryIt.href} className={actionButton({variant: 'secondary', size: 'md'})} data-lesson-try>{lesson.tryIt.label}</Link>
            </Panel>

            <Panel aria-labelledby="lesson-check">
                <SectionHeading id="lesson-check">{COURSE_COPY.checkHeading}</SectionHeading>
                <LessonCheck lessonId={lesson.id} check={lesson.check} done={done}/>
            </Panel>

            <nav aria-label="Lessons" className="flex items-center justify-between gap-3 pt-2">
                {previous ? (
                    <Link href={`/learn/course/${previous.id}`} className="min-w-0 text-left" data-lesson-previous>
                        <MicroLabel as="span" className="block">{COURSE_COPY.previous}</MicroLabel>
                        <span className="block truncate text-sm text-fg hover:text-brand">{previous.title}</span>
                    </Link>
                ) : <span/>}
                {next ? (
                    <Link href={`/learn/course/${next.id}`} className="min-w-0 text-right" data-lesson-next>
                        <MicroLabel as="span" className="block">{COURSE_COPY.next}</MicroLabel>
                        <span className="block truncate text-sm text-fg hover:text-brand">{next.title}</span>
                    </Link>
                ) : <span/>}
            </nav>
        </div>
    );
};

export default LessonPage;
