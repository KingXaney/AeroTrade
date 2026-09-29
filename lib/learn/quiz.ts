// The daily quiz: one question a day about a strategy's recent signal board, in one of three
// shapes — which verdict a row got, which reading explains a verdict, which row carried a
// verdict. Nothing is recomputed: the answer key is StrategyRun.board[].state and the reveal
// is the rule's own stored reason (explainVerdict), decoded clause by clause (decodeReason).
//
// The date seeds every choice through FNV-1a, so the question holds all day across reloads
// and learners, and moves the next day: a rotation over the templates, then over the
// strategies with a usable board, the first pair that yields a well-formed question winning.
// Every question has exactly one right answer — the "why" options explain different
// verdicts, the "which symbol" options carry different verdicts — and the "why" options are
// the decoder's plain-English glosses, never the raw strings (a verdict with no stored reason
// reads as its fixed meaning). A reading that names a ticker the question shows is not
// offered, because the name alone would give the answer away.
//
// Pure and dependency-light. Client code imports only its types (zod and the catalog stay
// on the server); the one read that feeds it is getRecentRuns in lib/strategies/queries.ts.

import {z} from 'zod';
import type {GlossaryKey} from '@/lib/learn/glossary';
import {decodeReason, type ReasonClause} from '@/lib/learn/reasons';
import {explainVerdict, pickQuizRows} from '@/lib/learn/verdict';
import {ASKABLE_STATES, STATE_MEANING} from '@/lib/learn/copy/verdict';
import {addCalendarDays} from '@/lib/prices/calendar-days';
import {formatSignalValue, STATE_LABEL, visibleSignalColumns} from '@/lib/strategies/views';
import type {RowState, SignalRow, StrategyDefinition, StrategyId} from '@/lib/strategies/types';

// How far back a board may date and still be asked about, in calendar days.
export const QUIZ_RUN_WINDOW_DAYS = 10;

export const QUIZ_TEMPLATES = ['which-verdict', 'why-this-verdict', 'which-symbol'] as const;
export type QuizTemplate = (typeof QUIZ_TEMPLATES)[number];

// A question needs at least three options to be more than a coin toss; "which symbol" shows
// the row asked for and up to three rows with other verdicts.
const MIN_OPTIONS = 3;
const MAX_SYMBOL_OPTIONS = 4;

export type QuizRunOrder = {symbol: string; side: 'buy' | 'sell'; reason: string};
export type QuizRun = {date: string; board: readonly SignalRow[]; orders: readonly QuizRunOrder[]};

export type QuizCell = {label: string; value: string; term?: GlossaryKey};
export type QuizOption = {
    id: string;
    label: string;
    // The verdict the option stands for (its row's, or the one its reading explains).
    state: RowState;
    // A row's numbers as the board prints them ("which symbol" only).
    cells: QuizCell[];
};
export type QuizReveal = {symbol: string; verdict: RowState; explanation: string; gloss: ReasonClause[]};

export type DailyQuiz = {
    // The ET day the question is for; recordQuizAnswer accepts only this, and only today.
    date: string;
    template: QuizTemplate;
    strategyId: StrategyId;
    strategyName: string;
    // The trade date of the board the question comes from.
    runDate: string;
    // The row asked about ("which verdict", "why this verdict"); null for "which symbol".
    symbol: string | null;
    // The verdict shown ("why this verdict") or asked for ("which symbol"); null for "which verdict".
    verdict: RowState | null;
    // The asked row's numbers ("which verdict"); empty otherwise.
    cells: QuizCell[];
    options: QuizOption[];
    answerId: string;
    reveal: QuizReveal;
};

// 32-bit FNV-1a over UTF-16 code units.
export const fnv1a = (text: string): number => {
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
};

const roll = (date: string, salt: string): number => fnv1a(`${date}|${salt}`);

const rotate = <T>(items: readonly T[], seed: number): T[] => {
    if (items.length === 0) return [];
    const start = seed % items.length;
    return [...items.slice(start), ...items.slice(0, start)];
};

