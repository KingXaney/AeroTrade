'use server';

import {connectToDatabase} from "@/database/mongoose";
import {getCurrentUserId} from "@/lib/auth/session";
import {unsetPreference, upsertPreferences} from "@/lib/settings/preferences-store";
import {defaultNewsFeed, isDefaultNewsFeed, NewsFeedSchema, normalizeNewsFeed, type NewsFeedPrefs} from "@/lib/news/feed-prefs";
import {formatIssue} from "@/lib/topics/normalize";
import type {ActionResult} from '@/lib/actions/types';

// Writes only. Reads live in lib/news/feed-store.ts (a plain server module), so they are
// not exposed as POST endpoints. No action here revalidates a path: the editor refreshes
// once its own state is settled, the same way the dashboard editor does, and the "last
// opened News" stamp is cleared in the shell by a window event (lib/shell/news-seen.ts).

type NewsFeedSaveResult = ActionResult & {feed?: NewsFeedPrefs};

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

// The reader opened News (/news or the /topics index): the stamp behind the rail's News dot and
// its card's "Since you last looked". Called once per visit by components/news/NewsSeenMarker.
// A topic's own page stamps the topic instead (lib/actions/topics.actions.markTopicSeen).
export const markNewsSeen = async (): Promise<ActionResult> => {
    const userId = await getCurrentUserId();
    if (!userId) return {success: false, message: 'Not authenticated'};
    try {
        await connectToDatabase();
        await upsertPreferences(userId, {$set: {newsSeenAt: new Date(), updatedAt: new Date()}});
        return {success: true};
    } catch (error) {
        console.error('Error marking news seen:', error);
        return {success: false, message: 'Could not update'};
    }
};
