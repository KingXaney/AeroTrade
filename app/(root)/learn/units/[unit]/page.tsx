import type {Metadata} from "next";
import Link from "next/link";
import {notFound, redirect} from "next/navigation";
import {getSessionUser} from "@/lib/auth/session";
import {isLabOwner} from "@/lib/lab/owner";
import {getUnitProgress} from "@/lib/lab/page-store";
import {plannedCountByTrack, unitById, unitsOf} from "@/lib/lab/registry";
import {LAB_COPY} from "@/lib/learn/copy/lab";
import {quizPublic} from "@/lib/lab/quiz";
import LabMarkdown from "@/components/lab/LabMarkdown";
import MarkUnitStudied from "@/components/lab/MarkUnitStudied";
import QuizCard from "@/components/lab/QuizCard";
import WhatTheseMean from "@/components/learn/WhatTheseMean";
import {actionButton} from "@/components/primitives/ActionButton";
import MicroLabel from "@/components/primitives/MicroLabel";
import PageTitle from "@/components/primitives/PageTitle";
import Panel from "@/components/primitives/Panel";
import SectionHeading from "@/components/primitives/SectionHeading";

// One unit of the owner's lab (lib/learn/copy/lab/units): its five sections, its sources, the
// app's own metrics it leans on (the glossary's definitions, in one disclosure), its quiz — the
// questions and options rendered here, the answers kept on the server — and the one button that
// marks it studied, live once the quiz is passed. Owner only; an unknown id is a 404.

const SECTION_KEYS = ['idea', 'maths', 'code', 'whyNow', 'pitfalls'] as const;

type UnitPageProps = {params: Promise<{unit: string}>};

export const generateMetadata = async ({params}: UnitPageProps): Promise<Metadata> => {
    const {unit: id} = await params;
    const unit = unitById(id);
    return {title: unit ? unit.title : 'Lab'};
};

const UnitPage = async ({params}: UnitPageProps) => {
    const user = await getSessionUser();
    if (!user) redirect('/sign-in');
    if (!isLabOwner(user.email)) redirect('/games');
    const {unit: id} = await params;
    const unit = unitById(id);
    if (!unit) notFound();

    const [progress, track] = [await getUnitProgress(user.id, unit.id), unitsOf(unit.track)];
    const index = track.findIndex((u) => u.id === unit.id);
    const previous = index > 0 ? track[index - 1] : null;
    const next = index < track.length - 1 ? track[index + 1] : null;

    return (
        <div className="space-y-4" data-lab-unit-page={unit.id}>
            <PageTitle
                title={unit.title}
                subtitle={unit.oneLiner}
                note={`${LAB_COPY.trackOf(unit.track, index + 1, plannedCountByTrack()[unit.track])} · ${LAB_COPY.readingTime(unit.readingMinutes)}`}
                actions={<Link href="/learn" className="label-type text-xs text-brand hover:underline">← {LAB_COPY.backToLab}</Link>}
            />

            {SECTION_KEYS.map((key) => (
                <Panel key={key} id={`lab-section-${key}`} aria-labelledby={`lab-section-${key}-heading`} data-lab-section={key}>
                    <SectionHeading id={`lab-section-${key}-heading`} spacing="sm">{LAB_COPY.sectionHeadings[key]}</SectionHeading>
                    <LabMarkdown>{unit.sections[key]}</LabMarkdown>
                </Panel>
            ))}

            <Panel id="lab-sources" aria-labelledby="lab-sources-heading">
                <SectionHeading id="lab-sources-heading" spacing="sm">{LAB_COPY.sourcesHeading}</SectionHeading>
                <ul className="space-y-2">
                    {unit.sources.map((source) => (
                        <li key={source.url} className="text-sm">
                            <a href={source.url} target="_blank" rel="noopener noreferrer" className="text-fg hover:text-brand hover:underline">{source.title}</a>
                            <MicroLabel as="p" className="mt-0.5 normal-case tracking-normal">{source.kind} · {source.year}{source.note ? ` · ${source.note}` : ''}</MicroLabel>
                        </li>
                    ))}
                </ul>
                <MicroLabel as="p" className="mt-4">{LAB_COPY.cardsHeading(unit.cards.length)}</MicroLabel>
                {unit.glossaryTerms && unit.glossaryTerms.length > 0 && <WhatTheseMean keys={unit.glossaryTerms}/>}
            </Panel>

            <Panel id="lab-quiz" aria-labelledby="lab-quiz-heading">
                <SectionHeading id="lab-quiz-heading" spacing="sm">{LAB_COPY.quiz.heading}</SectionHeading>
                <QuizCard
                    unitId={unit.id}
                    passedOn={progress.quizPassedOn}
                    score={progress.quizScore}
                    questions={quizPublic(unit).map((question) => ({
                        id: question.id,
                        prompt: <LabMarkdown>{question.prompt}</LabMarkdown>,
                        options: question.options.map((option) => <LabMarkdown key={option}>{option}</LabMarkdown>),
                    }))}
                />
            </Panel>

            <Panel id="lab-mark" aria-labelledby="lab-mark-heading">
                <SectionHeading id="lab-mark-heading" spacing="sm">{LAB_COPY.markHeading}</SectionHeading>
                <p className="mb-4 text-sm text-fg-soft">{LAB_COPY.markLead}</p>
                <MarkUnitStudied unitId={unit.id} studiedOn={progress.studiedOn} lastDay={progress.lastDay} quizPassed={progress.quizPassedOn !== null}/>
            </Panel>

            <nav aria-label="Units" className="flex flex-wrap items-center justify-between gap-3">
                {previous ? <Link href={`/learn/units/${previous.id}`} className={actionButton({variant: 'secondary'})} data-lab-previous={previous.id}>← {LAB_COPY.previous}: {previous.title}</Link> : <span/>}
                {next ? <Link href={`/learn/units/${next.id}`} className={actionButton({variant: 'secondary'})} data-lab-next={next.id}>{LAB_COPY.next}: {next.title} →</Link> : <span/>}
            </nav>
        </div>
    );
};

export default UnitPage;
