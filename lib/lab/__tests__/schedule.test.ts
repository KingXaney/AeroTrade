import {describe, expect, it} from 'vitest';
import {dailyProblem, dueCards, NEW_CARD_DELAY_DAYS, problemPool, progressByTrack, reviewSummary, todaysUnit, type StudiedRow} from '@/lib/lab/schedule';
import {newCardState, type CardState} from '@/lib/lab/srs';
import type {LabUnit} from '@/lib/learn/copy/lab/types';

const unit = (id: string, track: LabUnit['track'], cards = 2): LabUnit => ({
    id, track, title: id, oneLiner: id, readingMinutes: 10,
    sections: {idea: '', maths: '', code: '', whyNow: '', pitfalls: ''},
    sources: [], quiz: [], problems: [{id: `${id}/p1`, kind: 'quant', title: 'p1', statement: '', hints: [], solution: ''}, {id: `${id}/p2`, kind: 'quant', title: 'p2', statement: '', hints: [], solution: ''}],
    cards: Array.from({length: cards}, (_, i) => ({id: `${id}/c${i + 1}`, front: '', back: '', tags: []})),
});
const units = [unit('cv-1', 'cv'), unit('cv-2', 'cv'), unit('ml-1', 'ml'), unit('ml-2', 'ml'), unit('quant-1', 'quant')];
const studied = (...rows: [string, string][]): StudiedRow[] => rows.map(([unitId, day]) => ({unitId, day, lastDay: day}));

describe('todaysUnit', () => {
    it('opens on the first unit of the first track, then rotates to the least-advanced track', () => {
        expect(todaysUnit(units, [], '2026-10-13')).toEqual({kind: 'study', unit: units[0]});
        expect(todaysUnit(units, studied(['cv-1', '2026-10-12']), '2026-10-13')).toEqual({kind: 'study', unit: units[2]});
        expect(todaysUnit(units, studied(['cv-1', '2026-10-11'], ['ml-1', '2026-10-12']), '2026-10-13')).toEqual({kind: 'study', unit: units[4]});
        // Every track once: cv again, since it is first among the tied.
        expect(todaysUnit(units, studied(['cv-1', '2026-10-10'], ['ml-1', '2026-10-11'], ['quant-1', '2026-10-12']), '2026-10-13')).toEqual({kind: 'study', unit: units[1]});
    });

    it('never skips a prerequisite on a missed day, and keeps today\'s stamped unit as today\'s', () => {
        expect(todaysUnit(units, studied(['cv-1', '2026-10-01']), '2026-10-13')).toEqual({kind: 'study', unit: units[2]});
        expect(todaysUnit(units, studied(['cv-1', '2026-10-13']), '2026-10-13')).toEqual({kind: 'studied-today', unit: units[0]});
    });

    it('revisits the least recently studied once everything is studied, and says so when nothing is written', () => {
        const all = studied(['cv-1', '2026-10-01'], ['cv-2', '2026-10-03'], ['ml-1', '2026-10-02'], ['ml-2', '2026-10-04'], ['quant-1', '2026-10-05']);
        expect(todaysUnit(units, all, '2026-10-13')).toEqual({kind: 'revisit', unit: units[0], firstDay: '2026-10-01', lastDay: '2026-10-01'});
        expect(todaysUnit([], [], '2026-10-13')).toEqual({kind: 'nothing-written'});
    });
});

describe('progressByTrack', () => {
    it('counts done, written and planned per track', () => {
        expect(progressByTrack(units, {cv: 10, ml: 10, quant: 10}, studied(['cv-1', '2026-10-01']))).toEqual([
            {track: 'cv', done: 1, written: 2, planned: 10}, {track: 'ml', done: 0, written: 2, planned: 10}, {track: 'quant', done: 0, written: 1, planned: 10},
        ]);
    });
});

