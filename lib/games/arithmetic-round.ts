// One round of the arithmetic page — a sprint (Zetamac-style or custom) or the interview mode — as
// a pure reducer. Every input that varies (the seed, the clock) arrives in the action, so the
// reducer replays exactly and React may call it twice; the page owns only the clock's interval
// and the report it sends when the round ends.

import {isAnswer, problemAt, type Operation, type Problem, type SprintSettings} from "@/lib/games/arithmetic";
import type {Solved} from "@/lib/games/arithmetic-skill";
import {INTERVIEW_SECONDS, interviewRound, type InterviewQuestion} from "@/lib/games/interview";

type Clock = {startedAt: number; endsAt: number; now: number};

export type SprintRound = Clock & {
    kind: 'sprint';
    phase: 'playing' | 'done';
    seed: number;
    settings: SprintSettings;
    index: number;
    problem: Problem;
    typed: string;
    counts: Record<Operation, number>;
    // When the current problem appeared, and the full wrong entries typed for it so far.
    shownAt: number;
    slips: number;
    // Every problem answered, in order, with how long it took and its slips (lib/games/arithmetic-skill).
    solved: Solved[];
};

export type InterviewRound = Clock & {
    kind: 'interview';
    phase: 'playing' | 'done';
    questions: InterviewQuestion[];
    index: number;
    right: number;
    wrong: number;
    // Right answers by kind of problem.
    byKind: Record<string, number>;
};

export type RoundState = {kind: 'lobby'} | SprintRound | InterviewRound;

export type RoundAction =
    | {type: 'start-sprint'; seed: number; settings: SprintSettings; at: number}
    | {type: 'start-interview'; seed: number; at: number}
    | {type: 'tick'; at: number}
    | {type: 'type'; value: string; at: number}
    | {type: 'choose'; option: number; at: number}
    | {type: 'stop'; at: number}
    // A round in play dropped for a fresh one of the same kind on the same settings (a new seed and
    // clock). The dropped round never reaches 'done', so the page never reports it: no record, no
    // streak day, nothing folded into the reader's skill.
    | {type: 'restart'; seed: number; at: number}
    | {type: 'reset'};

export const LOBBY: RoundState = {kind: 'lobby'};

const NO_COUNTS: Record<Operation, number> = {add: 0, subtract: 0, multiply: 0, divide: 0};

const ended = <T extends SprintRound | InterviewRound>(round: T, at: number): T =>
    ({...round, phase: 'done', now: Math.min(Math.max(at, round.startedAt), round.endsAt)});

export const roundReducer = (state: RoundState, action: RoundAction): RoundState => {
    switch (action.type) {
        case 'reset':
            return LOBBY;
        case 'start-sprint':
            return {
                kind: 'sprint', phase: 'playing', seed: action.seed, settings: action.settings,
                startedAt: action.at, endsAt: action.at + action.settings.duration * 1000, now: action.at,
                index: 0, problem: problemAt(action.seed, action.settings, 0, null), typed: '', counts: NO_COUNTS,
                shownAt: action.at, slips: 0, solved: [],
            };
        case 'start-interview':
            return {
                kind: 'interview', phase: 'playing', questions: interviewRound(action.seed),
                startedAt: action.at, endsAt: action.at + INTERVIEW_SECONDS * 1000, now: action.at,
                index: 0, right: 0, wrong: 0, byKind: {},
            };
    }
    if (state.kind === 'lobby' || state.phase === 'done') return state;
    switch (action.type) {
        case 'tick':
            return action.at >= state.endsAt ? ended(state, action.at) : {...state, now: action.at};
        case 'stop':
            return ended(state, action.at);
        case 'restart':
            return state.kind === 'sprint'
                ? roundReducer(LOBBY, {type: 'start-sprint', seed: action.seed, settings: state.settings, at: action.at})
                : roundReducer(LOBBY, {type: 'start-interview', seed: action.seed, at: action.at});
        case 'type': {
            if (state.kind !== 'sprint') return state;
            if (!isAnswer(state.problem, action.value)) {
                // A slip is a full wrong entry: the typed text reaching the answer's length without
                // being the answer. Backspaces and the digits on the way are not slips.
                const length = String(state.problem.answer).length;
                const slip = state.typed.trim().length < length && action.value.trim().length >= length;
                return {...state, typed: action.value, slips: state.slips + (slip ? 1 : 0)};
            }
            const index = state.index + 1;
            return {
                ...state,
                index,
                problem: problemAt(state.seed, state.settings, index, state.problem),
                typed: '',
                counts: {...state.counts, [state.problem.op]: state.counts[state.problem.op] + 1},
                solved: [...state.solved, {problem: state.problem, ms: Math.max(0, action.at - state.shownAt), slips: state.slips}],
                shownAt: action.at,
                slips: 0,
            };
        }
        case 'choose': {
            if (state.kind !== 'interview') return state;
            const question = state.questions[state.index];
            if (!question || action.option < 0 || action.option >= question.options.length) return state;
            const isRight = action.option === question.answer;
            const next: InterviewRound = {
                ...state,
                index: state.index + 1,
                right: state.right + (isRight ? 1 : 0),
                wrong: state.wrong + (isRight ? 0 : 1),
                byKind: isRight ? {...state.byKind, [question.kind]: (state.byKind[question.kind] ?? 0) + 1} : state.byKind,
                now: Math.max(state.now, action.at),
            };
            return next.index >= state.questions.length ? ended(next, action.at) : next;
        }
    }
};

export const roundScore = (round: SprintRound | InterviewRound): number =>
    round.kind === 'interview' ? round.right : round.counts.add + round.counts.subtract + round.counts.multiply + round.counts.divide;

// What the page reports when a round ends (lib/games/rounds.RoundInputSchema).
export const roundReport = (round: SprintRound | InterviewRound) => {
    const durationMs = Math.round(round.now - round.startedAt);
    return round.kind === 'interview'
        ? {game: 'interview' as const, score: round.right, wrong: round.wrong, durationMs, detail: round.byKind}
        : {
            game: 'arithmetic' as const, settings: round.settings, seed: round.seed, score: roundScore(round),
            // The server replays the seed to recover each problem; only the timings and slips travel.
            wrong: round.solved.reduce((sum, s) => sum + s.slips, 0), durationMs, detail: round.counts,
            problems: round.solved.map(({ms, slips}) => ({ms, slips})),
        };
};
