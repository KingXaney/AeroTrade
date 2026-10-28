import WhatTheseMean from "@/components/learn/WhatTheseMean";
import Badge from "@/components/primitives/Badge";
import Panel from "@/components/primitives/Panel";
import RowCard from "@/components/primitives/RowCard";
import SectionHeading from "@/components/primitives/SectionHeading";
import {formatCents, ratingParts} from "@/lib/agent-world/page-view";
import type {SessionRow} from "@/lib/agent-world/types";
import {KIND_COPY, SESSIONS_COPY, SESSIONS_TERMS, STATUS_COPY} from "@/lib/learn/copy/agent-world";

// The latest sessions, newest first: the week, the kind, the state, each symbol's rating (symbol
// first, so no line opens on a rating's word), the fills and the model cost.
const SessionsList = ({rows}: {rows: readonly SessionRow[]}) => (
    <Panel id="agent-world-sessions">
        <SectionHeading>{SESSIONS_COPY.heading}</SectionHeading>
        {rows.length === 0 ? (
            <p className="text-sm text-fg-muted">{SESSIONS_COPY.empty}</p>
        ) : (
            <ul className="space-y-2">
                {rows.map((row) => {
                    const filled = row.fills.filter((fill) => fill.executed).length;
                    const parts = [
                        ratingParts(row).join(' · '),
                        row.fills.length > 0 ? SESSIONS_COPY.fills(filled, row.fills.length) : '',
                        SESSIONS_COPY.cost(formatCents(row.cost.totalCents)),
                    ].filter(Boolean);
                    return (
                        <RowCard key={row.sessionId} as="li" data-aw-session={row.sessionId} data-status={row.status}>
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm text-fg">{SESSIONS_COPY.line(row.weekKey, KIND_COPY[row.kind], row.runs.length)}</span>
                                <Badge tone={row.status === 'failed' ? 'warning' : 'neutral'}>{STATUS_COPY[row.status]}</Badge>
                            </div>
                            <div className="mt-1 text-xs text-fg-muted">{parts.join(' · ')}</div>
                        </RowCard>
                    );
                })}
            </ul>
        )}
        <div className="mt-4"><WhatTheseMean keys={SESSIONS_TERMS} /></div>
    </Panel>
);

export default SessionsList;