describe('the day\'s problem', () => {
    const TODAY = '2026-10-24';
    const closed = (problemId: string, lastDay: string, day = lastDay) => ({problemId, day, lastDay});
    const one = (u: LabUnit): LabUnit => ({...u, problems: u.problems.slice(0, 1)});

    it('draws from today\'s unit first, then the units already studied, in the registry\'s order', () => {
        expect(problemPool(units, units[2], studied(['cv-2', '2026-10-01'], ['cv-1', '2026-10-02'])).map((u) => u.id)).toEqual(['ml-1', 'cv-1', 'cv-2']);
        expect(problemPool(units, units[0], studied(['cv-1', TODAY])).map((u) => u.id)).toEqual(['cv-1']);
        expect(problemPool(units, null, []).map((u) => u.id)).toEqual([]);
    });

    it('hands out today\'s unit\'s unopened problem first', () => {
        expect(dailyProblem([units[0]], [], TODAY)).toMatchObject({unit: {id: 'cv-1'}, problem: {id: 'cv-1/p1'}, closedToday: null});
        expect(dailyProblem([units[0]], [closed('cv-1/p1', '2026-10-01')], TODAY)?.problem.id).toBe('cv-1/p2');
    });

    it('moves on to a studied unit\'s unopened problem once today\'s unit has none', () => {
        const pool = [one(units[1]), one(units[0])];
        expect(dailyProblem(pool, [closed('cv-2/p1', '2026-10-13')], TODAY)).toMatchObject({unit: {id: 'cv-1'}, problem: {id: 'cv-1/p1'}, closedToday: null});
    });

    it('keeps the problem closed today as today\'s, closed, whatever else is unopened', () => {
        const pick = dailyProblem([units[0]], [closed('cv-1/p2', TODAY, '2026-10-01')], TODAY);
        expect(pick).toMatchObject({problem: {id: 'cv-1/p2'}, closedToday: {problemId: 'cv-1/p2', lastDay: TODAY}});
    });

    it('opens the one closed longest ago again once every problem was opened — never "closed" from an earlier day', () => {
        const pool = [one(units[1]), one(units[0])];
        const pick = dailyProblem(pool, [closed('cv-2/p1', '2026-10-13'), closed('cv-1/p1', '2026-10-05')], TODAY);
        expect(pick).toMatchObject({unit: {id: 'cv-1'}, problem: {id: 'cv-1/p1'}, closedToday: null});
        // The production case: one unit, one problem, closed eleven days ago — open again today.
        expect(dailyProblem([one(units[0])], [closed('cv-1/p1', '2026-10-13')], TODAY)).toMatchObject({problem: {id: 'cv-1/p1'}, closedToday: null});
    });

    it('has nothing when the pool holds no problem', () => {
        expect(dailyProblem([{...units[0], problems: []}], [], TODAY)).toBeNull();
        expect(dailyProblem([], [], TODAY)).toBeNull();
    });
});

describe('dueCards and reviewSummary', () => {
    const refs = units.flatMap((u) => u.cards.map((c) => ({cardId: c.id, unitId: u.id})));
    const row = (cardId: string, state: Partial<CardState>) => ({cardId, state: {...newCardState('2026-10-13'), ...state}});

    it('lists overdue first by due day, then due today, then new cards of units studied a day ago, capped', () => {
        const rows = [row('cv-1/c1', {dueOn: '2026-10-10', reps: 2}), row('cv-1/c2', {dueOn: '2026-10-13', reps: 1}), row('ml-1/c1', {dueOn: '2026-10-20', reps: 1})];
        const queue = dueCards(refs, rows, studied(['cv-1', '2026-10-01'], ['ml-1', '2026-10-12'], ['quant-1', '2026-10-13']), '2026-10-13');
        expect(queue.map((c) => `${c.cardId}:${c.why}`)).toEqual(['cv-1/c1:overdue', 'cv-1/c2:due', 'ml-1/c2:new']);
        expect(dueCards(refs, rows, studied(['cv-1', '2026-10-01']), '2026-10-13', 1).map((c) => c.cardId)).toEqual(['cv-1/c1']);
        expect(NEW_CARD_DELAY_DAYS).toBe(1);
    });

    it('shows no card of a unit not yet studied, and none due in the future', () => {
        expect(dueCards(refs, [], [], '2026-10-13')).toEqual([]);
        expect(dueCards(refs, [row('cv-1/c1', {dueOn: '2026-10-14'})], studied(['cv-1', '2026-10-01']), '2026-10-13').map((c) => c.cardId)).toEqual(['cv-1/c2']);
    });

    it('summarises the queue and what has been learned', () => {
        const rows = [row('cv-1/c1', {dueOn: '2026-10-10', reps: 2}), row('cv-1/c2', {dueOn: '2026-11-01', reps: 3})];
        expect(reviewSummary(refs, rows, studied(['cv-1', '2026-10-01'], ['ml-1', '2026-10-12']), '2026-10-13')).toEqual({due: 3, overdue: 1, newCards: 2, learned: 2, total: 10});
    });
});
