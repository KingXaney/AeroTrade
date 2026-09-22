import JobStamp from "@/components/system/JobStamp";
import type {StrategiesSystemStatus} from "@/lib/strategies/queries";

// Is the machinery running, and on which day's prices? One row, always visible, so a
// stale feed or a skipped run is the first thing a reader sees — never a silent number.

const Stat = ({label, value, hint}: {label: string; value: string; hint?: string}) => (
    <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-[10px] uppercase tracking-[0.1em] text-fg-muted" style={{fontFamily: 'var(--type-mono)'}}>{label}</span>
        <span className="text-sm font-semibold text-fg truncate" style={{fontFamily: 'var(--type-display)'}}>{value}</span>
        {hint && <span className="text-[10px] text-fg-muted" style={{fontFamily: 'var(--type-mono)'}}>{hint}</span>}
    </div>
);

const StrategyStatusStrip = ({status}: {status: StrategiesSystemStatus}) => (
    <section className="glass-panel rounded-xl p-5" id="strategies-status">
        <div className="flex items-center justify-between mb-4 gap-3">
            <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-brand" style={{fontFamily: 'var(--type-mono)'}}>
                System Status
            </h2>
            {!status.started && (
                <span className="px-2 py-0.5 rounded text-[10px] uppercase tracking-[0.08em] text-warning bg-warning/10" style={{fontFamily: 'var(--type-mono)'}}>
                    Preview of the catalog — has not run yet
                </span>
            )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <Stat label="Live since" value={status.launchDate ?? '—'} hint={status.started ? 'system paper accounts opened' : 'first run 09:35 ET on the next trading day'} />
            <Stat label="Last decision" value={status.lastRunDate ?? '—'} hint="orders fill ~5 min after the open" />
            <Stat label="Bars as of" value={status.latestBarDate ?? '—'} hint="daily closes (Yahoo, Stooq fallback)" />
            <Stat label="Valuation" value="16:10 ET" hint="daily snapshot after the close" />
        </div>
        {status.job && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <JobStamp job={status.job} />
            </div>
        )}
        {status.errors.length > 0 && (
            <ul className="mt-3 space-y-1" role="status">
                {status.errors.map((e) => (
                    <li key={e.strategyId} className="text-[11px] text-warning" style={{fontFamily: 'var(--type-mono)'}}>
                        {e.strategyId}: {e.message}
                    </li>
                ))}
            </ul>
        )}
    </section>
);

export default StrategyStatusStrip;
