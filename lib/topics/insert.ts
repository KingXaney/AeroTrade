// Validate, cap, dedupe, insert — the one write path for a followed topic.
//
// A plain server module, deliberately NOT 'use server': a server-action export taking a
// userId would be an unauthenticated write endpoint (the same reason spelled out in
// lib/preferences/upsert.ts). Callers derive userId from the session, or are themselves
// the account-creation path. It queues nothing: every caller differs in exactly that.

import Topic, {type TopicDoc} from "@/database/models/topic.model";
import {MAX_TOPICS_PER_USER} from "@/lib/topics/config";
import {deriveKeywords, formatIssue, keywordSetHash, slugify, topicInputSchema} from "@/lib/topics/normalize";

export const parseTopicInput = (input: unknown) => {
    const parsed = topicInputSchema.safeParse(input);
    if (!parsed.success) return {error: formatIssue(parsed.error)} as const;
    const derived = deriveKeywords(parsed.data);
    if (!derived) return {error: 'Add at least one keyword to match articles against.'} as const;
    return {value: parsed.data, derived} as const;
};

export const insertTopic = async (userId: string, input: unknown): Promise<{doc: TopicDoc} | {error: string}> => {
    const parsed = parseTopicInput(input);
    if ('error' in parsed) return {error: parsed.error ?? 'Invalid topic'};
    const {value, derived} = parsed;

    if ((await Topic.countDocuments({userId})) >= MAX_TOPICS_PER_USER) {
        return {error: `You can follow up to ${MAX_TOPICS_PER_USER} topics. Remove one to add another.`};
    }
    const slug = slugify(value.name);
    if (await Topic.exists({userId, slug})) {
        return {error: `You already follow a topic called "${value.name}".`};
    }
    const doc = await Topic.create({
        userId,
        name: value.name,
        slug,
        keywords: derived.keywords,
        exclude: derived.exclude,
        color: value.color ?? undefined,
        keywordSetHash: keywordSetHash(derived.keywords, derived.exclude),
    });
    return {doc};
};
