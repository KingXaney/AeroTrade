import type {Metadata} from "next";
import {Suspense} from "react";
import Link from "next/link";
import {requireUserId} from "@/lib/auth/session";
import {STRATEGIES, STRATEGIES_DISCLAIMER} from "@/lib/strategies/catalog";
import {GLOSSARY} from "@/lib/learn/glossary";
import {GLOSSARY_GROUPS} from "@/lib/learn/where";
import {COURSE_COPY, LEARN_PAGE_COPY} from "@/lib/learn/copy/learn";
import {COURSE_MODULES} from "@/lib/learn/course";
import {getCourseProgress} from "@/lib/learn/course-store";
import {getLearnFacts, getOnboardingFacts} from "@/lib/learn/facts-store";
import {getTodaysLesson} from "@/lib/learn/lesson-store";
import {deriveMissions, onboardingActive} from "@/lib/learn/missions";
import {deriveMoments} from "@/lib/learn/moments";
import {getDailyQuiz} from "@/lib/learn/quiz-store";
import {QUIZ_RUN_WINDOW_DAYS} from "@/lib/learn/quiz";
import {DAILY_QUIZ_COPY, daysAnsweredLine, quizEmptyDescription} from "@/lib/learn/copy/quiz";
import GlossaryHashRedirect from "@/components/learn/GlossaryHashRedirect";
import DailyQuiz from "@/components/dashboard/widgets/learn/DailyQuiz";
import GettingStarted from "@/components/dashboard/widgets/learn/GettingStarted";
import TodaysLesson from "@/components/dashboard/widgets/learn/TodaysLesson";
import EmptyState from "@/components/primitives/EmptyState";
import MicroLabel from "@/components/primitives/MicroLabel";
import PageTitle from "@/components/primitives/PageTitle";
import Panel from "@/components/primitives/Panel";
import SectionHeading from "@/components/primitives/SectionHeading";
import WidgetSkeleton from "@/components/primitives/Skeleton";
import Tabs from "@/components/primitives/Tabs";
import {actionButton} from "@/components/primitives/ActionButton";
import {rowCard} from "@/components/primitives/RowCard";
import {cn} from "@/lib/utils";

// The browser tab's title; app/layout.tsx appends the app's name.
export const metadata: Metadata = {title: "Learn"};

// Everything the app teaches, in one place: the beginner course, today's lesson and question,
// the glossary every label on every page quotes, and the strategies in a line each. One view at
// a time, kept in the URL (?tab=), so only the open view's data is read.

const TAB_IDS = ['course', 'today', 'glossary', 'strategies'] as const;
type TabId = (typeof TAB_IDS)[number];
const isTab = (value: unknown): value is TabId => typeof value === 'string' && (TAB_IDS as readonly string[]).includes(value);

const TABS = TAB_IDS.map((id) => ({id, label: LEARN_PAGE_COPY.tabs[id], href: id === 'course' ? '/learn' : `/learn?tab=${id}`}));

type LearnPageProps = {searchParams: Promise<{tab?: string}>};

const CourseView = async ({userId}: {userId: string}) => {
    const progress = await getCourseProgress(userId);
    return (
        <div className="space-y-4" id="learn-course">
            <Panel aria-labelledby="course-heading" className="flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0 max-w-2xl">
                    <SectionHeading id="course-heading" spacing="sm">{COURSE_COPY.heading}</SectionHeading>
                    <p className="text-sm leading-relaxed text-fg-soft">{progress.next ? COURSE_COPY.lead : COURSE_COPY.complete}</p>
                    <MicroLabel as="p" className="mt-2" id="course-progress">{COURSE_COPY.progress(progress.done, progress.total)}</MicroLabel>
                </div>
                {progress.next && (
                    <Link href={`/learn/course/${progress.next.id}`} className={actionButton({size: 'md'})} data-course-next={progress.next.id}>
                        {COURSE_COPY.continueCta}: {progress.next.title}
                    </Link>
                )}
            </Panel>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {COURSE_MODULES.map((section, m) => {
                    const done = section.lessons.filter((lesson) => progress.doneIds.has(lesson.id)).length;
                    return (
                        <Panel key={section.id} id={`course-${section.id}`} aria-labelledby={`course-${section.id}-heading`}>
                            <div className="mb-1 flex items-center justify-between gap-3">
                                <SectionHeading id={`course-${section.id}-heading`} spacing="none">{`${m + 1}. ${section.title}`}</SectionHeading>
                                <MicroLabel>{COURSE_COPY.moduleDone(done, section.lessons.length)}</MicroLabel>
                            </div>
                            <p className="mb-3 text-xs text-fg-muted">{section.summary}</p>
                            <ol className="space-y-2">
                                {section.lessons.map((lesson) => {
                                    const isDone = progress.doneIds.has(lesson.id);
                                    return (
                                        <li key={lesson.id}>
                                            <Link href={`/learn/course/${lesson.id}`} data-course-lesson={lesson.id} data-done={isDone}
                                                  className={rowCard({interactive: true, className: 'flex items-center gap-3'})}>
                                                <span className={cn('material-symbols-outlined text-lg shrink-0', isDone ? 'text-positive' : 'text-fg-muted')} aria-hidden="true">
                                                    {isDone ? 'check_circle' : 'radio_button_unchecked'}
                                                </span>
                                                <span className={cn('min-w-0 flex-1 truncate text-sm', isDone ? 'text-fg-muted' : 'text-fg')}>{lesson.title}</span>
                                                <span className="sr-only">{isDone ? ' — done' : ' — not yet'}</span>
                                            </Link>
                                        </li>
                                    );
                                })}
                            </ol>
                        </Panel>
                    );
                })}
            </div>
        </div>
    );
};

