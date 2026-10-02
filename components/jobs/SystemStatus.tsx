import {type BrainSystemStatus} from "@/lib/brain/store";
import JobStamp, {jobHealth} from "@/components/jobs/JobStamp";
import StatTile from "@/components/primitives/StatTile";
import Panel from "@/components/primitives/Panel";
import SectionHeading from "@/components/primitives/SectionHeading";

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

const SystemStatus = ({status}: {status: BrainSystemStatus}) => {
    const anyNever = status.jobs.some((j) => j.staleAfterHours !== Number.POSITIVE_INFINITY && jobHealth(j) === 'never');

    return (
        <Panel>
            <div className="flex items-center justify-between mb-4">
                <SectionHeading spacing="none">
                    System Status
                </SectionHeading>
                {anyNever && (
                    <span className="label-type text-[length:var(--label-size)] text-negative">
                        Some jobs have never run — check the Inngest connection
                    </span>
                )}
            </div>

            {/* Pipeline counters */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
                <StatTile size="sm" label="Articles" value={String(status.articlesTotal)} hint={`${status.articlesLast24h} in last 24h`} />
                <StatTile size="sm"
                    label="Extracted"
                    value={String(status.articlesExtracted)}
                    hint={extractionHint(status)}
                />
                <StatTile size="sm" label="Entities" value={String(status.entityCount)} hint="knowledge graph nodes" />
                <StatTile size="sm" label="Theses" value={String(status.thesisCount)} hint="sustained narratives" />
                <StatTile size="sm" label="Priced symbols" value={String(status.pricedSymbols)} hint="daily history (Yahoo, Stooq fallback)" />
            </div>

            {/* Job stamps */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                {status.jobs.map((job) => <JobStamp key={job.jobId} job={job} />)}
            </div>
        </Panel>
    );
};

export default SystemStatus;
