import Link from "next/link";
import {cn, formatTimeAgo, getChangeColorClass} from "@/lib/utils";
import TradeLink from "@/components/trade/TradeLink";

// Ticker keys are bare symbols; sectors and themes carry a "sector:" / "theme:" prefix.
const isTickerKey = (key: string): boolean => /^[A-Z][A-Z0-9.\-]{0,9}$/.test(key);

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
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <p className="text-xs text-fg-muted" style={{fontFamily: 'var(--type-mono)'}}>
                Evidence for <span className="text-brand">{entityKey}</span> · last 21 days
            </p>
            {isTickerKey(entityKey) && (
                <span className="flex items-center gap-2">
                    <Link href={`/stocks/${encodeURIComponent(entityKey)}`} className="text-xs text-brand hover:underline" style={{fontFamily: 'var(--type-mono)'}}>
                        Stock page →
                    </Link>
                    <TradeLink symbol={entityKey} />
                </span>
            )}
        </div>
        {items.length === 0 ? (
            <p className="text-sm text-fg-muted">No recent articles mention this entity.</p>
        ) : (
            <div className="space-y-2">
                {items.map((item) => (
                    <a key={item.url} href={item.url} target="_blank" rel="noopener noreferrer"
                       className="block px-4 py-3 rounded-lg border bg-surface-2/40 border-line-strong/20 hover:border-brand/30 transition-colors">
                        <div className="flex items-start justify-between gap-3">
                            <span className="text-sm text-fg">{item.headline}</span>
                            <span className={cn('text-xs shrink-0', getChangeColorClass(item.sentiment || undefined))}
                                  style={{fontFamily: 'var(--type-mono)'}}>
                                {item.sentiment >= 0 ? '+' : ''}{item.sentiment.toFixed(2)}
                            </span>
                        </div>
                        <div className="text-[11px] text-fg-muted mt-1" style={{fontFamily: 'var(--type-mono)'}}>
                            {item.source} · {formatTimeAgo(item.datetime)}
                            {item.sourceType === 'reddit' && <span className="ml-2 text-negative">community sentiment</span>}
                        </div>
                    </a>
                ))}
            </div>
        )}
    </div>
);

export default EvidenceList;
