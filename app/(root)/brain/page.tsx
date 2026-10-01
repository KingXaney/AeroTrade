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
import {BRAIN_COPY} from "@/lib/learn/copy/brain";

// Each decision's reasons decoded here, on the server, so the client panel renders clauses
// without bundling the grammar.
const withGloss = (set: SuggestionSetView | null) => set && {
    ...set,
    items: set.items.map((item) => ({...item, gloss: glossNavigatorReasons(item.reasons)})),
};

type BrainPageProps = {
    searchParams: Promise<{entity?: string}>;
};

const BrainPage = async ({searchParams}: BrainPageProps) => {
    const userId = await requireUserId();

    const {entity} = await searchParams;

    const [navigatorStatus, theses, topEntities, graph, suggestions, portfolios, systemStatus, secondOpinion, topics] = await Promise.all([
        getNavigatorStatus(userId),
        getActiveTheses(),
        getTopEntities(),
        getBrainGraph(),
        getLatestSuggestions(userId),
        getPortfoliosForUser(userId),
        getBrainSystemStatus(),
        getLatestSecondOpinion(userId),
        getTopicsForUser(userId),
    ]);
    // Lets a narrative row show "following" when a topic of the same name exists.
    const followedByName = Object.fromEntries(topics.map((t) => [t.name.toLowerCase(), {id: t.id, slug: t.slug}]));
    // A second read that waits on the theses: "since thesis" needs their keys and dates.
    const [evidence, sinceThesis] = await Promise.all([
        entity ? getEntityEvidence(entity) : null,
        getSinceThesis(theses),
    ]);
    const applyAccounts = toApplyAccounts(portfolios);

    return (
        <div className="space-y-4">
            <PageTitle
                title="News Brain"
                subtitle={BRAIN_COPY.pageSubtitle}
            />

            {/* Is the machinery actually running? */}
            <SystemStatus status={systemStatus} />
            <BrainLegend />

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {/* Active theses — the centerpiece */}
                <Panel>
                    <SectionHeading>
                        Active Theses
                    </SectionHeading>
                    <ActiveTheses theses={theses} followedByName={followedByName} sinceThesis={sinceThesis} definitions />
                </Panel>

                {/* Navigator enrollment + weekly decisions */}
                <div className="space-y-4">
                    <NavigatorCard status={navigatorStatus} />
                    <Panel>
                        <SectionHeading>
                            Weekly Decisions
                        </SectionHeading>
                        <SuggestionPanel userSet={withGloss(suggestions.user)} globalSet={withGloss(suggestions.global)} accounts={applyAccounts} />
                    </Panel>
                </div>
            </div>

            {/* Claude's critique of the brain's current picture */}
            <SecondOpinionCard configured={isSecondOpinionConfigured()} opinion={secondOpinion} />

            {/* Knowledge graph */}
            <Panel>
                <SectionHeading>
                    Knowledge Graph
                </SectionHeading>
                <BrainGraph nodes={graph.nodes} edges={graph.edges} />
            </Panel>

            {/* Evidence drill-down for ?entity= */}
            {entity && evidence && (
                <Panel id="evidence" className="scroll-mt-24">
                    <SectionHeading>
                        Evidence
                    </SectionHeading>
                    <EvidenceList entityKey={entity} items={evidence} />
                </Panel>
            )}

            {/* Narrative leaderboard */}
            <Panel>
                <SectionHeading>
                    Narrative Leaderboard
                </SectionHeading>
                <NarrativeLeaderboard entities={topEntities} followedByName={followedByName} />
            </Panel>
        </div>
    );
};

export default BrainPage;
