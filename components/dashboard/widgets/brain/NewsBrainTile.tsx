import type {NewsBrainSummary} from "@/lib/dashboard/select";
import {BRAIN_COPY} from "@/lib/learn/copy/brain";
import {NAVIGATOR_COPY} from "@/lib/learn/copy/navigator";

// Full-width strip linking to /brain (the shell provides the <Link> chrome).
const NewsBrainTile = ({summary}: {summary: NewsBrainSummary}) => (
    <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-brand">neurology</span>
            <div>
                <div className="text-[10px] uppercase tracking-[0.14em] text-fg-muted font-mono">
                    News Brain
                </div>
                <div className="text-sm text-fg font-heading">
                    {summary.topThesis
                        ? <>Top thesis: <span className="text-brand">{summary.topThesis}</span></>
                        : BRAIN_COPY.tileBuilding}
                </div>
            </div>
        </div>
        <span className="text-xs text-fg-muted font-mono">
            {summary.decisions ? `${summary.decisions.count} decisions · ${summary.decisions.date}` : NAVIGATOR_COPY.tileSchedule} →
        </span>
    </div>
);

export default NewsBrainTile;
