// The Daily quiz's server read: today's question from the strategies' recent boards (one
// bounded point read per strategy, getRecentRuns in lib/strategies/queries.ts) and the
// learner's own count of answered days. A plain module, not 'use server': the caller derives
// the userId from the session. The answer is written by recordQuizAnswer in
// lib/actions/learn.actions.ts.

import {connectToDatabase} from "@/database/mongoose";
import UserPreferencesModel from "@/database/models/user-preferences.model";
import {buildDailyQuiz, quizDaysFrom, quizRunFloor, type DailyQuiz} from "@/lib/learn/quiz";
import {STRATEGIES, STRATEGY_SLUGS} from "@/lib/strategies/catalog";
import {getRecentRuns} from "@/lib/strategies/queries";
import {getEasternDateString} from "@/lib/utils";

export type DailyQuizView = {
    // null when no strategy has a usable board in the window.
    quiz: DailyQuiz | null;
    // Days with at least one answer; the widget omits the line at zero.
    daysAnswered: number;
};

type QuizPrefs = {learn?: {quizDaysAnswered?: unknown}} | null;

export const readQuizDaysAnswered = async (userId: string): Promise<number> => {
    await connectToDatabase();
    const prefs = await UserPreferencesModel.findOne({userId}).select('learn.quizDaysAnswered').lean<QuizPrefs>();
    return quizDaysFrom(prefs?.learn?.quizDaysAnswered);
};

export const getDailyQuiz = async (userId: string): Promise<DailyQuizView> => {
    const today = getEasternDateString();
    const [runs, daysAnswered] = await Promise.all([
        getRecentRuns(STRATEGY_SLUGS, quizRunFloor(today)),
        readQuizDaysAnswered(userId),
    ]);
    return {quiz: buildDailyQuiz(today, STRATEGIES, runs), daysAnswered};
};
