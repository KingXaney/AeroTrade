import type {NewsBrainSummary} from "@/lib/dashboard/select";

// Full-width strip linking to /brain (the shell provides the <Link> chrome).
const NewsBrainTile = ({summary}: {summary: NewsBrainSummary}) => (
    <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-brand">neurology</span>
            <div>
                <div className="text-[10px] uppercase tracking-[0.14em] text-fg-muted" style={{fontFamily: 'var(--type-mono)'}}>
                    News Brain
                </div>
                <div className="text-sm text-fg" style={{fontFamily: 'var(--type-display)'}}>
                    {summary.topThesis
                        ? <>Top thesis: <span className="text-brand">{summary.topThesis}</span></>
                        : 'Building market narratives from daily news'}
                </div>
            </div>
        </div>
        <span className="text-xs text-fg-muted" style={{fontFamily: 'var(--type-mono)'}}>
            {summary.decisions ? `${summary.decisions.count} decisions · ${summary.decisions.date}` : 'Navigator runs Mondays'} →
        </span>
    </div>
);

export default NewsBrainTile;
