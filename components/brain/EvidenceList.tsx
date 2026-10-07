import Link from "next/link";
import {cn} from "@/lib/utils";
import {formatSigned, formatTimeAgoSeconds, getChangeColorClass} from "@/lib/format";
import TradeLink from "@/components/trading/TradeLink";
import Badge from "@/components/primitives/Badge";
import Term from "@/components/primitives/Term";
import WhatTheseMean from "@/components/learn/WhatTheseMean";
import {eventBadge, eventTermsShown, natureBadge, natureTermsShown} from "@/lib/brain/event-types";
import {BRAIN_COPY} from "@/lib/learn/copy/brain";
import {rowCard} from "@/components/primitives/RowCard";

// Ticker keys are bare symbols; sectors and themes carry a "sector:" / "theme:" prefix.
const isTickerKey = (key: string): boolean => /^[A-Z][A-Z0-9.\-]{0,9}$/.test(key);

type EvidenceItem = {
    headline: string;
    source: string;
    sourceType: string;
    url: string;
    datetime: number;
    publishedDate: string;
    sentiment: number;
    relevance: number;
    // The extractor's label for the kind of event the article covers; 'other' shows no badge.
    eventType: string | null;
    // How the piece is written: a company statement, an opinion piece or a rumour gets a badge;
    // 'reported', and a row tagged before the label, none.
    nature: string | null;
};

// The row's event badge, its definition as the title (the panel's disclosure below is the
// touch-reachable twin).
const EventBadge = ({eventType}: {eventType: string | null}) => {
    const badge = eventBadge(eventType);
    if (!badge) return null;
    return (
        <Term k={badge.term} className="no-underline">
            <Badge>{badge.label}</Badge>
        </Term>
    );
};

const NatureBadge = ({nature}: {nature: string | null}) => {
    const badge = natureBadge(nature);
    if (!badge) return null;
    return (
        <Term k={badge.term} className="no-underline">
            <Badge variant="outline">{badge.label}</Badge>
        </Term>
    );
};

// Per-entity evidence drill-down: the actual articles behind a narrative's weight.
const EvidenceList = ({entityKey, items}: {entityKey: string; items: EvidenceItem[]}) => (
    <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <p className="text-xs text-fg-muted font-mono">
                Evidence for <span className="text-brand">{entityKey}</span> · last 21 days
            </p>
            {isTickerKey(entityKey) && (
                <span className="flex items-center gap-2">
                    <Link href={`/stocks/${encodeURIComponent(entityKey)}`} className="text-xs text-brand hover:underline font-mono">
                        Stock page →
                    </Link>
                    <TradeLink symbol={entityKey} />
                </span>
            )}
        </div>
        {items.length === 0 ? (
            <p className="text-sm text-fg-muted">{BRAIN_COPY.evidenceEmpty}</p>
        ) : (
            <div className="space-y-2">
                {items.map((item) => (
                    <a key={item.url} href={item.url} target="_blank" rel="noopener noreferrer"
                       className={rowCard({interactive: true, className: 'block'})}>
                        <div className="flex items-start justify-between gap-3">
                            <span className="text-sm text-fg">{item.headline}</span>
                            <span className={cn('font-mono text-xs shrink-0', getChangeColorClass(item.sentiment || undefined))}>
                                {formatSigned(item.sentiment)}
                            </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-fg-muted mt-1 font-mono">
                            <EventBadge eventType={item.eventType} />
                            <NatureBadge nature={item.nature} />
                            <span>{item.source} · {formatTimeAgoSeconds(item.datetime)}</span>
                            {item.sourceType === 'reddit' && <span className="text-negative">community sentiment</span>}
                        </div>
                    </a>
                ))}
            </div>
        )}
        {/* One disclosure per panel, listing only the labels on screen. */}
        <WhatTheseMean keys={[...eventTermsShown(items.map((item) => item.eventType)), ...natureTermsShown(items.map((item) => item.nature))]} label={BRAIN_COPY.labelsSummary} />
    </div>
);

export default EvidenceList;