// A seeded order that does not depend on the order the items arrived in.
const seededOrder = <T>(items: readonly T[], date: string, salt: string, key: (item: T) => string): T[] =>
    [...items].sort((a, b) => roll(date, `${salt}:${key(a)}`) - roll(date, `${salt}:${key(b)}`) || key(a).localeCompare(key(b)));

const pick = <T>(items: readonly T[], date: string, salt: string): T | undefined =>
    items.length > 0 ? items[roll(date, salt) % items.length] : undefined;

// The oldest board date getRecentRuns reads for a given day.
export const quizRunFloor = (today: string): string => addCalendarDays(today, -QUIZ_RUN_WINDOW_DAYS);

// recordQuizAnswer's one input: the question's day, which must be today in ET. Shape first
// (a string of exactly YYYY-MM-DD), then equality — today's date is a real calendar date, so
// a string equal to it needs no further check.
const quizDateSchema = z.string().max(10).regex(/^\d{4}-\d{2}-\d{2}$/);

export const parseQuizDate = (input: unknown, today: string): string | null => {
    const parsed = quizDateSchema.safeParse(input);
    return parsed.success && parsed.data === today ? parsed.data : null;
};

// The stored count of answered days, read defensively: anything but a positive number is none.
export const quizDaysFrom = (stored: unknown): number =>
    typeof stored === 'number' && Number.isFinite(stored) && stored > 0 ? Math.floor(stored) : 0;

export const glossText = (clauses: readonly ReasonClause[]): string => clauses.map((clause) => clause.gloss).join(' ');

type Board = {def: StrategyDefinition; run: QuizRun};

// A ticker named as a word ("SPY." at a sentence end included).
const namesSymbol = (text: string, symbol: string | null): boolean =>
    symbol !== null && text.split(/[^A-Za-z0-9.-]+/).some((token) => token.replace(/\.+$/, '') === symbol);

const cellsFor = ({def, run}: Board, row: SignalRow): QuizCell[] =>
    visibleSignalColumns(def.signalColumns, run.board).map((column) => ({
        label: column.label,
        value: formatSignalValue(row.values[column.key], column.format),
        ...(column.glossary ? {term: column.glossary} : {}),
    }));

const hasNumbers = (cells: readonly QuizCell[]): boolean => cells.some((cell) => cell.value !== '—');

const revealFor = ({def, run}: Board, row: SignalRow): QuizReveal => {
    const {explanation} = explainVerdict(row, run);
    return {symbol: row.symbol, verdict: row.state, explanation, gloss: decodeReason(explanation, {def}).clauses};
};

// The rule's own reason for a row, read in plain English — only when every part of it
// decodes and the reading does not name the row (the question shows the symbol).
const decodedReading = (board: Board, row: SignalRow): string | null => {
    const {explanation} = explainVerdict(row, board.run);
    if (explanation === STATE_MEANING[row.state]) return null;
    const decoded = decodeReason(explanation, {def: board.def});
    if (decoded.clauses.length === 0 || decoded.unknown.length > 0) return null;
    const text = glossText(decoded.clauses);
    return namesSymbol(text, row.symbol) ? null : text;
};

const base = (date: string, {def, run}: Board) => ({date, strategyId: def.id, strategyName: def.name, runDate: run.date});

const whichVerdict = (date: string, board: Board): DailyQuiz | null => {
    const row = pick(pickQuizRows(board.run.board).filter((r) => hasNumbers(cellsFor(board, r))), date, `which-verdict:${board.def.id}`);
    if (!row) return null;
    return {
        ...base(date, board),
        template: 'which-verdict',
        symbol: row.symbol,
        verdict: null,
        cells: cellsFor(board, row),
        options: ASKABLE_STATES.map((state) => ({id: state, label: STATE_LABEL[state], state, cells: []})),
        answerId: row.state,
        reveal: revealFor(board, row),
    };
};

