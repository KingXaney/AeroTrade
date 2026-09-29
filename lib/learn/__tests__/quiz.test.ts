// The daily quiz: one question a day, built from the strategies' recent boards. Seeded by the
// date through FNV-1a, so a reload (or a second learner) sees the same question all day; the
// "why this verdict" options are the decoder's plain-English glosses, never the raw strings;
// and every question has exactly one right answer. The grid at the end runs the builder over
// what the eight rules really emit (the fixtures rules.test.ts and the decoder use).

import {describe, expect, it} from 'vitest';
import {findBanned} from '@/lib/learn/banned';
import {STATE_MEANING} from '@/lib/learn/copy/verdict';
import {quizPrompt} from '@/lib/learn/copy/quiz';
import {decodeReason} from '@/lib/learn/reasons';
import {explainVerdict} from '@/lib/learn/verdict';
import {
    buildDailyQuiz,
    fnv1a,
    glossText,
    parseQuizDate,
    QUIZ_RUN_WINDOW_DAYS,
    QUIZ_TEMPLATES,
    quizDaysFrom,
    quizRunFloor,
    type DailyQuiz,
    type QuizRun,
    type QuizTemplate,
} from '@/lib/learn/quiz';
import {STRATEGIES} from '@/lib/strategies/catalog';
import {runStrategyDay} from '@/lib/strategies/engine';
import {STRATEGY_RULES} from '@/lib/strategies/rules';
import type {StrategyDefinition, StrategyId} from '@/lib/strategies/types';
import {branchContexts, definition, genericContext} from '@/lib/strategies/__tests__/fixtures';

const RSI = definition('rsi2-mean-reversion');
const HOLD = definition('buy-and-hold-spy');
const rsiEnter = 'enter: RSI(2) 3.4 < 10 with close 123.45 above SMA200 110.00';
const rsiExit = 'exit: close 130.00 > SMA5 128.00';

const rsiRun: QuizRun = {
    date: '2026-09-28',
    board: [
        {symbol: 'AAPL', state: 'enter', values: {close: 123.45, rsi2: 3.4, sma5: 126.1, sma200: 110, aboveSma200: true}},
        {symbol: 'MSFT', state: 'watch', values: {close: 410, rsi2: 6.2, sma5: 415, sma200: 380, aboveSma200: true}, note: 'signal, but no open slot'},
        {symbol: 'NVDA', state: 'exit', values: {close: 130, rsi2: 81.5, sma5: 128, sma200: 100, aboveSma200: true}},
        {symbol: 'KO', state: 'excluded', values: {close: null, rsi2: null, sma5: null, sma200: null, aboveSma200: null}, note: 'needs 200 bars'},
    ],
    orders: [{symbol: 'AAPL', side: 'buy', reason: rsiEnter}, {symbol: 'NVDA', side: 'sell', reason: rsiExit}],
};
const holdRun: QuizRun = {date: '2026-09-28', board: [{symbol: 'SPY', state: 'held', values: {close: 500, sinceEntry: 0.1}}], orders: []};

const DATES = Array.from({length: 90}, (_, k) => new Date(Date.UTC(2026, 8, 1 + k)).toISOString().slice(0, 10));

// The first date in DATES whose question is `template`, so a test can look at each kind.
const firstOf = (template: QuizTemplate, runs: Partial<Record<StrategyId, QuizRun>>, defs: readonly StrategyDefinition[] = STRATEGIES): DailyQuiz => {
    for (const date of DATES) {
        const quiz = buildDailyQuiz(date, defs, runs);
        if (quiz?.template === template) return quiz;
    }
    throw new Error(`no ${template} question in ${DATES.length} days`);
};

const answer = (quiz: DailyQuiz) => quiz.options.find((option) => option.id === quiz.answerId);

