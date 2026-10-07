import Link from "next/link";
import {cn} from "@/lib/utils";
import {formatSigned, formatTimeAgoSeconds, getChangeColorClass} from "@/lib/format";
import TradeLink from "@/components/trading/TradeLink";
import Badge from "@/components/primitives/Badge";
import Term from "@/components/primitives/Term";
import WhatTheseMean from "@/components/learn/WhatTheseMean";
import RowCard from "@/components/primitives/RowCard";
import BrandChips from "@/components/culture/BrandChips";
import {outboundHref} from "@/lib/culture/links";
import {signalBadge, signalTermsShown} from "@/lib/culture/signal-types";
import type {EvidenceItem} from "@/lib/culture/store";
import type {CultureBrand} from "@/lib/culture/types";
import {CULTURE_COPY} from "@/lib/learn/copy/culture";

// A brand's evidence: the posts, videos and articles behind its attention, each with the
// model's label (its definition as the badge's title; the panel's disclosure is the
// touch-reachable twin), the item's sentiment toward the brand, and the other brands it names.
// A row is a plain card; its title is an anchor only when the stored link is http(s). The AI
// caveat is stated once per panel, and an item's importance is never printed.

const SignalBadge = ({signal}: {signal: string | null}) => {
    const badge = signalBadge(signal);
    if (!badge) return null;
    return (
        <Term k={badge.term} className="no-underline">
            <Badge>{badge.label}</Badge>
        </Term>
    );
};

const Title = ({item}: {item: EvidenceItem}) => {
    const href = outboundHref(item.url);
    return href
        ? <a href={href} target="_blank" rel="noopener noreferrer" className="text-sm text-fg hover:text-brand">{item.title}</a>
        : <span className="text-sm text-fg">{item.title}</span>;
};

const BrandEvidence = ({brand, items, days}: {brand: CultureBrand; items: EvidenceItem[]; days: number}) => (
    <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <p className="text-xs text-fg-muted font-mono">{CULTURE_COPY.evidenceFor(brand.name, days)}</p>
            {brand.owner && (
                <span className="flex items-center gap-2">
                    <Link href={`/stocks/${encodeURIComponent(brand.owner.ticker)}`} className="text-xs text-brand hover:underline font-mono">
                        <Term k="brand-owner" className="no-underline">{brand.owner.ticker}</Term> · {brand.owner.company} →
                    </Link>
                    <TradeLink symbol={brand.owner.ticker} />
                </span>
            )}
        </div>
        {items.length === 0 ? (
            <p className="text-sm text-fg-muted">{CULTURE_COPY.evidenceEmpty}</p>
        ) : (
            <div className="space-y-2" data-evidence-items>
                {items.map((item) => (
                    <RowCard key={item.id}>
                        <div className="flex items-start justify-between gap-3">
                            <Title item={item} />
                            {item.sentiment !== null && (
                                <span className={cn('font-mono text-xs shrink-0', getChangeColorClass(item.sentiment || undefined))}>
                                    {formatSigned(item.sentiment)}
                                </span>
                            )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-fg-muted mt-1 font-mono">
                            <SignalBadge signal={item.signal} />
                            <span>{item.sourceName} · {formatTimeAgoSeconds(item.datetime)}</span>
                            {item.source === 'reddit' && <span className="text-warning">{CULTURE_COPY.communityNote}</span>}
                            {item.brands.length > 0 && (
                                <span className="inline-flex items-center gap-1.5">
                                    {CULTURE_COPY.alsoMentions} <BrandChips ids={item.brands} />
                                </span>
                            )}
                        </div>
                    </RowCard>
                ))}
            </div>
        )}
        <p className="font-mono text-[11px] text-fg-muted mt-3" data-evidence-caveat>{CULTURE_COPY.evidenceCaveat}</p>
        {/* One disclosure per panel, listing only the labels on screen. */}
        <WhatTheseMean keys={signalTermsShown(items.map((item) => item.signal))} label={CULTURE_COPY.labelsSummary} />
    </div>
);

export default BrandEvidence;
