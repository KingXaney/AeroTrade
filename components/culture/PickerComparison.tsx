import Panel from "@/components/primitives/Panel";
import SectionHeading from "@/components/primitives/SectionHeading";
import StatTile from "@/components/primitives/StatTile";
import Term from "@/components/primitives/Term";
import WhatTheseMean from "@/components/learn/WhatTheseMean";
import {formatPct} from "@/lib/format";
import type {ComparisonRow} from "@/lib/culture/page-view";
import {COMPARISON_TERMS, CULTURE_PICKS_COPY} from "@/lib/learn/copy/culture";

// The two live records and SPY in one row, in the registry's order, neutral: no tile carries a
// sign colour and nothing is sorted by return, so the strip prints the figures without saying
// which picker came out ahead (invariant 12). The simulated variants join it in a later slice;
// until a backtest is stored the strip says so in one line.
const PickerComparison = ({rows}: {rows: ComparisonRow[]}) => (
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
        <p className="font-mono text-[11px] text-fg-muted mt-4" data-backtest-pending>{CULTURE_PICKS_COPY.backtestPending}</p>
        <WhatTheseMean keys={COMPARISON_TERMS} />
    </Panel>
);

export default PickerComparison;
