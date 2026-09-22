'use client';

import {useState} from "react";
import PerformanceChart from "@/components/analytics/PerformanceChart";
import AnalyticsStats, {type AnalyticsStatFields} from "@/components/analytics/AnalyticsStats";
import {cn} from "@/lib/utils";
import type {SeriesStats} from "@/lib/strategies/types";

// Live and simulated curves side by side but never on one axis: a toggle, and each
// panel says which basis it shows and how far it reaches.

export type LivePanel = {
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

const SimStat = ({label, value, className, hint}: {label: string; value: string; className?: string; hint?: string}) => (
    <div className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-[0.1em] text-fg-muted" style={{fontFamily: 'var(--type-mono)'}}>{label}</span>
        <span className={cn('text-lg font-semibold text-fg', className)} style={{fontFamily: 'var(--type-display)'}}>{value}</span>
        {hint && <span className="text-[10px] text-fg-muted" style={{fontFamily: 'var(--type-mono)'}}>{hint}</span>}
    </div>
);

// The backtest's own tiles: annualised figures make sense over three years where the
// live tiles (a few weeks old) would not.
const SimulatedStats = ({stats}: {stats: SeriesStats}) => (
    <div className="glass-panel rounded-xl p-5 grid grid-cols-2 md:grid-cols-6 gap-4" id="simulated-stats">
        <SimStat label="Total return" value={pct(stats.totalReturnPct)} className={stats.totalReturnPct !== null ? (stats.totalReturnPct >= 0 ? 'text-positive' : 'text-negative') : undefined} hint="simulated window" />
        <SimStat label="vs SPY" value={pct(stats.excessReturnPct)} className={stats.excessReturnPct !== null ? (stats.excessReturnPct >= 0 ? 'text-positive' : 'text-negative') : undefined} hint={`SPY ${pct(stats.benchmarkReturnPct)}`} />
        <SimStat label="CAGR" value={pct(stats.cagrPct)} hint="annualised" />
        <SimStat label="Max drawdown" value={stats.maxDrawdownPct === null ? '—' : stats.maxDrawdownPct > 0 ? `−${stats.maxDrawdownPct.toFixed(2)}%` : '0.00%'} className={stats.maxDrawdownPct !== null && stats.maxDrawdownPct > 0 ? 'text-negative' : undefined} hint="peak to trough" />
        <SimStat label="Volatility" value={stats.annualizedVolPct === null ? '—' : `${stats.annualizedVolPct.toFixed(1)}%`} hint="annualised" />
        <SimStat label="Win rate" value={stats.winRatePct === null ? '—' : `${stats.winRatePct.toFixed(0)}%`} hint={stats.winRatePct === null ? 'no closed trades' : `${stats.wins}W / ${stats.losses}L · ${stats.tradeCount} fills`} />
    </div>
);

const pct = (value: number | null, digits = 2): string =>
    value === null ? '—' : `${value >= 0 ? '+' : ''}${value.toFixed(digits)}%`;

const Tab = ({active, onClick, children, id}: {active: boolean; onClick: () => void; children: React.ReactNode; id: string}) => (
    <button
        type="button"
        id={id}
        onClick={onClick}
        aria-pressed={active}
        className={cn(
            'px-3 py-1 rounded-md text-[11px] font-bold uppercase tracking-[0.08em] transition-colors',
            active ? 'bg-brand/10 text-brand' : 'text-fg-muted hover:text-fg',
        )}
        style={{fontFamily: 'var(--type-mono)'}}
    >
        {children}
    </button>
);

const StrategyPerformance = ({name, live, simulated, initialMode}: {name: string; live: LivePanel | null; simulated: SimulatedPanel | null; initialMode: Mode}) => {
    const [mode, setMode] = useState<Mode>(initialMode);
    const showingLive = mode === 'live';

    return (
        <section className="space-y-3" id="strategy-performance">
            <div className="glass-panel rounded-xl p-5">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                    <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-brand" style={{fontFamily: 'var(--type-mono)'}}>
                        Performance vs SPY
                    </h2>
                    <div className="flex items-center gap-1 rounded-lg border border-line-strong/20 p-0.5">
                        <Tab id="perf-live" active={showingLive} onClick={() => setMode('live')}>Live</Tab>
                        <Tab id="perf-simulated" active={!showingLive} onClick={() => setMode('simulated')}>Simulated</Tab>
                    </div>
                </div>

                {showingLive ? (
                    live ? (
                        <>
                            <p className="text-[11px] text-fg-muted mb-2" style={{fontFamily: 'var(--type-mono)'}}>
                                Live since {live.since} · {live.snapshotDays} daily snapshot{live.snapshotDays === 1 ? '' : 's'} at 16:10 ET ·
                                return {pct(live.totalReturnPct)} vs SPY {pct(live.benchmarkReturnPct)}
                            </p>
                            {live.series.length >= 2 ? (
                                <PerformanceChart series={live.series} accountName={name} />
                            ) : (
                                <div className="py-10 text-center">
                                    <p className="text-sm text-fg-muted">The live record starts on {live.since}.</p>
                                    <p className="text-xs text-fg-muted mt-1" style={{fontFamily: 'var(--type-mono)'}}>
                                        A curve appears after the second daily snapshot; until then the simulated tab shows the rule&apos;s history.
                                    </p>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="py-10 text-center">
                            <p className="text-sm text-fg-muted">Not started — no live record yet.</p>
                        </div>
                    )
                ) : (
                    simulated ? (
                        <>
                            <div className="flex flex-wrap items-center gap-2 mb-2">
                                <span className="px-2 py-0.5 rounded text-[10px] uppercase tracking-[0.08em] text-warning bg-warning/10" style={{fontFamily: 'var(--type-mono)'}}>
                                    Simulated — backtest, not live
                                </span>
                                <span className="text-[11px] text-fg-muted" style={{fontFamily: 'var(--type-mono)'}}>
                                    {simulated.from} → {simulated.to} · next-open fills · no fees, slippage or dividends
                                    {simulated.closeFills > 0 ? ` · ${simulated.closeFills} fill${simulated.closeFills === 1 ? '' : 's'} used the close` : ''}
                                </span>
                            </div>
                            {simulated.series.length >= 2 ? (
                                <PerformanceChart series={simulated.series} accountName={`${name} (simulated)`} />
                            ) : (
                                <p className="py-10 text-center text-sm text-fg-muted">Not enough stored history to simulate this rule yet.</p>
                            )}
                        </>
                    ) : (
                        <p className="py-10 text-center text-sm text-fg-muted">Backtest not computed yet — it is built on the first run.</p>
                    )
                )}
            </div>

            {showingLive && live && <AnalyticsStats analytics={live.stats} />}
            {!showingLive && simulated && <SimulatedStats stats={simulated.stats} />}
        </section>
    );
};

export default StrategyPerformance;
