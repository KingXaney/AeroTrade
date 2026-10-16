// Today's list, built from the lab's parts: each item's state is read from rows the day's work
// leaves (a studied unit, a graded queue, a closed problem, a solved puzzle, a kept round) or a
// tick the owner pressed; started and overdue sit between to do and done; nothing to do today is
// 'none' and counts neither way. Items carry a group the list draws them under.

import {describe, expect, it} from 'vitest';
import {buildTodayList, groupItems, isManualTodoId, listSummary, MANUAL_TODO_IDS, OPEN_STATES, reflectionLines, todoKey, TODO_GROUPS, type TodayListInput} from '@/lib/lab/todo';
import {findBanned} from '@/lib/learn/banned';

const base = (over: Partial<TodayListInput> = {}): TodayListInput => ({
    today: '2026-10-15',
    unit: {kind: 'study', id: 'cv-vit-dinov2', title: 'ViT and self-supervised features: DINOv2', quizPassed: false, revisitedToday: false},
    review: {due: 3, overdue: 0, gradedToday: false},
    problem: {closed: false},
    papers: true,
    widgets: ['daily-puzzle', 'arithmetic', 'leetcode', 'poker-night'],
    puzzle: {status: null},
    playedToday: [],
    ticked: [],
    ...over,
});

const states = (items: ReturnType<typeof buildTodayList>) => items.map((i) => `${i.id}:${i.state}`);

