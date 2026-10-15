// Enrolling an account with a culture picker, the pure parts: which pickers may be enrolled
// with, the account's name, a picker's latest decision read back as targets for an enrolled
// account's own book, an enrolment as the card shows it, and the bootstrap's summary line. The
// DB halves are lib/culture/follow-store.ts; the decision is lib/culture/engine.decideForBook.

import {z} from "zod";
import {CULTURE_PROFILES, LIVE_PROFILES, type ProfileId} from "@/lib/culture/config";
import type {CultureDecisionItem} from "@/lib/culture/decisions";
import type {TargetWeight} from "@/lib/navigator/allocator";
import type {ScoredSymbol} from "@/lib/navigator/scoring";

// The live profiles, as zod reads an action's input; lib/culture/__tests__/follow.test.ts holds
// it equal to LIVE_PROFILES.
export const FollowProfileSchema = z.enum(['spike', 'quiet']);
export type FollowProfile = z.infer<typeof FollowProfileSchema>;

export const isFollowProfile = (value: unknown): value is FollowProfile => FollowProfileSchema.safeParse(value).success;

// The account an enrolment creates for the user: never the picker's own name ("Culture Brain · …").
export const followAccountName = (profile: ProfileId): string => `Culture · ${CULTURE_PROFILES[profile].label}`;

// A picker's decision items read back as the week's targets: every symbol the picker weighs
// above zero, once, with the score and reasons it recorded. A sell to zero carries no weight.
export const targetsFromDecisionItems = (items: readonly CultureDecisionItem[]): TargetWeight[] => {
    const seen = new Set<string>();
    const targets: TargetWeight[] = [];
    for (const item of items) {
        if (item.targetWeight <= 0 || seen.has(item.symbol)) continue;
        seen.add(item.symbol);
        targets.push({symbol: item.symbol, weight: item.targetWeight, score: item.score, reasons: [...item.reasons]});
    }
    return targets;
};

// The scores the items carry, for the held rows of an enrolled book (an exit reads this week's).
export const scoredFromItems = (items: readonly CultureDecisionItem[]): ScoredSymbol[] =>
    items.map((item) => ({symbol: item.symbol, score: item.score, eligible: true, reasons: [...item.reasons]}));

export type FollowRow = {
    userId: string;
    profile: ProfileId;
    accountId: string;
    status: 'active' | 'paused';
    enrolledAt: Date;
    lastRunWeek: string | null;
    lastError: string | null;
};

// An enrolment as the card shows it: the Navigator's shape, per picker.
export type FollowStatus = {
    enrolled: boolean;
    status?: 'active' | 'paused';
    accountId?: string;
    enrolledAt?: number;          // epoch ms
    lastRunWeek?: string;
    lastError?: string;
};

export const followStatusView = (row: FollowRow | null): FollowStatus => row
    ? {
        enrolled: true,
        status: row.status,
        accountId: row.accountId,
        enrolledAt: row.enrolledAt.getTime(),
        ...(row.lastRunWeek ? {lastRunWeek: row.lastRunWeek} : {}),
        ...(row.lastError ? {lastError: row.lastError} : {}),
    }
    : {enrolled: false};

export type FollowRunKind = 'executed' | 'preview' | 'skipped' | 'no-decision' | 'not-enrolled';

export const describeFollowRun = (p: {profile: ProfileId; kind: FollowRunKind; orders: number; filled: number; note?: string}): string => {
    const label = CULTURE_PROFILES[p.profile].label;
    const head = p.kind === 'not-enrolled' ? `${label}: no active enrolment`
        : p.kind === 'no-decision' ? `${label}: the picker has not run yet, nothing to deploy`
            : p.kind === 'skipped' ? `${label}: already ran this week`
                : p.kind === 'preview' ? `${label}: ${p.orders} order(s) planned (preview)`
                    : `${label}: ${p.filled}/${p.orders} order(s) filled`;
    return `Culture enrolment — ${p.note ? `${head} — ${p.note}` : head}`;
};

export const LIVE_FOLLOW_PROFILES: readonly FollowProfile[] = LIVE_PROFILES.filter(isFollowProfile);
