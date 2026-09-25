import Link from "next/link";
import {notFound, redirect} from "next/navigation";
import {getCurrentUserId} from "@/lib/actions/watchlist.actions";
import {getEasternDateString} from "@/lib/utils";
import {STRATEGIES_DISCLAIMER} from "@/lib/strategies/catalog";
import {getStrategyDetail} from "@/lib/strategies/queries";
import {pickPerfMode, toPerfSeries} from "@/lib/strategies/views";
import {UNIVERSES} from "@/lib/strategies/universe";
import MicroLabel from "@/components/primitives/MicroLabel";
import Panel from "@/components/primitives/Panel";
import SectionHeading from "@/components/primitives/SectionHeading";
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
            {/* The rule in one sentence stays visible; everything else about it is one
                click away, so the numbers start about a screen higher than they did. */}
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-2">
                <div className="flex items-start gap-3 min-w-0">
                    <Link href="/strategies" className="text-fg-muted hover:text-brand transition-colors mt-1" aria-label="Back to strategies">
                        <span className="material-symbols-outlined">arrow_back</span>
                    </Link>
                    <div className="min-w-0">
                        <h1 className="font-heading text-2xl font-semibold text-fg tracking-tight">{def.name}</h1>
                        <p className="font-mono text-xs text-fg-muted mt-1" id="strategy-meta">
                            {def.family} · {CADENCE_LABEL[def.cadence]} · {universeSize} symbol{universeSize === 1 ? '' : 's'} ·{' '}
                            {started ? `live since ${liveSince}` : <span className="text-warning">not started</span>}
                        </p>
                        <p className="text-sm text-fg-soft mt-2 max-w-2xl">{def.explainer.summary}</p>
                    </div>
                </div>
                <FollowButton slug={def.id} followed={detail.followed} />
            </div>

            <StrategyExplainer def={def} lastRebalanceDate={state?.lastRebalanceDate ?? null} defaultOpen={!started} />

            {analytics && <AccountSummary portfolio={analytics.summary} />}

            <StrategyPerformance
                name={def.name}
                initialMode={pickPerfMode(liveSeries.length, simulatedSeries.length)}
                live={analytics && liveSince ? {
                    series: liveSeries,
                    stats: analytics,
                    since: liveSince,
                    snapshotDays: detail.snapshotDays,
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
                <Panel id="strategy-holdings">
                    <SectionHeading>Current holdings</SectionHeading>
                    <PortfolioHoldings
                        positions={analytics?.summary.positions ?? []}
                        emptyText={started ? def.explainer.cashReason : 'Not started — the account opens on the first run.'}
                        showUnpricedNote={false}
                    />
                </Panel>

                {/* What it saw and what it did are one story, so they share a panel. */}
                <Panel id="strategy-decision">
                    <SectionHeading>Latest decision</SectionHeading>
                    <LatestDecision
                        run={latestRun}
                        headline={latestRun ? detail.lastActionLine : undefined}
                        signals={<div id="strategy-signals"><SignalBoard columns={def.signalColumns} run={latestRun} /></div>}
                    />
                </Panel>
            </div>

            <Panel id="strategy-trades">
                <div className="flex items-center justify-between gap-3 mb-4">
                    <SectionHeading spacing="none">Live trade log</SectionHeading>
                    <MicroLabel>
                        {analytics ? `${analytics.tradeCount} fill${analytics.tradeCount === 1 ? '' : 's'}` : ''}
                    </MicroLabel>
                </div>
                {trades.length === 0
                    ? <p className="text-sm text-fg-muted p-4">No fills yet — the first orders are placed on the next run that finds a signal.</p>
                    : <TradeHistory trades={trades} totalCount={analytics?.tradeCount} />}

                {/* Hypothetical fills fold away under the real ones, never beside them. */}
                <div className="mt-4 pt-4 border-t border-line-strong/20" id="strategy-simulated-trades">
                    <details className="group">
                        <summary className="font-mono cursor-pointer text-[11px] text-brand hover:underline">
                            Simulated trade log — {backtest ? `${backtest.trades.length} hypothetical fills at the next day's open` : 'not computed yet'}
                        </summary>
                        <div className="pt-3">
                            {backtest
                                ? <SimulatedTradeList trades={backtest.trades} />
                                : <p className="text-sm text-fg-muted">Backtest not computed yet — it is built on the first run.</p>}
                        </div>
                    </details>
                </div>
            </Panel>

            {/* Once per page, and always visible — it used to be rendered twice. */}
            <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-fg-muted text-center">
                {STRATEGIES_DISCLAIMER}
            </p>
        </div>
    );
};

export default StrategyPage;