// One option per verdict. The asked row's reading is the answer; each other verdict is
// explained by a decoded reading from the asked board first, then the other boards (a seeded
// rotation), and by its fixed meaning when no board has one — so there are always four.
const whyThisVerdict = (date: string, board: Board, boards: readonly Board[]): DailyQuiz | null => {
    const candidates = pickQuizRows(board.run.board).filter((r) => decodedReading(board, r) !== null);
    const row = pick(candidates, date, `why-this-verdict:${board.def.id}`);
    const answer = row ? decodedReading(board, row) : null;
    if (!row || answer === null) return null;
    const others = rotate(boards.filter((b) => b.def.id !== board.def.id), roll(date, 'pool'));
    const used = new Set([answer]);
    const readingFor = (state: RowState): string => {
        for (const source of [board, ...others]) {
            const rows = seededOrder(source.run.board.filter((r) => r.state === state), date, `why:${source.def.id}`, (r) => r.symbol);
            for (const candidate of rows) {
                const text = decodedReading(source, candidate);
                if (text !== null && !used.has(text) && !namesSymbol(text, row.symbol)) return text;
            }
        }
        return STATE_MEANING[state];
    };
    const options: QuizOption[] = ASKABLE_STATES.map((state) => {
        const label = state === row.state ? answer : readingFor(state);
        used.add(label);
        return {id: state, label, state, cells: []};
    });
    return {
        ...base(date, board),
        template: 'why-this-verdict',
        symbol: row.symbol,
        verdict: row.state,
        cells: [],
        options: seededOrder(options, date, 'why-options', (o) => o.id),
        answerId: row.state,
        reveal: revealFor(board, row),
    };
};

// The asked row plus rows with other verdicts: one of each other verdict first, then the rest,
// in a seeded order, up to four options.
const whichSymbol = (date: string, board: Board): DailyQuiz | null => {
    const askable = board.run.board.filter((r) => r.state !== 'excluded');
    const candidates = pickQuizRows(board.run.board).filter((target) =>
        hasNumbers(cellsFor(board, target)) && askable.filter((r) => r.state !== target.state).length >= MIN_OPTIONS - 1);
    const row = pick(candidates, date, `which-symbol:${board.def.id}`);
    if (!row) return null;
    const rest = seededOrder(askable.filter((r) => r.state !== row.state), date, 'which-symbol-rest', (r) => r.symbol);
    const firstOfEach = rest.filter((r, i) => rest.findIndex((other) => other.state === r.state) === i);
    const distractors = [...firstOfEach, ...rest.filter((r) => !firstOfEach.includes(r))].slice(0, MAX_SYMBOL_OPTIONS - 1);
    const options = seededOrder([row, ...distractors], date, 'which-symbol-options', (r) => r.symbol)
        .map((r): QuizOption => ({id: r.symbol, label: r.symbol, state: r.state, cells: cellsFor(board, r)}));
    return {
        ...base(date, board),
        template: 'which-symbol',
        symbol: null,
        verdict: row.state,
        cells: [],
        options,
        answerId: row.symbol,
        reveal: revealFor(board, row),
    };
};

const BUILDERS: Record<QuizTemplate, (date: string, board: Board, boards: readonly Board[]) => DailyQuiz | null> = {
    'which-verdict': whichVerdict,
    'why-this-verdict': whyThisVerdict,
    'which-symbol': whichSymbol,
};

// Today's question from the recent run of each strategy in `defs` (runs for strategies the
// catalog does not list are ignored), or null when no board has anything to ask about.
export const buildDailyQuiz = (
    date: string,
    defs: readonly StrategyDefinition[],
    runsById: Partial<Record<StrategyId, QuizRun>>,
): DailyQuiz | null => {
    const boards: Board[] = defs.flatMap((def) => {
        const run = runsById[def.id];
        return run && run.board.length > 0 ? [{def, run}] : [];
    });
    if (boards.length === 0) return null;
    for (const template of rotate(QUIZ_TEMPLATES, roll(date, 'template'))) {
        for (const board of rotate(boards, roll(date, 'strategy'))) {
            const quiz = BUILDERS[template](date, board, boards);
            if (quiz) return quiz;
        }
    }
    return null;
};
