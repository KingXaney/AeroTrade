// The default topics every new account starts with, so nobody has to configure a news
// terminal before it will show them any news.
//
// A plain server module, deliberately NOT 'use server' — see lib/topics/insert.ts. The
// sign-up path calls it with an id it has just minted, before any session exists.

import {connectToDatabase} from "@/database/mongoose";
import Topic from "@/database/models/topic.model";
import UserPreferencesModel from "@/database/models/user-preferences.model";
import {upsertPreferences} from "@/lib/preferences/upsert";
import {insertTopic} from "@/lib/topics/insert";
import {defaultTopics} from "@/lib/topics/starters";
import {requestTopicFirstRun} from "@/lib/topics/events";

export type SeedResult = {created: number; firstSlug: string | null};

const EMPTY: SeedResult = {created: 0, firstSlug: null};

// `force` is the user asking for the defaults back from the empty state. It skips the
// once-only marker but never the "you already have topics" check, so restoring twice is
// still a no-op rather than a pile of duplicate-name errors.
export const seedDefaultTopics = async (userId: string, {force = false}: {force?: boolean} = {}): Promise<SeedResult> => {
    if (!userId) return EMPTY;
    await connectToDatabase();

    // Two guards, and the second is the one that matters. Without the marker, a user who
    // deliberately unfollows everything gets the defaults resurrected on their next page
    // view — the exact opposite of being able to change them.
    if (await Topic.exists({userId})) return EMPTY;
    if (!force) {
        const prefs = await UserPreferencesModel.findOne({userId}).select('topicsSeededAt').lean();
        if (prefs?.topicsSeededAt) return EMPTY;
    }

    let created = 0;
    let firstSlug: string | null = null;
    for (const topic of defaultTopics()) {
        // Per item, so one bad insert costs that topic and not the ones already created.
        try {
            const result = await insertTopic(userId, {name: topic.name, keywords: topic.keywords, exclude: topic.exclude ?? []});
            if ('error' in result) { console.error('Default topic skipped:', topic.name, result.error); continue; }
            created += 1;
            firstSlug ??= result.doc.slug;
        } catch (error) {
            console.error('Error seeding a default topic:', topic.name, error);
        }
    }

    // Stamped whether or not anything was created, so a seed that fails outright is not
    // retried on every page view forever.
    await upsertPreferences(userId, {$set: {topicsSeededAt: new Date(), updatedAt: new Date()}})
        .catch((error: unknown) => console.error('Could not stamp topicsSeededAt:', error));

    // ONE event for the whole batch: the per-topic job's Inngest rateLimit *drops* excess
    // events rather than queueing them, so six individual refreshes would silently lose some.
    if (created > 0) await requestTopicFirstRun(userId);
    return {created, firstSlug};
};

// Whether the safety net on /topics should run: no topics, and never seeded before.
export const shouldSeedDefaults = async (userId: string): Promise<boolean> => {
    const prefs = await UserPreferencesModel.findOne({userId}).select('topicsSeededAt').lean();
    return !prefs?.topicsSeededAt;
};
