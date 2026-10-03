// The arithmetic page's round as a reducer: a right answer advances and counts, a wrong one stays,
// the clock ends the round, the interview mode tallies right and wrong to its eightieth question,
// and the report it sends is one the server keeps.

import {describe, expect, it} from 'vitest';
import {ZETAMAC_DEFAULTS} from '@/lib/games/arithmetic';
import {INTERVIEW_QUESTIONS, INTERVIEW_SECONDS} from '@/lib/games/interview';
import {LOBBY, roundReducer, roundReport, roundScore, type InterviewRound, type RoundAction, type RoundState, type SprintRound} from '@/lib/games/arithmetic-round';
import {keptRound} from '@/lib/games/rounds';

const T0 = 1_000_000;
const run = (state: RoundState, ...actions: RoundAction[]): RoundState => actions.reduce(roundReducer, state);
const sprint = (): SprintRound => roundReducer(LOBBY, {type: 'start-sprint', seed: 5, settings: ZETAMAC_DEFAULTS, at: T0}) as SprintRound;
const interview = (): InterviewRound => roundReducer(LOBBY, {type: 'start-interview', seed: 5, at: T0}) as InterviewRound;

describe('a sprint', () => {
    it('starts on the seed\'s first problem with two minutes on the clock', () => {
        const round = sprint();
        expect(round).toMatchObject({kind: 'sprint', phase: 'playing', index: 0, typed: '', startedAt: T0, endsAt: T0 + 120_000});
        expect(sprint()).toEqual(round);
    });

    it('moves on the moment the answer is right, and keeps a wrong one typed', () => {
        const round = sprint();
        const wrong = roundReducer(round, {type: 'type', value: String(round.problem.answer + 1)}) as SprintRound;
        expect(wrong).toMatchObject({index: 0, typed: String(round.problem.answer + 1)});
        const right = roundReducer(wrong, {type: 'type', value: String(round.problem.answer)}) as SprintRound;
        expect(right.index).toBe(1);
        expect(right.typed).toBe('');
        expect(right.counts[round.problem.op]).toBe(1);
        expect(right.problem).not.toEqual(round.problem);
        expect(roundScore(right)).toBe(1);
    });

    it('ends when the clock runs out, and then takes nothing more', () => {
        let round: RoundState = sprint();
        round = run(round, {type: 'tick', at: T0 + 60_000});
        expect((round as SprintRound).phase).toBe('playing');
        round = run(round, {type: 'tick', at: T0 + 121_000});
        expect(round).toMatchObject({phase: 'done', now: T0 + 120_000});
        const after = run(round, {type: 'type', value: String((round as SprintRound).problem.answer)});
        expect(after).toBe(round);
    });

    it('reports a round the server keeps', () => {
        let round = sprint() as RoundState;
        for (let i = 0; i < 30; i++) round = run(round, {type: 'type', value: String((round as SprintRound).problem.answer)});
        round = run(round, {type: 'tick', at: T0 + 120_500});
        const report = roundReport(round as SprintRound);
        expect(report).toMatchObject({game: 'arithmetic', score: 30, durationMs: 120_000});
        expect(keptRound(report)).toMatchObject({key: 'zetamac', score: 30});
    });
});

describe('the interview mode', () => {
    it('tallies right and wrong answers question by question', () => {
        const round = interview();
        expect(round.questions).toHaveLength(INTERVIEW_QUESTIONS);
        const first = round.questions[0];
        const afterRight = roundReducer(round, {type: 'choose', option: first.answer, at: T0 + 1000}) as InterviewRound;
        expect(afterRight).toMatchObject({index: 1, right: 1, wrong: 0});
        expect(afterRight.byKind[first.kind]).toBe(1);
        const second = afterRight.questions[1];
        const afterWrong = roundReducer(afterRight, {type: 'choose', option: (second.answer + 1) % 5, at: T0 + 2000}) as InterviewRound;
        expect(afterWrong).toMatchObject({index: 2, right: 1, wrong: 1});
        expect(roundReducer(afterWrong, {type: 'choose', option: 9, at: T0 + 3000})).toBe(afterWrong);
    });

    it('ends on the eightieth answer, or at eight minutes', () => {
        let round: RoundState = interview();
        for (let i = 0; i < INTERVIEW_QUESTIONS; i++) {
            const q = (round as InterviewRound).questions[i];
            round = run(round, {type: 'choose', option: q.answer, at: T0 + (i + 1) * 1000});
        }
        expect(round).toMatchObject({phase: 'done', right: INTERVIEW_QUESTIONS, wrong: 0});
        expect(keptRound(roundReport(round as InterviewRound))).toMatchObject({key: 'interview', score: INTERVIEW_QUESTIONS});
        const timedOut = run(interview(), {type: 'tick', at: T0 + INTERVIEW_SECONDS * 1000});
        expect(timedOut).toMatchObject({phase: 'done'});
    });

    it('stops when asked and goes back to the lobby on reset', () => {
        const stopped = run(interview(), {type: 'stop', at: T0 + 5000});
        expect(stopped).toMatchObject({phase: 'done', now: T0 + 5000});
        expect(run(stopped, {type: 'reset'})).toBe(LOBBY);
    });
});
