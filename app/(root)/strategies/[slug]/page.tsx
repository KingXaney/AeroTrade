import Link from "next/link";
import {notFound, redirect} from "next/navigation";
import {getCurrentUserId} from "@/lib/actions/watchlist.actions";
import {getEasternDateString} from "@/lib/utils";
import {getStrategyDetail} from "@/lib/strategies/queries";
import {pickPerfMode, toPerfSeries} from "@/lib/strategies/views";
import {UNIVERSES} from "@/lib/strategies/universe";
import AccountSummary from "@/components/trade/AccountSummary";
import PortfolioHoldings from "@/components/trade/PortfolioHoldings";
import TradeHistory from "@/components/trade/TradeHistory";
import FollowButton from "@/components/strategies/FollowButton";
import LatestDecision from "@/components/strategies/LatestDecision";
import SignalBoard from "@/components/strategies/SignalBoard";
import SimulatedTradeList from "@/components/strategies/SimulatedTradeList";
import StrategyExplainer from "@/components/strategies/StrategyExplainer";
import StrategyPerformance from "@/components/strategies/StrategyPerformance";

type StrategyPageProps = {
    params: Promise<{slug: string}>;
};

const Panel = ({title, id, aside, children}: {title: string; id?: string; aside?: React.ReactNode; children: React.ReactNode}) => (
    <section className="glass-panel rounded-xl p-5" id={id}>
        <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-brand" style={{fontFamily: 'var(--type-mono)'}}>{title}</h2>
            {aside}
        </div>
        {children}
    </section>
);

const CADENCE_LABEL = {once: 'buys once', daily: 'checked daily', monthly: 'rebalances monthly', quarterly: 'rebalances quarterly'} as const;

const StrategyPage = async ({params}: StrategyPageProps) => {
    const userId = await getCurrentUserId();
    if (!userId) redirect('/sign-in');

    const {slug} = await params;
    const detail = await getStrategyDetail(slug, userId);
    if (!detail) notFound();

    const {def, state, analytics, trades, latestRun, backtest} = detail;
    const started = state !== null && analytics !== null;
    const liveSince = analytics ? getEasternDateString(new Date(analytics.account.inceptionAt)) : null;
    const liveSeries = analytics?.series ?? [];
    const simulatedSeries = backtest ? toPerfSeries(backtest.points, backtest.benchmark) : [];
    const universeSize = UNIVERSES[def.universe].length;

    return (
        <div className="space-y-4">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-2">
                <div className="flex items-start gap-3">
                    <Link href="/strategies" className="text-fg-muted hover:text-brand transition-colors mt-1" aria-label="Back to strategies">
                        <span className="material-symbols-outlined">arrow_back</span>
                    </Link>
                    <div>
                        <h1 className="text-2xl font-semibold text-fg tracking-tight" style={{fontFamily: 'var(--type-display)'}}>{def.name}</h1>
                        <p className="text-xs text-fg-muted mt-1" style={{fontFamily: 'var(--type-mono)'}} id="strategy-meta">
                            {def.family} · {CADENCE_LABEL[def.cadence]} · {universeSize} symbol{universeSize === 1 ? '' : 's'} ·{' '}
                            {started ? `live since ${liveSince}` : <span className="text-warning">not started</span>}
                        </p>
                    </div>
                </div>
                <FollowButton slug={def.id} followed={detail.followed} />
            </div>

            <StrategyExplainer def={def} lastRebalanceDate={state?.lastRebalanceDate ?? null} />

            {analytics && <AccountSummary portfolio={analytics.summary} />}

            <StrategyPerformance
                name={def.name}
                initialMode={pickPerfMode(liveSeries.length, simulatedSeries.length)}
                live={analytics && liveSince ? {
                    series: liveSeries,
                    stats: analytics,
                    since: liveSince,
                    snapshotDays: liveSeries.length,
                    benchmarkReturnPct: detail.benchmarkReturnPct,
                    totalReturnPct: analytics.summary.totalReturnPct,
                } : null}
                simulated={backtest ? {
                    series: simulatedSeries,
                    stats: backtest.stats,
                    from: backtest.from,
                    to: backtest.to,
                    closeFills: backtest.closeFills,
                } : null}
            />

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <Panel title="Current holdings" id="strategy-holdings">
                    <PortfolioHoldings
                        positions={analytics?.summary.positions ?? []}
                        emptyText={started ? def.explainer.cashReason : 'Not started — the account opens on the first run.'}
                    />
                </Panel>
                <Panel title="Latest decision" id="strategy-decision">
                    <LatestDecision run={latestRun} />
                </Panel>
            </div>

            <Panel title="What it is watching" id="strategy-signals">
                <SignalBoard columns={def.signalColumns} run={latestRun} />
            </Panel>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <Panel title="Live trade log" id="strategy-trades" aside={
                    <span className="text-[10px] uppercase tracking-[0.08em] text-fg-muted" style={{fontFamily: 'var(--type-mono)'}}>
                        {analytics ? `${analytics.tradeCount} fill${analytics.tradeCount === 1 ? '' : 's'}` : ''}
                    </span>
                }>
                    {trades.length === 0
                        ? <p className="text-sm text-fg-muted p-4">No fills yet — the first orders are placed on the next run that finds a signal.</p>
                        : <TradeHistory trades={trades} totalCount={analytics?.tradeCount} />}
                </Panel>
                <Panel title="Simulated trade log" id="strategy-simulated-trades">
                    {backtest
                        ? <SimulatedTradeList trades={backtest.trades} />
                        : <p className="text-sm text-fg-muted p-4">Backtest not computed yet.</p>}
                </Panel>
            </div>

            <p className="text-[10px] uppercase tracking-[0.08em] text-fg-muted text-center" style={{fontFamily: 'var(--type-mono)'}}>
                Deterministic rules · no AI · paper money · not financial advice
            </p>
        </div>
    );
};

export default StrategyPage;
