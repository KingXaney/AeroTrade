import type {SeriesStats} from "@/lib/strategies/types";
import {formatDrawdown, formatPct, roundPct} from "@/lib/format";
import {SIM_STATS_COPY as COPY} from "@/lib/learn/copy/simulated";
import Panel from "@/components/primitives/Panel";
import StatTile from "@/components/primitives/StatTile";
import Term from "@/components/primitives/Term";
import WhatTheseMean from "@/components/learn/WhatTheseMean";
import type {GlossaryKey} from "@/lib/learn/glossary";

// A simulated series' own tiles: annualised figures make sense over three years where the
// live tiles (a few weeks old) would not. The stored backtest renders them as
// #simulated-stats; the what-if lab renders the same tiles for a setting as #whatif-stats,
// `neutral`: there a green or red figure would read as which setting came out ahead, and the
// lab ranks nothing, so no tile carries a sign colour. Every label and hint is from
// lib/learn/copy/simulated.ts. Client-safe: no hooks, no server imports (StrategyPerformance
// and WhatIfLab are client trees).

const signClass = (value: number | null): string | undefined => {
    if (value === null) return undefined;
    const rounded = roundPct(value);
    return rounded > 0 ? 'text-positive' : rounded < 0 ? 'text-negative' : undefined;
};

// `recordTerm`: the glossary entry that says what kind of simulated record the tiles describe —
// a strategy's backtest by default; the culture brain's attention-and-price variant passes its own.
type Props = {stats: SeriesStats; id?: string; neutral?: boolean; recordTerm?: GlossaryKey};

const SimulatedStats = ({stats, id = 'simulated-stats', neutral = false, recordTerm = 'simulated-record'}: Props) => {
    const sign = (value: number | null) => (neutral ? undefined : signClass(value));
    const drawdownClass = !neutral && stats.maxDrawdownPct !== null && roundPct(stats.maxDrawdownPct) > 0 ? 'text-negative' : undefined;
    return (
        <Panel as="div" id={id}>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                <StatTile label={<Term k="total-return">{COPY.totalReturn}</Term>} value={formatPct(stats.totalReturnPct)} valueClass={sign(stats.totalReturnPct)} hint={COPY.totalReturnHint} />
                <StatTile label={<Term k="vs-spy">{COPY.vsSpy}</Term>} value={formatPct(stats.excessReturnPct)} valueClass={sign(stats.excessReturnPct)} hint={COPY.vsSpyHint(formatPct(stats.benchmarkReturnPct))} />
                <StatTile label={<Term k="cagr">{COPY.cagr}</Term>} value={formatPct(stats.cagrPct)} hint={COPY.cagrHint} />
                <StatTile label={<Term k="max-drawdown">{COPY.maxDrawdown}</Term>} value={formatDrawdown(stats.maxDrawdownPct)} valueClass={drawdownClass} hint={COPY.maxDrawdownHint} />
                <StatTile label={<Term k="volatility">{COPY.volatility}</Term>} value={stats.annualizedVolPct === null ? '—' : `${stats.annualizedVolPct.toFixed(1)}%`} hint={COPY.volatilityHint} />
                <StatTile label={<Term k="win-rate">{COPY.winRate}</Term>} value={stats.winRatePct === null ? '—' : `${stats.winRatePct.toFixed(0)}%`} hint={stats.winRatePct === null ? COPY.winRateNone : COPY.winRateHint(stats)} />
            </div>
            <WhatTheseMean keys={['total-return', 'vs-spy', recordTerm, 'cagr', 'max-drawdown', 'volatility', 'win-rate']} />
        </Panel>
    );
};

export default SimulatedStats;
