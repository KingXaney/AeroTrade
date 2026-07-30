import {cn, getChangeColorClass} from "@/lib/utils";

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

// Same pattern as formatTimeAgo — time-relative display computed in a helper.
const weeksActive = (thesisSince: number | null): number =>
    thesisSince ? Math.max(1, Math.round((Date.now() - thesisSince) / MS_PER_WEEK)) : 0;

// The centerpiece of /brain: narratives whose SLOW-layer weight has sustained above
// the thesis threshold — "where the market's favor has been shifting for weeks".
const ActiveTheses = ({theses}: {theses: BrainEntitySummary[]}) => {
    if (theses.length === 0) {
        return (
            <p className="text-sm text-[#849495]">
                No active theses yet. A narrative becomes a thesis once it keeps accumulating
                attention for several weeks — check back as the brain ingests more news.
            </p>
        );
    }

    return (
        <div className="space-y-1.5">
            {theses.map((t) => {
                const weeks = weeksActive(t.thesisSince);
                return (
                    <div key={t.key}
                         className="flex items-center justify-between px-4 py-3 rounded-lg border bg-[rgba(30,32,36,0.4)] border-[rgba(125,244,255,0.15)]">
                        <div className="flex items-center gap-3">
                            <span className="material-symbols-outlined text-base text-[#7df4ff]">trending_up</span>
                            <div>
                                <span className="text-sm font-semibold text-[#e2e2e8]" style={{fontFamily: 'var(--font-sora)'}}>
                                    {t.displayName}
                                </span>
                                <div className="text-[10px] uppercase tracking-[0.08em] text-[#849495]" style={{fontFamily: 'var(--font-jetbrains)'}}>
                                    {t.type} · active {weeks} {weeks === 1 ? 'week' : 'weeks'}
                                </div>
                            </div>
                        </div>
                        <div className="text-right" style={{fontFamily: 'var(--font-jetbrains)'}}>
                            <div className="text-sm text-[#e2e2e8]">weight {t.weightSlow.toFixed(1)}</div>
                            <div className={cn('text-xs', getChangeColorClass(t.sentimentSlow || undefined))}>
                                sentiment {t.sentimentSlow >= 0 ? '+' : ''}{t.sentimentSlow.toFixed(2)}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default ActiveTheses;
