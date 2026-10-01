import {inngest} from "@/lib/jobs/client";
import {JOBS} from "@/lib/jobs/registry";

// Best effort, and honest about it: a queue outage must never fail the user's
// action (creating a topic still creates the topic), but the caller gets to know
// the send failed so it can stop claiming "queued" and roll back any cooldown it
// took on the strength of that claim.
const send = async (name: string, data: Record<string, unknown>): Promise<boolean> => {
    try {
        await inngest.send({name, data});
        return true;
    } catch (error) {
        console.error(`Failed to queue ${name}:`, error);
        return false;
    }
};

export const requestTopicRefresh = (userId: string, keywordSetHash: number): Promise<boolean> =>
    send(JOBS.topicOnDemand.event, {userId, keywordSetHash});

// One event for a whole batch of new topics. The on-demand job rate-limits per user
// and Inngest's rateLimit drops events rather than queueing them, so a first-run
// batch of eight starters used to lose two silently.
export const requestTopicFirstRun = (userId: string): Promise<boolean> =>
    send(JOBS.topicFirstRun.event, {userId});
