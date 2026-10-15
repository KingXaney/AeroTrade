// A unit's quiz: the page gets the questions without the answers, an attempt is scored against
// the bank, and a pass allows at most one wrong answer.

import {describe, expect, it} from 'vitest';
import {QUIZ_MAX_WRONG, quizExplanations, quizPublic, scoreQuiz} from '@/lib/lab/quiz';
import type {LabQuizQuestion} from '@/lib/learn/copy/lab/types';

const q = (id: string, answer: 0 | 1 | 2 | 3): LabQuizQuestion => ({id, prompt: `Q ${id}`, options: ['a', 'b', 'c', 'd'], answer, why: `why ${id}`});
const quiz = [q('u/q1', 0), q('u/q2', 1), q('u/q3', 2), q('u/q4', 3)];

describe('quizPublic', () => {
    it('hands the page the prompts and options, never an answer or an explanation', () => {
        const pub = quizPublic({quiz});
        expect(pub).toHaveLength(4);
        expect(pub[0]).toEqual({id: 'u/q1', prompt: 'Q u/q1', options: ['a', 'b', 'c', 'd']});
        expect(JSON.stringify(pub)).not.toMatch(/answer|why/);
    });
});

describe('scoreQuiz', () => {
    it('passes with every answer right, and with one wrong', () => {
        expect(scoreQuiz(quiz, [0, 1, 2, 3])).toEqual({correct: 4, total: 4, passed: true, perQuestion: [true, true, true, true]});
        expect(scoreQuiz(quiz, [0, 1, 2, 0])).toMatchObject({correct: 3, passed: true, perQuestion: [true, true, true, false]});
        expect(QUIZ_MAX_WRONG).toBe(1);
    });

    it('fails with two wrong, a missing answer counting as wrong', () => {
        expect(scoreQuiz(quiz, [0, 1, 0, 0])).toMatchObject({correct: 2, passed: false});
        expect(scoreQuiz(quiz, [0, 1, 2])).toMatchObject({correct: 3, passed: true});
        expect(scoreQuiz(quiz, [0, 1])).toMatchObject({correct: 2, passed: false, perQuestion: [true, true, false, false]});
        expect(scoreQuiz(quiz, [0, 1, 2.5, 3])).toMatchObject({correct: 3});
        expect(scoreQuiz([], [])).toMatchObject({correct: 0, total: 0, passed: false});
    });

    it('lists the explanations in the quiz order', () => {
        expect(quizExplanations(quiz)).toEqual(['why u/q1', 'why u/q2', 'why u/q3', 'why u/q4']);
    });
});
