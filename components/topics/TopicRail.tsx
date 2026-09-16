'use client';

import Link from "next/link";
import {Plus} from "lucide-react";
import {cn, formatTimeAgo} from "@/lib/utils";

type Props = {
    topics: TopicOverviewItem[];
    activeSlug?: string;
    unseenTotal: number;
    onNewTopic: () => void;
};

const mono = {fontFamily: 'var(--type-mono)'} as const;

const UnseenPill = ({count}: {count: number}) => (
    count > 0
        ? <span className="ml-auto rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-bold text-on-brand" style={mono} aria-label={`${count} unseen`}>{count}</span>
        : null
);

// Desktop: a sticky vertical rail. Mobile: the same items as a scrolling chip row.
const TopicRail = ({topics, activeSlug, unseenTotal, onNewTopic}: Props) => {
    const sorted = [...topics].sort((a, b) =>
        b.unseenCount - a.unseenCount || (b.latest?.datetime ?? 0) - (a.latest?.datetime ?? 0));

    const rowClass = (active: boolean) => cn(
        'flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-[0.08em] transition-colors shrink-0 lg:shrink',
        active ? 'bg-brand/10 text-brand' : 'text-fg-soft hover:text-fg hover:bg-surface-3',
    );

    return (
        <nav aria-label="Your topics" className="glass-panel rounded-xl p-2 flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible scrollbar-hide">
            <Link href="/topics" aria-current={!activeSlug ? 'page' : undefined} className={rowClass(!activeSlug)} style={mono}>
                <span className="material-symbols-outlined text-base">interests</span>
                <span className="truncate">All topics</span>
                <UnseenPill count={unseenTotal} />
            </Link>
            {sorted.map((t) => {
                const active = t.slug === activeSlug;
                return (
                    <Link key={t.id} href={`/topics/${t.slug}`} aria-current={active ? 'page' : undefined} className={rowClass(active)} style={mono}>
                        <span className="h-2 w-2 rounded-full shrink-0" style={{background: t.color ?? 'var(--brand)'}} aria-hidden="true" />
                        <span className="truncate">{t.name}</span>
                        {t.latest && <span className="hidden lg:inline text-[10px] font-normal normal-case tracking-normal text-fg-muted ml-1 truncate">{formatTimeAgo(t.latest.datetime)}</span>}
                        <UnseenPill count={t.unseenCount} />
                    </Link>
                );
            })}
            <button type="button" onClick={onNewTopic}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-[0.08em] text-brand hover:bg-brand/10 shrink-0 lg:mt-1 lg:border-t lg:border-line-strong/20 lg:rounded-t-none lg:pt-3"
                    style={mono}>
                <Plus className="size-4" />
                New topic
            </button>
        </nav>
    );
};

export default TopicRail;
