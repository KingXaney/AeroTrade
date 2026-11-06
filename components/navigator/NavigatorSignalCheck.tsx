import Panel from "@/components/primitives/Panel";
import SectionHeading from "@/components/primitives/SectionHeading";
import WhatTheseMean from "@/components/learn/WhatTheseMean";
import IcTable, {icFigures, icMostWeeks} from "@/components/research/IcTable";
import type {NavigatorSignalView} from "@/lib/navigator/signal-store";
import {NAVIGATOR_SIGNAL_COPY, NAVIGATOR_SIGNAL_TERMS} from "@/lib/learn/copy/navigator";
import {RESEARCH_COPY} from "@/lib/learn/copy/research";

// What each of the Navigator's terms said, against what followed (research log R1): its own
// record, kept from the first weekly run after this was built. Until a column has eight weeks it
// says how far the record has come, once; then the table, in the order the scorer weighs them.
const NavigatorSignalCheck = ({view}: {view: NavigatorSignalView}) => (
    <Panel id="navigator-signal-check">
        <SectionHeading>{NAVIGATOR_SIGNAL_COPY.heading}</SectionHeading>
        {view.table === null ? (
            <p className="text-xs text-fg-muted" data-signal-recording>
                {view.since === null ? NAVIGATOR_SIGNAL_COPY.notStarted : NAVIGATOR_SIGNAL_COPY.recording(view.since, view.weeks)}
            </p>
        ) : (
            <>
                <p className="text-xs text-fg-muted mb-4">{NAVIGATOR_SIGNAL_COPY.lead}</p>
                <IcTable table={view.table} />
                <p className="font-mono text-[11px] text-fg-muted mt-3">{RESEARCH_COPY.weeksNote(icMostWeeks(view.table))}</p>
                <p className="font-mono text-[11px] text-fg-muted mt-1">{RESEARCH_COPY.hurdle(icFigures(view.table))}</p>
                <WhatTheseMean keys={NAVIGATOR_SIGNAL_TERMS} />
            </>
        )}
    </Panel>
);

export default NavigatorSignalCheck;
