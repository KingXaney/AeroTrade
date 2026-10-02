// Server-only: the beginner course as one reader sees it — which lessons are done and which is
// next. The registry and the rule are the pure lib/learn/course.ts; the stamps are the `learn`
// preference sub-schema and the first-week facts, both already read once per request by
// lib/learn/facts-store.ts, so this adds one small projected read.

import {cache} from "react";
import {connectToDatabase} from "@/database/mongoose";
import UserPreferencesModel from "@/database/models/user-preferences.model";
import {courseProgress, type CourseProgress} from "@/lib/learn/course";
import {getOnboardingFacts} from "@/lib/learn/facts-store";

type CoursePrefs = {learn?: {courseDone?: string[]}} | null;

export const getCourseProgress = cache(async (userId: string): Promise<CourseProgress> => {
    await connectToDatabase();
    const [prefs, facts] = await Promise.all([
        UserPreferencesModel.findOne({userId}).select('learn.courseDone').lean<CoursePrefs>(),
        getOnboardingFacts(userId),
    ]);
    return courseProgress(prefs?.learn?.courseDone ?? [], facts);
});
