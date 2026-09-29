'use server';

import {revalidatePath} from "next/cache";
import {connectToDatabase} from "@/database/mongoose";
import {getCurrentUserId} from "@/lib/actions/watchlist.actions";
import {upsertPreferences} from "@/lib/preferences/upsert";
import {LESSONS_SEEN_CAP, lessonKey, parseLessonId} from "@/lib/learn/moments";
import {LESSON_COPY} from "@/lib/learn/copy/lesson";

// Writes only; the reads live in lib/learn/facts-store.ts (a plain server module).

// The one-time "Hide" on the First-week checklist. A stamp, never a recomputation:
// a dismissed checklist stays dismissed however fresh the account still looks.
export const dismissMissions = async (): Promise<OrderResult> => {
    const userId = await getCurrentUserId();
    if (!userId) return {success: false, message: 'Not authenticated'};
    try {
        await connectToDatabase();
        await upsertPreferences(userId, {$set: {'learn.missionsDismissedAt': new Date(), updatedAt: new Date()}});
        revalidatePath('/');
        return {success: true};
    } catch (error) {
        console.error('Error dismissing missions:', error);
        return {success: false, message: 'Could not hide the checklist'};
    }
};

// Today's lesson "Got it": stamps the moment's key once, keeping the newest LESSONS_SEEN_CAP.
// The argument arrives from the client, so it is `unknown` until the zod schema in
// lib/learn/moments.ts says it is one of the four firsts or a real rebalance id; only the
// key derived from the parsed value is written.
export const markLessonSeen = async (input: unknown): Promise<OrderResult> => {
    const userId = await getCurrentUserId();
    if (!userId) return {success: false, message: LESSON_COPY.notSignedIn};
    const id = parseLessonId(input);
    if (!id) return {success: false, message: LESSON_COPY.invalid};
    try {
        await connectToDatabase();
        await upsertPreferences(userId, {
            $push: {'learn.lessonsSeen': {$each: [lessonKey(id)], $slice: -LESSONS_SEEN_CAP}},
            $set: {updatedAt: new Date()},
        });
        revalidatePath('/');
        return {success: true};
    } catch (error) {
        console.error('Error marking a lesson seen:', error);
        return {success: false, message: LESSON_COPY.notSaved};
    }
};
