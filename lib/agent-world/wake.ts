// Waking the trading agent world's job, best effort and honest about it: a queue outage never fails
// the write that came before it (the events are stored, the decision is recorded), and the job
// reads Mongo between its waits, so a lost wake-up costs one round of waiting, never the session.

import {AGENT_WORLD_EVENTS} from "@/lib/agent-world/config";
import {inngest} from "@/lib/jobs/client";
import {JOBS} from "@/lib/jobs/registry";

const send = async (name: string, data: Record<string, unknown>): Promise<boolean> => {
    try {
        await inngest.send({name, data});
        return true;
    } catch (error) {
        console.error(`Failed to queue ${name}:`, error);
        return false;
    }
};

export const wakeOnFinished = (sessionId: string, outcome: 'completed' | 'failed'): Promise<boolean> =>
    send(AGENT_WORLD_EVENTS.finished, {sessionId, outcome});

export const wakeOnDecision = (sessionId: string, decision: 'approved' | 'declined', by: string): Promise<boolean> =>
    send(AGENT_WORLD_EVENTS.decided, {sessionId, decision, by});

// A session asked for by hand: the owner's Run now or preview, or a routine fired in Paperclip.
export const requestSession = (data: {manual: true; force?: boolean; dryRun?: boolean; by?: string; source?: 'paperclip'; paperclip?: {runId: string | null; taskId: string | null}}): Promise<boolean> =>
    send(JOBS.agentWorldWeekly.event, data);
