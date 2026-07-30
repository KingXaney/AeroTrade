import {cn, formatTimeAgo, getChangeColorClass} from "@/lib/utils";

export type EvidenceItem = {
    headline: string;
    source: string;
    sourceType: string;
    url: string;
    datetime: number;
    publishedDate: string;
    sentiment: number;
    relevance: number;
};

// Per-entity evidence drill-down: the actual articles behind a narrative's weight.
const EvidenceList = ({entityKey, items}: {entityKey: string; items: EvidenceItem[]}) => (
    <div>
        <p className="text-xs text-[#849495] mb-3" style={{fontFamily: 'var(--font-jetbrains)'}}>
            Evidence for <span className="text-[#7df4ff]">{entityKey}</span> · last 21 days
        </p>
        {items.length === 0 ? (
            <p className="text-sm text-[#849495]">No recent articles mention this entity.</p>
        ) : (
            <div className="space-y-2">
                {items.map((item) => (
                    <a key={item.url} href={item.url} target="_blank" rel="noopener noreferrer"
                       className="block px-4 py-3 rounded-lg border bg-[rgba(30,32,36,0.4)] border-[rgba(59,73,75,0.2)] hover:border-[rgba(125,244,255,0.3)] transition-colors">
                        <div className="flex items-start justify-between gap-3">
                            <span className="text-sm text-[#e2e2e8]">{item.headline}</span>
                            <span className={cn('text-xs shrink-0', getChangeColorClass(item.sentiment || undefined))}
                                  style={{fontFamily: 'var(--font-jetbrains)'}}>
                                {item.sentiment >= 0 ? '+' : ''}{item.sentiment.toFixed(2)}
                            </span>
                        </div>
                        <div className="text-[11px] text-[#849495] mt-1" style={{fontFamily: 'var(--font-jetbrains)'}}>
                            {item.source} · {formatTimeAgo(item.datetime)}
                            {item.sourceType === 'reddit' && <span className="ml-2 text-[#ffb4ab]">community sentiment</span>}
                        </div>
                    </a>
                ))}
            </div>
        )}
    </div>
);

export default EvidenceList;
