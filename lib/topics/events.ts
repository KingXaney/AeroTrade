import {inngest} from "@/lib/inngest/client";

export const TOPIC_REFRESH_EVENT = 'topic/refresh.requested';
export const TOPIC_FIRST_RUN_EVENT = 'topic/first-run.requested';
export const TOPIC_FEEDS_EVENT = 'app/refresh.topic.feeds';
export const TOPIC_BRIEFS_EVENT = 'app/generate.topic.briefs';

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
    send(TOPIC_REFRESH_EVENT, {userId, keywordSetHash});

// One event for a whole batch of new topics. The on-demand job rate-limits per user
// and Inngest's rateLimit drops events rather than queueing them, so a first-run
// batch of eight starters used to lose two silently.
export const requestTopicFirstRun = (userId: string): Promise<boolean> =>
    send(TOPIC_FIRST_RUN_EVENT, {userId});
