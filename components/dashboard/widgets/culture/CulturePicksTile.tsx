import type {CulturePicksSummary} from "@/lib/culture/page-store";
import {formatPct} from "@/lib/format";
import {CULTURE_WIDGET_COPY} from "@/lib/learn/copy/culture";

// Full-width strip linking to /culture?view=picks (the shell provides the <Link> chrome): the
// two pickers' records and SPY since the launch, in the registry's order and without a sign
// colour — a dashboard tile ranks nothing — and the newest decision's count.
const CulturePicksTile = ({summary}: {summary: CulturePicksSummary}) => {
    const started = summary.comparison.filter((row) => row.returnPct !== null && row.since !== null);
    const since = started[0]?.since ?? null;
    return (
        <div className="flex items-center justify-between flex-wrap gap-2" data-culture-picks-tile>
            <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-brand">storefront</span>
                <div>
                    <div className="label-type text-[length:var(--label-size)] text-fg-muted">
                        {CULTURE_WIDGET_COPY.picksTitle}
                    </div>
                    <div className="text-sm text-fg font-heading">
                        {started.length > 0 && since
                            ? CULTURE_WIDGET_COPY.picksLine(started.map((row) => ({label: row.label, ret: formatPct(row.returnPct)})), since)
                            : CULTURE_WIDGET_COPY.picksBuilding}
                    </div>
                </div>
            </div>
            <span className="text-xs text-fg-muted font-mono">
                {summary.decisions ? CULTURE_WIDGET_COPY.decisions(summary.decisions.count, summary.decisions.date) : CULTURE_WIDGET_COPY.schedule} →
            </span>
        </div>
    );
};

export default CulturePicksTile;
