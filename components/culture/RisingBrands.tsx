import Link from "next/link";
import Term from "@/components/primitives/Term";
import WhatTheseMean from "@/components/learn/WhatTheseMean";
import {rowCard} from "@/components/primitives/RowCard";
import {CATEGORY_LABELS} from "@/lib/culture/catalog";
import {brandEvidenceHref} from "@/lib/culture/links";
import type {BrandRow} from "@/lib/culture/page-view";
import {CULTURE_COPY, RISING_TERMS} from "@/lib/learn/copy/culture";

// The fast layer's heaviest brands: what moved this week, whatever the slow layer says. Each
// name opens its evidence. One "What these mean", for the one term the panel shows.
const RisingBrands = ({rows}: {rows: BrandRow[]}) => (
    <div>
        <p className="text-xs text-fg-muted mb-3">{CULTURE_COPY.risingLead}</p>
        {rows.length === 0 ? (
            <p className="text-sm text-fg-muted">{CULTURE_COPY.risingEmpty}</p>
        ) : (
            <ol className="space-y-1" data-rising-brands>
                {rows.map((row) => (
                    <li key={row.key} data-brand={row.key} className={rowCard({interactive: true, className: 'flex items-center justify-between gap-2 px-3 py-2'})}>
                        <div className="min-w-0">
                            <Link href={brandEvidenceHref(row.key)} className="text-xs font-semibold text-fg hover:text-brand font-mono truncate block">
                                {row.displayName}
                            </Link>
                            <span className="text-[10px] text-fg-muted font-mono">
                                {CATEGORY_LABELS[row.category]}{row.ticker ? ` · ${row.ticker}` : ''}
                            </span>
                        </div>
                        <span className="text-[11px] font-mono text-fg-soft shrink-0">
                            <Term k="attention">fast</Term> {row.weightFast.toFixed(1)}
                        </span>
                    </li>
                ))}
            </ol>
        )}
        <WhatTheseMean keys={RISING_TERMS} />
    </div>
);

export default RisingBrands;
