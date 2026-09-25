import JobStamp from "@/components/system/JobStamp";
import Badge from "@/components/primitives/Badge";
import Panel from "@/components/primitives/Panel";
import type {StrategiesSystemStatus} from "@/lib/strategies/queries";

// Is the machinery running, and on which day's prices? One line, always visible, so a
// stale feed or a skipped run is the first thing a reader sees — never a silent number.
//
// It used to be four tiles with a hint under each: twelve lines of chrome above the
// actual ranking, every one of them saying the same thing on every visit. Now it is
// quiet when healthy and only grows — the not-run-yet badge, the error list — when
// something is actually wrong.

const Field = ({label, value, last}: {label: string; value: string; last?: boolean}) => (
    <span className="whitespace-nowrap">
        <span className="uppercase tracking-[0.1em] text-fg-muted">{label} </span>
        <span className="text-fg-soft">{value}</span>
        {!last && <span className="text-fg-muted" aria-hidden="true"> ·</span>}
    </span>
);

const StrategyStatusStrip = ({status}: {status: StrategiesSystemStatus}) => (
    <Panel id="strategies-status" pad={4}>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <p className="font-mono flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                <Field label="Live since" value={status.launchDate ?? '—'} />
                <Field label="Last decision" value={status.lastRunDate ?? '—'} />
                <Field label="Bars" value={status.latestBarDate ?? '—'} />
                <Field label="Valued" value="16:10 ET" last />
            </p>
            {!status.started && (
                <Badge tone="warning">Preview of the catalog — has not run yet</Badge>
            )}
        </div>

        {status.job && <div className="mt-3"><JobStamp job={status.job} /></div>}

        {status.errors.length > 0 && (
            <ul className="mt-3 space-y-1" role="status">
                {status.errors.map((e) => (
                    <li key={e.strategyId} className="font-mono text-[11px] text-warning">
                        {e.strategyId}: {e.message}
                    </li>
                ))}
            </ul>
        )}
    </Panel>
);

export default StrategyStatusStrip;