// What must hold for any question, whatever the template.
const expectWellFormed = (quiz: DailyQuiz, runs: Partial<Record<StrategyId, QuizRun>>) => {
    const def = STRATEGIES.find((d) => d.id === quiz.strategyId) as StrategyDefinition;
    const run = runs[quiz.strategyId] as QuizRun;
    expect(run.date).toBe(quiz.runDate);
    const ids = quiz.options.map((option) => option.id);
    expect(new Set(ids).size, JSON.stringify(ids)).toBe(ids.length);
    expect(new Set(quiz.options.map((option) => option.label)).size).toBe(quiz.options.length);
    expect(quiz.options.length).toBeGreaterThanOrEqual(3);
    expect(quiz.options.length).toBeLessThanOrEqual(4);
    expect(answer(quiz)).toBeDefined();
    // The reveal is the stored verdict and the rule's own reason, decoded with its own definition.
    const row = run.board.find((r) => r.symbol === quiz.reveal.symbol);
    expect(row, quiz.reveal.symbol).toBeDefined();
    expect(row?.state).toBe(quiz.reveal.verdict);
    if (!row) return;
    expect(quiz.reveal.explanation).toBe(explainVerdict(row, run).explanation);
    expect(quiz.reveal.gloss).toEqual(decodeReason(quiz.reveal.explanation, {def}).clauses);
    switch (quiz.template) {
        case 'which-verdict':
            expect(quiz.symbol).toBe(row.symbol);
            expect(quiz.answerId).toBe(row.state);
            expect(quiz.cells.length).toBeGreaterThan(0);
            break;
        case 'why-this-verdict':
            expect(quiz.symbol).toBe(row.symbol);
            expect(quiz.verdict).toBe(row.state);
            expect(answer(quiz)?.label).toBe(glossText(quiz.reveal.gloss));
            // One option per verdict: exactly one explains the verdict asked about.
            expect(new Set(quiz.options.map((o) => o.state)).size).toBe(quiz.options.length);
            expect(quiz.options.filter((o) => o.state === quiz.verdict)).toHaveLength(1);
            break;
        case 'which-symbol':
            expect(quiz.verdict).toBe(row.state);
            expect(quiz.answerId).toBe(row.symbol);
            expect(quiz.options.filter((o) => o.state === quiz.verdict)).toHaveLength(1);
            for (const option of quiz.options) {
                expect(run.board.find((r) => r.symbol === option.id)?.state, option.id).toBe(option.state);
                expect(option.cells.length).toBeGreaterThan(0);
            }
            break;
    }
};

describe('fnv1a', () => {
    it('is the 32-bit FNV-1a hash', () => {
        expect(fnv1a('')).toBe(0x811c9dc5);
        expect(fnv1a('a')).toBe(0xe40c292c);
        expect(fnv1a('foobar')).toBe(0xbf9cf968);
    });
});

describe('parseQuizDate', () => {
    it('accepts only today\'s ET date, as YYYY-MM-DD', () => {
        expect(parseQuizDate('2026-09-29', '2026-09-29')).toBe('2026-09-29');
        expect(parseQuizDate('2026-09-28', '2026-09-29')).toBeNull();
        expect(parseQuizDate('2026-9-29', '2026-09-29')).toBeNull();
        expect(parseQuizDate('2026-09-29T00:00:00Z', '2026-09-29')).toBeNull();
        expect(parseQuizDate(' 2026-09-29', '2026-09-29')).toBeNull();
        expect(parseQuizDate(20260929, '2026-09-29')).toBeNull();
        expect(parseQuizDate({$ne: null}, '2026-09-29')).toBeNull();
        expect(parseQuizDate(null, '2026-09-29')).toBeNull();
        expect(parseQuizDate(undefined, '2026-09-29')).toBeNull();
    });
});

describe('quizDaysFrom', () => {
    it('reads a positive whole count and nothing else', () => {
        expect(quizDaysFrom(3)).toBe(3);
        expect(quizDaysFrom(0)).toBe(0);
        expect(quizDaysFrom(-2)).toBe(0);
        expect(quizDaysFrom(2.7)).toBe(2);
        expect(quizDaysFrom(Number.NaN)).toBe(0);
        expect(quizDaysFrom(Number.POSITIVE_INFINITY)).toBe(0);
        expect(quizDaysFrom('4')).toBe(0);
        expect(quizDaysFrom(undefined)).toBe(0);
        expect(quizDaysFrom(null)).toBe(0);
    });
});

describe('quizRunFloor', () => {
    it('reaches back the window in calendar days', () => {
        expect(QUIZ_RUN_WINDOW_DAYS).toBe(10);
        expect(quizRunFloor('2026-09-29')).toBe('2026-09-19');
        expect(quizRunFloor('2026-03-05')).toBe('2026-02-23');
    });
});

