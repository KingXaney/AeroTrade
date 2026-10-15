// A unit's quiz, the pure parts: what the page may hold (the questions and options, never an
// answer or its explanation), how an attempt is scored, and what passes. The bank is server-only
// (lib/lab/__tests__/guard.test.ts); the action lib/actions/lab.actions.answerQuiz scores an
// attempt here and stamps a pass as a LabEvent row, which is what lets the unit be marked studied.

import type {LabQuizQuestion, LabUnit} from "@/lib/learn/copy/lab/types";

// A pass allows at most this many wrong answers (3 of 4, 4 of 5).
export const QUIZ_MAX_WRONG = 1;

export type QuizQuestionPublic = {id: string; prompt: string; options: readonly string[]};

export type QuizScore = {
    correct: number;
    total: number;
    passed: boolean;
    // Per question, in the quiz's order.
    perQuestion: boolean[];
};

export const quizPublic = (unit: Pick<LabUnit, 'quiz'>): QuizQuestionPublic[] =>
    unit.quiz.map((question) => ({id: question.id, prompt: question.prompt, options: [...question.options]}));

// An attempt is one chosen index per question; a missing or out-of-range choice is wrong.
export const scoreQuiz = (quiz: readonly LabQuizQuestion[], answers: readonly number[]): QuizScore => {
    const perQuestion = quiz.map((question, i) => Number.isInteger(answers[i]) && answers[i] === question.answer);
    const correct = perQuestion.filter(Boolean).length;
    return {correct, total: quiz.length, passed: quiz.length > 0 && quiz.length - correct <= QUIZ_MAX_WRONG, perQuestion};
};

// The explanations, handed out only once the quiz is passed.
export const quizExplanations = (quiz: readonly LabQuizQuestion[]): string[] => quiz.map((question) => question.why);
