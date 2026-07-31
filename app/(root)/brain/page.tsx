import {redirect} from "next/navigation";
import {getCurrentUserId} from "@/lib/actions/watchlist.actions";
import {getNavigatorStatus} from "@/lib/actions/navigator.actions";
import {getActiveTheses, getBrainGraph, getBrainSystemStatus, getEntityEvidence, getTopEntities} from "@/lib/brain/queries";
import {getLatestSecondOpinion, isSecondOpinionConfigured} from "@/lib/brain/opinion";
import {getLatestSuggestions} from "@/lib/navigator/service";
import {getAccountsForUser, toAccountSummary} from "@/lib/trading/account";
import ActiveTheses from "@/components/brain/ActiveTheses";
import BrainGraph from "@/components/brain/BrainGraph";
import EvidenceList from "@/components/brain/EvidenceList";
import NarrativeLeaderboard from "@/components/brain/NarrativeLeaderboard";
import NavigatorCard from "@/components/brain/NavigatorCard";
import SecondOpinionCard from "@/components/brain/SecondOpinionCard";
import SuggestionPanel from "@/components/brain/SuggestionPanel";
import SystemStatus from "@/components/brain/SystemStatus";

type BrainPageProps = {
    searchParams: Promise<{entity?: string}>;
};

const BrainPage = async ({searchParams}: BrainPageProps) => {
    const userId = await getCurrentUserId();
    if (!userId) redirect('/sign-in');

    const {entity} = await searchParams;

    const [navigatorStatus, theses, topEntities, graph, suggestions, accounts, systemStatus, secondOpinion] = await Promise.all([
        getNavigatorStatus(userId),
        getActiveTheses(),
        getTopEntities(),
        getBrainGraph(),
        getLatestSuggestions(userId),
        getAccountsForUser(userId),
        getBrainSystemStatus(),
        getLatestSecondOpinion(),
    ]);
    const evidence = entity ? await getEntityEvidence(entity) : null;
    const applyAccounts = accounts.map((a) => {
        const s = toAccountSummary(a);
        return {id: s.id, name: s.name};
    });

    return (
        <div className="min-h-screen space-y-4">
            {/* Header */}
            <div className="mb-2">
                <h1 className="text-2xl font-semibold text-[#e2e2e8] mb-1" style={{fontFamily: 'var(--font-sora)'}}>
                    News Brain
                </h1>
                <p className="text-sm text-[#849495]">
                    Persistent market narratives from every ingested article — slow-building theses drive the AI Navigator
                </p>
            </div>

            {/* Is the machinery actually running? */}
            <SystemStatus status={systemStatus} />

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {/* Active theses — the centerpiece */}
                <section className="glass-panel rounded-xl p-5">
                    <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-[#7df4ff] mb-4" style={{fontFamily: 'var(--font-jetbrains)'}}>
                        Active Theses
                    </h2>
                    <ActiveTheses theses={theses} />
                </section>

                {/* Navigator enrollment + weekly decisions */}
                <div className="space-y-4">
                    <NavigatorCard status={navigatorStatus} />
                    <section className="glass-panel rounded-xl p-5">
                        <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-[#7df4ff] mb-4" style={{fontFamily: 'var(--font-jetbrains)'}}>
                            Weekly Decisions
                        </h2>
                        <SuggestionPanel userSet={suggestions.user} globalSet={suggestions.global} accounts={applyAccounts} />
                    </section>
                </div>
            </div>

            {/* Claude's critique of the brain's current picture */}
            <SecondOpinionCard configured={isSecondOpinionConfigured()} opinion={secondOpinion} />

            {/* Knowledge graph */}
            <section className="glass-panel rounded-xl p-5">
                <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-[#7df4ff] mb-4" style={{fontFamily: 'var(--font-jetbrains)'}}>
                    Knowledge Graph
                </h2>
                <BrainGraph nodes={graph.nodes} edges={graph.edges} />
            </section>

            {/* Evidence drill-down for ?entity= */}
            {entity && evidence && (
                <section className="glass-panel rounded-xl p-5">
                    <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-[#7df4ff] mb-4" style={{fontFamily: 'var(--font-jetbrains)'}}>
                        Evidence
                    </h2>
                    <EvidenceList entityKey={entity} items={evidence} />
                </section>
            )}

            {/* Narrative leaderboard */}
            <section className="glass-panel rounded-xl p-5">
                <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-[#7df4ff] mb-4" style={{fontFamily: 'var(--font-jetbrains)'}}>
                    Narrative Leaderboard
                </h2>
                <NarrativeLeaderboard entities={topEntities} />
            </section>
        </div>
    );
};

export default BrainPage;
