'use client';

import Link from "next/link";
import {Plus} from "lucide-react";
import {cn} from "@/lib/utils";
import {formatCapped, formatTimeAgoSeconds} from "@/lib/format";
import {UNSEEN_COUNT_CAP} from "@/lib/topics/config";
import {sortTopicsForRail} from "@/lib/topics/rail";
import {useCurrentInTrack} from "@/hooks/useCurrentInTrack";
import type {TopicOverviewItem} from '@/lib/topics/types';
import Panel from '@/components/primitives/Panel';

type Props = {
    topics: TopicOverviewItem[];
    activeSlug?: string;
    unseenTotal: number;
    onNewTopic: () => void;
};

// The store counts to the cap plus one at most, so past the cap the pill reads "99+".
const UnseenPill = ({count, className}: {count: number; className?: string}) => (
    count > 0
        ? <span className={cn('ml-auto shrink-0 rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-bold text-on-brand font-mono', className)}
                aria-label={`${formatCapped(count, UNSEEN_COUNT_CAP)} unseen`}>{formatCapped(count, UNSEEN_COUNT_CAP)}</span>
        : null
);

// Desktop: a sticky vertical rail. Mobile: the same items as a row of chips that scrolls sideways.
//
// On the rail a topic is two lines: its name, whole up to two lines (a name at the composer's
// 60-character cap is cut at the end of the second), and under it how long ago its newest article
// came in, beside its count of new ones. The rail is a sixth of the column at 1440 and a quarter
// at 1024, and a name, an age and a count on one line there cut every name to a few letters. The
// topics scroll inside the rail when they run taller than the window under the bar, so the rail,
// which sticks, never hides its last ones; All topics and New topic stay in sight above and below.
//
// On a phone the chips' row is a scroller of its own: the panel clips what overflows it
// (.glass-panel), so while the row was the panel it could not be scrolled, and the topics past the
// screen's edge could not be reached. The current topic is kept in sight and an end fades where
// there are more (hooks/useCurrentInTrack).
const TopicRail = ({topics, activeSlug, unseenTotal, onNewTopic}: Props) => {
    const sorted = sortTopicsForRail(topics);
    const row = useCurrentInTrack<HTMLDivElement>(activeSlug ?? '');

    const rowClass = (active: boolean) => cn(
        'control-type flex items-center gap-2 rounded-lg px-3 py-2 text-xs transition-colors shrink-0 lg:shrink',
        active ? 'bg-brand/10 text-brand' : 'text-fg-soft hover:text-fg hover:bg-surface-3',
    );

    return (
        <Panel as="nav" pad={2} aria-label="Your topics">
            <div ref={row} className="flex gap-1 overflow-x-auto scrollbar-hide lg:flex-col lg:overflow-visible">
                <Link href="/topics" aria-current={!activeSlug ? 'page' : undefined} className={rowClass(!activeSlug)}>
                    <span className="material-symbols-outlined text-base">interests</span>
                    <span className="truncate">All topics</span>
                    <UnseenPill count={unseenTotal} />
                </Link>
                {/* The topics alone scroll on the rail; on a phone this box is no box (contents), and
                    each topic is a chip in the row. -m-1 p-1: room for a row's focus ring. */}
                <div className="contents lg:-m-1 lg:flex lg:max-h-[calc(100dvh_-_var(--sticky-top)_-_8.5rem)] lg:flex-col lg:gap-1 lg:overflow-y-auto lg:overscroll-contain lg:p-1">
                    {sorted.map((t) => {
                        const active = t.slug === activeSlug;
                        return (
                            <Link key={t.id} href={`/topics/${t.slug}`} aria-current={active ? 'page' : undefined}
                                  className={cn(rowClass(active), 'lg:grid lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:gap-x-2 lg:gap-y-0.5')}>
                                <span className="h-2 w-2 rounded-full shrink-0 lg:mt-1 lg:self-start" style={{background: t.color ?? 'var(--brand)'}} aria-hidden="true" />
                                <span className="whitespace-nowrap lg:col-span-2 lg:line-clamp-2 lg:whitespace-normal lg:break-words">{t.name}</span>
                                {t.latest && <span className="hidden whitespace-nowrap text-[10px] font-normal normal-case tracking-normal text-fg-muted lg:col-start-2 lg:block">{formatTimeAgoSeconds(t.latest.datetime)}</span>}
                                <UnseenPill count={t.unseenCount} className="lg:col-start-3 lg:row-start-2" />
                            </Link>
                        );
                    })}
                </div>
                <button type="button" onClick={onNewTopic}
                        className="control-type flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-brand hover:bg-brand/10 shrink-0 lg:mt-1 lg:border-t lg:border-line-strong/20 lg:rounded-t-none lg:pt-3">
                    <Plus className="size-4" />
                    New topic
                </button>
            </div>
        </Panel>
    );
};

export default TopicRail;
