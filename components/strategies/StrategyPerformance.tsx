'use client';

import {useState} from "react";
import PerformanceChart from "@/components/trading/PerformanceChart";
import AnalyticsStats, {type AnalyticsStatFields} from "@/components/trading/portfolio/AnalyticsStats";
import {cn} from "@/lib/utils";
import type {SeriesStats} from "@/lib/strategies/types";
import {formatPct} from "@/lib/format";
import SimulatedStats from "@/components/strategies/SimulatedStats";
import type {PerfPoint} from '@/lib/trading/types';
import Panel from '@/components/primitives/Panel';
import SectionHeading from "@/components/primitives/SectionHeading";
import {STRATEGY_PAGE_COPY, STRATEGY_PERFORMANCE_COPY} from "@/lib/learn/copy/strategies";

// Live and simulated curves side by side but never on one axis: a toggle, and each
// panel says which basis it shows and how far it reaches.

type LivePanel = {
    series: PerfPoint[];
    stats: AnalyticsStatFields;
    since: string;
    snapshotDays: number;
    benchmarkReturnPct: number | null;
    totalReturnPct: number;
};

type SimulatedPanel = {
    series: PerfPoint[];
    stats: SeriesStats;
    from: string;
    to: string;
    closeFills: number;
};

type Mode = 'live' | 'simulated';

const Tab = ({active, onClick, children, id}: {active: boolean; onClick: () => void; children: React.ReactNode; id: string}) => (
    <button
        type="button"
        id={id}
        onClick={onClick}
        aria-pressed={active}
        className={cn(
            'font-mono px-3 py-1 rounded-md text-[11px] font-bold uppercase tracking-[0.08em] transition-colors',
            active ? 'bg-brand/10 text-brand' : 'text-fg-muted hover:text-fg',
        )}
    >
        {children}
    </button>
);

const StrategyPerformance = ({name, live, simulated, initialMode}: {name: string; live: LivePanel | null; simulated: SimulatedPanel | null; initialMode: Mode}) => {
    const [mode, setMode] = useState<Mode>(initialMode);
    const showingLive = mode === 'live';

    return (
        <section className="space-y-3" id="strategy-performance">
            <Panel as="div">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                    <SectionHeading spacing="none">
                        Performance vs SPY
                    </SectionHeading>
                    <div className="flex items-center gap-1 rounded-lg border border-line-strong/20 p-0.5">
                        <Tab id="perf-live" active={showingLive} onClick={() => setMode('live')}>Live</Tab>
                        <Tab id="perf-simulated" active={!showingLive} onClick={() => setMode('simulated')}>Simulated</Tab>
                    </div>
                </div>

                {showingLive ? (
                    live ? (
                        <>
                            <p className="text-[11px] text-fg-muted mb-2 font-mono">
                                {STRATEGY_PERFORMANCE_COPY.liveLine(live.since, live.snapshotDays, formatPct(live.totalReturnPct), formatPct(live.benchmarkReturnPct))}
                            </p>
                            {live.series.length >= 2 ? (
                                <PerformanceChart series={live.series} accountName={name} />
                            ) : (
                                <div className="py-10 text-center">
                                    <p className="text-sm text-fg-muted">{STRATEGY_PERFORMANCE_COPY.liveStarts(live.since)}</p>
                                    <p className="text-xs text-fg-muted mt-1 font-mono">
                                        {STRATEGY_PERFORMANCE_COPY.curvePending}
                                    </p>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="py-10 text-center">
                            <p className="text-sm text-fg-muted">{STRATEGY_PERFORMANCE_COPY.notStarted}</p>
                        </div>
                    )
                ) : (
                    simulated ? (
                        <>
                            <div className="flex flex-wrap items-center gap-2 mb-2">
                                <span className="px-2 py-0.5 rounded text-[10px] uppercase tracking-[0.08em] text-warning bg-warning/10 font-mono">
                                    {STRATEGY_PERFORMANCE_COPY.simulatedBadge}
                                </span>
                                <span className="text-[11px] text-fg-muted font-mono">
                                    {STRATEGY_PERFORMANCE_COPY.simulatedLine(simulated.from, simulated.to, simulated.closeFills)}
                                </span>
                            </div>
                            {simulated.series.length >= 2 ? (
                                <PerformanceChart series={simulated.series} accountName={`${name} (simulated)`} />
                            ) : (
                                <p className="py-10 text-center text-sm text-fg-muted">{STRATEGY_PERFORMANCE_COPY.tooShort}</p>
                            )}
                        </>
                    ) : (
                        <p className="py-10 text-center text-sm text-fg-muted">{STRATEGY_PAGE_COPY.backtestPending}</p>
                    )
                )}
            </Panel>

            {showingLive && live && <AnalyticsStats analytics={live.stats} definitions />}
            {!showingLive && simulated && <SimulatedStats stats={simulated.stats} />}
        </section>
    );
};

export default StrategyPerformance;
