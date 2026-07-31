import {formatTimeAgo} from "@/lib/utils";
import {type BrainSystemStatus, type JobHealth} from "@/lib/brain/queries";

// Pipeline observability for the /brain page: is each Inngest job actually
// running, and is the brain actually learning? Health is derived from job-stamp
// staleness so even a crashed job shows up (its stamp stops moving).

type Health = 'ok' | 'stale' | 'never';

const jobHealth = (job: JobHealth): Health => {
    if (job.lastRunAt === null) return 'never';
    const ageHours = (Date.now() - job.lastRunAt) / (60 * 60 * 1000);
    return ageHours > job.staleAfterHours ? 'stale' : 'ok';
};

// Ingest is capped independently of the daily extraction budget, so a persistent
// backlog is the signal that the budget — not the feeds — is the limiting factor.
const extractionHint = (status: BrainSystemStatus): string => {
    if (status.articlesTotal > 0 && status.articlesExtracted === 0) return 'none — check GEMINI_API_KEY';
    if (status.articlesUnextracted > 0) return `${status.articlesUnextracted} waiting to be read`;
    return 'all caught up';
};

const DOT_COLORS: Record<Health, string> = {
    ok: '#7df4ff',
    stale: '#ffd700',
    never: '#ffb4ab',
};

const Stat = ({label, value, hint}: {label: string; value: string; hint?: string}) => (
    <div className="flex flex-col gap-0.5">
        <span className="text-[10px] uppercase tracking-[0.1em] text-[#849495]" style={{fontFamily: 'var(--font-jetbrains)'}}>
            {label}
        </span>
        <span className="text-sm font-semibold text-[#e2e2e8]" style={{fontFamily: 'var(--font-sora)'}}>{value}</span>
        {hint && <span className="text-[10px] text-[#849495]" style={{fontFamily: 'var(--font-jetbrains)'}}>{hint}</span>}
    </div>
);

const SystemStatus = ({status}: {status: BrainSystemStatus}) => {
    const anyNever = status.jobs.some((j) => j.staleAfterHours !== Number.POSITIVE_INFINITY && jobHealth(j) === 'never');

    return (
        <section className="glass-panel rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-[#7df4ff]" style={{fontFamily: 'var(--font-jetbrains)'}}>
                    System Status
                </h2>
                {anyNever && (
                    <span className="text-[10px] uppercase tracking-[0.08em] text-[#ffb4ab]" style={{fontFamily: 'var(--font-jetbrains)'}}>
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
                <Stat label="Priced symbols" value={String(status.pricedSymbols)} hint="daily history (Stooq)" />
            </div>

            {/* Job stamps */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                {status.jobs.map((job) => {
                    const health = jobHealth(job);
                    return (
                        <div key={job.jobId}
                             className="flex items-start gap-2.5 px-3 py-2 rounded-lg border bg-[rgba(30,32,36,0.4)] border-[rgba(59,73,75,0.2)]">
                            <span className="mt-1 inline-block w-2 h-2 rounded-full shrink-0" style={{backgroundColor: DOT_COLORS[health]}} />
                            <div className="min-w-0">
                                <div className="text-xs font-semibold text-[#e2e2e8]" style={{fontFamily: 'var(--font-jetbrains)'}}>
                                    {job.label}
                                    <span className="ml-2 font-normal text-[#849495]">{job.schedule}</span>
                                </div>
                                <div className="text-[11px] text-[#849495] truncate" style={{fontFamily: 'var(--font-jetbrains)'}}>
                                    {job.lastRunAt === null
                                        ? (job.staleAfterHours === Number.POSITIVE_INFINITY ? 'not run yet' : 'never ran')
                                        : `${formatTimeAgo(Math.floor(job.lastRunAt / 1000))}${health === 'stale' ? ' — overdue' : ''}`}
                                </div>
                                {job.lastMessage && (
                                    <div className="text-[11px] text-[#b9cacb] truncate" title={job.lastMessage} style={{fontFamily: 'var(--font-jetbrains)'}}>
                                        {job.lastMessage}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </section>
    );
};

export default SystemStatus;
