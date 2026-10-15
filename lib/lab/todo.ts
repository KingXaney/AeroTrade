// Lab › Today as a list (pure): what there is to do today and which of it is done, read from
// rows the owner's actions and the games already write — a unit stamp, a quiz pass, the review
// queue, a problem stamp, today's puzzle row, a kept round — or from a tick the owner pressed
// (a LabEvent of kind 'todo', keyed on the item and the day). lib/lab/view.ts hands it the parts
// of the lab view; components/lab/TodayList draws it. Nothing here is stored.

import {LAB_COPY, LAB_WIDGET_TITLES} from "@/lib/learn/copy/lab";
import {labWidget, type LabWidgetId} from "@/lib/lab/widgets";

export type LabTodoKind = 'unit' | 'review' | 'problem' | 'papers' | 'puzzle' | 'round' | 'table' | 'outside';
// done: counted today; todo: still to do; none: nothing to do today (not counted either way).
export type LabTodoState = 'done' | 'todo' | 'none';

export type LabTodoItem = {
    id: string;
    kind: LabTodoKind;
    title: string;
    line: string;
    href: string;
    // A site outside the app, opened in a new tab.
    external: boolean;
    state: LabTodoState;
    // Ticked by the owner's own press (tickTodo), not read from rows.
    manual: boolean;
};

export type TodayListInput = {
    today: string;
    unit: {kind: 'study' | 'studied-today' | 'revisit' | 'nothing-written'; id: string | null; title: string | null; quizPassed: boolean; revisitedToday: boolean};
    // Cards still to grade today, and whether any card was graded today.
    review: {due: number; gradedToday: boolean};
    problem: {closed: boolean} | null;
    // The day's digest or papers exist.
    papers: boolean;
    widgets: readonly LabWidgetId[];
    // Today's puzzle row, when the puzzle widget is on.
    puzzle: {status: 'open' | 'solved' | 'revealed' | null} | null;
    // The games with a kept round today (lib/games/rounds GameId).
    playedToday: readonly string[];
    // The manual items ticked today (item ids).
    ticked: readonly string[];
};

// The row's key for a manual tick: the item and the ET day.
export const todoKey = (id: string, day: string): string => `${id}:${day}`;

// The manual items the owner may tick: the digest and every manual widget.
export const MANUAL_TODO_IDS: readonly string[] = ['papers', ...['poker-night', 'lichess', 'monkeytype', 'codeforces', 'leetcode']];

export const buildTodayList = (input: TodayListInput): LabTodoItem[] => {
    const copy = LAB_COPY.list;
    const ticked = new Set(input.ticked);
    const played = new Set(input.playedToday);
    const items: LabTodoItem[] = [];

    const unit = input.unit;
    if (unit.kind === 'nothing-written' || !unit.id || !unit.title) {
        items.push({id: 'unit', kind: 'unit', title: copy.unit(unit.title ?? '…'), line: copy.unitNothing, href: '/learn?view=library', external: false, state: 'none', manual: false});
    } else {
        const done = unit.kind === 'studied-today' || unit.revisitedToday;
        items.push({
            id: 'unit', kind: 'unit', title: copy.unit(unit.title), href: `/learn/units/${unit.id}`, external: false, manual: false,
            line: done ? copy.unitStudied : unit.quizPassed ? copy.unitQuizPassed : copy.unitLine,
            state: done ? 'done' : 'todo',
        });
    }

    const review = input.review;
    items.push({
        id: 'review', kind: 'review', href: '#lab-review', external: false, manual: false,
        title: review.due > 0 ? copy.review(review.due) : copy.reviewNone,
        line: review.due > 0 ? copy.reviewLine : review.gradedToday ? copy.reviewDone : copy.reviewLine,
        state: review.due > 0 ? 'todo' : review.gradedToday ? 'done' : 'none',
    });

    if (input.problem) {
        items.push({
            id: 'problem', kind: 'problem', title: copy.problem, href: '#lab-problem', external: false, manual: false,
            line: input.problem.closed ? copy.problemDone : copy.problemLine, state: input.problem.closed ? 'done' : 'todo',
        });
    }

    if (input.papers) {
        items.push({id: 'papers', kind: 'papers', title: copy.papers, line: copy.papersLine, href: '#lab-digest', external: false, manual: true, state: ticked.has('papers') ? 'done' : 'todo'});
    }

    for (const id of input.widgets) {
        const widget = labWidget(id);
        const title = LAB_WIDGET_TITLES[id];
        if (widget.kind === 'puzzle') {
            items.push({
                id, kind: 'puzzle', title: copy.puzzle, line: copy.puzzleLine, href: widget.href, external: false, manual: false,
                state: input.puzzle?.status === 'solved' ? 'done' : 'todo',
            });
        } else if (widget.kind === 'game') {
            items.push({
                id, kind: 'round', title: copy.round(title), line: copy.roundLine, href: widget.href, external: false, manual: false,
                state: widget.game && played.has(widget.game) ? 'done' : 'todo',
            });
        } else if (widget.kind === 'table') {
            items.push({id, kind: 'table', title: copy.table, line: copy.tableLine, href: widget.href, external: false, manual: true, state: ticked.has(id) ? 'done' : 'todo'});
        } else {
            items.push({id, kind: 'outside', title: copy.site(title), line: copy.siteLine, href: widget.href, external: true, manual: true, state: ticked.has(id) ? 'done' : 'todo'});
        }
    }
    return items;
};

// "2 of 6 done": the items with something to do, done or not.
export const listSummary = (items: readonly LabTodoItem[]): {done: number; total: number} => {
    const counted = items.filter((item) => item.state !== 'none');
    return {done: counted.filter((item) => item.state === 'done').length, total: counted.length};
};

export const isManualTodoId = (value: unknown): value is string => typeof value === 'string' && MANUAL_TODO_IDS.includes(value);