describe('buildDailyQuiz', () => {
    const runs = {'rsi2-mean-reversion': rsiRun, 'buy-and-hold-spy': holdRun};

    it('has nothing to ask without a board', () => {
        expect(buildDailyQuiz('2026-09-29', STRATEGIES, {})).toBeNull();
        expect(buildDailyQuiz('2026-09-29', STRATEGIES, {'rsi2-mean-reversion': {...rsiRun, board: []}})).toBeNull();
        expect(buildDailyQuiz('2026-09-29', STRATEGIES, {'rsi2-mean-reversion': {...rsiRun, board: [rsiRun.board[3]]}})).toBeNull();
        // A run filed under a strategy the catalog does not list is never asked about.
        expect(buildDailyQuiz('2026-09-29', [HOLD], {'rsi2-mean-reversion': rsiRun})).toBeNull();
    });

    it('is the same question all day, whatever order the runs and rows arrive in', () => {
        const reversed: QuizRun = {...rsiRun, board: [...rsiRun.board].reverse(), orders: [...rsiRun.orders].reverse()};
        for (const date of DATES.slice(0, 20)) {
            const quiz = buildDailyQuiz(date, STRATEGIES, runs);
            expect(buildDailyQuiz(date, STRATEGIES, runs)).toEqual(quiz);
            expect(buildDailyQuiz(date, STRATEGIES, {'buy-and-hold-spy': holdRun, 'rsi2-mean-reversion': reversed})).toEqual(quiz);
            expect(quiz?.date).toBe(date);
        }
    });

    it('rotates through the three kinds of question and the strategies as the days go by', () => {
        const quizzes = DATES.map((date) => buildDailyQuiz(date, STRATEGIES, runs) as DailyQuiz);
        expect(new Set(quizzes.map((q) => q.template))).toEqual(new Set(QUIZ_TEMPLATES));
        expect(new Set(quizzes.map((q) => q.strategyId))).toEqual(new Set(['rsi2-mean-reversion', 'buy-and-hold-spy']));
        expect(new Set(quizzes.map((q) => `${q.template}:${q.reveal.symbol}`)).size).toBeGreaterThan(5);
        for (const quiz of quizzes) expectWellFormed(quiz, runs);
    });

    it('asks which verdict a lone held row got when nothing else can be asked', () => {
        for (const date of DATES.slice(0, 20)) {
            const quiz = buildDailyQuiz(date, STRATEGIES, {'buy-and-hold-spy': holdRun}) as DailyQuiz;
            expect(quiz.template).toBe('which-verdict');
            expect(quiz.answerId).toBe('held');
            expect(quiz.reveal.explanation).toBe(STATE_MEANING.held);
            expect(quiz.reveal.gloss).toEqual([]);
        }
    });

    it('which verdict: one row, its numbers as the board prints them, the four decisions as options', () => {
        const quiz = firstOf('which-verdict', {'rsi2-mean-reversion': rsiRun});
        expect(quiz.options.map((o) => o.id)).toEqual(['enter', 'exit', 'held', 'watch']);
        expect(quiz.options.map((o) => o.state)).toEqual(['enter', 'exit', 'held', 'watch']);
        const row = rsiRun.board.find((r) => r.symbol === quiz.symbol);
        expect(row?.state).not.toBe('excluded');
        expect(quiz.cells.map((c) => c.label)).toEqual(['Last close', 'RSI(2)', 'SMA5', 'SMA200', 'Above SMA200']);
        expect(quiz.cells.find((c) => c.label === 'RSI(2)')).toEqual({label: 'RSI(2)', value: (row?.values.rsi2 as number).toFixed(1), term: 'rsi2'});
        expect(quiz.cells.find((c) => c.label === 'Above SMA200')?.value).toBe('yes');
        expectWellFormed(quiz, {'rsi2-mean-reversion': rsiRun});
    });

    it('why this verdict: the options are glossed readings, one per verdict, never the raw strings', () => {
        const quiz = firstOf('why-this-verdict', {'rsi2-mean-reversion': rsiRun});
        expectWellFormed(quiz, {'rsi2-mean-reversion': rsiRun});
        const glossed = (reason: string) => glossText(decodeReason(reason, {def: RSI}).clauses);
        const byState = Object.fromEntries(quiz.options.map((o) => [o.state, o.label]));
        expect(byState).toEqual({
            enter: glossed(rsiEnter),
            exit: glossed(rsiExit),
            watch: glossed('signal, but no open slot'),
            // No held row on any board: the verdict's fixed meaning stands in.
            held: STATE_MEANING.held,
        });
        expect(byState.enter).toMatch(/under the entry level of 10/);
        expect(byState.watch).toMatch(/all 5 slots were taken/);
        for (const option of quiz.options) {
            expect([rsiEnter, rsiExit, 'signal, but no open slot']).not.toContain(option.label);
            expect(option.label.split(/\s+/)).not.toContain(quiz.symbol);
            expect(option.cells).toEqual([]);
        }
        expect(quiz.cells).toEqual([]);
    });

    it('why this verdict: another strategy\'s reading fills a verdict the asked board lacks', () => {
        const GC = definition('golden-cross');
        const noWatch: QuizRun = {...rsiRun, board: rsiRun.board.filter((r) => r.state !== 'watch')};
        const gc: QuizRun = {
            date: '2026-09-27',
            board: [{symbol: 'XLU', state: 'watch', values: {close: 70, sma50: 70, sma200: 69, spread: 0.014, trendOn: true}, note: 'signal, but no open slot'}],
            orders: [],
        };
        const both = {'rsi2-mean-reversion': noWatch, 'golden-cross': gc};
        const quiz = DATES.map((date) => buildDailyQuiz(date, STRATEGIES, both))
            .find((q) => q?.template === 'why-this-verdict' && q.strategyId === 'rsi2-mean-reversion') as DailyQuiz;
        expect(quiz).toBeDefined();
        expectWellFormed(quiz, both);
        // Glossed with the golden cross's own definition: its eleven slots, not RSI-2's five.
        const watch = quiz.options.find((o) => o.state === 'watch')?.label;
        expect(watch).toBe(glossText(decodeReason('signal, but no open slot', {def: GC}).clauses));
        expect(watch).toMatch(/all 11 slots were taken/);
    });

    it('which symbol: rows as options with their numbers, exactly one carrying the verdict asked for', () => {
        const quiz = firstOf('which-symbol', {'rsi2-mean-reversion': rsiRun});
        expectWellFormed(quiz, {'rsi2-mean-reversion': rsiRun});
        expect(quiz.options.map((o) => o.id).sort()).toEqual(['AAPL', 'MSFT', 'NVDA']);
        expect(quiz.options.find((o) => o.id === 'AAPL')?.cells.find((c) => c.label === 'RSI(2)')?.value).toBe('3.4');
        expect(quiz.symbol).toBeNull();
    });
});

