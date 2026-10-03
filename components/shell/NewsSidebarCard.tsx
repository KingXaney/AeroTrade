import Link from "next/link";
import Badge from "@/components/primitives/Badge";
import MicroLabel from "@/components/primitives/MicroLabel";
import {formatCapped, formatTimeAgoCompactSeconds, formatTimeAgoMs} from "@/lib/format";
import {UNSEEN_COUNT_CAP} from "@/lib/topics/config";
import {NEWS_COPY} from "@/lib/learn/copy/news";
import {SHELL_COPY} from "@/lib/learn/copy/shell";
import type {SidebarNews} from "@/lib/shell/sidebar";

// The rail's hover card over News (components/shell/Rail.tsx): the day's briefing headline, when
// the reader last looked, and the three followed topics with the most new. The whole card is the
// one link, to /news — rows are not links (nested anchors are invalid), the /topics rail is where
// you pick a topic, and the briefing's headline is a text node under its caveat, never a link
// (invariant 4). Radix mounts the card on open, so its time-ago strings never meet hydration.
//
// Two stamps meet here. The eyebrow is the News stamp (`seenAt`: "Since you last looked"); a row's
// "N new" counts since the reader opened that topic, inside the day's window
// (lib/topics/config.unseenFloor) — which is why each row prints its newest headline's own time.
// A topic with nothing new, or whose newest article is from a hidden outlet, shows its name alone:
// never "0 new", never "No articles yet" (invariant 8).
const NewsSidebarCard = ({news, seenAt}: {news: SidebarNews; seenAt: number | null}) => (
    <Link
        href="/news"
        className="relative block rounded-xl p-4 shimmer overflow-hidden transition-all hover:brightness-110 bg-brand-strong/6 border border-brand/15"
    >
        <div className="relative z-10">
            <div className="flex items-center gap-3 mb-2">
                <span className="material-symbols-outlined text-brand" style={{fontVariationSettings: "'FILL' 1"}}>feed</span>
                <MicroLabel tone="brand" className="text-xs font-bold">{SHELL_COPY.newsHeading}</MicroLabel>
            </div>

            {news.briefing && (
                <>
                    <p className="font-heading text-sm font-semibold leading-snug text-fg">{news.briefing.headline}</p>
                    <MicroLabel as="p" className="mt-1">{NEWS_COPY.briefingCaveat(news.briefing.date)}</MicroLabel>
                </>
            )}

            {news.followed > 0 ? (
                <>
                    <MicroLabel as="p" className="mt-3">
                        {seenAt !== null ? SHELL_COPY.sinceLastLook(formatTimeAgoMs(seenAt)) : SHELL_COPY.topicsHeading}
                    </MicroLabel>
                    <ul className="mt-1.5 space-y-1.5">
                        {news.top.map((t) => (
                            <li key={t.slug} className="text-xs">
                                <div className="flex items-center gap-2">
                                    <span className="size-1.5 shrink-0 rounded-full" style={{background: t.color ?? 'var(--brand)'}} aria-hidden="true" />
                                    <span className="truncate text-fg">{t.name}</span>
                                    {t.unseenCount > 0 && (
                                        <Badge tone="brand" variant="solid" shape="pill" className="ml-auto">
                                            {SHELL_COPY.newCount(formatCapped(t.unseenCount, UNSEEN_COUNT_CAP))}
                                        </Badge>
                                    )}
                                </div>
                                {t.headline !== null && t.datetime !== null && (
                                    // The time keeps its place when a long headline is cut short.
                                    <p className="mt-0.5 flex min-w-0 gap-1 pl-3.5 text-fg-muted">
                                        <span className="truncate">{t.headline}</span>
                                        <span className="shrink-0">· {formatTimeAgoCompactSeconds(t.datetime)}</span>
                                    </p>
                                )}
                            </li>
                        ))}
                    </ul>
                </>
            ) : (
                !news.briefing && <p className="text-xs text-fg-muted">{SHELL_COPY.empty}</p>
            )}

            <p className="label-type mt-3 text-xs text-brand">{SHELL_COPY.openNews} →</p>
        </div>
    </Link>
);

export default NewsSidebarCard;
