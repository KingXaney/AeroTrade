// Today's list, built from the lab's parts: each item's state is read from rows the day's work
// leaves (a studied unit, a graded queue, a closed problem, a solved puzzle, a kept round) or a
// tick the owner pressed; nothing to do today is 'none' and counts neither way.

import {describe, expect, it} from 'vitest';
import {buildTodayList, isManualTodoId, listSummary, MANUAL_TODO_IDS, todoKey, type TodayListInput} from '@/lib/lab/todo';
import {findBanned} from '@/lib/learn/banned';

const base = (over: Partial<TodayListInput> = {}): TodayListInput => ({
    today: '2026-10-15',
    unit: {kind: 'study', id: 'cv-vit-dinov2', title: 'ViT and self-supervised features: DINOv2', quizPassed: false, revisitedToday: false},
    review: {due: 3, gradedToday: false},
    problem: {closed: false},
    papers: true,
    widgets: ['daily-puzzle', 'arithmetic', 'leetcode', 'poker-night'],
    puzzle: {status: null},
    playedToday: [],
    ticked: [],
    ...over,
});

describe('buildTodayList', () => {
    it('lists the unit, the review, the problem, the papers and one item per widget, all to do', () => {
        const items = buildTodayList(base());
        expect(items.map((i) => `${i.id}:${i.state}`)).toEqual(['unit:todo', 'review:todo', 'problem:todo', 'papers:todo', 'daily-puzzle:todo', 'arithmetic:todo', 'leetcode:todo', 'poker-night:todo']);
        expect(items.find((i) => i.id === 'unit')).toMatchObject({href: '/learn/units/cv-vit-dinov2', title: 'Study ViT and self-supervised features: DINOv2', manual: false, external: false});
        expect(items.find((i) => i.id === 'review')?.title).toBe('Grade 3 due cards');
        expect(items.find((i) => i.id === 'leetcode')).toMatchObject({external: true, manual: true, href: 'https://leetcode.com/problemset/', title: 'A session on LeetCode'});
        expect(items.find((i) => i.id === 'papers')).toMatchObject({manual: true, href: '#lab-digest'});
        expect(listSummary(items)).toEqual({done: 0, total: 8});
    });

    it('ticks what the rows say: the unit studied today, the queue graded, the problem closed, the puzzle solved, a round kept, a tick pressed', () => {
        const items = buildTodayList(base({
            unit: {kind: 'studied-today', id: 'cv-vit-dinov2', title: 'T', quizPassed: true, revisitedToday: false},
            review: {due: 0, gradedToday: true},
            problem: {closed: true},
            puzzle: {status: 'solved'},
            playedToday: ['arithmetic'],
            ticked: ['leetcode'],
        }));
        expect(items.map((i) => `${i.id}:${i.state}`)).toEqual(['unit:done', 'review:done', 'problem:done', 'papers:todo', 'daily-puzzle:done', 'arithmetic:done', 'leetcode:done', 'poker-night:todo']);
        expect(listSummary(items)).toEqual({done: 6, total: 8});
    });

    it('says what is next on the unit: the quiz, then the mark; a revisit marked today is done', () => {
        expect(buildTodayList(base())[0].line).toBe('Read it, pass its quiz, then mark it studied.');
        expect(buildTodayList(base({unit: {kind: 'study', id: 'u', title: 'T', quizPassed: true, revisitedToday: false}}))[0].line).toBe('Quiz passed. Mark it studied to move on.');
        expect(buildTodayList(base({unit: {kind: 'revisit', id: 'u', title: 'T', quizPassed: true, revisitedToday: true}}))[0].state).toBe('done');
        expect(buildTodayList(base({unit: {kind: 'revisit', id: 'u', title: 'T', quizPassed: true, revisitedToday: false}}))[0].state).toBe('todo');
    });

    it('marks nothing-to-do items none, which the summary leaves out', () => {
        const items = buildTodayList(base({
            unit: {kind: 'nothing-written', id: null, title: null, quizPassed: false, revisitedToday: false},
            review: {due: 0, gradedToday: false},
            problem: null,
            papers: false,
            widgets: [],
        }));
        expect(items.map((i) => `${i.id}:${i.state}`)).toEqual(['unit:none', 'review:none']);
        expect(listSummary(items)).toEqual({done: 0, total: 0});
    });

    it('a revealed puzzle is not a solve, and a round of another game ticks nothing', () => {
        const items = buildTodayList(base({puzzle: {status: 'revealed'}, playedToday: ['kelly']}));
        expect(items.find((i) => i.id === 'daily-puzzle')?.state).toBe('todo');
        expect(items.find((i) => i.id === 'arithmetic')?.state).toBe('todo');
    });

    it('keys a manual tick on the item and the day, and knows which items are manual', () => {
        expect(todoKey('papers', '2026-10-15')).toBe('papers:2026-10-15');
        expect(MANUAL_TODO_IDS).toEqual(['papers', 'poker-night', 'lichess', 'monkeytype', 'codeforces', 'leetcode']);
        expect(isManualTodoId('leetcode')).toBe(true);
        expect(isManualTodoId('arithmetic')).toBe(false);
    });

    it('speaks in the descriptive voice', () => {
        for (const item of buildTodayList(base())) {
            for (const text of [item.title, item.line]) expect(findBanned(text, 'copy'), text).toEqual([]);
        }
    });
});
