// Which topic to fetch for when the user has topics but no articles. Pure so the
// choice is unit-tested; the page does the fetch via ensureTopicHasArticles.

type Pickable = {lastFetchedAt: number | null; createdAt: number};

// The bounded safety net on /topics: at most ONE never-fetched topic per page view,
// oldest first. Self-extinguishing, because refreshKeywordGroup stamps lastFetchedAt
// even when a fetch matched nothing — a reload never fetches the same topic twice.
export const pickFirstRunTopic = <T extends Pickable>(topics: readonly T[]): T | null => {
    let oldest: T | null = null;
    for (const t of topics) {
        if (t.lastFetchedAt !== null) continue;
        if (!oldest || t.createdAt < oldest.createdAt) oldest = t;
    }
    return oldest;
};

// The merged empty state has one "Refresh now" and many topics; it refreshes the one
// that has gone longest without a fetch (never-fetched first), so a single click is
// one claim and one event rather than a fan-out that the per-user rate limit drops.
export const pickStalestTopic = <T extends Pickable>(topics: readonly T[]): T | null => {
    let stalest: T | null = null;
    for (const t of topics) {
        if (!stalest) { stalest = t; continue; }
        const a = t.lastFetchedAt ?? -Infinity;
        const b = stalest.lastFetchedAt ?? -Infinity;
        if (a < b || (a === b && t.createdAt < stalest.createdAt)) stalest = t;
    }
    return stalest;
};
