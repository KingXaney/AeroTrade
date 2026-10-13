import type {Metadata} from "next";
import Link from "next/link";
import {redirect} from "next/navigation";
import {getSessionUser} from "@/lib/auth/session";
import {isLabOwner} from "@/lib/lab/owner";
import {getLabView} from "@/lib/lab/page-store";
import type {LabView} from "@/lib/lab/view";
import {LAB_COPY, LAB_TRACK_LABELS} from "@/lib/learn/copy/lab";
import LabMarkdown from "@/components/lab/LabMarkdown";
import LabProgress from "@/components/lab/LabProgress";
import ProblemCard from "@/components/lab/ProblemCard";
import ReviewDeck from "@/components/lab/ReviewDeck";
import LearnRedirect from "@/components/learn/LearnRedirect";
import {actionButton} from "@/components/primitives/ActionButton";
import Badge from "@/components/primitives/Badge";
import MicroLabel from "@/components/primitives/MicroLabel";
import PageTitle from "@/components/primitives/PageTitle";
import Panel from "@/components/primitives/Panel";
import {rowCard} from "@/components/primitives/RowCard";
import SectionHeading from "@/components/primitives/SectionHeading";
import Tabs from "@/components/primitives/Tabs";
import {cn} from "@/lib/utils";

// The browser tab's title; app/layout.tsx appends the app's name.
export const metadata: Metadata = {title: "Lab"};

// The owner's lab (lib/lab): a daily study of computer vision, machine learning and
// quantitative finance, for the accounts LAB_OWNER_EMAILS names. One view at a time in the URL
// (?view=): Today — the unit, the cards due, the problem, the progress — and the Library, the
// syllabus. Every other account's /learn goes to the games — on the client, so a /learn#term
// address from the glossary's days as a tab of this page keeps its hash on the way to /glossary
// (components/learn/LearnRedirect). One read, getLabView, shaped by the pure lib/lab/view.

const VIEW_IDS = ['today', 'library'] as const;
type ViewId = (typeof VIEW_IDS)[number];
const isView = (value: unknown): value is ViewId => typeof value === 'string' && (VIEW_IDS as readonly string[]).includes(value);
const TABS = VIEW_IDS.map((id) => ({id, label: LAB_COPY.views[id], href: id === 'today' ? '/learn' : `/learn?view=${id}`}));

type LearnPageProps = {searchParams: Promise<{tab?: string; view?: string}>};

