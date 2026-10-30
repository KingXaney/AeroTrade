import Panel from "@/components/primitives/Panel";
import SectionHeading from "@/components/primitives/SectionHeading";
import WhatTheseMean from "@/components/learn/WhatTheseMean";
import IcTable, {icFigures, icMostWeeks} from "@/components/research/IcTable";
import type {IcTable as Table} from "@/lib/research/ic";
import {RESEARCH_COPY} from "@/lib/learn/copy/research";
import {SIGNAL_CHECK_COPY, SIGNAL_CHECK_TERMS} from "@/lib/learn/copy/culture";

// What each signal said, against what followed (research log R1 and R2): the backtest's weeks,
// each signal's ranking of the owners beside the returns that came after it, at every horizon
// the build could measure (lib/culture/backtest.toSignalTable), drawn only once one did.
const SignalCheck = ({table}: {table: Table}) => (
    <Panel id="signal-check">
        <SectionHeading>{SIGNAL_CHECK_COPY.heading}</SectionHeading>
        <p className="text-xs text-fg-muted mb-4">{SIGNAL_CHECK_COPY.lead}</p>
        <IcTable table={table} />
        <p className="font-mono text-[11px] text-fg-muted mt-3">{RESEARCH_COPY.weeksNote(icMostWeeks(table))}</p>
        <p className="font-mono text-[11px] text-fg-muted mt-1">{RESEARCH_COPY.hurdle(icFigures(table))}</p>
        <p className="font-mono text-[11px] text-fg-muted mt-1">{SIGNAL_CHECK_COPY.simulatedOnly}</p>
        <WhatTheseMean keys={SIGNAL_CHECK_TERMS} />
    </Panel>
);

export default SignalCheck;