describe('buildTodayList', () => {
    it('lists the unit, the review, the problem, the papers and one item per widget, all to do', () => {
        const items = buildTodayList(base());
        expect(states(items)).toEqual(['unit:todo', 'review:todo', 'problem:todo', 'papers:todo', 'daily-puzzle:todo', 'arithmetic:todo', 'leetcode:todo', 'poker-night:todo']);
        expect(items.find((i) => i.id === 'unit')).toMatchObject({href: '/learn/units/cv-vit-dinov2', title: 'Study ViT and self-supervised features: DINOv2', manual: false, external: false, group: 'study'});
        expect(items.find((i) => i.id === 'review')?.title).toBe('Grade 3 due cards');
        expect(items.find((i) => i.id === 'leetcode')).toMatchObject({external: true, manual: true, href: 'https://leetcode.com/problemset/', title: 'A session on LeetCode', group: 'elsewhere'});
        expect(items.find((i) => i.id === 'papers')).toMatchObject({manual: true, href: '#lab-digest', group: 'study'});
        expect(items.find((i) => i.id === 'poker-night')?.group).toBe('play');
        expect(listSummary(items)).toEqual({done: 0, total: 8});
    });

    it('ticks what the rows say: the unit studied today, the queue graded, the problem closed, the puzzle solved, a round kept, a tick pressed', () => {
        const items = buildTodayList(base({
            unit: {kind: 'studied-today', id: 'cv-vit-dinov2', title: 'T', quizPassed: true, revisitedToday: false},
            review: {due: 0, overdue: 0, gradedToday: true},
            problem: {closed: true},
            puzzle: {status: 'solved'},
            playedToday: ['arithmetic'],
            ticked: ['leetcode'],
        }));
        expect(states(items)).toEqual(['unit:done', 'review:done', 'problem:done', 'papers:todo', 'daily-puzzle:done', 'arithmetic:done', 'leetcode:done', 'poker-night:todo']);
        expect(listSummary(items)).toEqual({done: 6, total: 8});
    });

    it('says what is next on the unit: the quiz, then the mark; a passed quiz is started; a revisit marked today is done', () => {
        expect(buildTodayList(base())[0].line).toBe('Read it, pass its quiz, then mark it studied.');
        const passed = buildTodayList(base({unit: {kind: 'study', id: 'u', title: 'T', quizPassed: true, revisitedToday: false}}))[0];
        expect(passed.line).toBe('Quiz passed. Mark it studied to move on.');
        expect(passed.state).toBe('started');
        expect(buildTodayList(base({unit: {kind: 'revisit', id: 'u', title: 'T', quizPassed: true, revisitedToday: true}}))[0].state).toBe('done');
        expect(buildTodayList(base({unit: {kind: 'revisit', id: 'u', title: 'T', quizPassed: true, revisitedToday: false}}))[0].state).toBe('started');
    });

    it('marks the review overdue when a card is past its day, started once some are graded, and counts neither as done', () => {
        const overdue = buildTodayList(base({review: {due: 3, overdue: 2, gradedToday: true}}))[1];
        expect(overdue).toMatchObject({state: 'overdue', title: 'Grade 3 due cards', line: '2 past their day. The review deck is below.'});
        const started = buildTodayList(base({review: {due: 1, overdue: 0, gradedToday: true}}))[1];
        expect(started).toMatchObject({state: 'started', line: '1 to go. The review deck is below.'});
        expect(buildTodayList(base({review: {due: 1, overdue: 1, gradedToday: false}}))[1].line).toBe('1 past its day. The review deck is below.');
        expect(listSummary(buildTodayList(base({review: {due: 3, overdue: 2, gradedToday: true}})))).toEqual({done: 0, total: 8});
    });

    it('marks nothing-to-do items none, which the summary leaves out', () => {
        const items = buildTodayList(base({
            unit: {kind: 'nothing-written', id: null, title: null, quizPassed: false, revisitedToday: false},
            review: {due: 0, overdue: 0, gradedToday: false},
            problem: null,
            papers: false,
            widgets: [],
        }));
        expect(states(items)).toEqual(['unit:none', 'review:none']);
        expect(listSummary(items)).toEqual({done: 0, total: 0});
    });

    it('reads the puzzle: attempted is started, revealed is none with its line, and a round of another game ticks nothing', () => {
        const open = buildTodayList(base({puzzle: {status: 'open'}, playedToday: ['kelly']}));
        expect(open.find((i) => i.id === 'daily-puzzle')).toMatchObject({state: 'started', line: 'Started; the answer is still open.'});
        expect(open.find((i) => i.id === 'arithmetic')?.state).toBe('todo');
        const revealed = buildTodayList(base({puzzle: {status: 'revealed'}}));
        expect(revealed.find((i) => i.id === 'daily-puzzle')).toMatchObject({state: 'none', line: 'Solution shown: no solve counted.'});
        expect(listSummary(revealed)).toEqual({done: 0, total: 7});
    });

    it('groups the items in the list order, leaving out an empty group', () => {
        expect(TODO_GROUPS).toEqual(['study', 'play', 'elsewhere']);
        const grouped = groupItems(buildTodayList(base()));
        expect(grouped.map((g) => `${g.group}:${g.items.map((i) => i.id).join('+')}`)).toEqual(['study:unit+review+problem+papers', 'play:daily-puzzle+arithmetic+poker-night', 'elsewhere:leetcode']);
        expect(groupItems(buildTodayList(base({widgets: []}))).map((g) => g.group)).toEqual(['study']);
    });

    it('gives the end of the day its two lines', () => {
        expect(OPEN_STATES).toEqual(['todo', 'started', 'overdue']);
        const items = buildTodayList(base({
            unit: {kind: 'study', id: 'u', title: 'T', quizPassed: true, revisitedToday: false},
            review: {due: 0, overdue: 0, gradedToday: true},
            problem: {closed: true},
            puzzle: {status: 'revealed'},
            playedToday: ['arithmetic'],
        }));
        expect(reflectionLines(items)).toEqual({
            done: ['No cards due today', 'Answer today\'s problem', 'Play a round of Arithmetic sprint'],
            left: ['Study T', 'Read the day in papers', 'A session on LeetCode', 'A hand or two at poker night'],
        });
    });

    it('keys a manual tick on the item and the day, and knows which items are manual', () => {
        expect(todoKey('papers', '2026-10-15')).toBe('papers:2026-10-15');
        expect(MANUAL_TODO_IDS).toEqual(['papers', 'poker-night', 'lichess', 'monkeytype', 'codeforces', 'leetcode']);
        expect(isManualTodoId('leetcode')).toBe(true);
        expect(isManualTodoId('arithmetic')).toBe(false);
    });

    it('speaks in the descriptive voice', () => {
        for (const item of buildTodayList(base({review: {due: 2, overdue: 1, gradedToday: true}, puzzle: {status: 'open'}}))) {
            for (const text of [item.title, item.line]) expect(findBanned(text, 'copy'), text).toEqual([]);
        }
    });
});
