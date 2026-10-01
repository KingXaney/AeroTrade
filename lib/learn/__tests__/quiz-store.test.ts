// The Daily quiz's read with the stores stubbed: the eight boards are read once per ET day
// while the runs they come from stay the same (every learner shares the question), each
// request reads only the stamp and the learner's own count, a run removed or added is seen at
// once, and today's own run is never read.

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {QuizRun} from '@/lib/learn/quiz';

const db = vi.hoisted(() => ({
    runs: new Map<string, QuizRun>(),
    windows: [] as {since: string; before: string}[],
    boardReads: 0,
    countReads: 0,
}));

vi.mock('@/database/mongoose', () => ({connectToDatabase: async () => undefined}));
vi.mock('@/database/models/user-preferences.model', () => ({
    default: {findOne: () => ({select: () => ({lean: async () => {
        db.countReads += 1;
        return {learn: {quizDaysAnswered: 4}};
    }})})},
}));
vi.mock('@/lib/strategies/queries', () => ({
    getRecentRunDates: async (_ids: string[], window: {since: string; before: string}) => {
        db.windows.push(window);
        return Object.fromEntries([...db.runs].map(([id, run]) => [id, run.date]));
    },
    getRecentRuns: async () => {
        db.boardReads += 1;
        return Object.fromEntries(db.runs);
    },
}));

import {getDailyQuiz} from '@/lib/learn/quiz-read';

const rsiRun: QuizRun = {
    date: '2026-09-28',
    board: [
        {symbol: 'AAPL', state: 'enter', values: {close: 123.45, rsi2: 3.4, sma5: 126.1, sma200: 110, aboveSma200: true}},
        {symbol: 'MSFT', state: 'watch', values: {close: 410, rsi2: 6.2, sma5: 415, sma200: 380, aboveSma200: true}},
        {symbol: 'NVDA', state: 'exit', values: {close: 130, rsi2: 81.5, sma5: 128, sma200: 100, aboveSma200: true}},
    ],
    orders: [],
};

describe('getDailyQuiz', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        db.runs = new Map([['rsi2-mean-reversion', rsiRun]]);
        db.windows = [];
        db.boardReads = 0;
        db.countReads = 0;
    });
    afterEach(() => vi.useRealTimers());

    it('builds the day\'s question once and reads only the stamp and the count per request', async () => {
        vi.setSystemTime(new Date('2026-09-29T14:00:00Z'));
        const first = await getDailyQuiz('user-1');
        const second = await getDailyQuiz('user-2');
        expect(first.quiz).not.toBeNull();
        expect(second.quiz).toEqual(first.quiz);
        expect(first.daysAnswered).toBe(4);
        expect(db.boardReads).toBe(1);
        expect(db.countReads).toBe(2);
        // The boards stored before the day opens, never the day's own run.
        expect(db.windows).toEqual([{since: '2026-09-19', before: '2026-09-29'}, {since: '2026-09-19', before: '2026-09-29'}]);
    });

    it('sees a board removed or added the same day', async () => {
        vi.setSystemTime(new Date('2026-09-30T14:00:00Z'));
        expect((await getDailyQuiz('user-1')).quiz).not.toBeNull();
        db.runs = new Map();
        expect((await getDailyQuiz('user-1')).quiz).toBeNull();
        db.runs = new Map([['rsi2-mean-reversion', {...rsiRun, date: '2026-09-29'}]]);
        expect((await getDailyQuiz('user-1')).quiz?.runDate).toBe('2026-09-29');
        expect(db.boardReads).toBe(3);
    });
});