const LessonAsync = async ({userId}: {userId: string}) => {
    const facts = await getLearnFacts(userId);
    const moment = deriveMoments(facts, facts.today)[0];
    if (moment) return <TodaysLesson moment={moment}/>;
    return <TodaysLesson lesson={await getTodaysLesson(userId)}/>;
};

const QuizAsync = async ({userId}: {userId: string}) => {
    const view = await getDailyQuiz(userId);
    if (view.quiz) return <DailyQuiz quiz={view.quiz} daysAnswered={view.daysAnswered}/>;
    return (
        <EmptyState
            title={DAILY_QUIZ_COPY.emptyTitle}
            description={quizEmptyDescription(QUIZ_RUN_WINDOW_DAYS)}
            note={daysAnsweredLine(view.daysAnswered)}
            className="p-0"
        />
    );
};

const TodayView = async ({userId}: {userId: string}) => {
    const facts = await getOnboardingFacts(userId);
    return (
        <div className="space-y-4" id="learn-today">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Panel aria-labelledby="today-lesson-heading">
                    <SectionHeading id="today-lesson-heading">{LEARN_PAGE_COPY.todayLesson}</SectionHeading>
                    <Suspense fallback={<WidgetSkeleton height={200} rows={3}/>}><LessonAsync userId={userId}/></Suspense>
                </Panel>
                <Panel aria-labelledby="today-quiz-heading">
                    <SectionHeading id="today-quiz-heading">{LEARN_PAGE_COPY.todayQuiz}</SectionHeading>
                    <Suspense fallback={<WidgetSkeleton height={200} rows={4}/>}><QuizAsync userId={userId}/></Suspense>
                </Panel>
            </div>
            {onboardingActive(facts) && (
                <Panel aria-labelledby="today-first-week-heading">
                    <SectionHeading id="today-first-week-heading">{LEARN_PAGE_COPY.todayFirstWeek}</SectionHeading>
                    <GettingStarted missions={deriveMissions(facts)}/>
                </Panel>
            )}
        </div>
    );
};

// The glossary as a page: every definition the app shows inline, grouped by where the number
// lives, with a link to go and look at the real one. The ⌘K palette deep-links to an entry.
const GlossaryView = () => (
    <div className="space-y-4">
        <p className="max-w-3xl text-sm text-fg-soft">{LEARN_PAGE_COPY.glossaryLead}</p>
        {GLOSSARY_GROUPS.map((group) => (
            <Panel key={group.id} id={`learn-${group.id}`}>
                <div className="flex items-center justify-between gap-3 mb-4">
                    <SectionHeading spacing="none">{group.label}</SectionHeading>
                    <Link href={group.home.href} className="font-mono text-[11px] text-brand hover:underline">
                        {group.home.label} →
                    </Link>
                </div>
                <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                    {group.keys.map((key) => {
                        const entry = GLOSSARY[key];
                        return (
                            <div key={key} id={key} className="scroll-mt-24 min-w-0" data-learn-entry={key}>
                                <dt className="font-heading text-xs font-semibold text-fg">{entry.term}</dt>
                                <dd className="text-xs text-fg-muted leading-relaxed">
                                    {entry.long}
                                    {entry.formula && (
                                        <span className="block font-mono text-[10px] text-fg-muted/80 mt-0.5">{entry.formula}</span>
                                    )}
                                    {entry.seeAlso && entry.seeAlso.length > 0 && (
                                        <span className="block mt-0.5 font-mono text-[10px] text-fg-muted">
                                            See also:{' '}
                                            {entry.seeAlso.map((other, i) => (
                                                <span key={other}>
                                                    {i > 0 ? ', ' : ''}
                                                    <a href={`#${other}`} className="text-brand hover:underline">{GLOSSARY[other as keyof typeof GLOSSARY]?.term ?? other}</a>
                                                </span>
                                            ))}
                                        </span>
                                    )}
                                </dd>
                            </div>
                        );
                    })}
                </dl>
            </Panel>
        ))}
    </div>
);

const StrategiesView = () => (
    <Panel id="learn-strategies">
        <SectionHeading>{LEARN_PAGE_COPY.strategiesHeading}</SectionHeading>
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
            {STRATEGIES.map((def) => (
                <li key={def.id} className="min-w-0">
                    <Link href={`/strategies/${def.id}`} className="font-heading text-sm font-semibold text-fg hover:text-brand transition-colors">
                        {def.name}
                    </Link>
                    <p className="text-xs text-fg-soft mt-0.5">{def.explainer.beginnerLine}</p>
                    <MicroLabel as="p" className="mt-0.5 normal-case tracking-normal">{def.family} · {def.explainer.summary}</MicroLabel>
                </li>
            ))}
        </ul>
    </Panel>
);

const LearnPage = async ({searchParams}: LearnPageProps) => {
    const userId = await requireUserId();
    const {tab: tabParam} = await searchParams;
    const tab: TabId = isTab(tabParam) ? tabParam : 'course';

    return (
        <div className="space-y-4">
            <GlossaryHashRedirect onGlossary={tab === 'glossary'}/>
            <PageTitle
                title="Learn"
                subtitle={LEARN_PAGE_COPY.subtitle}
                note={LEARN_PAGE_COPY.note}
            />
            <Tabs tabs={TABS} active={tab} label="Learn sections"/>

            {tab === 'course' && <CourseView userId={userId}/>}
            {tab === 'today' && <TodayView userId={userId}/>}
            {tab === 'glossary' && <GlossaryView/>}
            {tab === 'strategies' && <StrategiesView/>}

            <MicroLabel as="p" className="text-center">
                {STRATEGIES_DISCLAIMER}
            </MicroLabel>
        </div>
    );
};

export default LearnPage;
