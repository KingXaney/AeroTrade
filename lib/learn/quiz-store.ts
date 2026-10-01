// The Daily quiz's server read: today's question from the strategies' recent boards and the
// learner's own count of answered days. A plain module, not 'use server': the caller derives
// the userId from the session. The answer is written by recordQuizAnswer in
// lib/actions/learn.actions.ts.
//
// The question is the same for every learner all day, and it is read only from boards dated
// before today (quizRunWindow), which are final. So it is built once per ET day and kept,
// keyed on which run each strategy's board comes from (getRecentRunDates: eight point reads
// projected to a date, no board). Per request that stamp and the learner's count are read;
// the eight boards only when the stamp is new.

import {connectToDatabase} from "@/database/mongoose";
import UserPreferencesModel from "@/database/models/user-preferences.model";
import {createDayMemo, remember} from "@/lib/day-memo";
import {buildDailyQuiz, quizDaysFrom, quizRunWindow, type DailyQuiz} from "@/lib/learn/quiz";
import {STRATEGIES, STRATEGY_SLUGS} from "@/lib/strategies/catalog";
import {getRecentRunDates, getRecentRuns} from "@/lib/strategies/queries";
import {getEasternDateString} from "@/lib/utils";

export type DailyQuizView = {
    // null when no strategy has a usable board in the window.
    quiz: DailyQuiz | null;
    // Days with at least one answer; the widget omits the line at zero.
    daysAnswered: number;
};

type QuizPrefs = {learn?: {quizDaysAnswered?: unknown}} | null;

const quizMemo = createDayMemo<DailyQuiz | null>(8);

export const readQuizDaysAnswered = async (userId: string): Promise<number> => {
    await connectToDatabase();
    const prefs = await UserPreferencesModel.findOne({userId}).select('learn.quizDaysAnswered').lean<QuizPrefs>();
    return quizDaysFrom(prefs?.learn?.quizDaysAnswered);
};

export const getDailyQuiz = async (userId: string): Promise<DailyQuizView> => {
    const today = getEasternDateString();
    const window = quizRunWindow(today);
    const [dates, daysAnswered] = await Promise.all([
        getRecentRunDates(STRATEGY_SLUGS, window),
        readQuizDaysAnswered(userId),
    ]);
    const stamp = STRATEGY_SLUGS.map((id) => `${id}:${dates[id] ?? '-'}`).join(',');
    const quiz = await remember(quizMemo, stamp, today, async () => buildDailyQuiz(today, STRATEGIES, await getRecentRuns(STRATEGY_SLUGS, window)));
    return {quiz, daysAnswered};
};
