import Link from "next/link";

export type SidebarTopics = {
    followed: number;
    unseen: number;
    top: {slug: string; name: string; color: string | null; unseenCount: number}[];
};

const mono = {fontFamily: 'var(--type-mono)'} as const;
const display = {fontFamily: 'var(--type-display)'} as const;

// The sidebar's headline card: what you follow and what's new. Rows aren't links
// (the whole card is one) — the /topics rail is where you pick a topic.
const TopicsSidebarCard = ({topics}: {topics: SidebarTopics}) => (
    <Link
        href="/topics"
        className="relative block rounded-xl p-4 mb-6 shimmer overflow-hidden transition-all hover:brightness-110"
        style={{
            backgroundColor: 'color-mix(in srgb, var(--brand-strong) 6%, transparent)',
            border: '1px solid color-mix(in srgb, var(--brand) 15%, transparent)',
        }}
    >
        <div className="relative z-10">
            <div className="flex items-center gap-3 mb-2">
                <span className="material-symbols-outlined text-brand" style={{fontVariationSettings: "'FILL' 1"}}>interests</span>
                <span className="text-brand text-xs font-bold tracking-[0.1em] uppercase" style={mono}>Topics</span>
                {topics.unseen > 0 && (
                    <span className="ml-auto rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-bold text-on-brand" style={mono}>
                        {topics.unseen} new
                    </span>
                )}
            </div>
            {topics.followed === 0 ? (
                <>
                    <p className="text-sm text-fg" style={display}>Follow what you care about</p>
                    <p className="text-xs text-fg-muted mt-1" style={mono}>Markets, tech, politics, sport — anything</p>
                </>
            ) : (
                <>
                    <p className="text-2xl font-semibold text-fg" style={display}>{topics.followed}</p>
                    <p className="text-sm text-brand-dim" style={mono}>
                        {topics.followed === 1 ? 'topic' : 'topics'} <span className="text-fg-muted text-xs">followed</span>
                    </p>
                    {topics.top.length > 0 && (
                        <ul className="mt-3 space-y-1">
                            {topics.top.map((t) => (
                                <li key={t.slug} className="flex items-center gap-2 text-xs text-fg-soft">
                                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{background: t.color ?? 'var(--brand)'}} aria-hidden="true" />
                                    <span className="truncate">{t.name}</span>
                                    {t.unseenCount > 0 && <span className="ml-auto text-brand" style={mono}>{t.unseenCount}</span>}
                                </li>
                            ))}
                        </ul>
                    )}
                </>
            )}
        </div>
    </Link>
);

export default TopicsSidebarCard;
