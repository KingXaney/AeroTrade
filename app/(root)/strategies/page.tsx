import {requireUserId} from "@/lib/auth/session";
import {marketStatus} from "@/lib/prices/market-hours";
import {getStrategiesSystemStatus, getStrategyLeaderboard} from "@/lib/strategies/page-store";
import {everyLiveRecordYoung, LIVE_YOUNG_DAYS} from "@/lib/strategies/views";
import MicroLabel from "@/components/primitives/MicroLabel";
import PageTitle from "@/components/primitives/PageTitle";
import Panel from "@/components/primitives/Panel";
import SectionHeading from "@/components/primitives/SectionHeading";
import HowToRead from "@/components/strategies/HowToRead";
import StrategyLeaderboard from "@/components/strategies/StrategyLeaderboard";
import StrategyStatusStrip from "@/components/strategies/StrategyStatusStrip";
import {STRATEGIES_PAGE_COPY} from "@/lib/learn/copy/strategies";

const StrategiesPage = async () => {
    const userId = await requireUserId();

    const [leaderboard, status] = await Promise.all([
        getStrategyLeaderboard(userId),
        getStrategiesSystemStatus(),
    ]);
    const marketOpen = marketStatus().state === 'open';
    // eslint-disable-next-line react-hooks/purity -- the age note is informational and re-renders every request
    const young = everyLiveRecordYoung(leaderboard.rows, Date.now());

    const valuation = STRATEGIES_PAGE_COPY.valuation(leaderboard.started ? (marketOpen ? 'open' : 'closed') : 'not-started');

    return (
        <div className="space-y-4">
            {/* Two lines above the ranking, not seven. The fuller explanation of what
                live and simulated mean is one click away in the reading guide below. */}
            <PageTitle
                title="Quant Strategies"
                subtitle={STRATEGIES_PAGE_COPY.subtitle}
            />

            <StrategyStatusStrip status={status} />

            <Panel>
                <div className="flex items-center justify-between mb-4 gap-3">
                    <SectionHeading spacing="none">Leaderboard</SectionHeading>
                    <MicroLabel id="strategies-valuation" className="text-right">
                        {STRATEGIES_PAGE_COPY.rankedBy(valuation)}
                    </MicroLabel>
                </div>

                {/* Muted, not amber: "your record is young" is context, not a fault.
                    Amber is reserved for something actually being wrong. */}
                {young && (
                    <p role="status" className="font-mono mb-3 text-[11px] text-fg-muted">
                        {STRATEGIES_PAGE_COPY.young(LIVE_YOUNG_DAYS)}
                    </p>
                )}
                {!leaderboard.started && (
                    <p role="status" className="font-mono mb-3 text-[11px] text-warning">
                        {STRATEGIES_PAGE_COPY.notRun}
                    </p>
                )}

                <StrategyLeaderboard rows={leaderboard.rows} canFollow />
            </Panel>

            <HowToRead />
        </div>
    );
};

export default StrategiesPage;
