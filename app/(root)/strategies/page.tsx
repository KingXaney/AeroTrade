import {redirect} from "next/navigation";
import {getCurrentUserId} from "@/lib/actions/watchlist.actions";
import {marketStatus} from "@/lib/prices/market-hours";
import {getStrategiesSystemStatus, getStrategyLeaderboard} from "@/lib/strategies/queries";
import {everyLiveRecordYoung, LIVE_YOUNG_DAYS} from "@/lib/strategies/views";
import MicroLabel from "@/components/primitives/MicroLabel";
import PageTitle from "@/components/primitives/PageTitle";
import Panel from "@/components/primitives/Panel";
import SectionHeading from "@/components/primitives/SectionHeading";
import HowToRead from "@/components/strategies/HowToRead";
import StrategyLeaderboard from "@/components/strategies/StrategyLeaderboard";
import StrategyStatusStrip from "@/components/strategies/StrategyStatusStrip";

const StrategiesPage = async () => {
    const userId = await getCurrentUserId();
    if (!userId) redirect('/sign-in');

    const [leaderboard, status] = await Promise.all([
        getStrategyLeaderboard(userId),
        getStrategiesSystemStatus(),
    ]);
    const marketOpen = marketStatus().state === 'open';
    // eslint-disable-next-line react-hooks/purity -- the age note is informational and re-renders every request
    const young = everyLiveRecordYoung(leaderboard.rows, Date.now());

    const valuation = leaderboard.started
        ? (marketOpen ? 'live valuation at the last price' : 'valued at the last close')
        : 'no live records yet';

    return (
        <div className="space-y-4">
            {/* Two lines above the ranking, not seven. The fuller explanation of what
                live and simulated mean is one click away in the reading guide below. */}
            <PageTitle
                title="Quant Strategies"
                subtitle="Eight classic rules, paper-traded live against the S&P 500."
            />

            <StrategyStatusStrip status={status} />

            <Panel>
                <div className="flex items-center justify-between mb-4 gap-3">
                    <SectionHeading spacing="none">Leaderboard</SectionHeading>
                    <MicroLabel id="strategies-valuation" className="text-right">
                        ranked by live return · {valuation}
                    </MicroLabel>
                </div>

                {/* Muted, not amber: "your record is young" is context, not a fault.
                    Amber is reserved for something actually being wrong. */}
                {young && (
                    <p role="status" className="font-mono mb-3 text-[11px] text-fg-muted">
                        Live records are under {LIVE_YOUNG_DAYS} days old — the simulated column shows each rule&apos;s three-year backtest for context.
                    </p>
                )}
                {!leaderboard.started && (
                    <p role="status" className="font-mono mb-3 text-[11px] text-warning">
                        The strategies have not run yet. Their accounts open on the first trading morning after deployment.
                    </p>
                )}

                <StrategyLeaderboard rows={leaderboard.rows} canFollow />
            </Panel>

            <HowToRead />
        </div>
    );
};

export default StrategiesPage;
