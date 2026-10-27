'use server';

import {revalidatePath} from "next/cache";
import {z} from "zod";
import {isLiveStatus} from "@/lib/agent-world/config";
import {mirrorDecision} from "@/lib/agent-world/company";
import {agentWorldEnv, agentWorldOff, isAgentWorldOwner} from "@/lib/agent-world/env";
import {SESSION_ID} from "@/lib/agent-world/events";
import {decideSession, getSession, latestSession} from "@/lib/agent-world/store";
import {requestSession, wakeOnDecision} from "@/lib/agent-world/wake";
import type {ActionResult} from "@/lib/actions/types";
import {getCurrentUser} from "@/lib/auth/session";
import {ACTION_COPY} from "@/lib/learn/copy/agent-world";
import {takeRateLimit} from "@/lib/rate-limit";

// The owner's hand on the trading agent world: start a session (or a preview) by hand, and decide a
// session that awaits a decision. Everyone signed in watches the floor; only the owners
// (AGENT_WORLD_OWNER_EMAILS, else LAB_OWNER_EMAILS) act. The decision is Mongo's first — the job
// reads it there — then the job is woken and the Paperclip issue told, each best effort.

const ACTIONS_PER_MINUTE = 20;

const begin = async (): Promise<{userId: string; email: string} | {refused: string}> => {
    const user = await getCurrentUser();
    if (!user) return {refused: ACTION_COPY.notSignedIn};
    if (!isAgentWorldOwner(user.email)) return {refused: ACTION_COPY.notOwner};
    if (!(await takeRateLimit(`agent-world:${user.id}`, ACTIONS_PER_MINUTE, 60_000))) return {refused: ACTION_COPY.tooFast};
    return {userId: user.id, email: user.email};
};

const refresh = () => revalidatePath('/agent-world');

const RunInput = z.strictObject({preview: z.boolean().optional()});

export const runAgentWorldNow = async (input: unknown): Promise<ActionResult> => {
    try {
        const gate = await begin();
        if ('refused' in gate) return {success: false, message: gate.refused};
        const parsed = RunInput.safeParse(input ?? {});
        if (!parsed.success) return {success: false, message: ACTION_COPY.invalid};
        if (agentWorldOff() !== null) return {success: false, message: ACTION_COPY.off};
        const latest = await latestSession(agentWorldEnv());
        if (latest && isLiveStatus(latest.status)) return {success: false, message: ACTION_COPY.live};
        const preview = parsed.data.preview === true;
        const queued = await requestSession({manual: true, force: !preview, dryRun: preview, by: gate.email});
        if (!queued) return {success: false, message: ACTION_COPY.notQueued};
        refresh();
        return {success: true, message: preview ? ACTION_COPY.previewStarted : ACTION_COPY.started};
    } catch (error) {
        console.error('runAgentWorldNow failed:', error);
        return {success: false, message: ACTION_COPY.notSaved};
    }
};

const DecideInput = z.strictObject({sessionId: SESSION_ID});

const decide = async (input: unknown, decision: 'approved' | 'declined'): Promise<ActionResult> => {
    try {
        const gate = await begin();
        if ('refused' in gate) return {success: false, message: gate.refused};
        const parsed = DecideInput.safeParse(input);
        if (!parsed.success) return {success: false, message: ACTION_COPY.invalid};
        const env = agentWorldEnv();
        const {sessionId} = parsed.data;
        if (!(await decideSession(env, sessionId, decision, gate.email))) return {success: false, message: ACTION_COPY.notAwaiting};
        // The job reads Mongo once it wakes; a lost wake-up only waits for the deadline's read.
        await wakeOnDecision(sessionId, decision, gate.email);
        const session = await getSession(env, sessionId);
        await mirrorDecision(env, sessionId, session?.paperclip.issueId ?? null, decision, gate.email).catch((error) => {
            console.error('agent world: decision not mirrored to Paperclip', (error as Error).message);
            return false;
        });
        refresh();
        return {success: true, message: decision === 'approved' ? ACTION_COPY.approved : ACTION_COPY.declined};
    } catch (error) {
        console.error(`agent world ${decision} failed:`, error);
        return {success: false, message: ACTION_COPY.notSaved};
    }
};

export const approveSession = async (input: unknown): Promise<ActionResult> => decide(input, 'approved');

export const declineSession = async (input: unknown): Promise<ActionResult> => decide(input, 'declined');
