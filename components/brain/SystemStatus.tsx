import {type BrainSystemStatus} from "@/lib/brain/queries";
import JobStamp, {jobHealth} from "@/components/system/JobStamp";

// Pipeline observability for the /brain page: is each Inngest job actually
// running, and is the brain actually learning? Health is derived from job-stamp
// staleness so even a crashed job shows up (its stamp stops moving).

// Ingest is capped independently of the daily extraction budget, so a persistent
// backlog is the signal that the budget — not the feeds — is the limiting factor.
const extractionHint = (status: BrainSystemStatus): string => {
    if (status.articlesTotal > 0 && status.articlesExtracted === 0) return 'none — check GEMINI_API_KEY';
    if (status.articlesUnextracted > 0) return `${status.articlesUnextracted} waiting to be read`;
    return 'all caught up';
};

const Stat = ({label, value, hint}: {label: string; value: string; hint?: string}) => (
    <div className="flex flex-col gap-0.5">
        <span className="text-[10px] uppercase tracking-[0.1em] text-fg-muted" style={{fontFamily: 'var(--type-mono)'}}>
            {label}
        </span>
        <span className="text-sm font-semibold text-fg" style={{fontFamily: 'var(--type-display)'}}>{value}</span>
        {hint && <span className="text-[10px] text-fg-muted" style={{fontFamily: 'var(--type-mono)'}}>{hint}</span>}
    </div>
);

const SystemStatus = ({status}: {status: BrainSystemStatus}) => {
    const anyNever = status.jobs.some((j) => j.staleAfterHours !== Number.POSITIVE_INFINITY && jobHealth(j) === 'never');

    return (
        <section className="glass-panel rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-brand" style={{fontFamily: 'var(--type-mono)'}}>
                    System Status
                </h2>
                {anyNever && (
                    <span className="text-[10px] uppercase tracking-[0.08em] text-negative" style={{fontFamily: 'var(--type-mono)'}}>
                        Some jobs have never run — check the Inngest connection
                    </span>
                )}
            </div>

            {/* Pipeline counters */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
                <Stat label="Articles" value={String(status.articlesTotal)} hint={`${status.articlesLast24h} in last 24h`} />
                <Stat
                    label="Extracted"
                    value={String(status.articlesExtracted)}
                    hint={extractionHint(status)}
                />
                <Stat label="Entities" value={String(status.entityCount)} hint="knowledge graph nodes" />
                <Stat label="Theses" value={String(status.thesisCount)} hint="sustained narratives" />
                <Stat label="Priced symbols" value={String(status.pricedSymbols)} hint="daily history (Yahoo, Stooq fallback)" />
            </div>

            {/* Job stamps */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                {status.jobs.map((job) => <JobStamp key={job.jobId} job={job} />)}
            </div>
        </section>
    );
};

export default SystemStatus;
