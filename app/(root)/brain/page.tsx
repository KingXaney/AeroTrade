import {requireUserId} from "@/lib/auth/session";
import {getActiveTheses, getBrainGraph, getBrainSystemStatus, getEntityEvidence, getSinceThesis, getTopEntities} from "@/lib/brain/store";
import {glossNavigatorReasons} from "@/lib/learn/reasons";
import type {SuggestionSetView} from "@/lib/navigator/store";
import {getLatestSecondOpinion, isSecondOpinionConfigured} from "@/lib/brain/opinion";
import {getLatestSuggestions, getNavigatorStatus} from "@/lib/navigator/store";
import {getTopicsForUser} from "@/lib/topics/store";
import {getPortfoliosForUser} from "@/lib/trading/valuation";
import {toApplyAccounts} from "@/lib/trading/active-account";
import ActiveTheses from "@/components/brain/ActiveTheses";
import BrainLegend from "@/components/brain/BrainLegend";
import BrainGraph from "@/components/brain/BrainGraph";
import EvidenceList from "@/components/brain/EvidenceList";
import NarrativeLeaderboard from "@/components/brain/NarrativeLeaderboard";
import NavigatorCard from "@/components/navigator/NavigatorCard";
import SecondOpinionCard from "@/components/brain/SecondOpinionCard";
import SuggestionPanel from "@/components/navigator/SuggestionPanel";
import SystemStatus from "@/components/jobs/SystemStatus";
import Panel from "@/components/primitives/Panel";
import PageTitle from "@/components/primitives/PageTitle";
import SectionHeading from "@/components/primitives/SectionHeading";
import Tabs from "@/components/primitives/Tabs";
import {BRAIN_COPY} from "@/lib/learn/copy/brain";

// Each decision's reasons decoded here, on the server, so the client panel renders clauses
// without bundling the grammar.
const withGloss = (set: SuggestionSetView | null) => set && {
    ...set,
    items: set.items.map((item) => ({...item, gloss: glossNavigatorReasons(item.reasons)})),
};

// The page was seven purposes stacked on one scroll, with job schedules above the first
// narrative. It is three views now, one at a time in the URL, and each reads only its own data:
//   narratives — what the news is paying attention to (theses, the graph, evidence, the board)
//   navigator  — what the AI did about it (enrolment, the week's decisions, the second opinion)
//   system     — whether the machinery ran (pipeline counters, every job's last stamp)
const VIEW_IDS = ['narratives', 'navigator', 'system'] as const;
type ViewId = (typeof VIEW_IDS)[number];
const isView = (value: unknown): value is ViewId => typeof value === 'string' && (VIEW_IDS as readonly string[]).includes(value);

const TABS = VIEW_IDS.map((id) => ({id, label: BRAIN_COPY.views[id], href: id === 'narratives' ? '/brain' : `/brain?view=${id}`}));

type BrainPageProps = {
    searchParams: Promise<{entity?: string; view?: string}>;
};

const NarrativesView = async ({userId, entity}: {userId: string; entity?: string}) => {
    const [theses, topEntities, graph, topics] = await Promise.all([
        getActiveTheses(),
        getTopEntities(),
        getBrainGraph(),
        getTopicsForUser(userId),
    ]);
    // Lets a narrative row show "following" when a topic of the same name exists.
    const followedByName = Object.fromEntries(topics.map((t) => [t.name.toLowerCase(), {id: t.id, slug: t.slug}]));
    // A second read that waits on the theses: "since thesis" needs their keys and dates.
    const [evidence, sinceThesis] = await Promise.all([
        entity ? getEntityEvidence(entity) : null,
        getSinceThesis(theses),
    ]);

    return (
        <>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {/* Active theses — the centerpiece */}
                <Panel>
                    <SectionHeading>
                        Active Theses
                    </SectionHeading>
                    <ActiveTheses theses={theses} followedByName={followedByName} sinceThesis={sinceThesis} definitions />
                </Panel>

                <Panel>
                    <SectionHeading>
                        Knowledge Graph
                    </SectionHeading>
                    <BrainGraph nodes={graph.nodes} edges={graph.edges} />
                </Panel>
            </div>

            {/* Evidence drill-down for ?entity= */}
            {entity && evidence && (
                <Panel id="evidence" className="scroll-mt-24">
                    <SectionHeading>
                        Evidence
                    </SectionHeading>
                    <EvidenceList entityKey={entity} items={evidence} />
                </Panel>
            )}

            <Panel>
                <SectionHeading>
                    Narrative Leaderboard
                </SectionHeading>
                <NarrativeLeaderboard entities={topEntities} followedByName={followedByName} />
            </Panel>
        </>
    );
};

const NavigatorView = async ({userId}: {userId: string}) => {
    const [navigatorStatus, suggestions, portfolios, secondOpinion] = await Promise.all([
        getNavigatorStatus(userId),
        getLatestSuggestions(userId),
        getPortfoliosForUser(userId),
        getLatestSecondOpinion(userId),
    ]);

    return (
        <>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <NavigatorCard status={navigatorStatus} />
                <Panel>
                    <SectionHeading>
                        Weekly Decisions
                    </SectionHeading>
                    <SuggestionPanel userSet={withGloss(suggestions.user)} globalSet={withGloss(suggestions.global)} accounts={toApplyAccounts(portfolios)} />
                </Panel>
            </div>

            {/* Claude's critique of the brain's current picture */}
            <SecondOpinionCard configured={isSecondOpinionConfigured()} opinion={secondOpinion} />
        </>
    );
};

// Is the machinery actually running?
const SystemView = async () => <SystemStatus status={await getBrainSystemStatus()} />;

const BrainPage = async ({searchParams}: BrainPageProps) => {
    const userId = await requireUserId();

    const {entity, view: viewParam} = await searchParams;
    // An evidence link (?entity=) always means the narratives view, whatever else the URL says.
    const view: ViewId = !entity && isView(viewParam) ? viewParam : 'narratives';

    return (
        <div className="space-y-4">
            <PageTitle
                title="News Brain"
                subtitle={BRAIN_COPY.pageSubtitle}
            />
            <Tabs tabs={TABS} active={view} label="News Brain views"/>

            {view === 'narratives' && <NarrativesView userId={userId} entity={entity}/>}
            {view === 'navigator' && <NavigatorView userId={userId}/>}
            {view === 'system' && <SystemView/>}

            {/* How the weights and the scores are made: reference for every view, collapsed. */}
            <BrainLegend />
        </div>
    );
};

export default BrainPage;