// Every day each rule's generic and branch contexts produce, as the run the quiz reads.
const RULE_RUNS: Record<StrategyId, QuizRun[]> = Object.fromEntries(STRATEGIES.map((def) => [def.id,
    [genericContext(def), ...branchContexts(def)].map((ctx): QuizRun => {
        const day = runStrategyDay(def, ctx, STRATEGY_RULES[def.id]);
        return {date: ctx.tradeDate, board: day.decision.board, orders: day.orders};
    }),
])) as Record<StrategyId, QuizRun[]>;

describe('buildDailyQuiz over what the rules emit', () => {
    const quizzes: {quiz: DailyQuiz; runs: Partial<Record<StrategyId, QuizRun>>}[] = [];
    DATES.forEach((date, k) => {
        const runs = Object.fromEntries(STRATEGIES.map((def) => {
            const days = RULE_RUNS[def.id];
            return [def.id, days[(k + def.id.length) % days.length]];
        })) as Record<StrategyId, QuizRun>;
        const quiz = buildDailyQuiz(date, STRATEGIES, runs);
        if (quiz) quizzes.push({quiz, runs});
    });

    it('asks every kind of question, about most strategies, every day', () => {
        expect(quizzes).toHaveLength(DATES.length);
        expect(new Set(quizzes.map(({quiz}) => quiz.template))).toEqual(new Set(QUIZ_TEMPLATES));
        expect(new Set(quizzes.map(({quiz}) => quiz.strategyId)).size).toBeGreaterThanOrEqual(5);
    });

    it('gives every question one right answer and a reveal that is the stored record', () => {
        for (const {quiz, runs} of quizzes) expectWellFormed(quiz, runs);
    });

    it('never offers a raw rule string, nor a reading that names the row asked about', () => {
        for (const {quiz, runs} of quizzes.filter(({quiz}) => quiz.template === 'why-this-verdict')) {
            const raw = new Set(Object.values(runs).flatMap((run) => [
                ...(run?.orders ?? []).map((o) => o.reason),
                ...(run?.board ?? []).flatMap((r) => (r.note ? [r.note] : [])),
            ]));
            for (const option of quiz.options) {
                expect(raw.has(option.label), option.label).toBe(false);
                expect(option.label.split(/[^A-Za-z0-9.-]+/).map((t) => t.replace(/\.+$/, '')), option.label).not.toContain(quiz.symbol);
            }
        }
    });

    it('asks in words that describe and never advise; the options narrate at the advice tier', () => {
        for (const {quiz} of quizzes) {
            expect(findBanned(quizPrompt(quiz), 'copy'), quizPrompt(quiz)).toEqual([]);
            const labels = quiz.options.map((o) => o.label).join(' ');
            expect(findBanned(labels, quiz.template === 'why-this-verdict' ? 'advice' : 'copy'), labels).toEqual([]);
        }
    });
});
