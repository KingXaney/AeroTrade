'use client';

import {useState} from "react";
import PerformanceChart from "@/components/trading/PerformanceChart";
import AnalyticsStats, {type AnalyticsStatFields} from "@/components/trading/portfolio/AnalyticsStats";
import SimulatedStats from "@/components/strategies/SimulatedStats";
import Panel from "@/components/primitives/Panel";
import SectionHeading from "@/components/primitives/SectionHeading";
import {cn} from "@/lib/utils";
import {formatPct} from "@/lib/format";
import type {SeriesStats} from "@/lib/strategies/types";
import type {PerfPoint} from "@/lib/trading/types";
import {CULTURE_RECORD_COPY as COPY} from "@/lib/learn/copy/culture";

// A picker's live and simulated curves side by side but never on one axis: a toggle, and each
// half says which basis it shows and how far it reaches. The strategies' StrategyPerformance,
// with the culture brain's own sentences; the simulated half shows its profile's variant of the
// stored backtest once one exists (a later slice), and until then says so.

type LivePanel = {
    series: PerfPoint[];
    stats: AnalyticsStatFields;
    since: string;
    snapshotDays: number;
    benchmarkReturnPct: number | null;
    totalReturnPct: number;
};

export type SimulatedPanel = {
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
            'control-type px-3 py-1 rounded-md text-[11px] transition-colors',
            active ? 'bg-brand/10 text-brand' : 'text-fg-muted hover:text-fg',
        )}
    >
        {children}
    </button>
);

type Props = {
    id: string;
    name: string;
    live: LivePanel | null;
    simulated: SimulatedPanel | null;
    initialMode: Mode;
};

const CultureRecord = ({id, name, live, simulated, initialMode}: Props) => {
    const [mode, setMode] = useState<Mode>(initialMode);
    const showingLive = mode === 'live';

    return (
        <section className="space-y-3" id={`culture-record-${id}`} data-culture-record={id}>
            <Panel as="div">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                    <SectionHeading spacing="none">{COPY.heading}</SectionHeading>
                    <div className="flex items-center gap-1 rounded-lg border border-line-strong/20 p-0.5">
                        <Tab id={`record-live-${id}`} active={showingLive} onClick={() => setMode('live')}>{COPY.tabs.live}</Tab>
                        <Tab id={`record-simulated-${id}`} active={!showingLive} onClick={() => setMode('simulated')}>{COPY.tabs.simulated}</Tab>
                    </div>
                </div>

                {showingLive ? (
                    live ? (
                        <>
                            <p className="text-[11px] text-fg-muted mb-2 font-mono">
                                {COPY.liveLine(live.since, live.snapshotDays, formatPct(live.totalReturnPct), formatPct(live.benchmarkReturnPct))}
                            </p>
                            {live.series.length >= 2 ? (
                                <PerformanceChart series={live.series} accountName={name} />
                            ) : (
                                <div className="py-10 text-center">
                                    <p className="text-sm text-fg-muted">{COPY.liveStarts(live.since)}</p>
                                    <p className="text-xs text-fg-muted mt-1 font-mono">{COPY.curvePending}</p>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="py-10 text-center">
                            <p className="text-sm text-fg-muted">{COPY.notStarted}</p>
                        </div>
                    )
                ) : (
                    simulated ? (
                        <>
                            <div className="flex flex-wrap items-center gap-2 mb-2">
                                <span className="label-type px-2 py-0.5 rounded text-[length:var(--label-size)] text-warning bg-warning/10">
                                    {COPY.simulatedBadge}
                                </span>
                                <span className="text-[11px] text-fg-muted font-mono">
                                    {COPY.simulatedLine(simulated.from, simulated.to, simulated.closeFills)}
                                </span>
                            </div>
                            {simulated.series.length >= 2 ? (
                                <PerformanceChart series={simulated.series} accountName={`${name} (simulated)`} />
                            ) : (
                                <p className="py-10 text-center text-sm text-fg-muted">{COPY.tooShort}</p>
                            )}
                            <p className="text-[11px] text-fg-muted mt-2 font-mono">{COPY.feedsNote}</p>
                            <p className="text-[11px] text-fg-muted mt-1 font-mono">{COPY.survivorship}</p>
                        </>
                    ) : (
                        <p className="py-10 text-center text-sm text-fg-muted" data-record-pending>{COPY.pending}</p>
                    )
                )}
            </Panel>

            {showingLive && live && <AnalyticsStats analytics={live.stats} definitions />}
            {!showingLive && simulated && <SimulatedStats stats={simulated.stats} id={`simulated-stats-${id}`} />}
        </section>
    );
};

export default CultureRecord;
