import type {Metadata} from "next";
import type {ReactNode} from "react";
import Link from "next/link";
import {redirect} from "next/navigation";
import {getSessionUser} from "@/lib/auth/session";
import {isLabOwner} from "@/lib/lab/owner";
import {getLabView} from "@/lib/lab/page-store";
import {gamesOf, type LabHudId} from "@/lib/lab/layout";
import {LAB_WIDGET_IDS} from "@/lib/lab/widgets";
import type {LabView} from "@/lib/lab/view";
import {LAB_COPY, LAB_TRACK_LABELS} from "@/lib/learn/copy/lab";
import CheckIn from "@/components/lab/CheckIn";
import LabHud from "@/components/lab/LabHud";
import LabGameCard from "@/components/lab/LabGameCard";
import LabMarkdown from "@/components/lab/LabMarkdown";
import DigestPanel from "@/components/lab/DigestPanel";
import LabProgress from "@/components/lab/LabProgress";
import PapersPanel from "@/components/lab/PapersPanel";
import ProblemCard from "@/components/lab/ProblemCard";
import Reflection from "@/components/lab/Reflection";
import ReviewDeck from "@/components/lab/ReviewDeck";
import TodayList from "@/components/lab/TodayList";
import LearnRedirect from "@/components/learn/LearnRedirect";
import StreakHero from "@/components/learn/StreakHero";
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
// (?view=): Today — a HUD of the day's parts and the game cards in the owner's layout
// (components/lab/LabHud): the check-in, the list, the streak, the unit, the cards due, the
// problem, the day's digest, the end of the day, the progress — the Papers (the latest day's
// papers by field with the digest) and the Library, the syllabus. ?arrange=1 opens Today with its
// arranging on, for the account menu's entry. Every other account's /learn goes to the games — on
// the client, so a /learn#term address from the glossary's days as a tab of this page keeps its
// hash on the way to /glossary (components/learn/LearnRedirect). One read, getLabView, shaped by
// the pure lib/lab/view.

const VIEW_IDS = ['today', 'papers', 'library'] as const;
type ViewId = (typeof VIEW_IDS)[number];
const isView = (value: unknown): value is ViewId => typeof value === 'string' && (VIEW_IDS as readonly string[]).includes(value);
const TABS = VIEW_IDS.map((id) => ({id, label: LAB_COPY.views[id], href: id === 'today' ? '/learn' : `/learn?view=${id}`}));

type LearnPageProps = {searchParams: Promise<{tab?: string; view?: string; arrange?: string}>};

