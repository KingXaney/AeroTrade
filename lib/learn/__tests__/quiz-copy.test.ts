import {describe, expect, it} from 'vitest';
import {findBanned} from '@/lib/learn/banned';
import {DAILY_QUIZ_COPY, daysAnsweredLine, quizBoardHref, quizEmptyDescription, quizEyebrow, quizOutcome, quizPrompt} from '@/lib/learn/copy/quiz';
import type {DailyQuiz, QuizTemplate} from '@/lib/learn/quiz';
import {STRATEGIES} from '@/lib/strategies/catalog';
import type {RowState} from '@/lib/strategies/types';

const quiz = (template: QuizTemplate, verdict: RowState | null, symbol: string | null, strategyName = 'Golden Cross Sectors'): DailyQuiz => ({
    date: '2026-09-29', template, strategyId: 'golden-cross', strategyName, runDate: '2026-09-28',
    symbol, verdict, cells: [], options: [], answerId: 'enter',
    reveal: {symbol: symbol ?? 'XLK', verdict: verdict ?? 'enter', explanation: '', gloss: []},
});

const STATES: RowState[] = ['enter', 'exit', 'held', 'watch'];
const grid: DailyQuiz[] = STRATEGIES.flatMap((def) => STATES.flatMap((state) => [
    quiz('which-verdict', null, 'XLK', def.name),
    quiz('why-this-verdict', state, 'BRK.B', def.name),
    quiz('which-symbol', state, null, def.name),
]));

describe('daily quiz copy', () => {
    it('describes and never advises, on every kind of question, verdict and strategy', () => {
        const fixed = [
            DAILY_QUIZ_COPY.verdictLabel, DAILY_QUIZ_COPY.reasonLabel, DAILY_QUIZ_COPY.boardLink, DAILY_QUIZ_COPY.emptyTitle,
            DAILY_QUIZ_COPY.notSaved, DAILY_QUIZ_COPY.stale, DAILY_QUIZ_COPY.optionsLabel, quizEmptyDescription(10),
            quizOutcome(true), quizOutcome(false), daysAnsweredLine(1), daysAnsweredLine(365),
        ];
        for (const text of fixed) expect(findBanned(text ?? '', 'copy'), text ?? '').toEqual([]);
        for (const q of grid) {
            // The strategy's name is a proper noun from the catalog ("Buy & Hold SPY" is not an
            // order), so the eyebrow is checked around it.
            const eyebrow = quizEyebrow(q);
            expect(eyebrow.startsWith(`${q.strategyName} · `)).toBe(true);
            for (const text of [quizPrompt(q), eyebrow.slice(q.strategyName.length)]) expect(findBanned(text, 'copy'), text).toEqual([]);
        }
    });

    it('asks about the row, the verdict or the symbol the question names', () => {
        expect(quizPrompt(quiz('which-verdict', null, 'XLK'))).toBe('What did the rule decide for XLK?');
        expect(quizPrompt(quiz('why-this-verdict', 'exit', 'XLE'))).toBe('The rule marked XLE “exit”. Which reading explains that verdict?');
        expect(quizPrompt(quiz('which-symbol', 'enter', null))).toBe('Which of these did the rule mark “enter”?');
        expect(quizEyebrow(quiz('which-symbol', 'enter', null))).toBe('Golden Cross Sectors · Sep 28');
    });

    it('counts answered days only once there is one, with no streak and no reward', () => {
        expect(daysAnsweredLine(0)).toBeNull();
        expect(daysAnsweredLine(-1)).toBeNull();
        expect(daysAnsweredLine(1)).toBe('Days answered: 1');
        expect(daysAnsweredLine(12)).toBe('Days answered: 12');
        const everything = JSON.stringify(DAILY_QUIZ_COPY);
        expect(everything).not.toMatch(/streak|reward|points|badge|score/i);
    });

    it('links to the strategy the board belongs to and states the window once', () => {
        expect(quizBoardHref('rsi2-mean-reversion')).toBe('/strategies/rsi2-mean-reversion');
        expect(quizEmptyDescription(10)).toMatch(/last 10 days/);
    });
});
