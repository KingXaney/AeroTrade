// The shell's own sentences: the rail's News card (components/shell/NewsSidebarCard.tsx) and the
// aria text behind the dots on the rail and the mobile drawer. Pure exports, held to the 'copy'
// tier of lib/learn/banned.ts by lib/learn/__tests__/shell-copy.test.ts. The browser QA reads
// the dot sentences word for word (qa-topics, qa-topics-refresh), so they are pinned there too.

import type {NavBadgeKey} from "@/lib/shell/navigation";

export const SHELL_COPY = {
    newsHeading: 'News',
    // The rows' eyebrow when the reader has never opened News.
    topicsHeading: 'Your topics',
    // "Since you last looked · 3 hours ago" — `ago` from lib/format.formatTimeAgoMs.
    sinceLastLook: (ago: string): string => `Since you last looked · ${ago}`,
    // "3 new", "99+ new" — the count arrives through lib/format.formatCapped.
    newCount: (count: string): string => `${count} new`,
    // The card with no topics and no briefing.
    empty: 'Headlines, and the topics you follow.',
    openNews: 'Open the news',
    // After the section name on the rail and in the drawer: "News, new in 1 topic since you last looked".
    newsDot: (topics: number): string => `new in ${topics} ${topics === 1 ? 'topic' : 'topics'} since you last looked`,
    // "Portfolio, 2 holdings valued at cost".
    unpricedDot: (holdings: number): string => `${holdings} ${holdings === 1 ? 'holding' : 'holdings'} valued at cost`,
} as const;

// What a dot on a rail icon says to a screen reader. Watchlist and friend-request counts sit beside
// a label (the section tabs, the account menu), never on a rail dot, so they have no sentence here.
export const dotLabel = (key: NavBadgeKey, count: number): string => {
    switch (key) {
        case 'newsNew':
            return SHELL_COPY.newsDot(count);
        case 'unpriced':
            return SHELL_COPY.unpricedDot(count);
        default:
            return '';
    }
};
