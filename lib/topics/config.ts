// Limits for followed topics. Actions, jobs and UI copy all read the same numbers
// from here so a cap can never drift between the validator and the message shown.

// Six of these are seeded for every new account (lib/topics/starters.ts), so the cap is
// the user's own budget plus the defaults — 12 would have left them only six slots.
export const MAX_TOPICS_PER_USER = 16;
export const MAX_EXCLUDES = 8;
export const NAME_MIN = 2;
export const NAME_MAX = 60;

// User keywords become (escaped) regexes run over every candidate article. Capping
// the text per article bounds that work no matter how long a feed description is.
export const MAX_MATCH_TEXT_CHARS = 2000;
export const MATCH_CAP_PER_FETCH = 40;
export const MAX_ARTICLES_PER_TOPIC_PER_DAY = 60;

// The three-hourly sweep refreshes at most this many keyword sets, the ones longest without a
// fetch (one search a second).
export const TOPIC_GROUPS_PER_RUN = 60;

// Briefs run on the free Gemini tier with a 15 s sleep between calls; 20 keeps the
// daily job well inside the quota.
export const MAX_BRIEF_CALLS_PER_RUN = 20;
export const BRIEF_MIN_NEW_ARTICLES = 3;
export const BRIEF_MIN_AGE_HOURS = 20;

export const REFRESH_COOLDOWN_MS = 10 * 60 * 1000;

// How long a topic's "Refresh now" stays claimed, from the last claim. Missing or
// unparsable claims count as expired. `now` is injectable so the maths is testable.
export const refreshCooldownRemainingMs = (requestedAt: number | Date | null | undefined, now: number = Date.now()): number => {
    if (requestedAt == null) return 0;
    const at = typeof requestedAt === 'number' ? requestedAt : requestedAt.getTime();
    if (!Number.isFinite(at)) return 0;
    return Math.max(0, at + REFRESH_COOLDOWN_MS - now);
};

// Epoch ms when a claim taken at `requestedAt` lifts, or null with no claim. Pure
// arithmetic on purpose — no Date.now() — so the server and the client compute the
// same instant and the refresh button can hydrate from it; consumers clamp at zero.
export const refreshCooldownUntil = (requestedAt: number | Date | null | undefined): number | null => {
    if (requestedAt == null) return null;
    const at = typeof requestedAt === 'number' ? requestedAt : requestedAt.getTime();
    return Number.isFinite(at) ? at + REFRESH_COOLDOWN_MS : null;
};

export const refreshCooldownMessage = (remainingMs: number): string => {
    const minutes = Math.ceil(Math.max(0, remainingMs) / 60_000);
    return minutes <= 1
        ? 'Refreshed recently — try again in a minute.'
        : `Refreshed recently — try again in ${minutes} minutes.`;
};
