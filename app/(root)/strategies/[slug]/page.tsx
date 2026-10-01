import Link from "next/link";
import {notFound} from "next/navigation";
import {requireUserId} from "@/lib/auth/session";
import {STRATEGIES_DISCLAIMER} from "@/lib/strategies/catalog";
import {getStrategyPageView} from "@/lib/strategies/page-store";
import {BOARD_COPY} from "@/lib/learn/copy/board";
import {EXPORT_COPY} from "@/lib/learn/copy/export";
import MicroLabel from "@/components/primitives/MicroLabel";
import Panel from "@/components/primitives/Panel";
import SectionHeading from "@/components/primitives/SectionHeading";
import AccountSummary from "@/components/trading/portfolio/AccountSummary";
import HoldingsTable from "@/components/trading/portfolio/HoldingsTable";
import TradeHistory from "@/components/trading/portfolio/TradeHistory";
import DecisionReplay from "@/components/strategies/DecisionReplay";
import FollowButton from "@/components/strategies/FollowButton";
import LatestDecision from "@/components/strategies/LatestDecision";
import SignalBoard from "@/components/strategies/SignalBoard";
import SimulatedTradeList from "@/components/strategies/SimulatedTradeList";
import StrategyExplainer from "@/components/strategies/StrategyExplainer";
import StrategyPerformance from "@/components/strategies/StrategyPerformance";
import VerdictQuiz from "@/components/strategies/VerdictQuiz";
import WhatTheseMean from "@/components/learn/WhatTheseMean";
import BoardReading from "@/components/strategies/BoardReading";
import TimeInMarket from "@/components/strategies/TimeInMarket";
import WhatIfLab from "@/components/strategies/WhatIfLab";
import type {PaperTradeRecord} from '@/lib/trading/types';

type StrategyPageProps = {
    params: Promise<{slug: string}>;
    // ?from= — the start of "Time in the market" (buy-and-hold only), validated and clamped there.
    searchParams: Promise<{from?: string | string[]}>;
};

// What this page shows is worked out in lib/strategies/detail-view.ts and read by
// getStrategyPageView (lib/strategies/page-store.ts); the page only composes it.
const StrategyPage = async ({params, searchParams}: StrategyPageProps) => {
    const userId = await requireUserId();

    const {slug} = await params;
    const view = await getStrategyPageView(slug, userId, () => searchParams.then(({from}) => from));
    if (!view) notFound();

    const {def, state, analytics, trades, latestRun, backtest, timeInMarket, started, liveSince, boardReading, quizRows} = view;

    // The one disclosure an automated fill carries (a server render prop on the trade log).
    const replayFor = (trade: PaperTradeRecord) => {
        const replay = view.fillReplays[trade.id];
        return replay ? <DecisionReplay def={def} {...replay} /> : null;
    };

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
                            {view.meta} ·{' '}
                            {started ? `live since ${liveSince}` : <span className="text-warning">not started</span>}
                        </p>
                        <p className="text-sm text-fg-soft mt-2 max-w-2xl">{def.explainer.summary}</p>
                        <p className="font-mono text-[11px] text-fg-muted mt-1" id="strategy-beginner-line">In one line: {def.explainer.beginnerLine}</p>
                    </div>
                </div>
                <FollowButton slug={def.id} followed={view.followed} />
            </div>

            <StrategyExplainer def={def} lastRebalanceDate={state?.lastRebalanceDate ?? null} defaultOpen={!started} />

            {analytics && <AccountSummary portfolio={analytics.summary} definitions />}

            <StrategyPerformance name={def.name} {...view.performance} />

            {/* Every rule with a knob (not buy-and-hold): the nightly grid beside the stored backtest. */}
            {view.whatIf && <WhatIfLab view={view.whatIf} />}

            {/* Buy-and-hold only; a failed read hides it rather than showing zeros. */}
            {timeInMarket && <TimeInMarket view={timeInMarket} path={`/strategies/${def.id}`} />}

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <Panel id="strategy-holdings">
                    <SectionHeading>Current holdings</SectionHeading>
                    <HoldingsTable
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
                        def={def}
                        headline={latestRun ? view.lastActionLine : undefined}
                        signals={(
                            /* While the quiz is open, LatestDecision hides everything in the panel that
                               states a verdict — the board's verdict cells, the top row's reading, the
                               run's headline and its orders — with one CSS switch on #latest-decision.
                               The reading, the definitions and the quiz are siblings of #signal-board: it
                               keeps exactly one disclosure of its own, and the reading leads the panel's
                               one "What these mean", titled "Read this board — SYMBOL". */
                            <div id="strategy-signals">
                                <SignalBoard columns={def.signalColumns} run={latestRun} />
                                {boardReading && (
                                    <WhatTheseMean id="board-terms" keys={view.boardTerms} label={BOARD_COPY.summary(boardReading.symbol)}>
                                        <BoardReading reading={boardReading} />
                                    </WhatTheseMean>
                                )}
                                {quizRows.length > 0 && <VerdictQuiz rows={quizRows} />}
                            </div>
                        )}
                    />
                </Panel>
            </div>

            <Panel id="strategy-trades">
                <div className="flex items-center justify-between gap-3 mb-4">
                    <SectionHeading spacing="none">Live trade log</SectionHeading>
                    <div className="flex items-center gap-3">
                        <MicroLabel>
                            {analytics ? `${analytics.tradeCount} fill${analytics.tradeCount === 1 ? '' : 's'}` : ''}
                        </MicroLabel>
                        {/* The whole current epoch, uncapped — the log above shows its tail. Nothing to
                            export before the first fill, so no link either. */}
                        {trades.length > 0 && (
                            <a
                                href={`/api/strategies/${def.id}/export`}
                                download
                                title={EXPORT_COPY.strategyTitle(def.name)}
                                data-testid="strategy-export"
                                className="font-mono inline-flex items-center gap-1 text-[11px] text-brand hover:underline"
                            >
                                <span className="material-symbols-outlined text-sm" aria-hidden="true">download</span>
                                {EXPORT_COPY.label}
                            </a>
                        )}
                    </div>
                </div>
                {trades.length === 0
                    ? <p className="text-sm text-fg-muted p-4">No fills yet — the first orders are placed on the next run that finds a signal.</p>
                    : <TradeHistory trades={trades} totalCount={analytics?.tradeCount} detail={replayFor} />}

                {/* Hypothetical fills fold away under the real ones, never beside them. */}
                <div className="mt-4 pt-4 border-t border-line-strong/20" id="strategy-simulated-trades">
                    <details className="group">
                        <summary className="font-mono cursor-pointer text-[11px] text-brand hover:underline">
                            Simulated trade log — {backtest ? `${backtest.trades.length} hypothetical fills at the next day's open` : 'not computed yet'}
                        </summary>
                        <div className="pt-3">
                            {backtest
                                ? <SimulatedTradeList trades={backtest.trades} def={def} />
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
