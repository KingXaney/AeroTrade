'use server';

// Enrolling an account with a culture picker, the actions (lib/culture/follow.ts is the pure
// half, lib/culture/follow-store.ts the rows). The Navigator's shape: a dedicated paper account
// created — or reclaimed empty — through the normal account flow, a row per picker, the bootstrap
// queued once. Every action reads the session, parses its input with zod, spends the one rate
// counter and revalidates the pages that print the enrolment.

import {revalidatePath} from "next/cache";
import {z} from "zod";
import {getOwnerUserId} from "@/lib/auth/session";
import {createPaperAccount} from "@/lib/actions/accounts.actions";
import {getAccountsForUser} from "@/lib/trading/accounts";
import {STARTING_BALANCE_ERROR, resolveStartingBalance} from "@/lib/trading/starting-balance";
import {restartAccount} from "@/lib/trading/lifecycle";
import {CULTURE_PROFILES} from "@/lib/culture/config";
import {FollowProfileSchema, followAccountName, type FollowProfile} from "@/lib/culture/follow";
import {createFollow, getFollow, removeFollow, setFollowStatus} from "@/lib/culture/follow-store";
import {inngest} from "@/lib/jobs/client";
import {JOBS} from "@/lib/jobs/registry";
import {takeRateLimit} from "@/lib/rate-limit";
import {CULTURE_FOLLOW_COPY} from "@/lib/learn/copy/culture";
import type {ActionResult} from '@/lib/actions/types';

const FOLLOW_ACTIONS_PER_MINUTE = 10;

const EnrollInput = z.object({
    profile: FollowProfileSchema,
    startingBalance: z.number().finite().optional(),
});

const ProfileInput = z.object({profile: FollowProfileSchema});

const revalidateFollowPaths = () => {
    revalidatePath('/culture');
    revalidatePath('/portfolio');
    revalidatePath('/');
    revalidatePath('/dashboard');
};

// The session (the owner's: lib/lab/owner.ts), the input and the counter, in that order; every
// action begins here.
const begin = async <T>(schema: z.ZodType<T>, input: unknown): Promise<{userId: string; data: T} | {error: string}> => {
    const userId = await getOwnerUserId();
    if (!userId) return {error: 'Not authenticated'};
    const parsed = schema.safeParse(input);
    if (!parsed.success) return {error: CULTURE_FOLLOW_COPY.unknownPicker};
    if (!(await takeRateLimit(`culture:follow:${userId}`, FOLLOW_ACTIONS_PER_MINUTE, 60_000))) return {error: CULTURE_FOLLOW_COPY.tooFast};
    return {userId, data: parsed.data};
};

const queueBootstrap = async (userId: string, profile: FollowProfile): Promise<boolean> => {
    try {
        await inngest.send({name: JOBS.cultureFollowBootstrap.event, data: {userId, profile}});
        return true;
    } catch (error) {
        console.error('Could not queue the culture enrolment bootstrap:', error);
        return false;
    }
};

