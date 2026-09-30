import {cn} from "@/lib/utils";
import type {SeriesStats} from "@/lib/strategies/types";
import {formatDrawdown, formatPct, roundPct} from "@/lib/strategies/views";
import {SIM_STATS_COPY as COPY} from "@/lib/learn/copy/simulated";
import Panel from "@/components/primitives/Panel";
import Term from "@/components/primitives/Term";
import WhatTheseMean from "@/components/learn/WhatTheseMean";

// A simulated series' own tiles: annualised figures make sense over three years where the
// live tiles (a few weeks old) would not. The stored backtest renders them as
// #simulated-stats; the what-if lab renders the same tiles for a setting as #whatif-stats,
// `neutral`: there a green or red figure would read as which setting came out ahead, and the
// lab ranks nothing, so no tile carries a sign colour. Every label and hint is from
// lib/learn/copy/simulated.ts. Client-safe: no hooks, no server imports (StrategyPerformance
// and WhatIfLab are client trees).

const SimStat = ({label, value, className, hint}: {label: React.ReactNode; value: string; className?: string; hint?: string}) => (
    <div className="flex flex-col gap-1">
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-fg-muted">{label}</span>
        <span className={cn('font-heading text-lg font-semibold text-fg', className)}>{value}</span>
        {hint && <span className="font-mono text-[10px] text-fg-muted">{hint}</span>}
    </div>
);

const signClass = (value: number | null): string | undefined => {
    if (value === null) return undefined;
    const rounded = roundPct(value);
    return rounded > 0 ? 'text-positive' : rounded < 0 ? 'text-negative' : undefined;
};

type Props = {stats: SeriesStats; id?: string; neutral?: boolean};

const SimulatedStats = ({stats, id = 'simulated-stats', neutral = false}: Props) => {
    const sign = (value: number | null) => (neutral ? undefined : signClass(value));
    const drawdownClass = !neutral && stats.maxDrawdownPct !== null && roundPct(stats.maxDrawdownPct) > 0 ? 'text-negative' : undefined;
    return (
        <Panel as="div" id={id}>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                <SimStat label={<Term k="total-return">{COPY.totalReturn}</Term>} value={formatPct(stats.totalReturnPct)} className={sign(stats.totalReturnPct)} hint={COPY.totalReturnHint} />
                <SimStat label={<Term k="vs-spy">{COPY.vsSpy}</Term>} value={formatPct(stats.excessReturnPct)} className={sign(stats.excessReturnPct)} hint={COPY.vsSpyHint(formatPct(stats.benchmarkReturnPct))} />
                <SimStat label={<Term k="cagr">{COPY.cagr}</Term>} value={formatPct(stats.cagrPct)} hint={COPY.cagrHint} />
                <SimStat label={<Term k="max-drawdown">{COPY.maxDrawdown}</Term>} value={formatDrawdown(stats.maxDrawdownPct)} className={drawdownClass} hint={COPY.maxDrawdownHint} />
                <SimStat label={<Term k="volatility">{COPY.volatility}</Term>} value={stats.annualizedVolPct === null ? '—' : `${stats.annualizedVolPct.toFixed(1)}%`} hint={COPY.volatilityHint} />
                <SimStat label={<Term k="win-rate">{COPY.winRate}</Term>} value={stats.winRatePct === null ? '—' : `${stats.winRatePct.toFixed(0)}%`} hint={stats.winRatePct === null ? COPY.winRateNone : COPY.winRateHint(stats)} />
            </div>
            <WhatTheseMean keys={['total-return', 'vs-spy', 'simulated-record', 'cagr', 'max-drawdown', 'volatility', 'win-rate']} />
        </Panel>
    );
};

export default SimulatedStats;
