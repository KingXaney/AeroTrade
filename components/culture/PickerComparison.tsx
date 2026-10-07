import Panel from "@/components/primitives/Panel";
import SectionHeading from "@/components/primitives/SectionHeading";
import StatTile from "@/components/primitives/StatTile";
import Term from "@/components/primitives/Term";
import WhatTheseMean from "@/components/learn/WhatTheseMean";
import {formatPct} from "@/lib/format";
import type {CultureBacktestView} from "@/lib/culture/backtest";
import type {ComparisonRow} from "@/lib/culture/page-view";
import {COMPARISON_TERMS, CULTURE_PICKS_COPY, CULTURE_RECORD_COPY} from "@/lib/learn/copy/culture";

// The two live records and SPY in one row, then the three simulated variants and SPY over the
// backtest's window in a second, every tile in the registry's order and neutral: no tile
// carries a sign colour and nothing is sorted by return, so the strip prints the figures
// without saying which picker came out ahead (invariant 12). Until a backtest is stored the
// second row is one line saying so.
const PickerComparison = ({rows, simulated}: {rows: ComparisonRow[]; simulated: CultureBacktestView | null}) => (
    <Panel id="picker-comparison">
        <SectionHeading>{CULTURE_PICKS_COPY.comparisonHeading}</SectionHeading>
        <p className="text-xs text-fg-muted mb-4">{CULTURE_PICKS_COPY.comparisonLead}</p>
        <div className="grid grid-cols-3 gap-4" data-comparison-strip>
            {rows.map((row) => (
                <div key={row.id} data-comparison={row.id}>
                    <StatTile
                        label={row.id === 'spy' ? row.label : <Term k="picker-profile">{row.label}</Term>}
                        value={row.returnPct === null ? '—' : formatPct(row.returnPct)}
                        hint={row.since ? CULTURE_PICKS_COPY.sinceLaunch(row.since) : CULTURE_PICKS_COPY.notStarted}
                    />
                </div>
            ))}
        </div>
        {simulated ? (
            <div className="mt-5" data-simulated-strip>
                <div className="flex flex-wrap items-center gap-2 mb-3">
                    <span className="label-type px-2 py-0.5 rounded text-[length:var(--label-size)] text-warning bg-warning/10">
                        {CULTURE_RECORD_COPY.simulatedBadge}
                    </span>
                    <span className="text-[11px] text-fg-muted font-mono">
                        {CULTURE_PICKS_COPY.simulatedLine(simulated.from, simulated.to, simulated.variants[0]?.weeks ?? 0)}
                    </span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {simulated.variants.map((variant) => (
                        <div key={variant.profile} data-simulated={variant.profile}>
                            <StatTile
                                label={<Term k="attention-backtest">{variant.label}</Term>}
                                value={formatPct(variant.stats.totalReturnPct)}
                                hint={CULTURE_PICKS_COPY.simulatedFills(variant.tradeCount)}
                            />
                        </div>
                    ))}
                    <div data-simulated="spy">
                        <StatTile label="SPY" value={formatPct(simulated.benchmarkReturnPct)} hint={CULTURE_PICKS_COPY.simulatedSpyHint} />
                    </div>
                </div>
                <p className="font-mono text-[11px] text-fg-muted mt-3">{CULTURE_RECORD_COPY.feedsNote}</p>
                <p className="font-mono text-[11px] text-fg-muted mt-1">{CULTURE_RECORD_COPY.survivorship}</p>
            </div>
        ) : (
            <p className="font-mono text-[11px] text-fg-muted mt-4" data-backtest-pending>{CULTURE_PICKS_COPY.backtestPending}</p>
        )}
        <WhatTheseMean keys={simulated ? [...COMPARISON_TERMS, 'attention-backtest'] : COMPARISON_TERMS} />
    </Panel>
);

export default PickerComparison;
