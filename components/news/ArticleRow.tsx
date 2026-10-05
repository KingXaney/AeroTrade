import type {ReactNode} from "react";
import {ArrowUpRight} from "lucide-react";
import {formatTimeAgoSeconds} from "@/lib/format";
import {showSummary} from "@/lib/news/article";
import {rowCard} from "@/components/primitives/RowCard";

type Props = {
    url: string;
    headline: string;
    datetime: number;
    source: string;
    summary?: string | null;
    tag?: ReactNode;
    chips?: ReactNode;
};

// Editorial list treatment for the News and Topics pages. The compact metadata and single
// summary line keep long feeds readable without changing the shared dashboard card layout.
// data-article-row and data-article-title are the browser QA's handles (the card's are
// .news-item and .news-title).
const ArticleRow = ({url, headline, datetime, source, summary, tag, chips}: Props) => (
    <a href={url} target="_blank" rel="noopener noreferrer" data-article-row
       className={rowCard({interactive: true, className: 'group flex items-start justify-between gap-4'})}>
        <div className="min-w-0 flex-1">
            {tag && <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">{tag}</div>}
            <h3 data-article-title className="font-heading text-sm font-semibold leading-snug text-fg transition-colors group-hover:text-brand sm:text-base">
                {headline}
            </h3>
            <p className="mt-1 text-[11px] text-fg-muted">{formatTimeAgoSeconds(datetime)} <span aria-hidden="true">·</span> {source}</p>
            {showSummary(headline, summary) && (
                <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-fg-soft">{summary}</p>
            )}
            {chips && <div className="mt-2 flex flex-wrap items-center gap-1.5">{chips}</div>}
        </div>
        <ArrowUpRight className="mt-0.5 size-4 shrink-0 text-fg-muted transition-colors group-hover:text-brand" aria-hidden="true" />
    </a>
);

export default ArticleRow;
