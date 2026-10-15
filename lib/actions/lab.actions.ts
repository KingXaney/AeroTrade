'use server';

import {revalidatePath} from "next/cache";
import {z} from "zod";
import {getCurrentUser} from "@/lib/auth/session";
import {getEasternDateString} from "@/lib/dates";
import {checkAnswer, type AnswerCheck} from "@/lib/games/answer";
import {isLabOwner} from "@/lib/lab/owner";
import {quizExplanations, scoreQuiz} from "@/lib/lab/quiz";
import {cardById, isLabCardId, isLabProblemId, isLabUnitId, problemById, unitById} from "@/lib/lab/registry";
import {GRADES} from "@/lib/lab/srs";
import {closeProblem, gradeCard, markUnitStudied as writeStudied, readQuizzes, recordQuizPass, recordSession, tickTodo as writeTick, untickTodo as removeTick, writeLabWidgets} from "@/lib/lab/store";
import {isManualTodoId, todoKey} from "@/lib/lab/todo";
import {LAB_WIDGET_IDS, normalizeLabWidgets} from "@/lib/lab/widgets";
import {LAB_COPY} from "@/lib/learn/copy/lab";
import {takeRateLimit} from "@/lib/rate-limit";

// The owner's lab's writes (lib/lab/store does the database work, lib/lab/srs, schedule, quiz and
// todo the arithmetic). Every action: the signed-in user with their email, the owner gate, one
// rate limit, a client-sent id checked against the registry, one atomic write, a session row for
// the streak when something was done, then /learn and its unit pages revalidated — and, since
// the one streak shows on Home, the dashboard and the games hub, those too when the day's count
// may have moved. A non-owner gets the same refusal whatever they send.

const ACTIONS_PER_MINUTE = 120;

export type LabActionResult = {success: true; message?: string; check?: AnswerCheck} | {success: false; message: string};

const begin = async (): Promise<{userId: string; today: string} | {refused: string}> => {
    const user = await getCurrentUser();
    if (!user) return {refused: LAB_COPY.notSignedIn};
    if (!isLabOwner(user.email)) return {refused: LAB_COPY.notOwner};
    if (!(await takeRateLimit(`lab:${user.id}`, ACTIONS_PER_MINUTE, 60_000))) return {refused: LAB_COPY.tooFast};
    return {userId: user.id, today: getEasternDateString()};
};

const refresh = () => revalidatePath('/learn', 'layout');
// A write that may have moved the day's count: every surface that shows the streak.
const refreshStreak = () => {
    refresh();
    revalidatePath('/');
    revalidatePath('/dashboard');
    revalidatePath('/games', 'layout');
};

const GradeInput = z.strictObject({cardId: z.string().min(1).max(120), grade: z.enum(GRADES)});
const UnitInput = z.strictObject({unitId: z.string().min(1).max(120)});
const ProblemInput = z.strictObject({problemId: z.string().min(1).max(120)});
const AnswerInput = z.strictObject({problemId: z.string().min(1).max(120), answer: z.string().max(40)});
const QuizInput = z.strictObject({unitId: z.string().min(1).max(120), answers: z.array(z.number().int().min(0).max(3)).max(8)});
const TodoInput = z.strictObject({id: z.string().min(1).max(40)});
const WidgetsInput = z.strictObject({widgets: z.array(z.string().max(40)).max(LAB_WIDGET_IDS.length)});

// The unit's quiz is passed first: the first row is the gate, a revisit needs no second pass.
export const markUnitStudied = async (input: unknown): Promise<LabActionResult> => {
    const gate = await begin();
    if ('refused' in gate) return {success: false, message: gate.refused};
    const parsed = UnitInput.safeParse(input);
    if (!parsed.success || !isLabUnitId(parsed.data.unitId)) return {success: false, message: LAB_COPY.invalid};
    try {
        const unit = unitById(parsed.data.unitId)!;
        if (unit.quiz.length > 0 && !(await readQuizzes(gate.userId)).some((row) => row.unitId === unit.id)) {
            return {success: false, message: LAB_COPY.quiz.quizFirst};
        }
        await writeStudied(gate.userId, parsed.data.unitId, gate.today);
        await recordSession(gate.userId, gate.today);
        refreshStreak();
        return {success: true};
    } catch (error) {
        console.error('Error marking a lab unit studied:', error);
        return {success: false, message: LAB_COPY.notSaved};
    }
};

export type QuizActionResult =
    | {success: true; passed: boolean; correct: number; total: number; perQuestion: boolean[]; why: string[] | null; message: string}
    | {success: false; message: string};

// A quiz attempt, scored on the server against the bank: a pass is stamped once and counts the
// day; the explanations travel only with a pass. A fail says which questions were wrong and no
// more, so the answers never reach the page.
export const answerQuiz = async (input: unknown): Promise<QuizActionResult> => {
    const gate = await begin();
    if ('refused' in gate) return {success: false, message: gate.refused};
    const parsed = QuizInput.safeParse(input);
    if (!parsed.success || !isLabUnitId(parsed.data.unitId)) return {success: false, message: LAB_COPY.invalid};
    const unit = unitById(parsed.data.unitId)!;
    if (parsed.data.answers.length !== unit.quiz.length) return {success: false, message: LAB_COPY.quiz.unanswered};
    const score = scoreQuiz(unit.quiz, parsed.data.answers);
    if (!score.passed) {
        return {success: true, passed: false, correct: score.correct, total: score.total, perQuestion: score.perQuestion, why: null, message: LAB_COPY.quiz.failed(score.correct, score.total)};
    }
    try {
        await recordQuizPass(gate.userId, unit.id, gate.today, score.correct);
        await recordSession(gate.userId, gate.today);
        refreshStreak();
        return {success: true, passed: true, correct: score.correct, total: score.total, perQuestion: score.perQuestion, why: quizExplanations(unit.quiz), message: LAB_COPY.quiz.passed(score.correct, score.total)};
    } catch (error) {
        console.error('Error recording a lab quiz pass:', error);
        return {success: false, message: LAB_COPY.notSaved};
    }
};

