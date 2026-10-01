'use server';

import {revalidatePath} from "next/cache";
import {connectToDatabase} from "@/database/mongoose";
import {getCurrentUserId} from "@/lib/auth/session";
import {upsertPreferences} from "@/lib/settings/preferences-store";
import {LESSONS_SEEN_CAP, lessonKey, parseLessonId} from "@/lib/learn/moments";
import {LESSON_COPY} from "@/lib/learn/copy/lesson";
import {parseQuizDate} from "@/lib/learn/quiz";
import {DAILY_QUIZ_COPY} from "@/lib/learn/copy/quiz";
import {readQuizDaysAnswered} from "@/lib/learn/quiz-store";
import UserPreferencesModel from "@/database/models/user-preferences.model";
import {getEasternDateString} from "@/lib/dates";

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

export type QuizAnswerResult = {success: true; daysAnswered: number} | {success: false; message: string};

// The Daily quiz's answer: counts the day once. The argument arrives from the client, so it is
// `unknown` until parseQuizDate says it is today's ET date, exactly — a question left open past
// midnight is an earlier day's and is not counted. One atomic update, filtered on the date not
// being the last one counted: a second answer the same day (another tab, a reload, a double
// click) matches nothing and changes nothing. With no preferences document yet, the upsert
// creates it; when the document exists but today is already counted, that upsert collides on
// the unique userId and the collision means "counted already". Correctness is not recorded:
// the count is of days answered, with no streak and no reward.
export const recordQuizAnswer = async (input: unknown): Promise<QuizAnswerResult> => {
    const userId = await getCurrentUserId();
    if (!userId) return {success: false, message: DAILY_QUIZ_COPY.notSignedIn};
    const date = parseQuizDate(input, getEasternDateString());
    if (!date) return {success: false, message: DAILY_QUIZ_COPY.stale};
    try {
        await connectToDatabase();
        try {
            await UserPreferencesModel.updateOne(
                {userId, 'learn.quizLastAnsweredDate': {$ne: date}},
                {$set: {'learn.quizLastAnsweredDate': date, updatedAt: new Date()}, $inc: {'learn.quizDaysAnswered': 1}},
                {upsert: true},
            );
        } catch (e) {
            if ((e as {code?: number}).code !== 11000) throw e;
        }
        return {success: true, daysAnswered: await readQuizDaysAnswered(userId)};
    } catch (error) {
        console.error('Error recording a quiz answer:', error);
        return {success: false, message: DAILY_QUIZ_COPY.notSaved};
    }
};
