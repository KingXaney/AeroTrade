import WhatTheseMean from "@/components/learn/WhatTheseMean";
import Panel from "@/components/primitives/Panel";
import SectionHeading from "@/components/primitives/SectionHeading";
import StatTile from "@/components/primitives/StatTile";
import Term from "@/components/primitives/Term";
import PerformanceChart from "@/components/trading/PerformanceChart";
import {comparisonRows, formatCents} from "@/lib/agent-world/page-view";
import type {DeskRecordView} from "@/lib/agent-world/page-store";
import {formatPct} from "@/lib/format";
import {RECORD_COPY, RECORD_TERMS} from "@/lib/learn/copy/agent-world";

// The desk's paper account beside SPY over the same days, in a fixed order and with no sign colour:
// the strip states two returns and ranks nothing (invariant 12). Then how many sessions ran and
// what their model calls cost, and the curve once two daily snapshots exist.
const DeskRecord = ({record, sessions, spentCents}: {record: DeskRecordView | null; sessions: number; spentCents: number}) => (
    <Panel id="agent-world-record">
        <SectionHeading>{RECORD_COPY.heading}</SectionHeading>
        <p className="text-sm text-fg-soft max-w-3xl">{RECORD_COPY.lead}</p>
        <div data-comparison-strip className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-4">
            {comparisonRows(record).map((row) => (
                <div key={row.id} data-comparison={row.id}>
                    <StatTile
                        label={<Term k={row.id === 'desk' ? 'total-return' : 'benchmark'}>{row.id === 'desk' ? RECORD_COPY.desk : RECORD_COPY.spy}</Term>}
                        value={formatPct(row.returnPct)}
                        hint={row.since ? RECORD_COPY.since(row.since) : RECORD_COPY.notStarted}
                    />
                </div>
            ))}
            <div data-aw-sessions-count>
                <StatTile label={<Term k="desk-session">{RECORD_COPY.sessions}</Term>} value={sessions.toLocaleString('en-US')} />
            </div>
            <div data-aw-spent>
                <StatTile label={<Term k="session-cost">{RECORD_COPY.spent}</Term>} value={formatCents(spentCents)} />
            </div>
        </div>
        {record && record.series.length >= 2
            ? <div className="mt-4"><PerformanceChart series={record.series} accountName={RECORD_COPY.desk} /></div>
            : <p className="mt-3 text-xs text-fg-muted">{record ? RECORD_COPY.curvePending : RECORD_COPY.noAccount}</p>}
        <div className="mt-4"><WhatTheseMean keys={RECORD_TERMS} /></div>
    </Panel>
);

export default DeskRecord;