// A manual item of Today's list — the papers digest, a table, a site outside the app — ticked
// for today, or unticked. The tick counts the day (lib/learn/activity-store reads the rows).
export const tickTodo = async (input: unknown): Promise<LabActionResult> => {
    const gate = await begin();
    if ('refused' in gate) return {success: false, message: gate.refused};
    const parsed = TodoInput.safeParse(input);
    if (!parsed.success || !isManualTodoId(parsed.data.id)) return {success: false, message: LAB_COPY.invalid};
    try {
        await writeTick(gate.userId, todoKey(parsed.data.id, gate.today), gate.today);
        refreshStreak();
        return {success: true};
    } catch (error) {
        console.error('Error ticking a lab item:', error);
        return {success: false, message: LAB_COPY.notSaved};
    }
};

export const untickTodo = async (input: unknown): Promise<LabActionResult> => {
    const gate = await begin();
    if ('refused' in gate) return {success: false, message: gate.refused};
    const parsed = TodoInput.safeParse(input);
    if (!parsed.success || !isManualTodoId(parsed.data.id)) return {success: false, message: LAB_COPY.invalid};
    try {
        await removeTick(gate.userId, todoKey(parsed.data.id, gate.today));
        refreshStreak();
        return {success: true};
    } catch (error) {
        console.error('Error unticking a lab item:', error);
        return {success: false, message: LAB_COPY.notSaved};
    }
};

// The game widgets on Today, saved as the preference (unknown ids dropped, the registry's order).
export const setLabWidgets = async (input: unknown): Promise<LabActionResult> => {
    const gate = await begin();
    if ('refused' in gate) return {success: false, message: gate.refused};
    const parsed = WidgetsInput.safeParse(input);
    if (!parsed.success) return {success: false, message: LAB_COPY.invalid};
    try {
        await writeLabWidgets(gate.userId, normalizeLabWidgets(parsed.data.widgets));
        refresh();
        return {success: true};
    } catch (error) {
        console.error('Error saving the lab widgets:', error);
        return {success: false, message: LAB_COPY.notSaved};
    }
};

export const gradeReviewCard = async (input: unknown): Promise<LabActionResult> => {
    const gate = await begin();
    if ('refused' in gate) return {success: false, message: gate.refused};
    const parsed = GradeInput.safeParse(input);
    if (!parsed.success || !isLabCardId(parsed.data.cardId)) return {success: false, message: LAB_COPY.invalid};
    const card = cardById(parsed.data.cardId)!;
    try {
        const outcome = await gradeCard(gate.userId, card.id, card.unitId, parsed.data.grade, gate.today);
        if (outcome.applied) await recordSession(gate.userId, gate.today);
        refresh();
        return {success: true};
    } catch (error) {
        console.error('Error grading a lab card:', error);
        return {success: false, message: LAB_COPY.notSaved};
    }
};

export const revealProblem = async (input: unknown): Promise<LabActionResult> => {
    const gate = await begin();
    if ('refused' in gate) return {success: false, message: gate.refused};
    const parsed = ProblemInput.safeParse(input);
    if (!parsed.success || !isLabProblemId(parsed.data.problemId)) return {success: false, message: LAB_COPY.invalid};
    try {
        await closeProblem(gate.userId, parsed.data.problemId, gate.today, 'revealed');
        refresh();
        return {success: true};
    } catch (error) {
        console.error('Error revealing a lab solution:', error);
        return {success: false, message: LAB_COPY.notSaved};
    }
};

// A numeric problem's answer, checked on the server against the bank; a correct one closes the
// problem as solved and counts the day. The answer never reaches the client before that.
export const answerProblem = async (input: unknown): Promise<LabActionResult> => {
    const gate = await begin();
    if ('refused' in gate) return {success: false, message: gate.refused};
    const parsed = AnswerInput.safeParse(input);
    if (!parsed.success || !isLabProblemId(parsed.data.problemId)) return {success: false, message: LAB_COPY.invalid};
    const problem = problemById(parsed.data.problemId)!;
    if (problem.answer === undefined) return {success: false, message: LAB_COPY.invalid};
    const check = checkAnswer({answer: problem.answer, ...(problem.tolerance !== undefined ? {tolerance: problem.tolerance} : {})}, parsed.data.answer);
    if (check !== 'correct' && check !== 'close') return {success: true, check, message: LAB_COPY.checked[check]};
    try {
        await closeProblem(gate.userId, problem.id, gate.today, 'solved');
        await recordSession(gate.userId, gate.today);
        refresh();
        return {success: true, check, message: LAB_COPY.checked[check]};
    } catch (error) {
        console.error('Error closing a lab problem:', error);
        return {success: false, message: LAB_COPY.notSaved};
    }
};