const UnitPanel = ({today}: {today: LabView['today']}) => (
    <Panel id="lab-unit" aria-labelledby="lab-unit-heading" data-lab-unit={today.kind}>
        <SectionHeading id="lab-unit-heading" spacing="sm">{LAB_COPY.unitHeading[today.kind]}</SectionHeading>
        {today.kind === 'nothing-written' ? (
            <p className="text-sm text-fg-soft">{today.next ? LAB_COPY.nothingWritten(today.next.title) : LAB_COPY.nothingAtAll}</p>
        ) : (
            <div data-lab-unit-id={today.unit.id}>
                <MicroLabel as="p">{LAB_TRACK_LABELS[today.unit.track]} · {LAB_COPY.readingTime(today.unit.readingMinutes)} · {LAB_COPY.cardsCount(today.unit.cards)}</MicroLabel>
                <h3 className="mt-1 font-heading text-lg font-semibold text-fg">{today.unit.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-fg-soft">{today.unit.oneLiner}</p>
                {today.kind === 'revisit' && <MicroLabel as="p" className="mt-2 normal-case tracking-normal">{LAB_COPY.revisitLine(today.firstDay, today.lastDay)}</MicroLabel>}
                <div className="mt-4">
                    <Link href={`/learn/units/${today.unit.id}`} className={actionButton({variant: today.kind === 'study' ? 'primary' : 'secondary', size: 'md'})} data-lab-open-unit={today.unit.id}>
                        {LAB_COPY.openUnit}
                    </Link>
                </div>
            </div>
        )}
    </Panel>
);

const TodayView = ({view}: {view: LabView}) => (
    <div className="space-y-4" id="lab-today">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <UnitPanel today={view.today}/>
            <Panel id="lab-review" aria-labelledby="lab-review-heading">
                <div className="mb-3 flex items-center justify-between gap-3">
                    <SectionHeading id="lab-review-heading" spacing="none">{LAB_COPY.reviewHeading}</SectionHeading>
                    <MicroLabel data-lab-review-due={view.review.summary.due}>{LAB_COPY.reviewDue(view.review.summary.due)}</MicroLabel>
                </div>
                <ReviewDeck cards={view.review.queue.map((card) => ({
                    cardId: card.cardId, unitTitle: card.unitTitle, why: card.why,
                    front: <LabMarkdown>{card.front}</LabMarkdown>, back: <LabMarkdown>{card.back}</LabMarkdown>,
                }))}/>
            </Panel>
        </div>
        {view.problem && (
            <Panel id="lab-problem" aria-labelledby="lab-problem-heading">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <SectionHeading id="lab-problem-heading" spacing="none">{LAB_COPY.problemHeading}</SectionHeading>
                    <MicroLabel>{view.problem.unitTitle} · {LAB_COPY.kinds[view.problem.kind]}</MicroLabel>
                </div>
                <h3 className="mb-2 font-heading text-base font-semibold text-fg">{view.problem.title}</h3>
                <ProblemCard
                    problemId={view.problem.id}
                    numeric={view.problem.numeric}
                    unit={view.problem.unit}
                    hints={view.problem.hints}
                    closedLine={view.problem.closed ? LAB_COPY.closedOn(view.problem.closed.day, view.problem.closed.how) : null}
                    statement={<LabMarkdown>{view.problem.statement}</LabMarkdown>}
                    solution={view.problem.solution !== null ? <LabMarkdown>{view.problem.solution}</LabMarkdown> : null}
                />
            </Panel>
        )}
        <Panel id="lab-progress" aria-labelledby="lab-progress-heading">
            <SectionHeading id="lab-progress-heading" spacing="sm">{LAB_COPY.progressHeading}</SectionHeading>
            <LabProgress progress={view.progress}/>
        </Panel>
    </div>
);

const LibraryView = ({view}: {view: LabView}) => (
    <div className="space-y-4" id="lab-library">
        <p className="max-w-3xl text-sm text-fg-soft">{LAB_COPY.libraryLead}</p>
        {view.library.map(({track, rows}) => {
            const progress = view.progress.perTrack.find((t) => t.track === track);
            return (
                <Panel key={track} id={`lab-track-${track}`} aria-labelledby={`lab-track-${track}-heading`}>
                    <div className="mb-3 flex items-center justify-between gap-3">
                        <SectionHeading id={`lab-track-${track}-heading`} spacing="none">{LAB_TRACK_LABELS[track]}</SectionHeading>
                        {progress && <MicroLabel>{LAB_COPY.unitsOf(progress.done, progress.planned)} {LAB_COPY.unitsLabel}</MicroLabel>}
                    </div>
                    <ol className="space-y-2">
                        {rows.map((row) => (
                            <li key={row.id} data-lab-row={row.id} data-lab-written={row.written}>
                                {row.written ? (
                                    <Link href={`/learn/units/${row.id}`} className={rowCard({interactive: true, className: 'flex items-start gap-3 px-3 py-2'})}>
                                        <MicroLabel as="span" className="mt-0.5 w-14 shrink-0">{LAB_COPY.unitNumber(row.number)}</MicroLabel>
                                        <span className="min-w-0 flex-1">
                                            <span className="block text-sm text-fg">{row.title}</span>
                                            <span className="block text-xs text-fg-muted">{row.oneLiner}</span>
                                        </span>
                                        {row.studiedOn && <Badge tone="positive" variant="outline">{LAB_COPY.studiedOn(row.studiedOn)}</Badge>}
                                    </Link>
                                ) : (
                                    <div className={cn(rowCard({className: 'flex items-start gap-3 px-3 py-2'}), 'opacity-60')}>
                                        <MicroLabel as="span" className="mt-0.5 w-14 shrink-0">{LAB_COPY.unitNumber(row.number)}</MicroLabel>
                                        <span className="min-w-0 flex-1">
                                            <span className="block text-sm text-fg-soft">{row.title}</span>
                                            <span className="block text-xs text-fg-muted">{row.oneLiner}</span>
                                        </span>
                                        <Badge variant="outline">{LAB_COPY.planned}</Badge>
                                    </div>
                                )}
                            </li>
                        ))}
                    </ol>
                </Panel>
            );
        })}
    </div>
);

const LearnPage = async ({searchParams}: LearnPageProps) => {
    const user = await getSessionUser();
    if (!user) redirect('/sign-in');
    const {tab, view: viewParam} = await searchParams;
    const legacyGlossaryTab = tab === 'glossary';

    if (!isLabOwner(user.email)) return <LearnRedirect fallback="/games" legacyGlossaryTab={legacyGlossaryTab}/>;

    const view = await getLabView(user.id);
    const active: ViewId = isView(viewParam) ? viewParam : 'today';

    return (
        <div className="space-y-4" data-lab>
            <LearnRedirect fallback={null} legacyGlossaryTab={legacyGlossaryTab}/>
            <PageTitle title={LAB_COPY.title} subtitle={LAB_COPY.subtitle}/>
            <Tabs tabs={TABS} active={active} label={LAB_COPY.viewsLabel}/>
            {active === 'today' ? <TodayView view={view}/> : <LibraryView view={view}/>}
        </div>
    );
};

export default LearnPage;
