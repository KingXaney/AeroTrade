import Link from "next/link";
import {cn} from "@/lib/utils";
import {formatSigned, getChangeColorClass} from "@/lib/format";
import TradeLink from "@/components/trading/TradeLink";
import Term from "@/components/primitives/Term";
import WhatTheseMean from "@/components/learn/WhatTheseMean";
import {rowCard} from "@/components/primitives/RowCard";
import {brandEvidenceHref} from "@/lib/culture/links";
import type {BoardGroup, BoardMarks, BrandRow} from "@/lib/culture/page-view";
import {BRAND_BOARD_TERMS, CULTURE_COPY} from "@/lib/learn/copy/culture";

// The centrepiece of /culture: every catalog brand with attention, one column per category,
// heaviest first. A row's name opens its evidence; its owner line is the company a picker can
// trade (the stock page, the ticket) or the ○ of a private brand. The marks — ● thesis, ○
// private, * unpriced — are explained once under the grid, and only when some row carries them
// (invariant 8); the panel's one "What these mean" is led by the board's own paragraph.

const Row = ({row}: {row: BrandRow}) => (
    <div data-brand={row.key} className={rowCard({interactive: true, className: 'flex items-center justify-between gap-2 px-3 py-2'})}>
        <div className="min-w-0">
            <Link href={brandEvidenceHref(row.key)} className="text-xs font-semibold text-fg hover:text-brand font-mono truncate block">
                {row.displayName}
                {row.thesisSince !== null && <span className="ml-1 text-brand">●</span>}
            </Link>
            <div className="flex items-center gap-1.5 text-[10px] text-fg-muted font-mono truncate">
                {row.ticker ? (
                    <>
                        <Link href={`/stocks/${encodeURIComponent(row.ticker)}`} className="hover:text-brand">
                            {row.ticker}{row.unpriced ? '*' : ''}
                        </Link>
                        <span className="truncate">· {row.company ?? row.ticker}</span>
                        <TradeLink symbol={row.ticker} variant="icon" className="size-5" />
                    </>
                ) : (
                    <span className="truncate">○ {row.parent ?? 'private'}</span>
                )}
            </div>
        </div>
        <span className="flex items-center gap-1 text-[11px] font-mono shrink-0">
            <span className="text-fg-soft">{row.weightSlow.toFixed(1)}</span>
            <span className={cn(getChangeColorClass(row.sentimentSlow || undefined))}>{formatSigned(row.sentimentSlow)}</span>
        </span>
    </div>
);

type Props = {
    groups: BoardGroup[];
    marks: BoardMarks;
    thesisThreshold: number;
    unpricedWeek: string | null;
};

const BrandBoard = ({groups, marks, thesisThreshold, unpricedWeek}: Props) => {
    if (groups.length === 0) {
        return <p className="text-sm text-fg-muted">{CULTURE_COPY.boardEmpty}</p>;
    }
    return (
        <div>
            <p className="font-mono text-[11px] text-fg-muted mb-3">
                <Term k="attention">{CULTURE_COPY.columns.attention}</Term> · <Term k="brand-sentiment">{CULTURE_COPY.columns.sentiment}</Term>
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" data-brand-board>
                {groups.map((group) => (
                    <div key={group.category} data-category={group.category}>
                        <h3 className="label-type text-[length:var(--label-size)] text-fg-muted mb-2">{group.label}</h3>
                        <div className="space-y-1">
                            {group.rows.map((row) => <Row key={row.key} row={row} />)}
                        </div>
                    </div>
                ))}
            </div>
            {(marks.thesis || marks.privateBrand || marks.unpriced) && (
                <ul className="font-mono text-[11px] text-fg-muted mt-3 space-y-0.5" data-board-marks>
                    {marks.thesis && <li>{CULTURE_COPY.thesisMark(thesisThreshold)}</li>}
                    {marks.privateBrand && <li>{CULTURE_COPY.privateMark}</li>}
                    {marks.unpriced && unpricedWeek && <li>{CULTURE_COPY.unpricedMark(unpricedWeek)}</li>}
                </ul>
            )}
            <WhatTheseMean keys={BRAND_BOARD_TERMS} label={CULTURE_COPY.boardSummary}>
                <p className="text-xs text-fg-muted leading-relaxed">{CULTURE_COPY.boardLead}</p>
            </WhatTheseMean>
        </div>
    );
};

export default BrandBoard;
