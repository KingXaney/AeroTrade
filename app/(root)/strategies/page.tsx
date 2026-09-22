import {redirect} from "next/navigation";
import {getCurrentUserId} from "@/lib/actions/watchlist.actions";
import {marketStatus} from "@/lib/prices/market-hours";
import {getStrategiesSystemStatus, getStrategyLeaderboard} from "@/lib/strategies/queries";
import {everyLiveRecordYoung, LIVE_YOUNG_DAYS} from "@/lib/strategies/views";
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

    return (
        <div className="space-y-4">
            <div className="mb-2">
                <h1 className="text-2xl font-semibold text-fg mb-1" style={{fontFamily: 'var(--type-display)'}}>
                    Quant Strategies
                </h1>
                <p className="text-sm text-fg-muted">
                    Eight classic quant strategies, paper-traded on the live market by deterministic rules — no AI — and
                    measured against the S&amp;P 500 on the same terms as your own accounts. An experiment, not financial advice.
                </p>
                <p className="text-[11px] text-fg-muted mt-1" style={{fontFamily: 'var(--type-mono)'}} id="strategies-valuation">
                    {leaderboard.started
                        ? (marketOpen ? 'Live valuation at the last price' : 'Valued at the last close')
                        : 'No live records yet'}
                </p>
            </div>

            <StrategyStatusStrip status={status} />

            <section className="glass-panel rounded-xl p-5">
                <div className="flex items-center justify-between mb-4 gap-3">
                    <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-brand" style={{fontFamily: 'var(--type-mono)'}}>
                        Leaderboard
                    </h2>
                    <span className="text-[10px] uppercase tracking-[0.08em] text-fg-muted" style={{fontFamily: 'var(--type-mono)'}}>
                        ranked by live return since launch
                    </span>
                </div>
                {young && (
                    <p role="status" className="mb-3 text-[11px] text-warning" style={{fontFamily: 'var(--type-mono)'}}>
                        Live records are under {LIVE_YOUNG_DAYS} days old — the simulated column shows each rule&apos;s three-year backtest for context.
                    </p>
                )}
                {!leaderboard.started && (
                    <p role="status" className="mb-3 text-[11px] text-warning" style={{fontFamily: 'var(--type-mono)'}}>
                        The strategies have not run yet. Their accounts open on the first trading morning after deployment.
                    </p>
                )}
                <StrategyLeaderboard rows={leaderboard.rows} canFollow />
            </section>

            <HowToRead />
        </div>
    );
};

export default StrategiesPage;
