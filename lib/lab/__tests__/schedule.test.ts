import {describe, expect, it} from 'vitest';
import {dueCards, NEW_CARD_DELAY_DAYS, problemFor, progressByTrack, reviewSummary, todaysUnit, type StudiedRow} from '@/lib/lab/schedule';
import {newCardState, type CardState} from '@/lib/lab/srs';
import type {LabUnit} from '@/lib/learn/copy/lab/types';

const unit = (id: string, track: LabUnit['track'], cards = 2): LabUnit => ({
    id, track, title: id, oneLiner: id, readingMinutes: 10,
    sections: {idea: '', maths: '', code: '', whyNow: '', pitfalls: ''},
    sources: [], problems: [{id: `${id}/p1`, kind: 'quant', title: 'p1', statement: '', hints: [], solution: ''}, {id: `${id}/p2`, kind: 'quant', title: 'p2', statement: '', hints: [], solution: ''}],
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

describe('progressByTrack and problemFor', () => {
    it('counts done, written and planned per track', () => {
        expect(progressByTrack(units, {cv: 10, ml: 10, quant: 10}, studied(['cv-1', '2026-10-01']))).toEqual([
            {track: 'cv', done: 1, written: 2, planned: 10}, {track: 'ml', done: 0, written: 2, planned: 10}, {track: 'quant', done: 0, written: 1, planned: 10},
        ]);
    });

    it('hands out the unit\'s unopened problem first, then the one opened longest ago', () => {
        expect(problemFor(units[0], [])?.id).toBe('cv-1/p1');
        expect(problemFor(units[0], [{problemId: 'cv-1/p1', day: '2026-10-01'}])?.id).toBe('cv-1/p2');
        expect(problemFor(units[0], [{problemId: 'cv-1/p1', day: '2026-10-01'}, {problemId: 'cv-1/p2', day: '2026-10-05'}])?.id).toBe('cv-1/p1');
        expect(problemFor({...units[0], problems: []}, [])).toBeNull();
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
