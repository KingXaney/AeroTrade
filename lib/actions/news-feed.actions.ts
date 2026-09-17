'use server';

import {connectToDatabase} from "@/database/mongoose";
import {getCurrentUserId} from "@/lib/actions/watchlist.actions";
import {unsetPreference, upsertPreferences} from "@/lib/preferences/upsert";
import {defaultNewsFeed, isDefaultNewsFeed, NewsFeedSchema, normalizeNewsFeed, type NewsFeedPrefs} from "@/lib/news/feed-prefs";
import {formatIssue} from "@/lib/topics/normalize";

// Writes only. Reads live in lib/news/feed-store.ts (a plain server module), so they are
// not exposed as POST endpoints. Neither action revalidates a path: the editor refreshes
// once its own state is settled, the same way the dashboard editor does.

export type NewsFeedSaveResult = OrderResult & {feed?: NewsFeedPrefs};

export const saveNewsFeed = async (input: unknown): Promise<NewsFeedSaveResult> => {
    const userId = await getCurrentUserId();
    if (!userId) return {success: false, message: 'Not authenticated'};

    const parsed = NewsFeedSchema.safeParse(input);
    if (!parsed.success) return {success: false, message: formatIssue(parsed.error)};
    const feed = normalizeNewsFeed(parsed.data);   // whitelists, dedupes, caps; never empty

    try {
        await connectToDatabase();
        // The default is represented by absence, so saving it is the same as resetting:
        // a stored copy would go stale the day the default feed changes.
        if (isDefaultNewsFeed(feed)) await unsetPreference(userId, 'newsFeed');
        else await upsertPreferences(userId, {newsFeed: feed, updatedAt: new Date()});
        return {success: true, feed};
    } catch (error) {
        console.error('Error saving news feed:', error);
        return {success: false, message: 'Could not save your news feed'};
    }
};

export const resetNewsFeed = async (): Promise<NewsFeedSaveResult> => {
    const userId = await getCurrentUserId();
    if (!userId) return {success: false, message: 'Not authenticated'};
    try {
        await connectToDatabase();
        await unsetPreference(userId, 'newsFeed');
        return {success: true, feed: defaultNewsFeed()};
    } catch (error) {
        console.error('Error resetting news feed:', error);
        return {success: false, message: 'Could not reset your news feed'};
    }
};
