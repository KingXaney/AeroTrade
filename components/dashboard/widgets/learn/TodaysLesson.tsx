import Link from "next/link";
import MicroLabel from "@/components/primitives/MicroLabel";
import Term from "@/components/primitives/Term";
import GotItButton from "@/components/dashboard/widgets/learn/GotItButton";
import {GLOSSARY} from "@/lib/learn/glossary";
import {safeArticleUrl, type Lesson} from "@/lib/learn/lesson";
import type {Moment} from "@/lib/learn/moments";
import {LESSON_COPY, lessonCountLine, lessonLearnHref, momentCopy} from "@/lib/learn/copy/lesson";

// Today's lesson: a first from the learner's own account (or a followed strategy's rebalance)
// while it is fresh, else the glossary concept today's topic articles used, else the concept of
// the day. A dashboard widget, so labels carry titles (<Term>) and nothing else: no "What these
// mean" disclosure and no "Ask in chat" link (invariant 12). Every sentence comes from
// lib/learn/copy/lesson.ts or the glossary; headlines are rendered as text, never as HTML.

const MomentBody = ({moment}: {moment: Moment}) => {
    const copy = momentCopy(moment);
    return (
        <div id="todays-lesson-moment" data-lesson-moment={moment.kind}>
            <MicroLabel>{copy.label}</MicroLabel>
            <h3 className="mt-1 font-heading text-base font-semibold text-fg">{copy.title}</h3>
            <p className="mt-1 font-mono text-sm text-fg" data-lesson-figure>{copy.figure}</p>
            <div className="mt-2 space-y-1.5">
                {copy.body.map((sentence) => (
                    <p key={sentence} className="text-xs text-fg-muted leading-relaxed">{sentence}</p>
                ))}
            </div>
            <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <MicroLabel>{LESSON_COPY.termsLabel}</MicroLabel>
                {copy.terms.map((key) => <Term key={key} k={key} className="text-xs text-fg-soft" />)}
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
                <Link href={copy.href} className="font-mono text-[11px] text-brand hover:underline">{copy.linkLabel}</Link>
                <GotItButton lessonId={moment.id} label={LESSON_COPY.gotIt} pendingLabel={LESSON_COPY.saving} failedLabel={LESSON_COPY.notSaved} />
            </div>
        </div>
    );
};

const ConceptBody = ({lesson}: {lesson: Lesson}) => {
    const entry = GLOSSARY[lesson.key];
    return (
        <div id="todays-lesson-concept" data-lesson-concept={lesson.key} data-lesson-mode={lesson.mode}>
            <MicroLabel>{lesson.mode === 'feed' ? LESSON_COPY.feedLabel : LESSON_COPY.dayLabel}</MicroLabel>
            <h3 className="mt-1 font-heading text-base font-semibold text-fg">{entry.term}</h3>
            <p className="mt-1 text-sm text-fg leading-relaxed">{entry.short}</p>
            <p className="mt-1.5 text-xs text-fg-muted leading-relaxed">{entry.long}</p>
            {lesson.mode === 'feed' ? (
                <div className="mt-3">
                    <p className="font-mono text-[11px] text-fg-muted" data-lesson-count>{lessonCountLine(lesson.count)}</p>
                    <ul className="mt-1.5 space-y-1.5" data-lesson-headlines>
                        {lesson.headlines.map((item) => {
                            const href = safeArticleUrl(item.url);
                            return (
                                <li key={item.contentHash} className="text-xs leading-snug" data-lesson-headline>
                                    {href
                                        ? <a href={href} target="_blank" rel="noopener noreferrer" className="text-fg hover:text-brand transition-colors">{item.headline}</a>
                                        : <span className="text-fg">{item.headline}</span>}
                                    {item.source && <span className="ml-1.5 font-mono text-[10px] text-fg-muted">{item.source}</span>}
                                </li>
                            );
                        })}
                    </ul>
                </div>
            ) : (
                <p className="mt-3 font-mono text-[11px] text-fg-muted" data-lesson-no-matches>{LESSON_COPY.noMatches}</p>
            )}
            <Link href={lessonLearnHref(lesson.key)} className="mt-3 inline-block font-mono text-[11px] text-brand hover:underline">
                {LESSON_COPY.learnLink}
            </Link>
        </div>
    );
};

type Props = {moment: Moment; lesson?: never} | {lesson: Lesson; moment?: never};

const TodaysLesson = (props: Props) => (props.moment ? <MomentBody moment={props.moment} /> : <ConceptBody lesson={props.lesson} />);

export default TodaysLesson;
