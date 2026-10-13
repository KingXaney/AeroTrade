'use server';

import {revalidatePath} from "next/cache";
import {z} from "zod";
import {getCurrentUser} from "@/lib/auth/session";
import {getEasternDateString} from "@/lib/dates";
import {checkAnswer, type AnswerCheck} from "@/lib/games/answer";
import {isLabOwner} from "@/lib/lab/owner";
import {cardById, isLabCardId, isLabProblemId, isLabUnitId, problemById} from "@/lib/lab/registry";
import {GRADES} from "@/lib/lab/srs";
import {closeProblem, gradeCard, markUnitStudied as writeStudied, recordSession} from "@/lib/lab/store";
import {LAB_COPY} from "@/lib/learn/copy/lab";
import {takeRateLimit} from "@/lib/rate-limit";

// The owner's lab's writes (lib/lab/store does the database work, lib/lab/srs and schedule the
// arithmetic). Every action: the signed-in user with their email, the owner gate, one rate limit,
// a client-sent id checked against the registry, one atomic write, a session row for the streak
// when something was done, then /learn and its unit pages revalidated. A non-owner gets the same
// refusal whatever they send.

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

const GradeInput = z.strictObject({cardId: z.string().min(1).max(120), grade: z.enum(GRADES)});
const UnitInput = z.strictObject({unitId: z.string().min(1).max(120)});
const ProblemInput = z.strictObject({problemId: z.string().min(1).max(120)});
const AnswerInput = z.strictObject({problemId: z.string().min(1).max(120), answer: z.string().max(40)});

export const markUnitStudied = async (input: unknown): Promise<LabActionResult> => {
    const gate = await begin();
    if ('refused' in gate) return {success: false, message: gate.refused};
    const parsed = UnitInput.safeParse(input);
    if (!parsed.success || !isLabUnitId(parsed.data.unitId)) return {success: false, message: LAB_COPY.invalid};
    try {
        await writeStudied(gate.userId, parsed.data.unitId, gate.today);
        await recordSession(gate.userId, gate.today);
        refresh();
        return {success: true};
    } catch (error) {
        console.error('Error marking a lab unit studied:', error);
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
