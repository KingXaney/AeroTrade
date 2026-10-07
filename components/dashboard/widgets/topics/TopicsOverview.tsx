import Link from "next/link";
import {formatCapped, formatTimeAgoSeconds} from "@/lib/format";
import {UNSEEN_COUNT_CAP} from "@/lib/topics/config";
import {sortTopicsForRail} from "@/lib/topics/rail";
import type {TopicsOverview as TopicsOverviewData} from "@/lib/topics/types";

const MAX_ROWS = 6;

// The /topics rail's order (sortTopicsForRail): unseen first, then most recently updated.
// Wider spans get the latest headline under each name.
const TopicsOverview = ({overview, span}: {overview: TopicsOverviewData; span: number}) => {
    const rows = sortTopicsForRail(overview.topics).slice(0, MAX_ROWS);
    const hidden = overview.topics.length - rows.length;
    const wide = span >= 6;

    return (
        <div className="flex h-full flex-col">
            <ul className="space-y-0.5">
                {rows.map((t) => (
                    <li key={t.id}>
                        <Link href={`/topics/${t.slug}`} className="-mx-2 flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-3">
                            <span className="h-2 w-2 shrink-0 rounded-full" style={{background: t.color ?? 'var(--brand)'}} aria-hidden="true" />
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm text-fg font-heading">{t.name}</span>
                                {wide && (
                                    <span className="block truncate text-xs text-fg-muted">
                                        {t.latest ? `${t.latest.headline} · ${formatTimeAgoSeconds(t.latest.datetime)}` : 'No articles yet'}
                                    </span>
                                )}
                            </span>
                            {t.unseenCount > 0 && (
                                <span data-count-pill className="rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-bold text-on-brand font-mono"
                                      aria-label={`${formatCapped(t.unseenCount, UNSEEN_COUNT_CAP)} unseen`}>
                                    {formatCapped(t.unseenCount, UNSEEN_COUNT_CAP)}
                                </span>
                            )}
                        </Link>
                    </li>
                ))}
            </ul>
            <Link href="/topics" className="label-type mt-auto pt-3 text-xs text-brand hover:underline">
                {overview.unseenTotal > 0 ? `${formatCapped(overview.unseenTotal, UNSEEN_COUNT_CAP)} new` : 'All topics'}{hidden > 0 ? ` · +${hidden} more` : ''} →
            </Link>
        </div>
    );
};

export default TopicsOverview;
