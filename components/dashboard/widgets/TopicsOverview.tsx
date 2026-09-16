import Link from "next/link";
import {formatTimeAgo} from "@/lib/utils";

const MAX_ROWS = 6;
const mono = {fontFamily: 'var(--type-mono)'} as const;

// Same order as the /topics rail: unseen first, then most recently updated.
// Wider spans get the latest headline under each name.
const TopicsOverview = ({overview, span}: {overview: TopicsOverview; span: number}) => {
    const rows = [...overview.topics]
        .sort((a, b) => b.unseenCount - a.unseenCount || (b.latest?.datetime ?? 0) - (a.latest?.datetime ?? 0))
        .slice(0, MAX_ROWS);
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
                                <span className="block truncate text-sm text-fg" style={{fontFamily: 'var(--type-display)'}}>{t.name}</span>
                                {wide && (
                                    <span className="block truncate text-xs text-fg-muted">
                                        {t.latest ? `${t.latest.headline} · ${formatTimeAgo(t.latest.datetime)}` : 'No articles yet'}
                                    </span>
                                )}
                            </span>
                            {t.unseenCount > 0 && (
                                <span className="rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-bold text-on-brand" style={mono} aria-label={`${t.unseenCount} unseen`}>
                                    {t.unseenCount}
                                </span>
                            )}
                        </Link>
                    </li>
                ))}
            </ul>
            <Link href="/topics" className="mt-auto pt-3 text-xs uppercase tracking-[0.1em] text-brand hover:underline" style={mono}>
                {overview.unseenTotal > 0 ? `${overview.unseenTotal} new` : 'All topics'}{hidden > 0 ? ` · +${hidden} more` : ''} →
            </Link>
        </div>
    );
};

export default TopicsOverview;
