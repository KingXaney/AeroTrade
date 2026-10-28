'use client';

import {useState} from "react";
import MicroLabel from "@/components/primitives/MicroLabel";
import SafeMarkdown from "@/components/primitives/SafeMarkdown";
import {ROLES, type RoleId} from "@/lib/agent-world/config";
import {hasText, latestRole} from "@/lib/agent-world/page-view";
import type {RunView} from "@/lib/agent-world/types";
import {AGENT_WORLD_COPY, FLOOR_COPY, ROLE_COPY} from "@/lib/learn/copy/agent-world";
import {cn} from "@/lib/utils";

// One reading pane over the run's texts: each role's report, the researchers' turns, the risk
// desk's views, the portfolio manager's decision. While the reader has picked nothing the pane
// follows the newest text, so a live run reads itself out as it is filed. Every text is the
// model's own, rendered through SafeMarkdown (links read as text, images dropped) under the caveat.
const RoleText = ({run, role}: {run: RunView; role: RoleId}) => {
    if (role === 'bull' || role === 'bear' || role === 'risk-aggressive' || role === 'risk-conservative' || role === 'risk-neutral') {
        const turns = role === 'bull' || role === 'bear'
            ? run.debate.filter((turn) => turn.side === role)
            : run.risk.filter((turn) => turn.role === role);
        if (turns.length === 0) return <p className="text-sm text-fg-muted">{FLOOR_COPY.debateNone}</p>;
        return (
            <ol className="space-y-3">
                {turns.map((turn) => (
                    <li key={turn.seq} data-aw-turn={role}>
                        <MicroLabel tone="soft">{FLOOR_COPY.round(turn.round)}</MicroLabel>
                        <SafeMarkdown className="mt-1 text-sm text-fg">{turn.text}</SafeMarkdown>
                    </li>
                ))}
            </ol>
        );
    }
    const text = run.reports[role];
    if (text === undefined) {
        const name = ROLE_COPY[role].name;
        return <p className="text-sm text-fg-muted">{run.status === 'running' || run.status === 'pending' ? FLOOR_COPY.reportPending(name) : FLOOR_COPY.reportMissing(name)}</p>;
    }
    return <SafeMarkdown className="text-sm text-fg">{text}</SafeMarkdown>;
};

const ReportRail = ({run}: {run: RunView | null}) => {
    const [picked, setPicked] = useState<RoleId | null>(null);
    const role = picked ?? latestRole(run) ?? 'market';
    return (
        <div data-aw-reports className="space-y-3">
            <p className="text-xs text-fg-muted max-w-3xl" data-aw-caveat>{AGENT_WORLD_COPY.caveat}</p>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={FLOOR_COPY.reportsHeading}>
                {ROLES.map(({id}) => {
                    const has = hasText(run, id);
                    return (
                        <button
                            key={id}
                            type="button"
                            data-aw-pick={id}
                            data-has={has ? 'true' : 'false'}
                            aria-pressed={id === role}
                            disabled={!has}
                            onClick={() => setPicked(id === picked ? null : id)}
                            className={cn(
                                'control-type rounded-[var(--control-radius)] border px-2.5 py-1 text-xs transition-colors',
                                id === role ? 'border-brand bg-brand/10 text-fg' : 'border-line text-fg-muted hover:text-fg',
                                !has && 'opacity-40 cursor-not-allowed',
                            )}
                        >
                            {ROLE_COPY[id].name}
                        </button>
                    );
                })}
            </div>
            <section data-aw-report={role} aria-live="polite" className="rounded-[var(--control-radius)] border border-line bg-surface-1 p-4 max-h-[30rem] overflow-y-auto">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <h3 className="heading-type text-sm text-fg">{ROLE_COPY[role].name}</h3>
                    <MicroLabel tone="soft">{FLOOR_COPY.modelText}</MicroLabel>
                </div>
                <p className="mt-1 mb-3 text-xs text-fg-muted">{ROLE_COPY[role].line}</p>
                {run ? <RoleText run={run} role={role} /> : <p className="text-sm text-fg-muted">{FLOOR_COPY.reportPending(ROLE_COPY[role].name)}</p>}
            </section>
        </div>
    );
};

export default ReportRail;
