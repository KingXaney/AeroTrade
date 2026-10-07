import Link from "next/link";
import {cn} from "@/lib/utils";
import {formatSigned, getChangeColorClass} from "@/lib/format";
import Term from "@/components/primitives/Term";
import {rowCard} from "@/components/primitives/RowCard";
import {CATEGORY_LABELS} from "@/lib/culture/catalog";
import {brandEvidenceHref} from "@/lib/culture/links";
import type {BrandRow} from "@/lib/culture/page-view";
import {CULTURE_WIDGET_COPY} from "@/lib/learn/copy/culture";

// The brands with the most attention this week, each row a link to its evidence on /culture.
// Term titles only: a dashboard widget carries no "What these mean" and no "Ask in chat"
// (invariant 12).
const BrandAttentionList = ({rows}: {rows: BrandRow[]}) => {
    if (rows.length === 0) {
        return <p className="text-sm text-fg-muted">{CULTURE_WIDGET_COPY.attentionEmpty}</p>;
    }
    return (
        <div>
            <ul className="space-y-1.5" data-testid="brand-attention-widget">
                {rows.map((row) => (
                    <li key={row.key}>
                        <Link href={brandEvidenceHref(row.key)} data-brand={row.key}
                              className={rowCard({interactive: true, className: 'flex items-center justify-between gap-3 px-3 py-2'})}>
                            <div className="min-w-0">
                                <div className="font-heading text-sm font-semibold text-fg truncate">
                                    {row.displayName}
                                    {row.thesisSince !== null && <span className="ml-1 text-brand">●</span>}
                                </div>
                                <div className="text-[10px] text-fg-muted font-mono truncate">
                                    {CATEGORY_LABELS[row.category]}{row.ticker ? ` · ${row.ticker}` : ''}
                                </div>
                            </div>
                            <div className="font-mono text-right shrink-0">
                                <div className="text-sm text-fg-soft"><Term k="attention">{row.weightFast.toFixed(1)}</Term></div>
                                <div className={cn('text-[10px]', getChangeColorClass(row.sentimentSlow || undefined))}>
                                    <Term k="brand-sentiment">{formatSigned(row.sentimentSlow)}</Term>
                                </div>
                            </div>
                        </Link>
                    </li>
                ))}
            </ul>
            <p className="label-type text-[length:var(--label-size)] text-fg-muted mt-3">{CULTURE_WIDGET_COPY.attentionFooter}</p>
        </div>
    );
};

export default BrandAttentionList;
