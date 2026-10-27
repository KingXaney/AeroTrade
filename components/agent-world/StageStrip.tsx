import Badge from "@/components/primitives/Badge";
import MicroLabel from "@/components/primitives/MicroLabel";
import {rowCard} from "@/components/primitives/RowCard";
import {TEAM_IDS, type StageStatus} from "@/lib/agent-world/config";
import {elapsedText, formatCents, formatTokens, type StageView} from "@/lib/agent-world/page-view";
import {FLOOR_COPY, ROLE_COPY, STAGE_STATUS_COPY, TEAM_COPY, vendorLabel} from "@/lib/learn/copy/agent-world";
import {cn} from "@/lib/utils";

// The desk at a glance: the five teams in run order (numbered, side by side from md, stacked on a
// phone), each role a tile with its state, its clock, its calls, tokens and cost, and the providers
// its fetches were answered by. A working role's dot breathes (.aw-working, CSS keyframes only,
// stopped under both reduced-motion guards and in brutalist). No sign colour anywhere: the dot
// reads waiting, working, done or stopped, nothing better or worse.
const DOT: Readonly<Record<StageStatus, string>> = {
    waiting: 'bg-line-strong',
    working: 'bg-brand',
    done: 'bg-brand',
    failed: 'bg-warning',
};

const StageTile = ({stage, now}: {stage: StageView; now: number}) => {
    const role = ROLE_COPY[stage.role];
    const elapsed = elapsedText(stage.startedAt, stage.finishedAt, now);
    return (
        <li
            data-aw-stage={stage.role}
            data-status={stage.status}
            title={role.line}
            className={rowCard({tone: stage.status === 'working' ? 'brand' : 'plain', className: 'min-w-0'})}
        >
            <div className="flex items-center gap-2 min-w-0">
                <span aria-hidden className={cn('inline-block size-2 shrink-0 rounded-full', DOT[stage.status], stage.status === 'working' && 'aw-working', stage.status === 'waiting' && 'opacity-60')} />
                <span className="text-sm font-medium text-fg truncate">{role.name}</span>
                {elapsed && <span className="ml-auto text-xs text-fg-muted tabular-nums" data-aw-elapsed>{elapsed}</span>}
            </div>
            <div className="mt-1 text-xs text-fg-muted">
                {STAGE_STATUS_COPY[stage.status]}
                {stage.status !== 'waiting' && stage.llmCalls > 0 && <> · {FLOOR_COPY.tileStats(stage.llmCalls, formatTokens(stage.tokensIn + stage.tokensOut), formatCents(stage.costCents))}</>}
            </div>
            {stage.vendors.length > 0 && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1" aria-label={FLOOR_COPY.vendorsLabel}>
                    {stage.vendors.map((vendor) => (
                        <Badge key={vendor.vendor} tone="neutral" shape="pill" data-aw-vendor-badge={vendor.vendor}>
                            {vendorLabel(vendor.vendor)} ×{vendor.count}
                        </Badge>
                    ))}
                </div>
            )}
        </li>
    );
};

const StageStrip = ({stages, now}: {stages: readonly StageView[]; now: number}) => (
    <ol data-aw-strip className="grid grid-cols-1 md:grid-cols-5 gap-3">
        {TEAM_IDS.map((team, index) => (
            <li key={team} data-aw-team={team} className="min-w-0">
                <div className="mb-2 flex items-center gap-2">
                    <span className="label-type text-[length:var(--label-size)] text-fg-soft tabular-nums">{index + 1}</span>
                    <MicroLabel>{TEAM_COPY[team]}</MicroLabel>
                </div>
                <ul className="space-y-2">
                    {stages.filter((stage) => stage.team === team).map((stage) => <StageTile key={stage.role} stage={stage} now={now} />)}
                </ul>
            </li>
        ))}
    </ol>
);

export default StageStrip;
