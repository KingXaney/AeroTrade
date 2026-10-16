// Lab › Today as a list (pure): what there is to do today and which of it is done, read from
// rows the owner's actions and the games already write — a unit stamp, a quiz pass, the review
// queue, a problem stamp, today's puzzle row, a kept round — or from a tick the owner pressed
// (a LabEvent of kind 'todo', keyed on the item and the day). Each item sits in a group (study,
// play, elsewhere) and has a state: done, to do, started (under way but not counted yet),
// overdue (a review with cards past their day), or none (nothing to do today — not counted either
// way). lib/lab/view.ts hands it the parts of the lab view; components/lab/TodayList draws it.
// Nothing here is stored.

import {LAB_COPY, LAB_WIDGET_TITLES} from "@/lib/learn/copy/lab";
import {labWidget, type LabWidgetId} from "@/lib/lab/widgets";

export type LabTodoKind = 'unit' | 'review' | 'problem' | 'papers' | 'puzzle' | 'round' | 'table' | 'outside';
export type LabTodoState = 'done' | 'todo' | 'started' | 'overdue' | 'none';
export type LabTodoGroup = 'study' | 'play' | 'elsewhere';

// The groups in the order the list draws them.
export const TODO_GROUPS: readonly LabTodoGroup[] = ['study', 'play', 'elsewhere'];

// The states with something still to do, in the list's sense: counted, not done.
export const OPEN_STATES: readonly LabTodoState[] = ['todo', 'started', 'overdue'];

export type LabTodoItem = {
    id: string;
    kind: LabTodoKind;
    group: LabTodoGroup;
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
    // Cards still to grade today, how many of them are past their day, and whether any card was graded today.
    review: {due: number; overdue: number; gradedToday: boolean};
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
        items.push({id: 'unit', kind: 'unit', group: 'study', title: copy.unit(unit.title ?? '…'), line: copy.unitNothing, href: '/learn?view=library', external: false, state: 'none', manual: false});
    } else {
        const done = unit.kind === 'studied-today' || unit.revisitedToday;
        items.push({
            id: 'unit', kind: 'unit', group: 'study', title: copy.unit(unit.title), href: `/learn/units/${unit.id}`, external: false, manual: false,
            line: done ? copy.unitStudied : unit.quizPassed ? copy.unitQuizPassed : copy.unitLine,
            state: done ? 'done' : unit.quizPassed ? 'started' : 'todo',
        });
    }

    const review = input.review;
    const reviewState: LabTodoState = review.due > 0
        ? (review.overdue > 0 ? 'overdue' : review.gradedToday ? 'started' : 'todo')
        : (review.gradedToday ? 'done' : 'none');
    items.push({
        id: 'review', kind: 'review', group: 'study', href: '#lab-review', external: false, manual: false,
        title: review.due > 0 ? copy.review(review.due) : copy.reviewNone,
        line: reviewState === 'overdue' ? copy.reviewOverdue(review.overdue)
            : reviewState === 'started' ? copy.reviewStarted(review.due)
                : reviewState === 'done' ? copy.reviewDone : copy.reviewLine,
        state: reviewState,
    });

    if (input.problem) {
        items.push({
            id: 'problem', kind: 'problem', group: 'study', title: copy.problem, href: '#lab-problem', external: false, manual: false,
            line: input.problem.closed ? copy.problemDone : copy.problemLine, state: input.problem.closed ? 'done' : 'todo',
        });
    }

    if (input.papers) {
        items.push({id: 'papers', kind: 'papers', group: 'study', title: copy.papers, line: copy.papersLine, href: '#lab-digest', external: false, manual: true, state: ticked.has('papers') ? 'done' : 'todo'});
    }

    for (const id of input.widgets) {
        const widget = labWidget(id);
        const title = LAB_WIDGET_TITLES[id];
        if (widget.kind === 'puzzle') {
            const status = input.puzzle?.status ?? null;
            items.push({
                id, kind: 'puzzle', group: 'play', title: copy.puzzle, href: widget.href, external: false, manual: false,
                line: status === 'revealed' ? copy.puzzleRevealed : status === 'open' ? copy.puzzleStarted : copy.puzzleLine,
                state: status === 'solved' ? 'done' : status === 'revealed' ? 'none' : status === 'open' ? 'started' : 'todo',
            });
        } else if (widget.kind === 'game') {
            items.push({
                id, kind: 'round', group: 'play', title: copy.round(title), line: copy.roundLine, href: widget.href, external: false, manual: false,
                state: widget.game && played.has(widget.game) ? 'done' : 'todo',
            });
        } else if (widget.kind === 'table') {
            items.push({id, kind: 'table', group: 'play', title: copy.table, line: copy.tableLine, href: widget.href, external: false, manual: true, state: ticked.has(id) ? 'done' : 'todo'});
        } else {
            items.push({id, kind: 'outside', group: 'elsewhere', title: copy.site(title), line: copy.siteLine, href: widget.href, external: true, manual: true, state: ticked.has(id) ? 'done' : 'todo'});
        }
    }
    return items;
};

// "2 of 6 done": the items with something to do, done or not.
export const listSummary = (items: readonly LabTodoItem[]): {done: number; total: number} => {
    const counted = items.filter((item) => item.state !== 'none');
    return {done: counted.filter((item) => item.state === 'done').length, total: counted.length};
};

// The list by group, in TODO_GROUPS' order, the empty groups left out.
export const groupItems = (items: readonly LabTodoItem[]): {group: LabTodoGroup; items: LabTodoItem[]}[] =>
    TODO_GROUPS.flatMap((group) => {
        const own = items.filter((item) => item.group === group);
        return own.length > 0 ? [{group, items: own}] : [];
    });

// The end-of-day lines: what is done, and what is still open (to do, started or overdue).
export const reflectionLines = (items: readonly LabTodoItem[]): {done: string[]; left: string[]} => ({
    done: items.filter((item) => item.state === 'done').map((item) => item.title),
    left: items.filter((item) => OPEN_STATES.includes(item.state)).map((item) => item.title),
});

export const isManualTodoId = (value: unknown): value is string => typeof value === 'string' && MANUAL_TODO_IDS.includes(value);