// Opt in: the picker gets a dedicated paper account of the user's, named for it, created (or
// reclaimed empty on re-enrolment) through the normal account flow so the cap and the day-zero
// snapshot apply. A failed bootstrap send never fails the enrolment: the weekly run trades it.
export const enrollCulturePicker = async (input: unknown): Promise<ActionResult> => {
    try {
        const started = await begin(EnrollInput, input);
        if ('error' in started) return {success: false, message: started.error};
        const {userId, data: {profile, startingBalance}} = started;
        const label = CULTURE_PROFILES[profile].label;

        if (await getFollow(userId, profile)) return {success: false, message: CULTURE_FOLLOW_COPY.alreadyEnrolled(label)};

        const name = followAccountName(profile);
        const accounts = await getAccountsForUser(userId);
        const reusable = accounts.find((a) => (a.name || '').toLowerCase() === name.toLowerCase());
        if (reusable && reusable.positions.length > 0) {
            // Never adopt an account with holdings: the picker would gain the authority to sell
            // positions the user placed there by hand.
            return {success: false, message: CULTURE_FOLLOW_COPY.hasHoldings(name)};
        }
        let accountId = reusable ? String(reusable._id) : undefined;
        if (reusable && startingBalance !== undefined) {
            const balance = resolveStartingBalance(startingBalance);
            if (balance === null) return {success: false, message: STARTING_BALANCE_ERROR};
            await restartAccount(userId, reusable, balance);
        }
        if (!accountId) {
            const created = await createPaperAccount({name, startingBalance});
            if (!created.success || !created.accountId) return {success: false, message: created.message || CULTURE_FOLLOW_COPY.couldNotCreate};
            accountId = created.accountId;
        }

        await createFollow(userId, profile, accountId);
        const queued = await queueBootstrap(userId, profile);

        revalidateFollowPaths();
        return {success: true, message: queued ? CULTURE_FOLLOW_COPY.enrolledQueued(label) : CULTURE_FOLLOW_COPY.enrolledWeekly(label)};
    } catch (error) {
        console.error('Error enrolling with a culture picker:', error);
        return {success: false, message: CULTURE_FOLLOW_COPY.couldNotEnroll};
    }
};

const setStatus = async (input: unknown, status: 'active' | 'paused'): Promise<ActionResult> => {
    try {
        const started = await begin(ProfileInput, input);
        if ('error' in started) return {success: false, message: started.error};
        const {userId, data: {profile}} = started;
        if (!(await setFollowStatus(userId, profile, status))) return {success: false, message: CULTURE_FOLLOW_COPY.notEnrolled};
        revalidateFollowPaths();
        const label = CULTURE_PROFILES[profile].label;
        return {success: true, message: status === 'paused' ? CULTURE_FOLLOW_COPY.pausedToast(label) : CULTURE_FOLLOW_COPY.resumedToast(label)};
    } catch (error) {
        console.error('Error updating a culture enrolment:', error);
        return {success: false, message: CULTURE_FOLLOW_COPY.couldNotUpdate};
    }
};

export const pauseCultureFollow = async (input: unknown): Promise<ActionResult> => setStatus(input, 'paused');
export const resumeCultureFollow = async (input: unknown): Promise<ActionResult> => setStatus(input, 'active');

// "Trade now": the bootstrap again — it trades if this week is still unclaimed and the market
// is open, otherwise previews, so it is always safe to press.
export const runCultureFollowNow = async (input: unknown): Promise<ActionResult> => {
    try {
        const started = await begin(ProfileInput, input);
        if ('error' in started) return {success: false, message: started.error};
        const {userId, data: {profile}} = started;
        const row = await getFollow(userId, profile);
        if (!row) return {success: false, message: CULTURE_FOLLOW_COPY.notEnrolled};
        if (row.status !== 'active') return {success: false, message: CULTURE_FOLLOW_COPY.pausedFirst};
        if (!(await queueBootstrap(userId, profile))) return {success: false, message: CULTURE_FOLLOW_COPY.queueUnreachable};
        return {success: true, message: CULTURE_FOLLOW_COPY.runQueued};
    } catch (error) {
        console.error('Error queueing a culture enrolment run:', error);
        return {success: false, message: CULTURE_FOLLOW_COPY.queueUnreachable};
    }
};

// Unenroll keeps the paper account (least destructive) — delete it from /portfolio if wanted.
export const unenrollCulturePicker = async (input: unknown): Promise<ActionResult> => {
    try {
        const started = await begin(ProfileInput, input);
        if ('error' in started) return {success: false, message: started.error};
        const {userId, data: {profile}} = started;
        if (!(await removeFollow(userId, profile))) return {success: false, message: CULTURE_FOLLOW_COPY.notEnrolled};
        revalidateFollowPaths();
        return {success: true, message: CULTURE_FOLLOW_COPY.unenrolledToast(CULTURE_PROFILES[profile].label)};
    } catch (error) {
        console.error('Error unenrolling from a culture picker:', error);
        return {success: false, message: CULTURE_FOLLOW_COPY.couldNotUpdate};
    }
};
