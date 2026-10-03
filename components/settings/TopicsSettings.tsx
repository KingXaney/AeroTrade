import Link from "next/link";
import {formatCapped} from "@/lib/format";
import {MAX_TOPICS_PER_USER, UNSEEN_COUNT_CAP} from "@/lib/topics/config";
import {MAX_KEYWORDS} from "@/lib/news/keywords";
import type {TopicsOverview} from '@/lib/topics/types';

// Read-only summary; editing lives on /topics where the composer and feeds are.
const TopicsSettings = ({overview}: {overview: TopicsOverview}) => {
    const count = overview.topics.length;
    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm text-fg-soft">
                    {count === 0
                        ? "You're not following any topics yet."
                        : `${count} of ${MAX_TOPICS_PER_USER} topics · ${formatCapped(overview.unseenTotal, UNSEEN_COUNT_CAP)} new ${overview.unseenTotal === 1 ? 'article' : 'articles'}`}
                </p>
                <Link href="/topics" className="label-type text-xs text-brand hover:underline">
                    {count === 0 ? 'Follow a topic →' : 'Manage topics →'}
                </Link>
            </div>
            {count > 0 && (
                <ul className="flex flex-wrap gap-2" aria-label="Followed topics">
                    {overview.topics.map((t) => (
                        <li key={t.id}>
                            <Link href={`/topics/${t.slug}`}
                                  className="inline-flex items-center gap-2 rounded-full border border-line-strong/20 bg-surface-2/40 px-3 py-1.5 text-xs text-fg transition-colors hover:border-brand/40 hover:text-brand">
                                <span className="h-2 w-2 rounded-full" style={{background: t.color ?? 'var(--brand)'}} aria-hidden="true" />
                                <span className="font-heading">{t.name}</span>
                                {t.unseenCount > 0 && <span className="text-brand font-mono">{formatCapped(t.unseenCount, UNSEEN_COUNT_CAP)}</span>}
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
            <p className="text-[11px] text-fg-muted">
                Each topic matches on up to {MAX_KEYWORDS} keywords across every source we read. Feeds refresh every few hours;
                the AI brief for each topic arrives each morning and also goes into the daily email when that toggle is on.
            </p>
        </div>
    );
};

export default TopicsSettings;