const UnitPanel = ({today}: {today: LabView['today']}) => (
    <Panel id="lab-unit" aria-labelledby="lab-unit-heading" className="h-full" data-lab-unit={today.kind}>
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

const ReviewPanel = ({view}: {view: LabView}) => (
    <Panel id="lab-review" aria-labelledby="lab-review-heading" className="h-full">
        <div className="mb-3 flex items-center justify-between gap-3">
            <SectionHeading id="lab-review-heading" spacing="none">{LAB_COPY.reviewHeading}</SectionHeading>
            <MicroLabel data-lab-review-due={view.review.summary.due}>{LAB_COPY.reviewDue(view.review.summary.due)}</MicroLabel>
        </div>
        <ReviewDeck cards={view.review.queue.map((card) => ({
            cardId: card.cardId, unitTitle: card.unitTitle, why: card.why,
            front: <LabMarkdown>{card.front}</LabMarkdown>, back: <LabMarkdown>{card.back}</LabMarkdown>,
        }))}/>
    </Panel>
);

const ProblemPanel = ({problem}: {problem: NonNullable<LabView['problem']>}) => (
    <Panel id="lab-problem" aria-labelledby="lab-problem-heading" className="h-full">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <SectionHeading id="lab-problem-heading" spacing="none">{LAB_COPY.problemHeading}</SectionHeading>
            <MicroLabel>{problem.unitTitle} · {LAB_COPY.kinds[problem.kind]}</MicroLabel>
        </div>
        <h3 className="mb-2 font-heading text-base font-semibold text-fg">{problem.title}</h3>
        <ProblemCard
            problemId={problem.id}
            numeric={problem.numeric}
            unit={problem.unit}
            hints={problem.hints}
            closedLine={problem.closed ? LAB_COPY.closedOn(problem.closed.day, problem.closed.how) : null}
            statement={<LabMarkdown>{problem.statement}</LabMarkdown>}
            solution={problem.solution !== null ? <LabMarkdown>{problem.solution}</LabMarkdown> : null}
        />
    </Panel>
);

// The day's papers on Today: the digest with a link to the Papers view, else three papers a field.
const PapersToday = ({papers}: {papers: NonNullable<LabView['papers']>}) => papers.digest ? (
    <DigestPanel id="lab-digest" digest={papers.digest} day={papers.day} hrefPrefix="/learn?view=papers#paper-" more={{href: '/learn?view=papers', label: LAB_COPY.allPapers}}/>
) : (
    <Panel id="lab-papers-today" aria-labelledby="lab-papers-today-heading" className="h-full">
        <div className="mb-3 flex items-center justify-between gap-3">
            <SectionHeading id="lab-papers-today-heading" spacing="none">{LAB_COPY.todayPapersHeading}</SectionHeading>
            <Link href="/learn?view=papers" className="label-type text-xs text-brand hover:underline">{LAB_COPY.allPapers}</Link>
        </div>
        <ul className="space-y-1">
            {papers.tracks.flatMap(({track, papers: rows}) => rows.slice(0, 3).map((paper) => (
                <li key={paper.id} className="text-sm">
                    <a href={paper.links.abs} target="_blank" rel="noopener noreferrer" className="text-fg hover:text-brand hover:underline">{paper.title}</a>
                    <MicroLabel as="span" className="ml-2">{LAB_TRACK_LABELS[track]}</MicroLabel>
                </li>
            )))}
        </ul>
    </Panel>
);

// Every card's body, rendered here on the server and handed to the HUD by id: the parts of the
// day that have something to show, and each game card on the layout. A part with nothing to show
// (no problem, no papers) has no body, so the HUD skips it and the library does not offer it.
const bodiesOf = (view: LabView, name: string | null | undefined): Partial<Record<LabHudId, ReactNode>> => {
    const bodies: Partial<Record<LabHudId, ReactNode>> = {
        'check-in': <CheckIn view={view.checkIn} name={name}/>,
        list: <TodayList items={view.list} summary={view.listSummary} games={gamesOf(view.layout)}/>,
        streak: (
            <Panel id="lab-streak" aria-labelledby="lab-streak-heading" className="h-full" data-lab-streak={view.progress.streak.current}>
                <StreakHero streak={view.progress.streak} headingId="lab-streak-heading"/>
            </Panel>
        ),
        unit: <UnitPanel today={view.today}/>,
        review: <ReviewPanel view={view}/>,
        reflection: <Reflection view={view.reflection}/>,
        progress: (
            <Panel id="lab-progress" aria-labelledby="lab-progress-heading" className="h-full">
                <SectionHeading id="lab-progress-heading" spacing="sm">{LAB_COPY.progressHeading}</SectionHeading>
                <LabProgress progress={view.progress}/>
            </Panel>
        ),
    };
    if (view.problem) bodies.problem = <ProblemPanel problem={view.problem}/>;
    if (view.papers && (view.papers.digest || view.papers.tracks.length > 0)) bodies.papers = <PapersToday papers={view.papers}/>;
    for (const widget of view.widgets) bodies[widget.id] = <LabGameCard widget={widget} puzzle={view.puzzle}/>;
    return bodies;
};

const TodayView = ({view, name, arranging}: {view: LabView; name: string | null | undefined; arranging: boolean}) => {
    const bodies = bodiesOf(view, name);
    // The library offers every part of the day with something to show, and every game.
    const availableIds = [...(Object.keys(bodies) as LabHudId[]).filter((id) => !(LAB_WIDGET_IDS as readonly string[]).includes(id)), ...LAB_WIDGET_IDS];
    return (
        <div id="lab-today">
            {/* Keyed on the mode, not the layout: the HUD follows a new layout itself (a game switched on from the list). */}
            <LabHud key={arranging ? 'arranging' : 'today'} initialLayout={view.layout} bodies={bodies} availableIds={availableIds} startInEditMode={arranging}/>
        </div>
    );
};

const PapersView = ({view}: {view: LabView}) => (
    <div className="space-y-4" id="lab-papers">
        <p className="max-w-3xl text-sm text-fg-soft">{LAB_COPY.papersLead}</p>
        {!view.papers ? (
            <Panel id="lab-papers-none"><p className="text-sm text-fg-muted">{LAB_COPY.papersNone}</p></Panel>
        ) : (
            <>
                {view.papers.stale && <MicroLabel as="p" tone="warning" data-lab-papers-stale={view.papers.day}>{LAB_COPY.papersStale(view.papers.day)}</MicroLabel>}
                {view.papers.digest && <DigestPanel id="lab-digest" digest={view.papers.digest} day={view.papers.day} hrefPrefix="#paper-"/>}
                {view.papers.tracks.map(({track, papers}) => <PapersPanel key={track} track={track} papers={papers}/>)}
            </>
        )}
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
    const {tab, view: viewParam, arrange} = await searchParams;
    const legacyGlossaryTab = tab === 'glossary';

    if (!isLabOwner(user.email)) return <LearnRedirect fallback="/games" legacyGlossaryTab={legacyGlossaryTab}/>;

    const view = await getLabView(user.id);
    const arranging = arrange === '1';
    const active: ViewId = !arranging && isView(viewParam) ? viewParam : 'today';

    return (
        <div className="space-y-4" data-lab>
            <LearnRedirect fallback={null} legacyGlossaryTab={legacyGlossaryTab}/>
            <PageTitle title={LAB_COPY.title} subtitle={LAB_COPY.subtitle}/>
            <Tabs tabs={TABS} active={active} label={LAB_COPY.viewsLabel}/>
            {active === 'today' ? <TodayView view={view} name={user.name} arranging={arranging}/> : active === 'papers' ? <PapersView view={view}/> : <LibraryView view={view}/>}
        </div>
    );
};

export default LearnPage;
