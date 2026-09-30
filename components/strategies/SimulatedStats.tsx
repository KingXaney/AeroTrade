import {cn} from "@/lib/utils";
import type {SeriesStats} from "@/lib/strategies/types";
import {formatDrawdown, formatPct, roundPct} from "@/lib/strategies/views";
import Term from "@/components/primitives/Term";
import WhatTheseMean from "@/components/learn/WhatTheseMean";

// A simulated series' own tiles: annualised figures make sense over three years where the
// live tiles (a few weeks old) would not. The stored backtest renders them as
// #simulated-stats; the what-if lab renders the same tiles for a setting as #whatif-stats.
// Client-safe: no hooks, no server imports (StrategyPerformance and WhatIfLab are client trees).

const SimStat = ({label, value, className, hint}: {label: React.ReactNode; value: string; className?: string; hint?: string}) => (
    <div className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-[0.1em] text-fg-muted" style={{fontFamily: 'var(--type-mono)'}}>{label}</span>
        <span className={cn('text-lg font-semibold text-fg', className)} style={{fontFamily: 'var(--type-display)'}}>{value}</span>
        {hint && <span className="text-[10px] text-fg-muted" style={{fontFamily: 'var(--type-mono)'}}>{hint}</span>}
    </div>
);

const signClass = (value: number | null): string | undefined => {
    if (value === null) return undefined;
    const rounded = roundPct(value);
    return rounded > 0 ? 'text-positive' : rounded < 0 ? 'text-negative' : undefined;
};

const SimulatedStats = ({stats, id = 'simulated-stats'}: {stats: SeriesStats; id?: string}) => (
    <div className="glass-panel rounded-xl p-5" id={id}>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <SimStat label={<Term k="total-return">Total return</Term>} value={formatPct(stats.totalReturnPct)} className={signClass(stats.totalReturnPct)} hint="simulated window" />
        <SimStat label={<Term k="vs-spy">vs SPY</Term>} value={formatPct(stats.excessReturnPct)} className={signClass(stats.excessReturnPct)} hint={`SPY ${formatPct(stats.benchmarkReturnPct)}`} />
        <SimStat label={<Term k="cagr">CAGR</Term>} value={formatPct(stats.cagrPct)} hint="annualised" />
        <SimStat label={<Term k="max-drawdown">Max drawdown</Term>} value={formatDrawdown(stats.maxDrawdownPct)} className={stats.maxDrawdownPct !== null && roundPct(stats.maxDrawdownPct) > 0 ? 'text-negative' : undefined} hint="peak to trough" />
        <SimStat label={<Term k="volatility">Volatility</Term>} value={stats.annualizedVolPct === null ? '—' : `${stats.annualizedVolPct.toFixed(1)}%`} hint="annualised" />
        <SimStat label={<Term k="win-rate">Win rate</Term>} value={stats.winRatePct === null ? '—' : `${stats.winRatePct.toFixed(0)}%`} hint={stats.winRatePct === null ? 'no closed trades' : `${stats.wins}W / ${stats.losses}L · ${stats.tradeCount} fills`} />
        </div>
        <WhatTheseMean keys={['total-return', 'vs-spy', 'simulated-record', 'cagr', 'max-drawdown', 'volatility', 'win-rate']} />
    </div>
);

export default SimulatedStats;
