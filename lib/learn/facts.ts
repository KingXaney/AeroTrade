// What the learn surfaces know about an account, derived from stored rows — never a
// flag that says "new user". A mission is done when the row it asks for exists; the
// checklist leaves when every row exists, when it was dismissed once, or when the
// account is older than the first month. Pure types and date maths only; the reads
// live in facts-store.ts.

export type OnboardingFacts = {
    // ET calendar dates, 'YYYY-MM-DD'.
    today: string;
    // The oldest paper account's creation date; null before the first render creates one.
    accountCreatedOn: string | null;
    hasUserTrade: boolean;
    followedStrategies: readonly string[];
    topicOpened: boolean;
    hasWatchlist: boolean;
    navigatorEnrolled: boolean;
    // ISO timestamp of the one-time "Hide" click, or null.
    missionsDismissedAt: string | null;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Whole calendar days from `from` to `to` ('YYYY-MM-DD'); negative when `to` is earlier.
export const daysBetween = (from: string, to: string): number =>
    Math.round((Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10)) -
        Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10))) / MS_PER_DAY);
